"""Redis-backed distributed counting semaphore for resource serialization.

No lock/semaphore of any kind existed in this codebase before this module —
ARQ's `WorkerSettings.max_jobs` only caps how many *tasks* run concurrently,
not how many of a specific resource-heavy operation (LLM inference, video
rendering) run at once across those tasks. Since ARQ workers may run as
multiple processes, a plain `asyncio.Semaphore` (per-process) isn't enough;
this uses Redis (already a hard dependency via ARQ) instead, so no new
dependency is introduced.

Two named slots matter most:
- `"llm"` — caps concurrent LLM calls (Ollama or Gemini) at 1 by default.
- `"gpu"` — acquired by BOTH LLM call sites (Ollama only — Gemini is a
  remote API and doesn't touch local VRAM) and render call sites, so local
  LLM inference and video rendering never run at the same time on the same
  GPU. See CLAUDE.md's "Local LLM (Ollama)" section for the rationale.

Implementation: a Redis sorted set per slot name, scored by expiry timestamp.
Acquiring adds a member (an expiry-scored holder id) after first evicting any
expired members, then checks the resulting cardinality against the limit.
This is the standard "Redis semaphore" pattern and needs no new library.
"""

import contextlib
import logging
import time
import uuid
from typing import AsyncIterator, Optional

from arq.connections import ArqRedis

from .job_queue import JobQueue

logger = logging.getLogger(__name__)

_KEY_PREFIX = "supoclip:resource_slot:"

# Slightly longer than the slowest expected holder (a render pass or a local
# LLM call) so a crashed/killed holder's slot is reclaimed rather than
# deadlocking the semaphore forever.
DEFAULT_TTL_SECONDS = 15 * 60


async def _get_redis(redis: Optional[ArqRedis]) -> ArqRedis:
    return redis if redis is not None else await JobQueue.get_pool()


async def acquire_slot(
    name: str,
    max_concurrent: int,
    *,
    holder_id: Optional[str] = None,
    ttl_seconds: float = DEFAULT_TTL_SECONDS,
    redis: Optional[ArqRedis] = None,
) -> Optional[str]:
    """Try to acquire one of `max_concurrent` slots for `name`.

    Returns the holder_id on success, or None if the slot is full. Non-blocking:
    callers that need to wait should poll (see `resource_slot`).
    """
    client = await _get_redis(redis)
    key = f"{_KEY_PREFIX}{name}"
    holder_id = holder_id or uuid.uuid4().hex
    now = time.time()

    await client.zremrangebyscore(key, "-inf", now)

    # Optimistically add this holder, then check if we're within the limit —
    # if not, remove it again. A tiny race window exists between count and
    # add under concurrent callers; acceptable here since slot limits are a
    # throughput/VRAM-contention safeguard, not a hard exclusion guarantee.
    await client.zadd(key, {holder_id: now + ttl_seconds})
    count = await client.zcard(key)
    if count > max_concurrent:
        await client.zrem(key, holder_id)
        return None
    return holder_id


async def release_slot(name: str, holder_id: str, *, redis: Optional[ArqRedis] = None) -> None:
    client = await _get_redis(redis)
    await client.zrem(f"{_KEY_PREFIX}{name}", holder_id)


async def _renew_slot(
    name: str, holder_id: str, ttl_seconds: float, redis: ArqRedis
) -> None:
    """Push this holder's expiry back out — a plain `zadd` on a member the
    caller already owns just updates its score, it can't create a second
    slot occupant or exceed the limit."""
    await redis.zadd(f"{_KEY_PREFIX}{name}", {holder_id: time.time() + ttl_seconds})


@contextlib.asynccontextmanager
async def resource_slot(
    name: str,
    max_concurrent: int = 1,
    *,
    poll_interval_seconds: float = 1.0,
    timeout_seconds: float = 20 * 60,
    ttl_seconds: float = DEFAULT_TTL_SECONDS,
    redis: Optional[ArqRedis] = None,
) -> AsyncIterator[None]:
    """Block (polling) until a slot named `name` is free, then hold it for the
    duration of the `async with` block, releasing it on exit (even on error).

    A background task renews this holder's expiry at ttl_seconds/3 while the
    block is held — without it, a render/LLM call that runs longer than
    ttl_seconds would have its slot silently evicted (as "expired") by the
    next caller's acquire_slot, letting a second render/LLM call proceed
    concurrently while the first is still in flight, defeating the whole
    point of this serialization.
    """
    import asyncio

    client = await _get_redis(redis)
    holder_id = uuid.uuid4().hex
    deadline = time.time() + timeout_seconds
    while True:
        acquired = await acquire_slot(
            name, max_concurrent, holder_id=holder_id, ttl_seconds=ttl_seconds, redis=client
        )
        if acquired:
            break
        if time.time() >= deadline:
            raise TimeoutError(f"Timed out waiting for resource slot '{name}'")
        await asyncio.sleep(poll_interval_seconds)

    async def _renew_periodically() -> None:
        interval = ttl_seconds / 3
        while True:
            await asyncio.sleep(interval)
            await _renew_slot(name, holder_id, ttl_seconds, client)

    renew_task = asyncio.create_task(_renew_periodically())
    try:
        yield
    finally:
        renew_task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await renew_task
        await release_slot(name, holder_id, redis=client)
