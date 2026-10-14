"""
Server-side Pending State Management for Pappu Assistant v2.

Handles:
- confirm: single resolved delete, or future dated add
- disambiguate: resolver returned multiple matches (capped at 5, newest first, stable ids)
- contact_confirm: fuzzy contact match (saves alias on yes, creates new contact on no)
- 5 minute expiration window
- Single active pending item per user (auto-supersedes previous active items)
"""

import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session

from app.models.pending_action import PendingAction
from app.models.contact import Contact
from app.assistant.schemas import (
    AssistantResponse,
    PendingSummary,
    PlanV2,
    Action,
    AddAction,
    DeleteAction,
    EditAction,
    Selector,
)
from app.assistant.executors.coordinator import execute_ops
from app.assistant.executors.base import ActionResult
from app.assistant.contacts import add_alias_to_contact, create_contact, normalize_name

DEFAULT_EXPIRY_SECONDS = 300  # 5 minutes


def _to_utc(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_active_pending(db: Session, user_id: uuid.UUID) -> Optional[PendingAction]:
    """
    Returns the single active pending action for user_id, or None.
    If the active item has expired, updates its status to 'expired' and commits.
    """
    item = (
        db.query(PendingAction)
        .filter(PendingAction.user_id == user_id, PendingAction.status == "pending")
        .order_by(PendingAction.created_at.desc())
        .first()
    )
    if not item:
        return None

    now = datetime.now(timezone.utc)
    expires_at = _to_utc(item.expires_at)

    if expires_at and expires_at < now:
        item.status = "expired"
        db.commit()
        db.refresh(item)
        return None

    return item


def get_pending_by_id(
    db: Session,
    pending_id: uuid.UUID,
    user_id: uuid.UUID,
) -> Optional[PendingAction]:
    """
    Fetches a pending item by id, strictly scoped to user_id.
    Returns None if the item does not exist or belongs to another user.
    """
    return (
        db.query(PendingAction)
        .filter(PendingAction.id == pending_id, PendingAction.user_id == user_id)
        .first()
    )


def supersede_pending(db: Session, user_id: uuid.UUID) -> Optional[PendingAction]:
    """
    Marks any currently active pending item for user_id as superseded.
    """
    active = get_active_pending(db, user_id)
    if active:
        active.status = "superseded"
        db.commit()
        db.refresh(active)
        return active
    return None


def create_pending(
    db: Session,
    user_id: uuid.UUID,
    kind: str,
    plan_json: Dict[str, Any],
    candidates: Optional[List[Dict[str, Any]]] = None,
    question: Optional[str] = None,
    expires_in_seconds: int = DEFAULT_EXPIRY_SECONDS,
) -> Tuple[PendingAction, Optional[PendingAction]]:
    """
    Creates a new pending item for user_id.
    Automatically supersedes any previously active pending item.
    Candidates for disambiguate are capped at 5, newest first.
    """
    # 1. Supersede any existing active pending item
    superseded = supersede_pending(db, user_id)

    # 2. Cap candidates at 5 if provided
    capped_candidates = None
    if candidates is not None:
        capped_candidates = candidates[:5]

    # 3. Compute expiry
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(seconds=expires_in_seconds)

    # Embed question if provided
    payload_plan = dict(plan_json)
    if question and "question" not in payload_plan:
        payload_plan["question"] = question

    pending = PendingAction(
        id=uuid.uuid4(),
        user_id=user_id,
        kind=kind,
        plan_json=payload_plan,
        candidates_json=capped_candidates,
        status="pending",
        expires_at=expires_at,
    )
    db.add(pending)
    db.commit()
    db.refresh(pending)

    return pending, superseded


def format_pending_summary(item: PendingAction) -> PendingSummary:
    """
    Converts a PendingAction DB record into a client-facing PendingSummary.
    """
    q = (item.plan_json or {}).get("question") or "Confirmation required."
    expires_str = None
    if item.expires_at:
        expires_str = _to_utc(item.expires_at).isoformat()

    return PendingSummary(
        id=str(item.id),
        kind=item.kind,
        question=q,
        candidates=item.candidates_json,
        expires_at=expires_str,
    )


def handle_answer_pending(
    db: Session,
    user_id: uuid.UUID,
    pending_id: uuid.UUID,
    answer: str,
    index: Optional[int] = None,
) -> AssistantResponse:
    """
    Deterministically processes an answer (yes, no, pick, cancel) for pending_id.
    No LLM call is made. Returns unified AssistantResponse shape.
    """
    item = get_pending_by_id(db, pending_id, user_id)
    if not item:
        # Cross user or nonexistent pending id returns 404
        return None

    now = datetime.now(timezone.utc)
    expires_at = _to_utc(item.expires_at)

    # 1. Check expiration
    if item.status == "expired" or (expires_at and expires_at < now and item.status == "pending"):
        item.status = "expired"
        db.commit()
        return AssistantResponse(
            reply_text="That request expired, please say it again.",
            spoken_text="That request expired, please say it again.",
            language="en",
            results=[],
            pending=None,
            changed=False,
        )

    # 2. Check if already resolved or superseded
    if item.status in ("resolved", "superseded", "cancelled"):
        return AssistantResponse(
            reply_text="Nothing is waiting for confirmation.",
            spoken_text="Nothing is waiting for confirmation.",
            language="en",
            results=[],
            pending=None,
            changed=False,
        )

    clean_answer = (answer or "").strip().lower()

    # 3. Answer: NO or CANCEL
    if clean_answer in ("no", "cancel"):
        if item.kind == "contact_confirm":
            # On 'no' for contact_confirm: create a new contact with the spoken name
            plan_payload = item.plan_json or {}
            action_data = plan_payload.get("action") or {}
            spoken_name = plan_payload.get("spoken_name") or action_data.get("contact") or "Unknown"

            new_contact = create_contact(db, user_id, spoken_name)
            action_data["contact"] = new_contact.name
            add_op = AddAction.model_validate(action_data)

            results = execute_ops(db, user_id, [add_op], confirmed=True)
            item.status = "resolved"
            db.commit()

            reply = f"Created contact {new_contact.name} and recorded transaction."
            return AssistantResponse(
                reply_text=reply,
                spoken_text=reply,
                language="en",
                results=[r.model_dump() for r in results],
                pending=None,
                changed=True,
            )

        # Standard cancellation for confirm and disambiguate
        item.status = "cancelled"
        db.commit()
        return AssistantResponse(
            reply_text="Cancelled.",
            spoken_text="Cancelled.",
            language="en",
            results=[],
            pending=None,
            changed=False,
        )

    # 4. Answer: YES
    if clean_answer == "yes":
        if item.kind == "confirm":
            plan_payload = item.plan_json or {}
            op_data = plan_payload.get("action") or plan_payload.get("op") or plan_payload
            op_type = op_data.get("op")

            if op_type == "delete":
                target_id_str = plan_payload.get("target_id")
                target_uuid = uuid.UUID(target_id_str) if target_id_str else None
                del_op = DeleteAction.model_validate(op_data)
                results = execute_ops(
                    db,
                    user_id,
                    [del_op],
                    last_touched_id=target_uuid,
                    confirmed_deletes=True,
                )
                item.status = "resolved"
                db.commit()

                reply = "Deleted transaction."
                return AssistantResponse(
                    reply_text=reply,
                    spoken_text=reply,
                    language="en",
                    results=[r.model_dump() for r in results],
                    pending=None,
                    changed=True,
                )

            elif op_type == "add":
                add_op = AddAction.model_validate(op_data)
                results = execute_ops(db, user_id, [add_op], confirmed=True)
                item.status = "resolved"
                db.commit()

                reply = "Recorded transaction."
                return AssistantResponse(
                    reply_text=reply,
                    spoken_text=reply,
                    language="en",
                    results=[r.model_dump() for r in results],
                    pending=None,
                    changed=True,
                )

        elif item.kind == "contact_confirm":
            plan_payload = item.plan_json or {}
            target_contact_id_str = plan_payload.get("target_contact_id")
            spoken_name = plan_payload.get("spoken_name", "")
            action_data = plan_payload.get("action") or {}

            target_contact = None
            if target_contact_id_str:
                target_contact = (
                    db.query(Contact)
                    .filter(Contact.id == uuid.UUID(target_contact_id_str), Contact.user_id == user_id)
                    .first()
                )

            if target_contact and spoken_name:
                add_alias_to_contact(db, target_contact.id, user_id, spoken_name)
                action_data["contact"] = target_contact.name

            add_op = AddAction.model_validate(action_data)
            results = execute_ops(db, user_id, [add_op], confirmed=True)
            item.status = "resolved"
            db.commit()

            contact_label = target_contact.name if target_contact else "contact"
            reply = f"Saved alias for {contact_label} and recorded transaction."
            return AssistantResponse(
                reply_text=reply,
                spoken_text=reply,
                language="en",
                results=[r.model_dump() for r in results],
                pending=None,
                changed=True,
            )

        elif item.kind == "disambiguate":
            candidates = item.candidates_json or []
            summary = format_pending_summary(item)
            reply = f"Please select an option by number (1 to {len(candidates)})."
            return AssistantResponse(
                reply_text=reply,
                spoken_text=reply,
                language="en",
                results=[],
                pending=summary,
                changed=False,
            )

    # 5. Answer: PICK (with candidate index)
    if clean_answer == "pick":
        candidates = item.candidates_json or []
        if index is None or index < 1 or index > len(candidates):
            summary = format_pending_summary(item)
            reply = f"Please choose a valid number between 1 and {len(candidates)}."
            return AssistantResponse(
                reply_text=reply,
                spoken_text=reply,
                language="en",
                results=[],
                pending=summary,
                changed=False,
            )

        chosen = candidates[index - 1]
        chosen_id = chosen.get("id")
        plan_payload = item.plan_json or {}
        orig_op = plan_payload.get("action") or plan_payload.get("op") or plan_payload
        op_type = orig_op.get("op")

        if op_type == "delete":
            # Select candidate then move to confirm for delete
            amt = chosen.get("amount")
            cat = chosen.get("category") or "expense"
            dt = chosen.get("date") or chosen.get("txn_date") or ""
            question = f"Delete ₹{amt} {cat} on {dt}?"

            del_action = {
                "op": "delete",
                "selector": {"ref": "last_touched"},
            }

            new_pending, _ = create_pending(
                db=db,
                user_id=user_id,
                kind="confirm",
                plan_json={"action": del_action, "target_id": str(chosen_id)},
                candidates=[chosen],
                question=question,
            )
            item.status = "resolved"
            db.commit()

            summary = format_pending_summary(new_pending)
            return AssistantResponse(
                reply_text=question,
                spoken_text=question,
                language="en",
                results=[],
                pending=summary,
                changed=False,
            )

        elif op_type == "edit":
            # Apply edit patch directly to chosen candidate
            patch = orig_op.get("patch") or {}
            edit_action = {
                "op": "edit",
                "selector": {"ref": "last_touched"},
                "patch": patch,
            }
            edit_op = EditAction.model_validate(edit_action)
            chosen_uuid = uuid.UUID(str(chosen_id)) if chosen_id else None
            results = execute_ops(
                db,
                user_id,
                [edit_op],
                last_touched_id=chosen_uuid,
            )
            item.status = "resolved"
            db.commit()

            reply = "Updated transaction."
            return AssistantResponse(
                reply_text=reply,
                spoken_text=reply,
                language="en",
                results=[r.model_dump() for r in results],
                pending=None,
                changed=True,
            )

    # Fallback for unrecognized answer
    summary = format_pending_summary(item)
    return AssistantResponse(
        reply_text="Please reply with yes, no, or pick a number.",
        spoken_text="Please reply with yes, no, or pick a number.",
        language="en",
        results=[],
        pending=summary,
        changed=False,
    )
