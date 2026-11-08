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
from app.assistant.composer import (
    compose_reply,
    format_inr,
    format_date_short,
    TEMPLATES,
    date_part,
    localize_category,
    render,
    resolve_reply_language,
    to_spoken,
    _compose_single_delete,
    _compose_single_edit,
    budget_alert_lines,
)

DEFAULT_EXPIRY_SECONDS = 300  # 5 minutes

# Answers that confirm or cancel a pending item (English, Manglish, Malayalam script).
# Keep in sync with FAST_PATH_EXACT_MATCHES in planner.py.
CONFIRM_ANSWERS = (
    "confirm", "ok", "aam", "ഉവ്വ്", "sure", "yes",
    "athe", "sheri", "seri", "aanu", "അതെ", "ശരി", "ആണ്",
)
CANCEL_ANSWERS = ("venda", "vendaa", "illa", "വേണ്ട", "വേണ്ടാ", "ഇല്ല")


def pending_language(item: Optional[PendingAction]) -> Optional[str]:
    """Reply language the pending question was asked in, stored at creation."""
    if item is None:
        return None
    return (item.plan_json or {}).get("language")


def _response(
    lang: str,
    text: str,
    results: Optional[List[Dict[str, Any]]] = None,
    pending: Optional[PendingSummary] = None,
    changed: bool = False,
) -> AssistantResponse:
    return AssistantResponse(
        reply_text=text,
        spoken_text=to_spoken(text, lang),
        language=lang,
        results=results or [],
        pending=pending,
        changed=changed,
    )


def format_delete_confirmation_question(row_or_candidate: Any, lang: str = "en") -> str:
    """
    Unified single formatter for every pending delete question and confirmation:
    contact name or category, amount in Indian format without .0,
    and date like 14 Oct, with income or expense stated correctly from the row.
    """
    amt_val = getattr(row_or_candidate, "amount", None)
    if amt_val is None and isinstance(row_or_candidate, dict):
        amt_val = row_or_candidate.get("amount")
    amt_str = format_inr(amt_val or 0)

    dt_val = getattr(row_or_candidate, "txn_date", None)
    if dt_val is None and isinstance(row_or_candidate, dict):
        dt_val = row_or_candidate.get("date") or row_or_candidate.get("txn_date")
    dt_str = format_date_short(dt_val, lang)

    txn_type = getattr(row_or_candidate, "type", None)
    if txn_type is None and isinstance(row_or_candidate, dict):
        txn_type = row_or_candidate.get("type") or row_or_candidate.get("kind")
    is_income = str(txn_type or "").strip().lower() == "income"

    contact_name = None
    if hasattr(row_or_candidate, "contact") and row_or_candidate.contact:
        contact_name = getattr(row_or_candidate.contact, "name", None)
    elif isinstance(row_or_candidate, dict):
        contact_name = row_or_candidate.get("contact_name") or row_or_candidate.get("contact")

    category_name = None
    if hasattr(row_or_candidate, "category") and row_or_candidate.category:
        category_name = getattr(row_or_candidate.category, "name", None)
    elif isinstance(row_or_candidate, dict):
        category_name = row_or_candidate.get("category_name") or row_or_candidate.get("category")

    if contact_name and str(contact_name).strip():
        label = str(contact_name).strip()
    elif category_name and str(category_name).strip() and str(category_name).strip().lower() not in ("people", "other", "expense", "income"):
        label = localize_category(str(category_name).strip(), lang)
    else:
        label = render("word.income" if is_income else "word.expense", lang)

    return render("pending.delete_question", lang, label=label, amt=amt_str, date=dt_str)


