"""Redis-backed (or in-memory demo) idempotency for generate/audit/regenerate/final-qa.

Locks are owner-scoped: only the lock holder may renew, release, or complete.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from dataclasses import dataclass
from typing import Any, Protocol

from app.core.errors import IDEMPOTENCY_KEY_REUSED, ProviderError

# Compare-and-delete: only delete if owner matches.
_RELEASE_LUA = """
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local ok, data = pcall(cjson.decode, raw)
if not ok then
  return 0
end
if data['owner'] == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
"""

# Compare-and-renew: extend TTL only if owner matches.
_RENEW_LUA = """
local raw = redis.call('GET', KEYS[1])
if not raw then
  return 0
end
local ok, data = pcall(cjson.decode, raw)
if not ok then
  return 0
end
if data['owner'] == ARGV[1] then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
  return 1
end
return 0
"""


@dataclass(frozen=True, slots=True)
class IdempotencyBeginResult:
    """Result of begin(): cached response (replay) or lock owner token (new execution)."""

    cached_response: dict[str, Any] | None
    owner: str | None


class IdempotencyStore(Protocol):
    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> IdempotencyBeginResult:
        """Acquire lock or return cached response. Raises on key reuse with different body."""
        ...

    async def complete(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any],
        ttl_seconds: int,
        owner: str,
    ) -> None: ...

    async def release(self, key: str, owner: str) -> None: ...

    async def renew(self, key: str, owner: str, ttl_seconds: int) -> bool: ...


def lock_ttl_seconds(*, response_ttl_seconds: int, lock_budget_seconds: int) -> int:
    """Compute in-flight lock TTL.

    Covers provider timeouts + retries via ``idempotency_lock_ttl_seconds`` (default 600).
    Never caps at 120 — floor is 180s.
    """
    return max(180, min(response_ttl_seconds, lock_budget_seconds))


def _lock_payload(owner: str, request_hash: str) -> str:
    return json.dumps({"owner": owner, "request_hash": request_hash}, separators=(",", ":"))


def _parse_lock(raw: Any) -> tuple[str | None, str | None]:
    if raw is None:
        return None, None
    text = raw.decode() if isinstance(raw, bytes) else str(raw)
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data.get("owner"), data.get("request_hash")
    except json.JSONDecodeError:
        # Legacy plain-hash lock value
        return None, text
    return None, text


@dataclass
class _MemoryEntry:
    request_hash: str
    response: dict[str, Any] | None
    expires_at: float
    locked: bool
    owner: str | None = None


class MemoryIdempotencyStore:
    """Process-local TTL store for demo mode when REDIS_URL is absent."""

    def __init__(self) -> None:
        self._entries: dict[str, _MemoryEntry] = {}
        self._lock = asyncio.Lock()

    def _purge(self, now: float) -> None:
        expired = [k for k, v in self._entries.items() if v.expires_at <= now and not v.locked]
        for key in expired:
            del self._entries[key]

    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> IdempotencyBeginResult:
        async with self._lock:
            now = time.time()
            self._purge(now)
            existing = self._entries.get(key)
            if existing and existing.expires_at > now:
                if existing.request_hash != request_hash:
                    raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
                if existing.response is not None:
                    return IdempotencyBeginResult(cached_response=existing.response, owner=None)
                raise ProviderError("IDEMPOTENCY_IN_PROGRESS", "Request with this idempotency key is in progress")
            owner = str(uuid.uuid4())
            self._entries[key] = _MemoryEntry(
                request_hash=request_hash,
                response=None,
                expires_at=now + ttl_seconds,
                locked=True,
                owner=owner,
            )
            return IdempotencyBeginResult(cached_response=None, owner=owner)

    async def complete(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any],
        ttl_seconds: int,
        owner: str,
    ) -> None:
        async with self._lock:
            existing = self._entries.get(key)
            if existing is not None and existing.locked and existing.owner is not None and existing.owner != owner:
                return
            self._entries[key] = _MemoryEntry(
                request_hash=request_hash,
                response=response,
                expires_at=time.time() + ttl_seconds,
                locked=False,
                owner=None,
            )

    async def release(self, key: str, owner: str) -> None:
        async with self._lock:
            entry = self._entries.get(key)
            if entry and entry.response is None and entry.owner == owner:
                del self._entries[key]

    async def renew(self, key: str, owner: str, ttl_seconds: int) -> bool:
        async with self._lock:
            entry = self._entries.get(key)
            if entry is None or entry.owner != owner or entry.response is not None:
                return False
            entry.expires_at = time.time() + ttl_seconds
            return True


class RedisIdempotencyStore:
    def __init__(self, redis_client: Any) -> None:
        self._redis = redis_client

    async def begin(self, key: str, request_hash: str, ttl_seconds: int) -> IdempotencyBeginResult:
        lock_key = f"{key}:lock"
        data_key = f"{key}:data"
        existing = await self._redis.get(data_key)
        if existing:
            payload = json.loads(existing)
            if payload.get("request_hash") != request_hash:
                raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            cached = payload.get("response")
            return IdempotencyBeginResult(
                cached_response=cached if isinstance(cached, dict) else None,
                owner=None,
            )

        owner = str(uuid.uuid4())
        acquired = await self._redis.set(lock_key, _lock_payload(owner, request_hash), nx=True, ex=ttl_seconds)
        if not acquired:
            existing = await self._redis.get(data_key)
            if existing:
                payload = json.loads(existing)
                if payload.get("request_hash") != request_hash:
                    raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
                cached = payload.get("response")
                return IdempotencyBeginResult(
                    cached_response=cached if isinstance(cached, dict) else None,
                    owner=None,
                )
            _, lock_hash = _parse_lock(await self._redis.get(lock_key))
            if lock_hash and lock_hash != request_hash:
                raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            raise ProviderError("IDEMPOTENCY_IN_PROGRESS", "Request with this idempotency key is in progress")

        existing = await self._redis.get(data_key)
        if existing:
            payload = json.loads(existing)
            if payload.get("request_hash") != request_hash:
                await self.release(key, owner)
                raise ProviderError(IDEMPOTENCY_KEY_REUSED, "Idempotency key reused with different request body")
            await self.release(key, owner)
            cached = payload.get("response")
            return IdempotencyBeginResult(
                cached_response=cached if isinstance(cached, dict) else None,
                owner=None,
            )
        return IdempotencyBeginResult(cached_response=None, owner=owner)

    async def complete(
        self,
        key: str,
        request_hash: str,
        response: dict[str, Any],
        ttl_seconds: int,
        owner: str,
    ) -> None:
        data_key = f"{key}:data"
        lock_key = f"{key}:lock"
        _, lock_hash = _parse_lock(await self._redis.get(lock_key))
        # Only the owner may complete; if lock already expired, still write response for safety
        # when hash matches or lock is gone.
        if lock_hash is not None and lock_hash != request_hash:
            return
        current_owner, _ = _parse_lock(await self._redis.get(lock_key))
        if current_owner is not None and current_owner != owner:
            return
        payload = json.dumps({"request_hash": request_hash, "response": response})
        await self._redis.set(data_key, payload, ex=ttl_seconds)
        await self.release(key, owner)

    async def release(self, key: str, owner: str) -> None:
        lock_key = f"{key}:lock"
        await self._redis.eval(_RELEASE_LUA, 1, lock_key, owner)

    async def renew(self, key: str, owner: str, ttl_seconds: int) -> bool:
        lock_key = f"{key}:lock"
        result = await self._redis.eval(_RENEW_LUA, 1, lock_key, owner, str(ttl_seconds))
        return bool(result)


def request_hash(body: dict[str, Any]) -> str:
    canonical = json.dumps(body, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def idempotency_redis_key(tenant_id: str, user_id: str, operation: str, idempotency_key: str) -> str:
    return f"idem:{tenant_id}:{user_id}:{operation}:{idempotency_key}"
