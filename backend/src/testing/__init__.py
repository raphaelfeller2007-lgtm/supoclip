"""Isolated pipeline-stage testing tab (dev tool, off by default).

See CLAUDE.md's "Testing Tab" section for the full picture. Quick map:
- `paths.py` — where fixtures/cache live on disk.
- `fixtures.py` — read/list/save canned stage inputs+outputs.
- `cache.py` — real-run artifact caching ("from prior run" input source).
- `costs.py` — static, labeled-as-estimate per-provider cost table.
- `stages.py` — the stage registry: each stage wraps an existing pipeline
  function, never reimplements it.
- `runner.py` — stub/real dispatch, timing, cost estimation, config
  override scoping, benchmarking.
"""
