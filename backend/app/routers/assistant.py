"""
Assistant Router for Pappu Assistant v2.

Endpoints:
- POST /assistant/message: Core conversational message endpoint.
- POST /assistant/pending/{id}/answer: Deterministically resolves an active confirmation.
"""

import uuid
import json
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.rate_limit import rate_limit
from app.models.profile import Profile
from app.models.chat_message import ChatMessage
from app.models.pending_action import PendingAction
from app.assistant import idempotency
from app.services.tracing import AssistantTracer, save_trace_background
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
from app.assistant.planner import AssistantPlanner, check_fast_path, FAST_PATH_EXACT_MATCHES
from app.assistant.resolver import resolve
from app.assistant.last_touched import get_last_touched_id, is_recent_or_touched
from app.assistant.pending import (
    create_pending,
    get_active_pending,
    get_pending_by_id,
    supersede_pending,
    handle_answer_pending,
    format_pending_summary,
    format_budget_change_question,
    format_delete_confirmation_question,
    format_edit_confirmation_question,
    format_superseded_message,
)
from app.assistant.sanitizer import sanitize_plan
from app.assistant.executors.add import execute_add
from app.assistant.executors.edit import execute_edit
from app.assistant.executors.query import execute_query
from app.assistant.executors.undo import execute_undo
from app.assistant.executors.budget import execute_set_budget
from app.assistant.executors.base import serialize_transaction
from app.assistant.composer import (
    compose_reply,
    format_inr,
    format_date_short,
    derive_mood,
    render,
    resolve_reply_language,
    to_spoken,
    tts_language_code,
)

router = APIRouter(prefix="/assistant", tags=["assistant"])


# Bounded LRU of user_ids whose profile row is known to exist (skips a DB lookup).
_VERIFIED_USER_PROFILES_MAX = 1024
_VERIFIED_USER_PROFILES: "OrderedDict[uuid.UUID, None]" = OrderedDict()
_VERIFIED_USER_PROFILES_LOCK = threading.Lock()


def _ensure_profile_exists(db: Session, user_id: uuid.UUID) -> Profile:
    with _VERIFIED_USER_PROFILES_LOCK:
        if user_id in _VERIFIED_USER_PROFILES:
            _VERIFIED_USER_PROFILES.move_to_end(user_id)
            return Profile(id=user_id, name="User", preferred_language="en")
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(id=user_id, name="User", preferred_language="en")
        db.add(profile)
        db.commit()
        db.refresh(profile)
    with _VERIFIED_USER_PROFILES_LOCK:
        _VERIFIED_USER_PROFILES[user_id] = None
        _VERIFIED_USER_PROFILES.move_to_end(user_id)
        while len(_VERIFIED_USER_PROFILES) > _VERIFIED_USER_PROFILES_MAX:
            _VERIFIED_USER_PROFILES.popitem(last=False)
    return profile


def _load_preferred_language(db: Session, user_id: uuid.UUID) -> str:
    """profiles.preferred_language for the verified user (the cached stub above is always 'en')."""
    lang = db.query(Profile.preferred_language).filter(Profile.id == user_id).scalar()
    return lang or "en"


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
        preferred_language=_load_preferred_language(db, user_id),
    )

    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending confirmation not found",
        )

    # Backend is single writer: persist user answer and assistant response
    user_msg = ChatMessage(
        user_id=user_id,
        role="user",
        text=body.answer,
        payload=json.dumps({"input": "tap", "pending_id": str(pending_id)}),
    )
    asst_msg = ChatMessage(
        user_id=user_id,
        role="assistant",
        text=response.reply_text,
        payload=json.dumps(response.model_dump()),
    )
    db.add_all([user_msg, asst_msg])
    db.commit()

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
    _ensure_profile_exists(db, user_id)
    item = get_active_pending(db, user_id)
    if not item:
        return None

    return format_pending_summary(item)


STILL_PROCESSING_RETRY_AFTER_SECONDS = 2


@router.post("/message", response_model=AssistantResponse, dependencies=[Depends(rate_limit("assistant"))])
def handle_assistant_message(
    body: AssistantMessageRequest,
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db),
    user_id: uuid.UUID = Depends(get_current_user_id),
    plan_override: Optional[Plan] = Depends(lambda: None),
):
    """
    Core conversational endpoint for Pappu Assistant v2.

    With a client_msg_id, the (user_id, client_msg_id) key is reserved before any
    work runs: a retry of a finished request gets the stored response back, and a
    retry that arrives while the first is still running gets 409 still_processing.
    """
    _ensure_profile_exists(db, user_id)

    if not body.client_msg_id:
        return _process_message(body, background_tasks, db, user_id, plan_override)

    reservation = idempotency.reserve(db, user_id, body.client_msg_id)
    if reservation.outcome == "done":
        return AssistantResponse.model_validate(reservation.response_json)
    if reservation.outcome == "in_progress":
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={"detail": "Still processing this message. Retry shortly.", "code": "still_processing"},
            headers={"Retry-After": str(STILL_PROCESSING_RETRY_AFTER_SECONDS)},
        )

    try:
        response = _process_message(body, background_tasks, db, user_id, plan_override)
    except Exception:
        idempotency.release(db, user_id, reservation)
        raise
    idempotency.finish(db, user_id, reservation, json.loads(json.dumps(response.model_dump(), default=str)))
    return response


