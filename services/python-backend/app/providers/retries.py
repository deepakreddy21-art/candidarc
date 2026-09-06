"""Provider retry helpers — retry only 429/5xx/timeouts with jitter."""

from __future__ import annotations

import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import TypeVar

from app.core.errors import (
    PROVIDER_OUTPUT_INVALID,
    PROVIDER_RATE_LIMITED,
    PROVIDER_TIMEOUT,
    PROVIDER_UNAVAILABLE,
    ProviderError,
)

T = TypeVar("T")


def map_sdk_exception(exc: BaseException) -> ProviderError:
    name = type(exc).__name__.lower()
    message = str(exc).lower()
    if "timeout" in name or "timeout" in message:
        return ProviderError(PROVIDER_TIMEOUT, str(exc))
    if "rate" in name or "429" in message or "rate_limit" in message:
        return ProviderError(PROVIDER_RATE_LIMITED, str(exc))
    if "authentication" in name or "auth" in message or "api_key" in message or "401" in message:
        return ProviderError("MISSING_CREDENTIALS", str(exc))
    if "validation" in name or "badrequest" in name or "400" in message:
        return ProviderError(PROVIDER_OUTPUT_INVALID, str(exc))
    status = getattr(exc, "status_code", None) or getattr(exc, "status", None)
    if status == 429:
        return ProviderError(PROVIDER_RATE_LIMITED, str(exc))
    if isinstance(status, int) and status >= 500:
        return ProviderError(PROVIDER_UNAVAILABLE, str(exc))
    if isinstance(status, int) and 400 <= status < 500:
        return ProviderError(PROVIDER_OUTPUT_INVALID, str(exc))
    return ProviderError(PROVIDER_UNAVAILABLE, str(exc))


def is_retryable(error: ProviderError) -> bool:
    return error.code in {PROVIDER_TIMEOUT, PROVIDER_RATE_LIMITED, PROVIDER_UNAVAILABLE}


async def with_retries(
    fn: Callable[[], Awaitable[T]],
    *,
    max_retries: int = 2,
) -> tuple[T, int]:
    attempt = 0
    while True:
        try:
            result = await fn()
            return result, attempt
        except ProviderError as exc:
            if not is_retryable(exc) or attempt >= max_retries:
                raise
            delay = (0.25 * (2**attempt)) + random.uniform(0, 0.25)
            await asyncio.sleep(delay)
            attempt += 1
        except Exception as exc:
            mapped = map_sdk_exception(exc)
            if not is_retryable(mapped) or attempt >= max_retries:
                raise mapped from exc
            delay = (0.25 * (2**attempt)) + random.uniform(0, 0.25)
            await asyncio.sleep(delay)
            attempt += 1
