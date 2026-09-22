import pytest

from tests.fixtures.factories import create_user


@pytest.mark.asyncio
async def test_admin_route_requires_admin_user(app, client, db_session, auth_headers):
    # require_admin_user() bypasses to the single implicit local-first user
    # (always "admin") when require_auth is off, which is the fixture's
    # default so unrelated tests don't need real sessions — this test is
    # specifically about the multi-user/hosted mode admin check, so it must
    # opt into that mode itself.
    app.state.config.require_auth = True
    await create_user(
        db_session,
        user_id="user-1",
        email="owner@example.com",
        is_admin=False,
    )

    response = await client.get(
        "/admin/health",
        headers=auth_headers,
    )

    assert response.status_code == 403


@pytest.mark.asyncio
async def test_feedback_rejects_invalid_category(client, auth_headers):
    response = await client.post(
        "/feedback",
        headers=auth_headers,
        json={"category": "unknown", "message": "hi"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_performance_metrics_require_admin(app, client, db_session, auth_headers):
    app.state.config.require_auth = True
    await create_user(
        db_session,
        user_id="user-1",
        email="owner@example.com",
        is_admin=False,
    )

    response = await client.get("/tasks/metrics/performance", headers=auth_headers)

    assert response.status_code == 403
