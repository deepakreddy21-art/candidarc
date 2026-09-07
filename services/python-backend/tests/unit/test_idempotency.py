"""Unit tests for owner-scoped idempotency locks."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

import pytest

from app.core.config import Settings
from app.core.errors import IDEMPOTENCY_IN_PROGRESS, IDEMPOTENCY_KEY_REUSED, ProviderError, http_status_for
from app.core.idempotency import (
    _COMPLETE_LUA,
    _RELEASE_LUA,
    _RENEW_LUA,
    MemoryIdempotencyStore,
    RedisIdempotencyStore,
    lock_ttl_seconds,
)


def test_idempotency_in_progress_maps_to_409() -> None:
    assert http_status_for(IDEMPOTENCY_IN_PROGRESS) == 409
    assert http_status_for(IDEMPOTENCY_KEY_REUSED) == 409


def test_lock_ttl_setting_above_120() -> None:
    settings = Settings()
    assert settings.idempotency_lock_ttl_seconds == 600
    assert settings.idempotency_lock_ttl_seconds > 120
    ttl = lock_ttl_seconds(
        response_ttl_seconds=settings.idempotency_ttl_seconds,
        lock_budget_seconds=settings.idempotency_lock_ttl_seconds,
    )
    assert ttl == 600
    assert ttl > 120


@pytest.mark.asyncio
async def test_concurrent_same_key_one_execution() -> None:
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:same"
    digest = "hash-same"
    started = 0
    finished = 0

    async def worker() -> str:
        nonlocal started, finished
        begun = await store.begin(key, digest, ttl_seconds=30)
        if begun.cached_response is not None:
            return "cached"
        assert begun.owner is not None
        started += 1
        await asyncio.sleep(0.05)
        await store.complete(key, digest, {"ok": True}, ttl_seconds=60, owner=begun.owner)
        finished += 1
        return "ran"

    first = await worker()
    assert first == "ran"
    # Second acquisition after complete should replay cache
    second = await store.begin(key, digest, ttl_seconds=30)
    assert second.cached_response == {"ok": True}
    assert second.owner is None
    assert started == 1
    assert finished == 1

    # True concurrency: second begin while first holds lock
    store2 = MemoryIdempotencyStore()
    results: list[str] = []

    async def contender(name: str) -> None:
        try:
            begun = await store2.begin(key, digest, ttl_seconds=30)
        except ProviderError as exc:
            results.append(f"{name}:error:{exc.code}")
            return
        if begun.cached_response is not None:
            results.append(f"{name}:cached")
            return
        assert begun.owner is not None
        await asyncio.sleep(0.05)
        await store2.complete(key, digest, {"winner": name}, ttl_seconds=60, owner=begun.owner)
        results.append(f"{name}:ran")

    await asyncio.gather(contender("a"), contender("b"))
    ran = [r for r in results if r.endswith(":ran")]
    in_progress = [r for r in results if "IDEMPOTENCY_IN_PROGRESS" in r]
    assert len(ran) == 1
    assert len(in_progress) == 1


@pytest.mark.asyncio
async def test_different_body_conflict_409() -> None:
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:conflict"
    begun = await store.begin(key, "hash-a", ttl_seconds=30)
    assert begun.owner is not None
    await store.complete(key, "hash-a", {"v": 1}, ttl_seconds=60, owner=begun.owner)
    with pytest.raises(ProviderError) as excinfo:
        await store.begin(key, "hash-b", ttl_seconds=30)
    assert excinfo.value.code == "IDEMPOTENCY_KEY_REUSED"


@pytest.mark.asyncio
async def test_release_wrong_owner_does_not_delete() -> None:
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:owner"
    begun = await store.begin(key, "hash-x", ttl_seconds=30)
    assert begun.owner is not None
    await store.release(key, "wrong-owner-token")
    # Lock still held — same hash still in progress
    with pytest.raises(ProviderError) as excinfo:
        await store.begin(key, "hash-x", ttl_seconds=30)
    assert excinfo.value.code == "IDEMPOTENCY_IN_PROGRESS"
    # Correct owner releases
    await store.release(key, begun.owner)
    again = await store.begin(key, "hash-x", ttl_seconds=30)
    assert again.owner is not None
    assert again.cached_response is None


@pytest.mark.asyncio
async def test_renew_requires_owner() -> None:
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:renew"
    begun = await store.begin(key, "hash-r", ttl_seconds=5)
    assert begun.owner is not None
    assert await store.renew(key, "not-owner", 30) is False
    assert await store.renew(key, begun.owner, 30) is True


# --- Memory Store: Wrong owner cannot complete ---
@pytest.mark.asyncio
async def test_memory_wrong_owner_cannot_complete() -> None:
    """Wrong owner cannot complete - result not published."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:wrong-owner-complete"
    digest = "hash-woc"

    begun = await store.begin(key, digest, ttl_seconds=30)
    assert begun.owner is not None
    real_owner = begun.owner

    # Wrong owner tries to complete
    result = await store.complete(key, digest, {"bad": True}, ttl_seconds=60, owner="wrong-owner")
    assert result is False

    # Verify result was not published - lock should still be held
    with pytest.raises(ProviderError) as excinfo:
        await store.begin(key, digest, ttl_seconds=30)
    assert excinfo.value.code == "IDEMPOTENCY_IN_PROGRESS"

    # Real owner can still complete
    result = await store.complete(key, digest, {"good": True}, ttl_seconds=60, owner=real_owner)
    assert result is True

    # Verify correct result is cached
    cached = await store.begin(key, digest, ttl_seconds=30)
    assert cached.cached_response == {"good": True}


