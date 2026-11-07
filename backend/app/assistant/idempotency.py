"""
Retry idempotency for POST /assistant/message, keyed by (user_id, client_msg_id).

The key is reserved BEFORE any work runs. The unique constraint
uq_user_client_msg_id decides the winner when two requests race; there is no
check-then-insert. Every query is scoped by the verified user_id.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.idempotency import AssistantIdempotency

logger = logging.getLogger(__name__)

# An in_progress reservation older than this is treated as abandoned (worker
# crashed or was killed) and the next retry may take it over. It must exceed the
# slowest request that is still alive: the planner makes up to 2 Sarvam calls,
# each up to 3 attempts with a 45s read timeout (~4.6 min), with no overall
# deadline. A shorter window would let a retry re-run a slow live request.
STALE_AFTER = timedelta(seconds=300)


@dataclass
class Reservation:
    # "reserved": caller owns the key and must finish() or release() it.
    # "done": a previous request finished; response_json is its stored response.
    # "in_progress": another request holds the key and is not stale yet.
    outcome: str
    record_id: Optional[uuid.UUID] = None
    reserved_at: Optional[datetime] = None
    response_json: Optional[Dict[str, Any]] = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _scoped(db: Session, user_id: uuid.UUID, client_msg_id: str):
    return db.query(AssistantIdempotency).filter(
        AssistantIdempotency.user_id == user_id,
        AssistantIdempotency.client_msg_id == client_msg_id,
    )


def reserve(db: Session, user_id: uuid.UUID, client_msg_id: str) -> Reservation:
    """Claim (user_id, client_msg_id) before doing any work."""
    last_error: Optional[IntegrityError] = None
    # A second pass only happens if the holder released the key between our
    # failed insert and our read.
    for _ in range(2):
        now = _now()
        record_id = uuid.uuid4()
        db.add(AssistantIdempotency(
            id=record_id,
            user_id=user_id,
            client_msg_id=client_msg_id,
            status="in_progress",
            reserved_at=now,
        ))
        try:
            db.commit()
            return Reservation("reserved", record_id=record_id, reserved_at=now)
        except IntegrityError as exc:
            db.rollback()
            last_error = exc

        # Key exists. Take it over only if its holder looks abandoned. The
        # conditional UPDATE is a compare-and-set: of two concurrent takers,
        # only one matches reserved_at < cutoff.
        taken = (
            _scoped(db, user_id, client_msg_id)
            .filter(
                AssistantIdempotency.status == "in_progress",
                AssistantIdempotency.reserved_at < now - STALE_AFTER,
            )
            .update({"reserved_at": now}, synchronize_session=False)
        )
        db.commit()

        existing = _scoped(db, user_id, client_msg_id).first()
        if existing is None:
            continue
        if taken:
            logger.warning("Taking over stale idempotency reservation for client_msg_id=%s", client_msg_id)
            return Reservation("reserved", record_id=existing.id, reserved_at=now)
        if existing.status == "done":
            return Reservation("done", response_json=existing.response_json)
        return Reservation("in_progress")

    raise last_error


def finish(db: Session, user_id: uuid.UUID, reservation: Reservation, response_json: Dict[str, Any]) -> None:
    """Store the response so later retries with the same key get it back."""
    db.query(AssistantIdempotency).filter(
        AssistantIdempotency.id == reservation.record_id,
        AssistantIdempotency.user_id == user_id,
    ).update({"status": "done", "response_json": response_json}, synchronize_session=False)
    db.commit()


def release(db: Session, user_id: uuid.UUID, reservation: Reservation) -> None:
    """Drop our in_progress reservation after a failed request so a retry can run now.

    Only deletes the row if we still own it (not taken over since). If this
    fails, the reservation simply goes stale after STALE_AFTER.
    """
    try:
        db.rollback()
        db.query(AssistantIdempotency).filter(
            AssistantIdempotency.id == reservation.record_id,
            AssistantIdempotency.user_id == user_id,
            AssistantIdempotency.status == "in_progress",
            AssistantIdempotency.reserved_at == reservation.reserved_at,
        ).delete(synchronize_session=False)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to release idempotency reservation %s", reservation.record_id)
