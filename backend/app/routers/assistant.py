"""
Assistant Router for Pappu Assistant v2.

Endpoints:
- POST /assistant/message: Core conversational message endpoint.
- POST /assistant/pending/{id}/answer: Deterministically resolves an active confirmation.
"""

import uuid
import json
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.config import ASSISTANT_V2
from app.auth import get_current_user_id
from app.models.profile import Profile
from app.models.chat_message import ChatMessage
from app.models.idempotency import AssistantIdempotency
from app.services.tracing import AssistantTracer
from app.assistant.schemas import (
    AssistantMessageRequest,
    AssistantResponse,
    PendingAnswerRequest,
    PendingSummary,
    Plan,
    AddAction,
    EditAction,
    DeleteAction,
    QueryAction,
    UndoActionOp,
    AnswerPendingAction,
)
from app.assistant.context import load_assistant_context
from app.assistant.planner import AssistantPlanner, check_fast_path
from app.assistant.resolver import resolve
from app.assistant.last_touched import get_last_touched_id
from app.assistant.pending import (
    create_pending,
    get_active_pending,
    get_pending_by_id,
    handle_answer_pending,
    format_pending_summary,
)
from app.assistant.executors.add import execute_add
from app.assistant.executors.edit import execute_edit
from app.assistant.executors.query import execute_query
from app.assistant.executors.undo import execute_undo
from app.assistant.executors.base import serialize_transaction
from app.assistant.composer import compose_reply, format_inr, format_date_short

router = APIRouter(prefix="/assistant", tags=["assistant"])


def _ensure_profile_exists(db: Session, user_id: uuid.UUID) -> Profile:
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(id=user_id, name="User", preferred_language="en")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    return profile


@router.post("/pending/{pending_id}/answer", response_model=AssistantResponse)
def answer_pending_endpoint(
    pending_id: uuid.UUID,
    body: PendingAnswerRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> AssistantResponse:
    """
    Deterministically resolves an active pending confirmation (yes, no, pick, cancel).
    No LLM call is executed.
    Cross-user pending IDs return 404.
    """
    if not ASSISTANT_V2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistant v2 is disabled",
        )

    _ensure_profile_exists(db, user_id)

    item = get_pending_by_id(db, pending_id, user_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending confirmation not found",
        )

    response = handle_answer_pending(
        db=db,
        user_id=user_id,
        pending_id=pending_id,
        answer=body.answer,
        index=body.index,
    )

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending confirmation not found",
        )

    return response


@router.get("/pending", response_model=Optional[PendingSummary])
def get_active_pending_endpoint(
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
) -> Optional[PendingSummary]:
    """
    Returns the active pending confirmation for the authenticated user, or None.
    If the active pending item has expired, returns None.
    """
    if not ASSISTANT_V2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistant v2 is disabled",
        )

    _ensure_profile_exists(db, user_id)
    item = get_active_pending(db, user_id)
    if not item:
        return None

    return format_pending_summary(item)


