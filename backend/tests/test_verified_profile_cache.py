import uuid
from collections import OrderedDict
from unittest.mock import MagicMock

import pytest

from app.routers import assistant as assistant_router


@pytest.fixture
def fresh_cache(monkeypatch):
    cache = OrderedDict()
    monkeypatch.setattr(assistant_router, "_VERIFIED_USER_PROFILES", cache)
    monkeypatch.setattr(assistant_router, "_VERIFIED_USER_PROFILES_MAX", 3)
    return cache


def _db_with_existing_profile():
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = MagicMock()
    return db


def test_cache_hit_skips_db_lookup(fresh_cache):
    user_id = uuid.uuid4()
    db = _db_with_existing_profile()

    assistant_router._ensure_profile_exists(db, user_id)
    assert db.query.call_count == 1

    assistant_router._ensure_profile_exists(db, user_id)
    assert db.query.call_count == 1  # second call served from cache


def test_cache_is_bounded_and_evicts_least_recently_used(fresh_cache):
    db = _db_with_existing_profile()
    a, b, c, d = (uuid.uuid4() for _ in range(4))

    for uid in (a, b, c):
        assistant_router._ensure_profile_exists(db, uid)
    assistant_router._ensure_profile_exists(db, a)  # touch a -> b is now LRU
    assistant_router._ensure_profile_exists(db, d)

    assert len(fresh_cache) == 3
    assert list(fresh_cache) == [c, a, d]

    # Evicted user falls back to a DB lookup, same as an uncached user.
    calls_before = db.query.call_count
    assistant_router._ensure_profile_exists(db, b)
    assert db.query.call_count == calls_before + 1


def test_missing_profile_is_created_then_cached(fresh_cache):
    user_id = uuid.uuid4()
    db = MagicMock()
    db.query.return_value.filter.return_value.first.return_value = None

    assistant_router._ensure_profile_exists(db, user_id)
    db.add.assert_called_once()
    db.commit.assert_called_once()
    assert user_id in fresh_cache
