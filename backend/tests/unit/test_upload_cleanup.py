"""
Tests for uploaded-source-video disk cleanup:
  - TaskService.purge_task now also deletes the uploaded source video (real DB, over the HTTP API)
  - SourceRepository.get_upload_urls / RankingFolderRepository.get_upload_file_paths /
    RankingRepository.get_upload_file_paths
  - workers.tasks.cleanup_orphaned_uploads_job (the daily cron sweep for never-attached uploads)
"""

import os
import time
import uuid

import pytest

from src.config import Config, get_config, set_config_override
from src.database import AsyncSessionLocal
from src.repositories.ranking_folder_repository import RankingFolderRepository
from src.repositories.ranking_repository import RankingRepository
from src.repositories.source_repository import SourceRepository
from src.workers.tasks import cleanup_orphaned_uploads_job
from tests.fixtures.factories import create_source, create_task, create_user


@pytest.mark.asyncio
async def test_purge_task_removes_uploaded_source_video(client, db_session, tmp_path):
    get_config().temp_dir = str(tmp_path)
    uploads_dir = tmp_path / "uploads"
    uploads_dir.mkdir(parents=True)
    video_file = uploads_dir / "seeded-upload.mp4"
    video_file.write_bytes(b"fake source video bytes")

    await create_user(db_session, user_id="local")
    source = await create_source(
        db_session,
        title="Upload purge test",
        source_type="video_url",
        url="upload://seeded-upload.mp4",
    )
    task = await create_task(
        db_session, user_id="local", source_id=source["id"], status="completed"
    )
    task_id = task["id"]

    await client.delete(f"/tasks/{task_id}")
    purge_response = await client.delete(f"/tasks/{task_id}/purge")
    assert purge_response.status_code == 200

    assert not video_file.exists()


@pytest.mark.asyncio
async def test_purge_task_leaves_youtube_source_alone(client, db_session, tmp_path):
    # YouTube sources are already cleaned up right after processing
    # (_cleanup_source_video) — purge must not try to touch anything for them.
    get_config().temp_dir = str(tmp_path)

    await create_user(db_session, user_id="local")
    source = await create_source(db_session, title="YouTube purge test")  # default source_type="youtube"
    task = await create_task(
        db_session, user_id="local", source_id=source["id"], status="completed"
    )
    task_id = task["id"]

    await client.delete(f"/tasks/{task_id}")
    purge_response = await client.delete(f"/tasks/{task_id}/purge")
    assert purge_response.status_code == 200


@pytest.mark.asyncio
async def test_get_upload_urls_returns_only_upload_scheme(client, db_session):
    # `client` is unused directly but pulls in the `app` fixture's lifespan-
    # managed engine/session handling, matching every other DB test in this
    # suite. Unique per-run filenames, and a subset assertion below: this DB
    # is shared across the whole test session (commits aren't rolled back
    # between tests), so other tests' upload sources are legitimately still
    # present here too.
    suffix = uuid.uuid4().hex[:8]
    url_a = f"upload://a-{suffix}.mp4"
    url_b = f"upload://b-{suffix}.mp4"
    await create_source(
        db_session, title="Upload one", source_type="video_url", url=url_a
    )
    await create_source(
        db_session, title="Upload two", source_type="video_url", url=url_b
    )
    youtube_source = await create_source(db_session, title="Not an upload")  # default youtube URL

    # A fresh AsyncSessionLocal() (same pattern the cron job itself uses)
    # rather than the fixture's own db_session — a raw read via the bare
    # fixture session with nothing else touching the app afterward hits an
    # unrelated, pre-existing asyncpg/event-loop teardown race in this test
    # harness (reproduced independently of this feature; out of scope here).
    async with AsyncSessionLocal() as read_session:
        urls = await SourceRepository.get_upload_urls(read_session)

    assert {url_a, url_b}.issubset(set(urls))
    assert all(url.startswith("upload://") for url in urls)
    assert youtube_source is not None  # sanity: the non-upload source was created too


@pytest.mark.asyncio
async def test_ranking_folder_get_upload_file_paths_returns_only_upload_scheme(
    client, db_session
):
    suffix = uuid.uuid4().hex[:8]
    file_path = f"upload://folder-clip-{suffix}.mp4"

    await create_user(db_session, user_id="local")
    folder_id = await RankingFolderRepository.get_or_create_folder(
        db_session, user_id="local", name=f"Library {suffix}"
    )
    await RankingFolderRepository.upsert_clip(
        db_session,
        folder_id=folder_id,
        file_path=file_path,
        original_filename="clip.mp4",
        duration_seconds=5.0,
        content_hash=f"hash-{suffix}",
    )

    async with AsyncSessionLocal() as read_session:
        paths = await RankingFolderRepository.get_upload_file_paths(read_session)

    assert file_path in paths
    assert all(path.startswith("upload://") for path in paths)