# --- Memory Store: Expired lock cannot complete ---
@pytest.mark.asyncio
async def test_memory_expired_lock_cannot_complete() -> None:
    """Expired lock: complete does not write (lost ownership = discard)."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:expired-complete"
    digest = "hash-exp"

    # Create lock with very short TTL
    begun = await store.begin(key, digest, ttl_seconds=1)
    assert begun.owner is not None
    owner = begun.owner

    # Wait for lock to expire
    await asyncio.sleep(1.1)

    # Try to complete after expiration - should fail
    result = await store.complete(key, digest, {"expired": True}, ttl_seconds=60, owner=owner)
    assert result is False

    # New begin should succeed (old lock expired)
    new_begun = await store.begin(key, digest, ttl_seconds=30)
    assert new_begun.owner is not None
    assert new_begun.cached_response is None  # No cached response


# --- Memory Store: Successful owner complete returns cached response on begin ---
@pytest.mark.asyncio
async def test_memory_successful_complete_caches_response() -> None:
    """Successful owner complete returns cached response on subsequent begin."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:cache-test"
    digest = "hash-cache"
    response_payload = {"status": "success", "data": [1, 2, 3]}

    begun = await store.begin(key, digest, ttl_seconds=30)
    assert begun.owner is not None

    result = await store.complete(key, digest, response_payload, ttl_seconds=60, owner=begun.owner)
    assert result is True

    # Subsequent begin should return cached response
    cached = await store.begin(key, digest, ttl_seconds=30)
    assert cached.cached_response == response_payload
    assert cached.owner is None


# --- Memory Store: Complete returns False when lock doesn't exist ---
@pytest.mark.asyncio
async def test_memory_complete_no_lock() -> None:
    """Complete on non-existent key returns False."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:no-lock"

    result = await store.complete(key, "hash-x", {"data": True}, ttl_seconds=60, owner="some-owner")
    assert result is False


# --- Redis Store Tests (mocked) ---
@pytest.fixture
def mock_redis() -> AsyncMock:
    """Create a mock Redis client."""
    redis = AsyncMock()
    return redis


@pytest.mark.asyncio
async def test_redis_wrong_owner_cannot_complete(mock_redis: AsyncMock) -> None:
    """Wrong owner cannot complete via Redis - Lua returns 0."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-wrong-owner"
    digest = "hash-rwo"

    # Lua script returns 0 (owner mismatch)
    mock_redis.eval.return_value = 0

    result = await store.complete(key, digest, {"data": True}, ttl_seconds=60, owner="wrong-owner")
    assert result is False

    # Verify Lua was called with correct args
    mock_redis.eval.assert_called_once()
    call_args = mock_redis.eval.call_args
    assert call_args[0][0] == _COMPLETE_LUA
    assert call_args[0][1] == 2  # 2 keys
    assert call_args[0][2] == f"{key}:lock"
    assert call_args[0][3] == f"{key}:data"
    assert call_args[0][4] == "wrong-owner"


@pytest.mark.asyncio
async def test_redis_owner_matches_complete_succeeds(mock_redis: AsyncMock) -> None:
    """Correct owner completes successfully via Redis - Lua returns 1."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-owner-match"
    digest = "hash-rom"
    owner = "correct-owner"
    response = {"success": True, "value": 42}

    # Lua script returns 1 (success)
    mock_redis.eval.return_value = 1

    result = await store.complete(key, digest, response, ttl_seconds=120, owner=owner)
    assert result is True

    # Verify Lua was called with correct payload
    mock_redis.eval.assert_called_once()
    call_args = mock_redis.eval.call_args
    assert call_args[0][4] == owner
    payload = json.loads(call_args[0][5])
    assert payload["request_hash"] == digest
    assert payload["response"] == response
    assert call_args[0][6] == "120"  # TTL as string


@pytest.mark.asyncio
async def test_redis_expired_lock_cannot_complete(mock_redis: AsyncMock) -> None:
    """Expired lock (missing): Lua returns 0, complete returns False."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-expired"
    digest = "hash-rexp"

    # Lua script returns 0 (lock missing/expired)
    mock_redis.eval.return_value = 0

    result = await store.complete(key, digest, {"data": True}, ttl_seconds=60, owner="owner")
    assert result is False