def format_edit_confirmation_question(row_or_candidate: Any, patch: Dict[str, Any], lang: str = "en") -> str:
    """
    Formatter for pending edit question:
    contact name or category, previous amount, date, and target change.
    Example: Change Shopping ₹350 on 15 Sep to ₹300?
    """
    amt_val = getattr(row_or_candidate, "amount", None)
    if amt_val is None and isinstance(row_or_candidate, dict):
        amt_val = row_or_candidate.get("amount")
    amt_str = format_inr(amt_val or 0)

    dt_val = getattr(row_or_candidate, "txn_date", None)
    if dt_val is None and isinstance(row_or_candidate, dict):
        dt_val = row_or_candidate.get("date") or row_or_candidate.get("txn_date")
    dt_part = date_part(format_date_short(dt_val, lang), lang)

    contact_name = None
    if hasattr(row_or_candidate, "contact") and row_or_candidate.contact:
        contact_name = getattr(row_or_candidate.contact, "name", None)
    elif isinstance(row_or_candidate, dict):
        contact_name = row_or_candidate.get("contact_name") or row_or_candidate.get("contact")

    category_name = None
    if hasattr(row_or_candidate, "category") and row_or_candidate.category:
        category_name = getattr(row_or_candidate.category, "name", None)
    elif isinstance(row_or_candidate, dict):
        category_name = row_or_candidate.get("category_name") or row_or_candidate.get("category")

    if contact_name and str(contact_name).strip():
        label = str(contact_name).strip()
    elif category_name and str(category_name).strip() and str(category_name).strip().lower() not in ("people", "other", "expense", "income"):
        label = localize_category(str(category_name).strip(), lang)
    else:
        label = render("word.transaction", lang)

    if patch and "amount" in patch and patch["amount"] is not None:
        amt_new = format_inr(patch["amount"])
        return render(
            "pending.edit_question_amount", lang, label=label, amt=amt_str, date_part=dt_part, amt_new=amt_new
        )
    return render("pending.edit_question", lang, label=label, amt=amt_str, date_part=dt_part)


def format_superseded_message(item: PendingAction, lang: str = "en") -> str:
    """
    Formats a user-facing cancellation sentence when an active pending item
    is superseded by an unrelated new message.
    Example: 'I cancelled the pending delete of രാഹുൽ ₹300.'
    """
    plan_json = item.plan_json or {}
    action = plan_json.get("action") or {}
    op = action.get("op") or ("add" if item.kind == "contact_confirm" else "action")
    q = plan_json.get("question") or getattr(item, "question", None) or ""

    cands = item.candidates_json or []
    first_cand = cands[0] if (cands and isinstance(cands, list) and isinstance(cands[0], dict)) else {}

    amt_str = None
    if "amount" in first_cand:
        amt_str = format_inr(first_cand["amount"])
    elif "amount" in action:
        amt_str = format_inr(action["amount"])

    label = None
    contact_name = (
        first_cand.get("contact_name")
        or first_cand.get("contact")
        or action.get("contact")
        or (action.get("selector") or {}).get("contact")
    )
    category_name = (
        first_cand.get("category_name")
        or first_cand.get("category")
        or action.get("category")
        or (action.get("selector") or {}).get("category")
    )

    if contact_name and str(contact_name).strip():
        label = str(contact_name).strip()
    elif category_name and str(category_name).strip() and str(category_name).strip().lower() not in ("people", "other", "expense", "income"):
        label = localize_category(str(category_name).strip(), lang)
    elif first_cand.get("type") == "income" or action.get("kind") == "income":
        label = render("word.income", lang)
    elif first_cand.get("type") == "expense" or action.get("kind") == "expense":
        label = render("word.expense", lang)

    if label and amt_str:
        subject = f"{label} {amt_str}"
    elif label:
        subject = label
    elif amt_str:
        subject = amt_str
    elif lang == "en" and q and q.startswith("Delete ") and " on " in q:
        subject = q.removeprefix("Delete ").removesuffix("?").rsplit(" on ", 1)[0].strip()
    else:
        subject = render("word.transaction", lang)

    if f"op.{op}" in TEMPLATES:
        op_word = render(f"op.{op}", lang)
    else:
        op_word = op if lang == "en" else render("op.action", lang)

    return render("pending.superseded", lang, op=op_word, subject=subject)


