"""
Per-user rate limits for the routes that cost money on every call (LLM, speech, bill reading).

A sliding window per (user, bucket), kept in memory. That is enough while the backend runs as
one process; with several workers or instances each one keeps its own count, so the effective
limit is multiplied and a shared store would be needed (PROJECT_SPEC.md §8 Rate limits).
"""

import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import Depends, HTTPException, status

from app.auth import get_current_user_id
from app.config import RATE_LIMITS, RATE_LIMITS_ENABLED

WINDOW_SECONDS = 60.0

_lock = threading.Lock()
_hits: dict[tuple[uuid.UUID, str], deque] = defaultdict(deque)


def reset_rate_limits() -> None:
    with _lock:
        _hits.clear()


def _check(user_id: uuid.UUID, bucket: str, limit: int, now: float) -> float:
    """Records a hit. Returns 0 when allowed, else the seconds until the next slot frees up."""
    key = (user_id, bucket)
    with _lock:
        hits = _hits[key]
        while hits and now - hits[0] >= WINDOW_SECONDS:
            hits.popleft()
        if len(hits) >= limit:
            return max(1.0, WINDOW_SECONDS - (now - hits[0]))
        hits.append(now)
        return 0.0


def rate_limit(bucket: str):
    """FastAPI dependency: at most RATE_LIMITS[bucket] calls a minute for the verified user."""

    def dependency(user_id: uuid.UUID = Depends(get_current_user_id)) -> None:
        if not RATE_LIMITS_ENABLED:
            return
        wait = _check(user_id, bucket, RATE_LIMITS[bucket], time.monotonic())
        if wait:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please wait a moment and try again.",
                headers={"Retry-After": str(int(wait))},
            )

    return dependency
