"""Redis-backed (or in-memory demo) idempotency for generate/audit/regenerate/final-qa."""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.errors import IDEMPOTENCY_KEY_REUSED, ProviderError


class IdempotencyStore(Protocol):
    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> dict[str, Any] | None:
        """Acquire lock or return cached response. Raises on key reuse with different body."""
        ...

    async def complete(self, key: str, request_hash: str, response: dict[str, Any], ttl_seconds: int) -> None: ...

    async def release(self, key: str) -> None: ...


@dataclass
class _MemoryEntry:
    request_hash: str
    response: dict[str, Any] | None
    expires_at: float
    locked: bool


class MemoryIdempotencyStore:
    """Process-local TTL store for demo mode when REDIS_URL is absent."""

    def __init__(self) -> None:
        self._entries: dict[str, _MemoryEntry] = {}
        self._lock = asyncio.Lock()

    def _purge(self, now: float) -> None:
        expired = [k for k, v in self._entries.items() if v.expires_at <= now and not v.locked]
        for key in expired:
            del self._entries[key]

    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> dict[str, Any] | None:
        async with self._lock:
            now = time.time()
            self._purge(now)
            existing = self._entries.get(key)
            if existing and existing.expires_at > now:
                if existing.request_hash != request_hash:
                    raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
                if existing.response is not None:
                    return existing.response
                # Concurrent in-flight: wait briefly outside would be better; spin-wait via polling
                raise ProviderError("IDEMPOTENCY_IN_PROGRESS", "Request with this idempotency key is in progress")
            self._entries[key] = _MemoryEntry(
                request_hash=request_hash,
                response=None,
                expires_at=now + ttl_seconds,
                locked=True,
            )
            return None

    async def complete(self, key: str, request_hash: str, response: dict[str, Any], ttl_seconds: int) -> None:
        async with self._lock:
            self._entries[key] = _MemoryEntry(
                request_hash=request_hash,
                response=response,
                expires_at=time.time() + ttl_seconds,
                locked=False,
            )

    async def release(self, key: str) -> None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry and entry.response is None:
                del self._entries[key]


class RedisIdempotencyStore:
    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> dict[str, Any] | None:
        lock_key = f"{key}:lock"
        data_key = f"{key}:data"
        existing = await self._redis.get(data_key)
        if existing:
            payload = json.loads(existing)
            if payload.get("request_hash") != request_hash:
                raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            cached = payload.get("response")
            return cached if isinstance(cached, dict) else None

        acquired = await self._redis.set(lock_key, request_hash, nx=True, ex=min(ttl_seconds, 120))
        if not acquired:
            # Another worker holds the lock — check again for completed response
            existing = await self._redis.get(data_key)
            if existing:
                payload = json.loads(existing)
                if payload.get("request_hash") != request_hash:
                    raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
                cached = payload.get("response")
                return cached if isinstance(cached, dict) else None
            # Same key in progress with possibly same/different hash
            lock_hash = await self._redis.get(lock_key)
            if lock_hash and lock_hash != request_hash and lock_hash != request_hash.encode():
                # Compare as string
                lock_s = lock_hash.decode() if isinstance(lock_hash, bytes) else str(lock_hash)
                if lock_s != request_hash:
                    raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            raise ProviderError("IDEMPOTENCY_IN_PROGRESS", "Request with this idempotency key is in progress")

        # Double-check data after acquiring lock
        existing = await self._redis.get(data_key)
        if existing:
            payload = json.loads(existing)
            if payload.get("request_hash") != request_hash:
                await self._redis.delete(lock_key)
                raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            await self._redis.delete(lock_key)
            cached = payload.get("response")
            return cached if isinstance(cached, dict) else None
        return None

    async def complete(self, key: str, request_hash: str, response: dict[str, Any], ttl_seconds: int) -> None:
        data_key = f"{key}:data"
        lock_key = f"{key}:lock"
        payload = json.dumps({"request_hash": request_hash, "response": response})
        await self._redis.set(data_key, payload, ex=ttl_seconds)
        await self._redis.delete(lock_key)

    async def release(self, key: str) -> None:
        await self._redis.delete(f"{key}:lock")


def request_hash(body: dict[str, Any]) -> str:
    canonical = json.dumps(body, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def idempotency_redis_key(tenant_id: str, user_id: str, operation: str, idempotency_key: str) -> str:
    return f"idem:{tenant_id}:{user_id}:{operation}:{idempotency_key}"