@pytest.mark.asyncio
async def test_ranking_inputs_get_upload_file_paths_returns_only_upload_scheme(
    client, db_session
):
    suffix = uuid.uuid4().hex[:8]
    file_path = f"upload://ranking-input-{suffix}.mp4"

    await create_user(db_session, user_id="local")
    task = await create_task(db_session, user_id="local", source_id=None, status="completed")
    await RankingRepository.add_input(
        db_session,
        task_id=task["id"],
        file_path=file_path,
        original_filename="clip.mp4",
        duration_seconds=5.0,
        order_index=0,
    )

    async with AsyncSessionLocal() as read_session:
        paths = await RankingRepository.get_upload_file_paths(read_session)

    assert file_path in paths
    assert all(path.startswith("upload://") for path in paths)


@pytest.mark.asyncio
async def test_cleanup_orphaned_uploads_job_protects_ranking_referenced_files(
    client, db_session, tmp_path
):
    """Regression test: the cron previously cross-referenced only `sources`,
    so a file still live in a Ranking folder library or attached to a
    Ranking project (same `uploads/` dir, same `upload://` scheme) was
    silently deleted the moment it turned 24h old."""
    config = Config()
    config.temp_dir = str(tmp_path)
    set_config_override(config)
    try:
        uploads_dir = tmp_path / "uploads"
        uploads_dir.mkdir(parents=True)

        suffix = uuid.uuid4().hex[:8]
        folder_clip_file = uploads_dir / f"folder-clip-{suffix}.mp4"
        folder_clip_file.write_bytes(b"folder clip")
        ranking_input_file = uploads_dir / f"ranking-input-{suffix}.mp4"
        ranking_input_file.write_bytes(b"ranking input")

        day_old = time.time() - (25 * 60 * 60)
        os.utime(folder_clip_file, (day_old, day_old))
        os.utime(ranking_input_file, (day_old, day_old))

        await create_user(db_session, user_id="local")
        folder_id = await RankingFolderRepository.get_or_create_folder(
            db_session, user_id="local", name=f"Library {suffix}"
        )
        await RankingFolderRepository.upsert_clip(
            db_session,
            folder_id=folder_id,
            file_path=f"upload://{folder_clip_file.name}",
            original_filename="clip.mp4",
            duration_seconds=5.0,
            content_hash=f"hash-{suffix}",
        )
        task = await create_task(db_session, user_id="local", source_id=None, status="completed")
        await RankingRepository.add_input(
            db_session,
            task_id=task["id"],
            file_path=f"upload://{ranking_input_file.name}",
            original_filename="clip.mp4",
            duration_seconds=5.0,
            order_index=0,
        )

        result = await cleanup_orphaned_uploads_job({})

        assert folder_clip_file.exists()  # still referenced by ranking_folder_clips
        assert ranking_input_file.exists()  # still referenced by ranking_inputs
        assert result["removed"] == 0
    finally:
        set_config_override(None)


@pytest.mark.asyncio
async def test_cleanup_orphaned_uploads_job_removes_old_unreferenced_files_only(
    client, db_session, tmp_path
):
    config = Config()
    config.temp_dir = str(tmp_path)
    set_config_override(config)
    try:
        uploads_dir = tmp_path / "uploads"
        uploads_dir.mkdir(parents=True)

        referenced = uploads_dir / "referenced.mp4"
        referenced.write_bytes(b"referenced")
        orphan_old = uploads_dir / "orphan-old.mp4"
        orphan_old.write_bytes(b"orphan old")
        orphan_recent = uploads_dir / "orphan-recent.mp4"
        orphan_recent.write_bytes(b"orphan recent")

        day_old = time.time() - (25 * 60 * 60)
        os.utime(orphan_old, (day_old, day_old))

        await create_source(
            db_session,
            title="Still-referenced upload",
            source_type="video_url",
            url="upload://referenced.mp4",
        )

        result = await cleanup_orphaned_uploads_job({})

        assert referenced.exists()  # still referenced by a source row
        assert orphan_recent.exists()  # orphaned but inside the grace period
        assert not orphan_old.exists()  # orphaned and past the grace period
        assert result["removed"] == 1
        assert result["freed_bytes"] == len(b"orphan old")
    finally:
        set_config_override(None)