@pytest.mark.asyncio
async def test_redis_wrong_owner_cannot_renew(mock_redis: AsyncMock) -> None:
    """Wrong owner cannot renew lock via Redis."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-renew"

    # Lua script returns 0 (owner mismatch)
    mock_redis.eval.return_value = 0

    result = await store.renew(key, "wrong-owner", ttl_seconds=60)
    assert result is False

    # Verify Lua was called
    mock_redis.eval.assert_called_once()
    call_args = mock_redis.eval.call_args
    assert call_args[0][0] == _RENEW_LUA


@pytest.mark.asyncio
async def test_redis_correct_owner_can_renew(mock_redis: AsyncMock) -> None:
    """Correct owner can renew lock via Redis."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-renew-ok"

    # Lua script returns 1 (success)
    mock_redis.eval.return_value = 1

    result = await store.renew(key, "correct-owner", ttl_seconds=60)
    assert result is True


@pytest.mark.asyncio
async def test_redis_wrong_owner_cannot_release(mock_redis: AsyncMock) -> None:
    """Wrong owner cannot release lock via Redis."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-release"

    # Lua script returns 0 (owner mismatch or not found)
    mock_redis.eval.return_value = 0

    await store.release(key, "wrong-owner")

    # Verify Lua was called
    mock_redis.eval.assert_called_once()
    call_args = mock_redis.eval.call_args
    assert call_args[0][0] == _RELEASE_LUA


# --- Concurrent execution tests ---
@pytest.mark.asyncio
async def test_concurrent_only_one_publishes() -> None:
    """Only one execution publishes result in concurrent scenario."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:concurrent-pub"
    digest = "hash-conc"
    published_count = 0

    async def worker(name: str) -> str:
        nonlocal published_count
        try:
            begun = await store.begin(key, digest, ttl_seconds=30)
        except ProviderError as exc:
            return f"{name}:error:{exc.code}"
        if begun.cached_response is not None:
            return f"{name}:cached"
        assert begun.owner is not None
        await asyncio.sleep(0.02)  # Simulate work
        success = await store.complete(key, digest, {"winner": name}, ttl_seconds=60, owner=begun.owner)
        if success:
            published_count += 1
            return f"{name}:published"
        return f"{name}:lost"

    results = await asyncio.gather(worker("a"), worker("b"), worker("c"))

    # Exactly one should publish
    assert published_count == 1
    assert sum(1 for r in results if r.endswith(":published")) == 1

    # Others should be blocked or lost
    errors = [r for r in results if "IDEMPOTENCY_IN_PROGRESS" in r]
    assert len(errors) == 2  # Two workers blocked


# --- IN_PROGRESS 409 semantics preserved ---
@pytest.mark.asyncio
async def test_in_progress_409_semantics() -> None:
    """IN_PROGRESS returns 409 status code."""
    store = MemoryIdempotencyStore()
    key = "idem:t:u:gen:409-test"
    digest = "hash-409"

    # First worker acquires lock
    begun = await store.begin(key, digest, ttl_seconds=30)
    assert begun.owner is not None

    # Second worker should get IN_PROGRESS error
    with pytest.raises(ProviderError) as excinfo:
        await store.begin(key, digest, ttl_seconds=30)

    assert excinfo.value.code == IDEMPOTENCY_IN_PROGRESS
    assert http_status_for(IDEMPOTENCY_IN_PROGRESS) == 409


# --- Redis begin/complete full flow (mocked) ---
@pytest.mark.asyncio
async def test_redis_full_flow_begin_complete(mock_redis: AsyncMock) -> None:
    """Full Redis flow: begin acquires lock, complete stores result atomically."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-flow"
    digest = "hash-flow"
    response = {"result": "success"}

    # Setup: no existing data, lock acquired successfully
    mock_redis.get.return_value = None
    mock_redis.set.return_value = True

    # Begin should acquire lock
    begun = await store.begin(key, digest, ttl_seconds=30)
    assert begun.owner is not None
    assert begun.cached_response is None
    owner = begun.owner

    # Complete should use Lua atomically
    mock_redis.eval.return_value = 1
    result = await store.complete(key, digest, response, ttl_seconds=60, owner=owner)
    assert result is True

    # Verify eval was called (not separate set+delete)
    assert mock_redis.eval.call_count == 1
    call_args = mock_redis.eval.call_args
    assert call_args[0][0] == _COMPLETE_LUA


# --- Redis begin returns cached response ---
@pytest.mark.asyncio
async def test_redis_begin_returns_cached(mock_redis: AsyncMock) -> None:
    """Redis begin returns cached response when data exists."""
    store = RedisIdempotencyStore(mock_redis)
    key = "idem:t:u:gen:redis-cached"
    digest = "hash-cached"
    cached_response = {"cached": True}

    # Setup: data key has cached response
    mock_redis.get.return_value = json.dumps({
        "request_hash": digest,
        "response": cached_response
    }).encode()

    begun = await store.begin(key, digest, ttl_seconds=30)
    assert begun.cached_response == cached_response
    assert begun.owner is None