def _failed_execution_response(results: List[ActionResult], lang: str = "en") -> Optional[AssistantResponse]:
    """Returns a failure reply if a confirmed op did not succeed, else None."""
    if results and all(r.ok for r in results):
        return None
    dumped = [r.model_dump() for r in results]
    reply, spoken = compose_reply(plan=None, results=dumped, language=lang)
    return AssistantResponse(
        reply_text=reply,
        spoken_text=spoken,
        language=lang,
        results=dumped,
        pending=None,
        changed=False,
    )


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
    q = (item.plan_json or {}).get("question") or render(
        "pending.default_question", pending_language(item) or "en"
    )
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
    detected_language: Optional[str] = None,
    preferred_language: Optional[str] = None,
) -> AssistantResponse:
    """
    Deterministically processes an answer (yes, no, pick, cancel) for pending_id.
    No LLM call is made. Returns unified AssistantResponse shape.
    Reply language: the language detected for this answer, else the language the
    pending question was asked in, else the profile preference.
    """
    item = get_pending_by_id(db, pending_id, user_id)
    if not item:
        # Cross user or nonexistent pending id returns 404
        return None

    lang = resolve_reply_language(detected_language or pending_language(item), preferred_language)

    now = datetime.now(timezone.utc)
    expires_at = _to_utc(item.expires_at)

    # 1. Check expiration
    if item.status == "expired" or (expires_at and expires_at < now and item.status == "pending"):
        item.status = "expired"
        db.commit()
        return _response(lang, render("pending.expired", lang))

    # 2. Check if already resolved or superseded
    if item.status in ("resolved", "superseded", "cancelled"):
        return _response(lang, render("error.nothing_pending", lang))

    clean_answer = (answer or "").strip().lower()

    # Normalize answer synonyms
    if clean_answer in CONFIRM_ANSWERS:
        clean_answer = "yes"
    elif clean_answer in CANCEL_ANSWERS:
        clean_answer = "no"
    elif clean_answer in ("new", "+ add new", "add new", "add_new"):
        clean_answer = "no"  # For contact_confirm, creates new contact
    elif clean_answer in ("choose", "select"):
        clean_answer = "pick"
    else:
        # Check if clean_answer directly matches a candidate id, category, or name
        candidates = item.candidates_json or []
        for i, c in enumerate(candidates):
            if isinstance(c, dict):
                c_id = str(c.get("id") or "").lower()
                c_name = str(c.get("name") or "").lower()
                c_cat = str(c.get("category") or "").lower()
                if clean_answer in (c_id, c_name, c_cat):
                    clean_answer = "pick"
                    index = i + 1
                    break

    # 3. Answer: NO or CANCEL
    if clean_answer in ("no", "cancel"):
        if item.kind == "contact_confirm":
            plan_payload = item.plan_json or {}
            is_new = plan_payload.get("is_new", False)
            if is_new:
                item.status = "cancelled"
                db.commit()
                return _response(lang, render("pending.cancelled", lang))

            # On 'no' for fuzzy contact_confirm: create a new contact with the spoken name
            action_data = plan_payload.get("action") or {}
            spoken_name = plan_payload.get("spoken_name") or action_data.get("contact") or "Unknown"

            new_contact = create_contact(db, user_id, spoken_name)
            action_data["contact"] = new_contact.name
            add_op = AddAction.model_validate(action_data)

            results = execute_ops(db, user_id, [add_op], confirmed=True)
            item.status = "resolved"
            db.commit()

            reply = render("pending.created_contact", lang, name=new_contact.name)
            return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)

        # Standard cancellation for confirm and disambiguate
        item.status = "cancelled"
        db.commit()
        return _response(lang, render("pending.cancelled", lang))

    # 4. Answer: YES
    if clean_answer == "yes":
        if item.kind == "confirm":
            plan_payload = item.plan_json or {}
            op_data = plan_payload.get("action") or plan_payload.get("op") or plan_payload
            op_type = op_data.get("op")

            if op_type == "delete":
                target_id_str = plan_payload.get("target_id")
                target_uuid = uuid.UUID(target_id_str) if target_id_str else None
                if target_uuid:
                    # Act on the exact row shown in the question, not a re-resolved selector.
                    op_data = {**op_data, "selector": {"ref": "last_touched"}}
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

                failed = _failed_execution_response(results, lang)
                if failed:
                    return failed

                # Compose reply from deleted data or candidate
                cands = item.candidates_json or []
                del_cand = cands[0] if (cands and isinstance(cands, list) and isinstance(cands[0], dict)) else {}
                res_data = results[0].data if (results and results[0].data) else {}
                merged_info = {**del_cand, **res_data}

                reply = _compose_single_delete({"data": merged_info}, lang)
                return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)

            elif op_type == "edit":
                target_id_str = plan_payload.get("target_id")
                target_uuid = uuid.UUID(target_id_str) if target_id_str else None
                if target_uuid:
                    # Act on the exact row shown in the question, not a re-resolved selector.
                    op_data = {**op_data, "selector": {"ref": "last_touched"}}
                edit_op = EditAction.model_validate(op_data)
                results = execute_ops(
                    db,
                    user_id,
                    [edit_op],
                    last_touched_id=target_uuid,
                )
                item.status = "resolved"
                db.commit()

                failed = _failed_execution_response(results, lang)
                if failed:
                    return failed

                edit_res = results[0] if results else None
                if edit_res and edit_res.ok:
                    reply = _compose_single_edit(edit_res.model_dump(), lang)
                else:
                    reply = render("pending.updated_undo", lang)

                return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)

            elif op_type == "add":
                add_op = AddAction.model_validate(op_data)
                results = execute_ops(db, user_id, [add_op], confirmed=True)
                item.status = "resolved"
                db.commit()

                dumped = [r.model_dump() for r in results]
                reply = " ".join([render("pending.recorded", lang), *budget_alert_lines(dumped, lang)])
                return _response(lang, reply, results=dumped, changed=True)

        elif item.kind == "contact_confirm":
            plan_payload = item.plan_json or {}
            is_new = plan_payload.get("is_new", False)
            target_contact_id_str = plan_payload.get("target_contact_id")
            spoken_name = plan_payload.get("spoken_name", "")
            action_data = plan_payload.get("action") or {}

            if is_new:
                new_contact = create_contact(db, user_id, spoken_name)
                action_data["contact"] = new_contact.name
                add_op = AddAction.model_validate(action_data)
                results = execute_ops(db, user_id, [add_op], confirmed=True)
                item.status = "resolved"
                db.commit()

                reply = render("pending.created_contact", lang, name=new_contact.name)
                return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)
            else:
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

                contact_label = target_contact.name if target_contact else render("word.contact", lang)
                reply = render("pending.saved_alias", lang, name=contact_label)
                return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)

        elif item.kind == "disambiguate":
            candidates = item.candidates_json or []
            summary = format_pending_summary(item)
            reply = render("pending.select_number", lang, count=len(candidates))
            return _response(lang, reply, pending=summary)

    # 5. Answer: PICK (with candidate index)
    if clean_answer == "pick":
        candidates = item.candidates_json or []
        if index == 0 and len(candidates) > 0:
            index = 1
        if index is None or index < 1 or index > len(candidates):
            summary = format_pending_summary(item)
            reply = render("pending.invalid_number", lang, count=len(candidates))
            return _response(lang, reply, pending=summary)

        chosen = candidates[index - 1]
        chosen_id = chosen.get("id")
        plan_payload = item.plan_json or {}
        orig_op = plan_payload.get("action") or plan_payload.get("op") or plan_payload
        op_type = orig_op.get("op")

        if op_type == "delete":
            # Select candidate then move to confirm for delete
            question = format_delete_confirmation_question(chosen, lang)

            del_action = {
                "op": "delete",
                "selector": {"ref": "last_touched"},
            }

            new_pending, _ = create_pending(
                db=db,
                user_id=user_id,
                kind="confirm",
                plan_json={"action": del_action, "target_id": str(chosen_id), "language": lang},
                candidates=[chosen],
                question=question,
            )
            item.status = "resolved"
            db.commit()

            summary = format_pending_summary(new_pending)
            return _response(lang, question, pending=summary)

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

            failed = _failed_execution_response(results, lang)
            if failed:
                return failed

            reply = render("pending.updated", lang)
            return _response(lang, reply, results=[r.model_dump() for r in results], changed=True)

    # Fallback for unrecognized answer
    summary = format_pending_summary(item)
    return _response(lang, render("pending.reply_hint", lang), pending=summary)