def _process_message(
    body: AssistantMessageRequest,
    background_tasks: Optional[BackgroundTasks],
    db: Session,
    user_id: uuid.UUID,
    plan_override: Optional[Plan],
) -> AssistantResponse:
    """
    Orchestrates context loading, fast path, single LLM planner call,
    deterministic execution, pending state management, reply composition,
    and tracing. Idempotency is handled by the caller.
    """
    # 2. Start Tracer (auto_save=False: trace saving is off the request path)
    with AssistantTracer(
        db=db,
        user_id=user_id,
        message_text=body.text,
        input_type=body.input,
        auto_save=False,
    ) as tracer:
        with tracer.time_stage("connection_acquisition"):
            try:
                db.connection()
            except Exception:
                pass

        # 3. Context Loading
        with tracer.time_stage("context_loading"):
            ctx = load_assistant_context(user_id, db=db, current_message_text=body.text)
            tracer.context_json = ctx.to_dict_for_prompt()

        # 4. Fast Path check
        with tracer.time_stage("fast_path"):
            fast_plan = check_fast_path(body.text, ctx)
            if not fast_plan:
                clean_text = body.text.strip().lower().rstrip(".!?")
                if clean_text in FAST_PATH_EXACT_MATCHES:
                    fast_plan = Plan(actions=[AnswerPendingAction(value=FAST_PATH_EXACT_MATCHES[clean_text])])

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

        # 6. Sanitize descriptions, supersession check, and deterministic execution
        plan = sanitize_plan(plan, body.text)

        # Reply language: detected for this message, else the profile preference.
        reply_lang = resolve_reply_language(plan.language, getattr(ctx, "preferred_language", None))

        superseded_notice: Optional[str] = None
        is_answer_pending = any(a.op == "answer_pending" for a in plan.actions)
        if not is_answer_pending:
            active_p = get_active_pending(db, user_id)
            if active_p:
                superseded_notice = format_superseded_message(active_p, reply_lang)
                supersede_pending(db, user_id)

        with tracer.time_stage("execution"):
            ref_date = getattr(ctx, "today", None)
            lt_id_str = ctx.get_last_touched_id() if hasattr(ctx, "get_last_touched_id") else None
            if lt_id_str:
                try:
                    last_touched_id = uuid.UUID(str(lt_id_str))
                except Exception:
                    last_touched_id = get_last_touched_id(db, user_id)
            else:
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
                    ask_new = bool(action.contact)
                    res = execute_add(db, user_id, action, batch_id, confirmed=False, ask_new_contact=ask_new)

                    if res.needs_confirmation:
                        if not created_pending:
                            if res.status == "contact_confirm" and res.candidates:
                                cand = res.candidates[0]
                                is_new = bool(cand.get("is_new"))
                                if is_new:
                                    spoken = cand.get("spoken_name") or render("word.contact", reply_lang)
                                    q = render("pending.new_contact_question", reply_lang, name=spoken)
                                else:
                                    cand_name = cand.get("candidate_name") or render("word.contact", reply_lang)
                                    q = render("pending.contact_match_question", reply_lang, name=cand_name)
                                created_pending, _ = create_pending(
                                    db=db,
                                    user_id=user_id,
                                    kind="contact_confirm",
                                    plan_json={
                                        "target_contact_id": cand.get("candidate_id"),
                                        "spoken_name": cand.get("spoken_name"),
                                        "is_new": is_new,
                                        "action": action.model_dump(),
                                        "question": q,
                                        "language": reply_lang,
                                    },
                                    question=q,
                                )
                            else:
                                # Future date add
                                amt_str = format_inr(action.amount)
                                dt_str = format_date_short(action.date, reply_lang)
                                q = render("pending.future_add_question", reply_lang, amt=amt_str, date=dt_str)
                                created_pending, _ = create_pending(
                                    db=db,
                                    user_id=user_id,
                                    kind="confirm",
                                    plan_json={
                                        "action": action.model_dump(),
                                        "question": q,
                                        "language": reply_lang,
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
                    resolve_res = resolve(db, user_id, action.selector, last_touched_id, ref_date=ref_date, for_mutation=True)
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
                                plan_json={"action": action.model_dump(), "language": reply_lang},
                                candidates=cands,
                            )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        target_row = resolve_res.rows[0]
                        # If target was not created or touched in last 10 minutes, ask for confirmation first
                        if not is_recent_or_touched(db, target_row, user_id):
                            if not created_pending:
                                q = format_edit_confirmation_question(target_row, action.patch, reply_lang)
                                created_pending, _ = create_pending(
                                    db=db,
                                    user_id=user_id,
                                    kind="confirm",
                                    plan_json={
                                        "action": action.model_dump(),
                                        "target_id": str(target_row.id),
                                        "question": q,
                                        "language": reply_lang,
                                    },
                                    candidates=[serialize_transaction(target_row)],
                                    question=q,
                                )
                            else:
                                multi_action_pending_dropped = True
                        else:
                            # Exactly one row matched created or touched in last 10 minutes: execute edit immediately with undo
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
                    resolve_res = resolve(db, user_id, action.selector, last_touched_id, ref_date=ref_date, for_mutation=True)
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
                                plan_json={"action": action.model_dump(), "language": reply_lang},
                                candidates=cands,
                            )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        # Exactly one row matched: always create a pending confirm
                        if not created_pending:
                            target_row = resolve_res.rows[0]
                            q = format_delete_confirmation_question(target_row, reply_lang)
                            created_pending, _ = create_pending(
                                db=db,
                                user_id=user_id,
                                kind="confirm",
                                plan_json={
                                    "action": action.model_dump(),
                                    "target_id": str(target_row.id),
                                    "question": q,
                                    "language": reply_lang,
                                },
                                candidates=[serialize_transaction(target_row)],
                                question=q,
                            )
                        else:
                            multi_action_pending_dropped = True

                elif op_name == "query":
                    res = execute_query(db, user_id, action, last_touched_id, ref_date=ref_date)
                    results.append(res.model_dump())

                elif op_name == "undo":
                    res = execute_undo(db, user_id, action)
                    if res.ok:
                        changed = True
                    results.append(res.model_dump())

                elif op_name == "set_budget":
                    res = execute_set_budget(db, user_id, action, ref_date=ref_date)
                    if res.needs_confirmation:
                        # Replacing an existing budget with a different amount: confirm first.
                        if not created_pending:
                            q = format_budget_change_question(res.data, reply_lang)
                            created_pending, _ = create_pending(
                                db=db,
                                user_id=user_id,
                                kind="confirm",
                                plan_json={
                                    "action": {**action.model_dump(), "category": res.data["category"]},
                                    "question": q,
                                    "language": reply_lang,
                                },
                                question=q,
                            )
                        else:
                            multi_action_pending_dropped = True
                    else:
                        if res.ok:
                            changed = True
                        results.append(res.model_dump())

                elif op_name == "answer_pending":
                    active_item = None
                    p_id_str = ctx.get_pending_item_id() if hasattr(ctx, "get_pending_item_id") else None
                    if p_id_str:
                        try:
                            pid_uuid = uuid.UUID(str(p_id_str))
                            active_item = (
                                db.query(PendingAction)
                                .filter(
                                    PendingAction.id == pid_uuid,
                                    PendingAction.user_id == user_id,
                                    PendingAction.status == "pending",
                                )
                                .first()
                            )
                        except Exception:
                            pass
                    if not active_item:
                        active_item = get_active_pending(db, user_id)
                    if active_item:
                        ans_val = str(action.value)
                        ans_res = handle_answer_pending(
                            db,
                            user_id,
                            active_item.id,
                            answer=ans_val,
                            detected_language=plan.language,
                            preferred_language=getattr(ctx, "preferred_language", None),
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

                            tracer.set_reply(reply_text=ans_res.reply_text, spoken_text=ans_res.spoken_text)
                            if background_tasks is not None:
                                background_tasks.add_task(save_trace_background, tracer.to_dict())
                            else:
                                save_trace_background(tracer.to_dict(), db_override=db)
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
            reply_text, spoken_text = compose_reply(
                plan=plan,
                results=results,
                pending=pending_summary,
                language=reply_lang,
                filters_used=last_filters_used,
            )

            if superseded_notice:
                if reply_text and reply_text != render("done", reply_lang):
                    reply_text = f"{superseded_notice} {reply_text}"
                    spoken_text = f"{superseded_notice} {spoken_text}"
                else:
                    reply_text = superseded_notice
                    spoken_text = superseded_notice

            if multi_action_pending_dropped:
                drop_msg = " " + render("pending.multi_action_dropped", reply_lang)
                reply_text += drop_msg
                spoken_text += drop_msg

            spoken_text = to_spoken(spoken_text, reply_lang)
            reply_language_code = tts_language_code(reply_lang)

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
                "language": reply_lang,
                "language_code": reply_language_code,
                "plan": plan.model_dump() if plan else None,
                "results": results,
                "pending": pending_summary.model_dump() if pending_summary else None,
                "changed": changed,
            }, default=str),
        )
        db.add_all([user_msg, asst_msg])

        # 10. Record Trace & Results
        tracer.set_resolver_filters(last_filters_used)
        tracer.set_result({"results": results, "changed": changed})
        tracer.set_reply(reply_text=reply_text, spoken_text=spoken_text)

        mood = derive_mood(results=results, plan=plan, pending=pending_summary)

        response_obj = AssistantResponse(
            reply_text=reply_text,
            spoken_text=spoken_text,
            language=reply_lang,
            language_code=reply_language_code,
            results=results,
            pending=pending_summary,
            changed=changed,
            mood=mood,
        )

        # 11. Commit
        with tracer.time_stage("commit"):
            db.commit()

        if background_tasks is not None:
            background_tasks.add_task(save_trace_background, tracer.to_dict())
        else:
            save_trace_background(tracer.to_dict(), db_override=db)

        return response_obj
