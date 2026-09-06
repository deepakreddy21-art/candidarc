"""Unit tests for owner-scoped idempotency locks."""

from __future__ import annotations

import asyncio

import pytest

from app.core.config import Settings
from app.core.errors import ProviderError
from app.core.idempotency import MemoryIdempotencyStore, lock_ttl_seconds


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