@router.post("/message", response_model=AssistantResponse)
def handle_assistant_message(
    body: AssistantMessageRequest,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    plan_override: Optional[Plan] = Depends(lambda: None),
) -> AssistantResponse:
    """
    Core conversational endpoint for Pappu Assistant v2.
    Orchestrates context loading, fast path, single LLM planner call,
    deterministic execution, pending state management, reply composition,
    idempotency, and tracing.
    """
    if not ASSISTANT_V2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Assistant v2 is disabled",
        )

    _ensure_profile_exists(db, user_id)

    # 1. Idempotency Check
    if body.client_msg_id:
        existing_record = (
            db.query(AssistantIdempotency)
            .filter(
                AssistantIdempotency.user_id == user_id,
                AssistantIdempotency.client_msg_id == body.client_msg_id,
            )
            .first()
        )
        if existing_record:
            return AssistantResponse.model_validate(existing_record.response_json)

    # 2. Start Tracer
    with AssistantTracer(
        db=db,
        user_id=user_id,
        message_text=body.text,
        input_type=body.input,
    ) as tracer:

        # 3. Context Loading (in parallel)
        with tracer.time_stage("context_loading"):
            ctx = load_assistant_context(user_id, db=db)
            tracer.context_json = ctx.to_dict_for_prompt()

        # 4. Fast Path check
        with tracer.time_stage("fast_path"):
            fast_plan = check_fast_path(body.text, ctx)

        # 5. Planner: Single LLM call (unless fast path or override)
        if plan_override:
            plan = plan_override
            tracer.set_llm_output("PLAN_OVERRIDE")
            tracer.set_plan(plan)
        elif fast_plan:
            plan = fast_plan
            tracer.set_llm_output("FAST_PATH")
            tracer.set_plan(plan)
        else:
            with tracer.time_stage("planner"):
                planner = AssistantPlanner()
                plan = planner.plan(body.text, ctx, tracer=tracer, include_reasoning=False)

        # 6. Deterministic Execution and Pending State Management
        with tracer.time_stage("execution"):
            last_touched_id = get_last_touched_id(db, user_id)
            results: List[Dict[str, Any]] = []
            created_pending = None
            multi_action_pending_dropped = False
            changed = False
            last_filters_used: Optional[Dict[str, Any]] = None

            for action in plan.actions:
                op_name = action.op

                if op_name == "add":
                    batch_id = uuid.uuid4()
                    res = execute_add(db, user_id, action, batch_id, confirmed=False)

                    if res.needs_confirmation:
                        if not created_pending:
                            if res.status == "contact_confirm" and res.candidates:
                                cand = res.candidates[0]
                                cand_name = cand.get("candidate_name", "contact")
                                q = f"Is this {cand_name}?"
                                created_pending, _ = create_pending(
                                    db=db,
                                    user_id=user_id,
                                    kind="contact_confirm",
                                    plan_json={
                                        "target_contact_id": cand.get("candidate_id"),
                                        "spoken_name": cand.get("spoken_name"),
                                        "action": action.model_dump(),
                                        "question": q,
                                    },
                                    question=q,
                                )
                            else:
                                # Future date add
                                amt_str = format_inr(action.amount)
                                dt_str = format_date_short(action.date)
                                q = f"Record {amt_str} for {dt_str}?"
                                created_pending, _ = create_pending(
                                    db=db,
                                    user_id=user_id,
                                    kind="confirm",
                                    plan_json={
                                        "action": action.model_dump(),
                                        "question": q,
                                    },
                                    question=q,
                                )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        if res.ok:
                            changed = True
                        results.append(res.model_dump())

                elif op_name == "edit":
                    resolve_res = resolve(db, user_id, action.selector, last_touched_id)
                    last_filters_used = resolve_res.filters_used

                    if resolve_res.outcome == "none":
                        results.append({
                            "ok": False,
                            "action": "edit",
                            "error": "Transaction not found",
                            "filters_used": resolve_res.filters_used,
                        })
                    elif resolve_res.outcome == "many":
                        if not created_pending:
                            cands = [serialize_transaction(r) for r in resolve_res.rows[:5]]
                            created_pending, _ = create_pending(
                                db=db,
                                user_id=user_id,
                                kind="disambiguate",
                                plan_json={"action": action.model_dump()},
                                candidates=cands,
                            )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        # Exactly one row matched: execute edit immediately with undo
                        batch_id = uuid.uuid4()
                        res = execute_edit(
                            db,
                            user_id,
                            action,
                            batch_id,
                            last_touched_id=last_touched_id,
                        )
                        if res.ok:
                            changed = True
                        results.append(res.model_dump())

                elif op_name == "delete":
                    resolve_res = resolve(db, user_id, action.selector, last_touched_id)
                    last_filters_used = resolve_res.filters_used

                    if resolve_res.outcome == "none":
                        results.append({
                            "ok": False,
                            "action": "delete",
                            "error": "Transaction not found",
                            "filters_used": resolve_res.filters_used,
                        })
                    elif resolve_res.outcome == "many":
                        if not created_pending:
                            cands = [serialize_transaction(r) for r in resolve_res.rows[:5]]
                            created_pending, _ = create_pending(
                                db=db,
                                user_id=user_id,
                                kind="disambiguate",
                                plan_json={"action": action.model_dump()},
                                candidates=cands,
                            )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        # Exactly one row matched: always create a pending confirm
                        if not created_pending:
                            target_row = resolve_res.rows[0]
                            amt_str = format_inr(target_row.amount)
                            cat_str = target_row.contact.name if target_row.contact else (target_row.category.name if target_row.category else "Food")
                            dt_str = format_date_short(target_row.txn_date)
                            q = f"Delete {cat_str} {amt_str} on {dt_str}?"
                            created_pending, _ = create_pending(
                                db=db,
                                user_id=user_id,
                                kind="confirm",
                                plan_json={
                                    "action": action.model_dump(),
                                    "target_id": str(target_row.id),
                                    "question": q,
                                },
                                candidates=[serialize_transaction(target_row)],
                                question=q,
                            )
                        else:
                            multi_action_pending_dropped = True

                elif op_name == "query":
                    res = execute_query(db, user_id, action, last_touched_id)
                    results.append(res.model_dump())

                elif op_name == "undo":
                    res = execute_undo(db, user_id, action)
                    if res.ok:
                        changed = True
                    results.append(res.model_dump())

                elif op_name == "answer_pending":
                    active_item = get_active_pending(db, user_id)
                    if active_item:
                        ans_val = str(action.value)
                        ans_res = handle_answer_pending(
                            db,
                            user_id,
                            active_item.id,
                            answer=ans_val,
                        )
                        if ans_res:
                            # Save chat messages and return answer result
                            user_msg = ChatMessage(
                                user_id=user_id,
                                role="user",
                                text=body.text,
                                payload=json.dumps({"input": body.input, "client_msg_id": body.client_msg_id}),
                            )
                            asst_msg = ChatMessage(
                                user_id=user_id,
                                role="assistant",
                                text=ans_res.reply_text,
                                payload=json.dumps(ans_res.model_dump()),
                            )
                            db.add_all([user_msg, asst_msg])
                            db.commit()

                            if body.client_msg_id:
                                idemp = AssistantIdempotency(
                                    user_id=user_id,
                                    client_msg_id=body.client_msg_id,
                                    response_json=ans_res.model_dump(),
                                )
                                db.add(idemp)
                                db.commit()

                            return ans_res

                    results.append({
                        "ok": False,
                        "action": "answer_pending",
                        "error": "Nothing is waiting for confirmation.",
                    })

                elif op_name in ("clarify", "chat"):
                    # Informational, handled directly by composer
                    pass

        # 7. Summary for pending item if one was created
        pending_summary = None
        if created_pending:
            pending_summary = format_pending_summary(created_pending)

        # 8. Compose deterministic response
        with tracer.time_stage("composer"):
            lang = getattr(plan, "language", None) or "en"
            reply_text, spoken_text = compose_reply(
                plan=plan,
                results=results,
                pending=pending_summary,
                language=lang,
                filters_used=last_filters_used,
            )

            if multi_action_pending_dropped:
                drop_msg = " I have asked about the first transaction. Please repeat the second request after confirming."
                reply_text += drop_msg
                spoken_text += drop_msg

        # 9. Save Chat Messages
        user_msg = ChatMessage(
            user_id=user_id,
            role="user",
            text=body.text,
            payload=json.dumps({"input": body.input, "client_msg_id": body.client_msg_id}, default=str),
        )
        asst_msg = ChatMessage(
            user_id=user_id,
            role="assistant",
            text=reply_text,
            payload=json.dumps({
                "spoken_text": spoken_text,
                "plan": plan.model_dump() if plan else None,
                "results": results,
                "pending": pending_summary.model_dump() if pending_summary else None,
                "changed": changed,
            }, default=str),
        )
        db.add_all([user_msg, asst_msg])
        db.commit()

        # 10. Record Trace & Results
        tracer.set_resolver_filters(last_filters_used)
        tracer.set_result({"results": results, "changed": changed})

        response_obj = AssistantResponse(
            reply_text=reply_text,
            spoken_text=spoken_text,
            language=getattr(plan, "language", "en"),
            results=results,
            pending=pending_summary,
            changed=changed,
        )

        # 11. Record Idempotency
        if body.client_msg_id:
            idemp = AssistantIdempotency(
                user_id=user_id,
                client_msg_id=body.client_msg_id,
                response_json=json.loads(json.dumps(response_obj.model_dump(), default=str)),
            )
            db.add(idemp)
            db.commit()

        return response_obj
