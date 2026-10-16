"""
Evaluation harness runner for Pappu Assistant v2.

Loads test cases from cases.jsonl, invokes a pluggable planner,
validates schema conformance strictly, compares against expected plans,
outputs per-group and overall accuracy, reports p50/p95 latency and schema failure rate,
tracks the 7 critical regression cases, and writes results to eval_results/<timestamp>.json.
"""

import sys
import os
import json
import uuid
import time
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Dict, Any, List, Tuple, Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

# Ensure backend root is on sys.path
backend_root = str(Path(__file__).resolve().parent.parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from pydantic import ValidationError

from app.assistant.schemas import PlanV2
from tests.eval.baseline_adapter import is_case_expressible, old_intent_to_v2_plan

REGRESSION_CASES = [
    "regression_query_who_owes_me",
    "regression_edit_change_to_300",
    "regression_delete_last_pooja",
    "regression_delete_last_food",
    "regression_multi_lunch_pooja",
    "regression_multi_lunch_auto",
    "regression_delete_manglish_yesterday_food",
]


def validate_plan_schema(plan_dict: Any) -> PlanV2:
    """
    Validates that a generated plan conforms to the PlanV2 schema.
    Fails loudly with an exception if invalid.
    """
    if plan_dict is None:
        raise ValueError("Planner returned None. Output must be a valid PlanV2 dictionary.")
    try:
        return PlanV2.model_validate(plan_dict)
    except ValidationError as e:
        raise ValueError(f"CRITICAL: Schema invalid output from planner: {e}") from e


def compare_plans(actual: PlanV2, expected: PlanV2) -> Tuple[bool, str]:
    """
    Compares an actual PlanV2 instance to an expected PlanV2 instance.
    Returns (True, "Match") or (False, reason).
    """
    if len(actual.ops) != len(expected.ops):
        return False, f"Op count mismatch: expected {len(expected.ops)}, got {len(actual.ops)}"

    for idx, (act_op, exp_op) in enumerate(zip(actual.ops, expected.ops)):
        if act_op.op != exp_op.op:
            return False, f"Op[{idx}] op mismatch: expected {exp_op.op}, got {act_op.op}"

        if exp_op.op == "add":
            if act_op.kind != exp_op.kind:
                return False, f"Op[{idx}] add kind mismatch: expected {exp_op.kind}, got {act_op.kind}"
            if round(float(act_op.amount or 0), 2) != round(float(exp_op.amount or 0), 2):
                return False, f"Op[{idx}] add amount mismatch: expected {exp_op.amount}, got {act_op.amount}"
            if exp_op.kind == "person":
                if act_op.direction != exp_op.direction:
                    return False, f"Op[{idx}] add person direction mismatch: expected {exp_op.direction}, got {act_op.direction}"
                if (act_op.contact or "").lower() != (exp_op.contact or "").lower():
                    return False, f"Op[{idx}] add person contact mismatch: expected {exp_op.contact}, got {act_op.contact}"
            if exp_op.category and (act_op.category or "").lower() != exp_op.category.lower():
                return False, f"Op[{idx}] add category mismatch: expected {exp_op.category}, got {act_op.category}"
            if exp_op.date and act_op.date != exp_op.date:
                return False, f"Op[{idx}] add date mismatch: expected {exp_op.date}, got {act_op.date}"

        elif exp_op.op == "delete":
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["contact", "category", "amount", "recency", "direction", "date_from", "date_to"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if isinstance(exp_val, str):
                        if (act_val or "").lower() != exp_val.lower():
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"
                    elif isinstance(exp_val, (int, float)):
                        if act_val is None or round(float(act_val), 2) != round(float(exp_val), 2):
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"
                    else:
                        if act_val != exp_val:
                            return False, f"Op[{idx}] delete selector.{field} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "edit":
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["ref", "contact", "category", "amount", "recency"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if act_val != exp_val:
                        return False, f"Op[{idx}] edit selector.{field} mismatch: expected {exp_val}, got {act_val}"
            for k, exp_val in exp_op.patch.items():
                act_val = act_op.patch.get(k)
                if isinstance(exp_val, (int, float)):
                    if act_val is None or round(float(act_val), 2) != round(float(exp_val), 2):
                        return False, f"Op[{idx}] edit patch.{k} mismatch: expected {exp_val}, got {act_val}"
                elif isinstance(exp_val, str):
                    if (act_val or "").lower() != exp_val.lower():
                        return False, f"Op[{idx}] edit patch.{k} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "query":
            if act_op.query_kind != exp_op.query_kind:
                return False, f"Op[{idx}] query query_kind mismatch: expected {exp_op.query_kind}, got {act_op.query_kind}"
            exp_bs = getattr(exp_op, "balance_side", None)
            if exp_bs is not None:
                act_bs = getattr(act_op, "balance_side", None)
                if act_bs != exp_bs:
                    return False, f"Op[{idx}] query balance_side mismatch: expected {exp_bs}, got {act_bs}"
            exp_sel = exp_op.selector
            act_sel = act_op.selector
            for field in ["contact", "category", "direction", "amount_min", "amount_max", "period", "limit", "recency"]:
                exp_val = getattr(exp_sel, field, None)
                if exp_val is not None:
                    act_val = getattr(act_sel, field, None)
                    if isinstance(exp_val, str):
                        if (act_val or "").lower() != (exp_val or "").lower():
                            return False, f"Op[{idx}] query selector.{field} mismatch: expected {exp_val}, got {act_val}"
                    elif act_val != exp_val:
                        return False, f"Op[{idx}] query selector.{field} mismatch: expected {exp_val}, got {act_val}"

        elif exp_op.op == "clarify":
            if exp_op.missing:
                exp_missing = set(exp_op.missing)
                act_missing = set(act_op.missing or [])
                if not exp_missing.issubset(act_missing):
                    return False, f"Op[{idx}] clarify missing mismatch: expected {exp_op.missing}, got {act_op.missing}"

        elif exp_op.op == "chat":
            exp_kind = getattr(exp_op, "kind", None)
            if exp_kind is not None:
                act_kind = getattr(act_op, "kind", None)
                if act_kind != exp_kind:
                    return False, f"Op[{idx}] chat kind mismatch: expected {exp_kind}, got {act_kind}"

        elif exp_op.op == "answer_pending":
            if str(act_op.value).lower() != str(exp_op.value).lower():
                return False, f"Op[{idx}] answer_pending value mismatch: expected {exp_op.value}, got {act_op.value}"

        elif exp_op.op == "undo":
            pass

    return True, "Match"


def create_baseline_planner() -> Callable[[str, Dict[str, Any], Dict[str, Any]], Tuple[Optional[Dict[str, Any]], bool, float, int]]:
    """
    Creates a baseline planner that runs the legacy SarvamLLMClient
    adapted to the PlanV2 shape. Returns (plan_dict, expressible, latency_ms, tokens).
    """
    from app.llm.client import SarvamLLMClient

    llm_client = SarvamLLMClient()

    def baseline_planner(text: str, context: Dict[str, Any], case: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], bool, float, int]:
        if not is_case_expressible(case):
            return None, False, 0.0, 0

        for attempt in range(3):
            try:
                time.sleep(0.1)
                t0 = time.perf_counter()
                intent = llm_client.parse_intent(text)
                latency_ms = (time.perf_counter() - t0) * 1000.0
                plan = old_intent_to_v2_plan(intent)
                return plan.model_dump(), True, latency_ms, 0
            except Exception as e:
                if "429" in str(e) or "Rate limit" in str(e):
                    time.sleep(2.0 * (attempt + 1))
                    continue
                return None, True, 0.0, 0
        return None, True, 0.0, 0

    return baseline_planner


def create_v2_planner(include_reasoning: bool = False) -> Callable[[str, Dict[str, Any], Dict[str, Any]], Tuple[Optional[Dict[str, Any]], bool, float, int]]:
    """
    Creates a v2 planner that runs AssistantPlanner with dynamic AssistantContext.
    Returns (plan_dict, expressible, latency_ms, tokens).
    """
    from app.assistant.planner import AssistantPlanner
    from app.assistant.context import AssistantContext

    planner = AssistantPlanner()

    def v2_planner(text: str, context: Dict[str, Any], case: Dict[str, Any]) -> Tuple[Optional[Dict[str, Any]], bool, float, int]:
        ctx = AssistantContext.from_dict(context)
        tokens = ctx.token_estimate

        for attempt in range(5):
            try:
                time.sleep(0.2)
                t0 = time.perf_counter()
                plan = planner.plan(text, ctx, include_reasoning=include_reasoning)
                latency_ms = (time.perf_counter() - t0) * 1000.0
                return plan.model_dump(), True, latency_ms, tokens
            except Exception as e:
                if "429" in str(e) or "Rate limit" in str(e):
                    time.sleep(2.5 * (attempt + 1))
                    continue
                return None, True, 0.0, tokens
        return None, True, 0.0, tokens

    return v2_planner


from decimal import Decimal
from datetime import date
from unittest.mock import patch
from app.models.profile import Profile
from app.models.category import Category
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.models.pending_action import PendingAction
from app.assistant.schemas import Plan, AssistantMessageRequest
from app.assistant.planner import AssistantPlanner
from app.routers.assistant import handle_assistant_message


def create_isolated_eval_db(case: Dict[str, Any]):
    """
    Creates an isolated in-memory SQLite database seeded with case context.
    """
    import uuid
    from sqlalchemy import create_engine, event
    from sqlalchemy.orm import sessionmaker
    from sqlalchemy.pool import StaticPool
    from app.database import init_db

    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    init_db(bind_engine=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestingSessionLocal()

    user_id = uuid.uuid4()
    profile = Profile(id=user_id, name="Eval User", preferred_language=case.get("language", "en"))
    session.add(profile)
    session.commit()

    context = case.get("context", {})

    # Seed contacts
    contact_map = {}
    for c in context.get("contacts", []):
        cid = uuid.uuid4()
        c_name = c.get("name", "Contact")
        c_row = Contact(id=cid, user_id=user_id, name=c_name, aliases=c.get("aliases", []))
        session.add(c_row)
        contact_map[c_name.lower()] = cid
        for al in c.get("aliases", []):
            contact_map[al.lower()] = cid
    session.commit()

    # Seed categories
    food_cat = session.query(Category).filter(Category.name == "Food").first()
    people_cat = session.query(Category).filter(Category.name == "People").first()
    transport_cat = session.query(Category).filter(Category.name == "Transport").first()
    other_cat = session.query(Category).filter(Category.name == "Other").first()

    txn_map = {}
    for t in context.get("seeded_transactions", []):
        tid = uuid.uuid4()
        contact_id = None
        c_needle = t.get("contact")
        if c_needle and c_needle.lower() in contact_map:
            contact_id = contact_map[c_needle.lower()]

        cat_id = food_cat.id if food_cat else None
        if contact_id:
            cat_id = people_cat.id if people_cat else None
        elif t.get("category"):
            c_low = t["category"].lower()
            if c_low == "transport" and transport_cat:
                cat_id = transport_cat.id
            elif c_low == "food" and food_cat:
                cat_id = food_cat.id
            elif other_cat:
                cat_id = other_cat.id

        t_date_str = t.get("txn_date") or context.get("today", "2026-10-14")
        t_date = date.fromisoformat(t_date_str)
        t_type = "income" if (t.get("direction") == "received" or t.get("type") == "income") else "expense"

        txn_row = Transaction(
            id=tid,
            user_id=user_id,
            amount=Decimal(str(t.get("amount", 100))),
            type=t_type,
            category_id=cat_id,
            contact_id=contact_id,
            description=t.get("description"),
            txn_date=t_date,
        )
        session.add(txn_row)
        t_key = t.get("id") or str(tid)
        txn_map[t_key] = txn_row
    session.commit()

    # Seed last touched
    lt = context.get("last_touched_transaction")
    if lt:
        lt_key = lt.get("id")
        target_txn = txn_map.get(lt_key) if lt_key else None
        if not target_txn and txn_map:
            target_txn = list(txn_map.values())[0]
        if target_txn:
            undo = UndoAction(
                user_id=user_id,
                transaction_id=target_txn.id,
                action_type="insert",
                batch_id=uuid.uuid4(),
            )
            session.add(undo)
            session.commit()

    # Seed pending item
    pi = context.get("pending_item")
    if pi:
        plan_j = pi.get("plan_json") or {}
        if "question" not in plan_j and "question" in pi:
            plan_j["question"] = pi["question"]
        pa = PendingAction(
            user_id=user_id,
            kind=pi.get("kind", "confirm"),
            plan_json=plan_j,
            candidates_json=pi.get("candidates"),
            status="pending",
        )
        session.add(pa)
        session.commit()

    return session, user_id


def compare_end_state(
    response: Any,
    expected_end_state: Dict[str, Any],
    plan: Optional[Plan],
) -> Tuple[bool, str, str]:
    """
    Validates execution end state against expected_end_state.
    Returns (passed, failure_cause, reason).
    """
    if not expected_end_state:
        return True, "", "Match"

    action = expected_end_state.get("action")

    if action == "added":
        exp_count = expected_end_state.get("count", 1)
        added = [r for r in response.results if r.get("action") == "add" and r.get("ok")]
        if len(added) != exp_count:
            return False, "executor", f"Expected {exp_count} added, got {len(added)}"
        if not response.changed:
            return False, "executor", "Expected changed=True"
        return True, "", "Match"

    elif action == "query_result":
        has_query = any(
            r.get("action") in ("query", "balances", "sum", "count", "biggest", "compare", "list")
            and r.get("ok")
            for r in response.results
        )
        if not has_query:
            return False, "executor", "Query produced no successful results"
        if not response.reply_text:
            return False, "composer", "Empty query reply text"
        return True, "", "Match"

    elif action == "edited":
        edits = [r for r in response.results if r.get("action") == "edit" and r.get("ok")]
        if not edits:
            return False, "executor", "Edit failed to execute"
        return True, "", "Match"

    elif action == "deleted":
        if response.pending and response.pending.kind == "confirm":
            return True, "", "Match"
        if any(r.get("action") == "delete" and r.get("ok") for r in response.results):
            return True, "", "Match"
        return False, "executor", "Expected delete confirmation or deletion"

    elif action == "disambiguated":
        if response.pending and response.pending.kind == "disambiguate":
            return True, "", "Match"
        if any("disambiguat" in str(r).lower() for r in response.results):
            return True, "", "Match"
        return False, "resolver", "Expected disambiguation pending item"

    elif action == "clarify":
        if plan and plan.actions and plan.actions[0].op == "clarify":
            return True, "", "Match"
        return False, "planner", "Expected clarify action"

    elif action == "reply":
        if plan and plan.actions and plan.actions[0].op == "chat":
            return True, "", "Match"
        return False, "planner", "Expected chat action"

    elif action == "unsupported":
        if "not available" in response.reply_text.lower() or (
            plan and plan.actions and getattr(plan.actions[0], "kind", None) == "unsupported"
        ):
            return True, "", "Match"
        return False, "planner", "Expected unsupported action"

    elif action == "undone":
        if any(r.get("action") == "undo" and r.get("ok") for r in response.results):
            return True, "", "Match"
        return False, "executor", "Expected undo to succeed"

    elif action in ("pending", "contact_confirm"):
        if response.pending and response.pending.kind in ("contact_confirm", "confirm"):
            return True, "", "Match"
        if any(r.get("status") in ("contact_confirm", "pending") for r in response.results):
            return True, "", "Match"
        return False, "executor", "Expected pending contact confirmation"

    return True, "", "Match"


def run_evaluation(
    cases_file: str,
    planner_fn: Callable[[str, Dict[str, Any], Dict[str, Any]], Tuple[Optional[Dict[str, Any]], bool, float, int]],
    planner_name: str = "baseline",
    max_workers: int = 4,
    output_dir: Optional[str] = None,
    execute: bool = False,
) -> Dict[str, Any]:
    """
    Runs the full evaluation dataset against the pluggable planner.
    When execute is True, executes the requests end to end and validates end state.
    """
    cases_path = Path(cases_file)
    if not cases_path.exists():
        raise FileNotFoundError(f"Cases file not found: {cases_path}")

    cases: List[Dict[str, Any]] = []
    with open(cases_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
        if content.startswith("["):
            cases = json.loads(content)
        else:
            for line in content.splitlines():
                line = line.strip()
                if line:
                    cases.append(json.loads(line))

    mode_str = "Execution and End State Mode" if execute else "Plan Only Mode"
    print(f"\n=======================================================")
    print(f"Starting Evaluation with Planner: {planner_name} ({mode_str})")
    print(f"Loaded {len(cases)} cases from {cases_path.name}")
    print(f"Workers: {max_workers}")
    print(f"=======================================================\n")

    results: List[Dict[str, Any]] = []

    def evaluate_single_case(case: Dict[str, Any]) -> Dict[str, Any]:
        case_id = case["id"]
        group = case["group"]
        input_text = case["input"]
        context = case["context"]
        expected_plan_dict = case["expected_plan"]

        expected_plan = PlanV2.model_validate(expected_plan_dict)

        plan_dict, expressible, latency_ms, token_count = planner_fn(input_text, context, case)

        if not expressible:
            return {
                "id": case_id,
                "group": group,
                "input": input_text,
                "expressible": False,
                "passed": False,
                "schema_valid": True,
                "latency_ms": latency_ms,
                "token_count": token_count,
                "reason": "Not expressible in legacy schema",
                "failure_cause": "planner",
                "actual_plan": None,
                "expected_plan": expected_plan_dict,
            }

        if plan_dict is None:
            return {
                "id": case_id,
                "group": group,
                "input": input_text,
                "expressible": True,
                "passed": False,
                "schema_valid": False,
                "latency_ms": latency_ms,
                "token_count": token_count,
                "reason": "Planner failed to produce an output",
                "failure_cause": "planner",
                "actual_plan": None,
                "expected_plan": expected_plan_dict,
            }

        schema_valid = True
        actual_plan = None
        try:
            actual_plan = validate_plan_schema(plan_dict)
        except Exception as e:
            schema_valid = False
            return {
                "id": case_id,
                "group": group,
                "input": input_text,
                "expressible": True,
                "passed": False,
                "schema_valid": False,
                "latency_ms": latency_ms,
                "token_count": token_count,
                "reason": f"Schema validation error: {e}",
                "failure_cause": "planner",
                "actual_plan": plan_dict,
                "expected_plan": expected_plan_dict,
            }

        # Compare with expected plan
        plan_passed, plan_reason = compare_plans(actual_plan, expected_plan)

        end_state_passed = True
        end_state_reason = "Match"
        failure_cause = None

        if not plan_passed:
            failure_cause = "planner"

        # End to end execution if requested
        if execute:
            db_session, user_id = create_isolated_eval_db(case)
            try:
                plan_obj = Plan.model_validate(actual_plan.model_dump())
                t0_req = time.perf_counter()
                resp = handle_assistant_message(
                    body=AssistantMessageRequest(
                        text=input_text,
                        input="typed",
                        client_msg_id=f"eval_{case_id}_{uuid.uuid4().hex[:6]}",
                    ),
                    db=db_session,
                    user_id=user_id,
                    plan_override=plan_obj,
                )
                end_to_end_latency = (time.perf_counter() - t0_req) * 1000.0 + latency_ms
                latency_ms = round(end_to_end_latency, 1)

                es_ok, es_cause, es_msg = compare_end_state(
                    response=resp,
                    expected_end_state=case.get("expected_end_state", {}),
                    plan=plan_obj,
                )
                if not es_ok:
                    end_state_passed = False
                    end_state_reason = es_msg
                    if not failure_cause:
                        failure_cause = es_cause
            except Exception as e:
                end_state_passed = False
                end_state_reason = f"Execution error: {e}"
                if not failure_cause:
                    failure_cause = "executor"
            finally:
                db_session.close()

        passed = plan_passed and end_state_passed if execute else plan_passed
        reason = plan_reason if not plan_passed else (end_state_reason if execute else "Match")

        return {
            "id": case_id,
            "group": group,
            "input": input_text,
            "expressible": True,
            "passed": passed,
            "schema_valid": schema_valid,
            "latency_ms": latency_ms,
            "token_count": token_count,
            "reason": reason,
            "failure_cause": failure_cause if not passed else None,
            "actual_plan": actual_plan.model_dump(),
            "expected_plan": expected_plan_dict,
        }

    start_time = time.time()

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_case = {executor.submit(evaluate_single_case, c): c for c in cases}
        for future in as_completed(future_to_case):
            res = future.result()
            results.append(res)
            status_symbol = "✓" if res["passed"] else ("⊘" if not res["expressible"] else "✗")
            cause_tag = f" [{res['failure_cause']}]" if res.get("failure_cause") else ""
            print(f"[{status_symbol}] {res['group']} | {res['id']}{cause_tag}: {res['reason']}")

    elapsed_time = round(time.time() - start_time, 2)

    # Compute metrics per group and overall
    groups = sorted(list(set(c["group"] for c in cases)))
    group_stats: Dict[str, Dict[str, Any]] = {}

    total_cases = len(cases)
    total_passed = sum(1 for r in results if r["passed"])
    total_expressible = sum(1 for r in results if r["expressible"])
    total_inexpressible = total_cases - total_expressible
    schema_failures = sum(1 for r in results if not r.get("schema_valid", True))
    schema_failure_rate = round((schema_failures / total_cases) * 100.0, 2)

    # Latencies
    latencies = sorted([r["latency_ms"] for r in results if r.get("latency_ms") and r["latency_ms"] > 0])
    p50_latency = round(latencies[int(len(latencies) * 0.50)], 1) if latencies else 0.0
    p95_latency = round(latencies[int(len(latencies) * 0.95)], 1) if latencies else 0.0

    # Token counts
    tokens_list = [r.get("token_count", 0) for r in results if r.get("token_count", 0) > 0]
    avg_tokens = round(sum(tokens_list) / len(tokens_list), 1) if tokens_list else 0

    # Failures by cause
    failures_by_cause = {"planner": 0, "resolver": 0, "executor": 0, "composer": 0}
    for r in results:
        if not r["passed"] and r["expressible"]:
            cause = r.get("failure_cause") or "planner"
            failures_by_cause[cause] = failures_by_cause.get(cause, 0) + 1

    for grp in groups:
        grp_results = [r for r in results if r["group"] == grp]
        grp_total = len(grp_results)
        grp_passed = sum(1 for r in grp_results if r["passed"])
        grp_expr = sum(1 for r in grp_results if r["expressible"])
        group_stats[grp] = {
            "total": grp_total,
            "passed": grp_passed,
            "expressible": grp_expr,
            "not_expressible": grp_total - grp_expr,
            "accuracy": round((grp_passed / grp_total) * 100.0, 1),
            "expressible_accuracy": round((grp_passed / grp_expr) * 100.0, 1) if grp_expr > 0 else 0.0,
        }

    overall_accuracy = round((total_passed / total_cases) * 100.0, 1)
    expressible_accuracy = round((total_passed / total_expressible) * 100.0, 1) if total_expressible > 0 else 0.0

    # Regression cases breakdown
    regression_summary = {}
    for r in results:
        if r["id"] in REGRESSION_CASES:
            regression_summary[r["id"]] = "PASS" if r["passed"] else f"FAIL ({r['reason']})"

    print("\n" + "=" * 80)
    print(f"EVALUATION RESULTS SUMMARY: {planner_name} ({mode_str})")
    print("=" * 80)
    print(f"{'Group':<26} | {'Total':<6} | {'Pass':<6} | {'Not Expr':<9} | {'Accuracy':<10} | {'Expr Acc'}")
    print("-" * 80)
    for grp, stats in group_stats.items():
        print(f"{grp:<26} | {stats['total']:<6} | {stats['passed']:<6} | {stats['not_expressible']:<9} | {stats['accuracy']:>7.1f}% | {stats['expressible_accuracy']:>7.1f}%")
    print("-" * 80)
    print(f"{'OVERALL':<26} | {total_cases:<6} | {total_passed:<6} | {total_inexpressible:<9} | {overall_accuracy:>7.1f}% | {expressible_accuracy:>7.1f}%")
    print(f"Schema Failure Rate: {schema_failure_rate}% ({schema_failures}/{total_cases})")
    print(f"Request Latency: p50={p50_latency}ms, p95={p95_latency}ms")
    print(f"Average Input Tokens: {avg_tokens}")
    print(f"Total Time: {elapsed_time}s")
    print("-" * 80)
    print("FAILURES GROUPED BY CAUSE:")
    for c_name, count in failures_by_cause.items():
        print(f"  {c_name.capitalize()}: {count}")
    print("-" * 80)
    print("REGRESSION CASES STATUS:")
    for reg_id in REGRESSION_CASES:
        status_text = regression_summary.get(reg_id, "NOT_FOUND")
        print(f"  {reg_id}: {status_text}")
    print("=" * 80 + "\n")

    timestamp_str = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    out_dir = Path(output_dir) if output_dir else Path(__file__).parent / "eval_results"
    out_dir.mkdir(parents=True, exist_ok=True)

    result_payload = {
        "planner": planner_name,
        "execute_mode": execute,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "total_cases": total_cases,
        "total_passed": total_passed,
        "total_expressible": total_expressible,
        "total_inexpressible": total_inexpressible,
        "overall_accuracy": overall_accuracy,
        "expressible_accuracy": expressible_accuracy,
        "schema_failure_rate": schema_failure_rate,
        "p50_latency_ms": p50_latency,
        "p95_latency_ms": p95_latency,
        "avg_input_tokens": avg_tokens,
        "elapsed_seconds": elapsed_time,
        "failures_by_cause": failures_by_cause,
        "regression_cases": regression_summary,
        "group_stats": group_stats,
        "results": sorted(results, key=lambda x: x["id"]),
    }

    out_file = out_dir / f"{timestamp_str}.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(result_payload, f, indent=2, ensure_ascii=False)

    if planner_name == "baseline":
        baseline_file = out_dir / "baseline.json"
        with open(baseline_file, "w", encoding="utf-8") as f:
            json.dump(result_payload, f, indent=2, ensure_ascii=False)
        print(f"Saved baseline results to {baseline_file}")

    print(f"Saved timestamped results to {out_file}")

    return result_payload


def main():
    parser = argparse.ArgumentParser(description="Pappu Assistant v2 Evaluation Runner")
    parser.add_argument("--cases", default=str(Path(__file__).parent / "cases.jsonl"), help="Path to cases.jsonl")
    parser.add_argument("--planner", default="baseline", help="Planner name: 'baseline', 'v2', 'v2_reasoning'")
    parser.add_argument("--workers", type=int, default=5, help="Number of concurrent worker threads")
    parser.add_argument("--output-dir", default=None, help="Directory to save evaluation results")
    parser.add_argument("--execute", action="store_true", help="Execute generated plan and verify end state")

    args = parser.parse_args()

    if args.planner == "baseline":
        planner_fn = create_baseline_planner()
    elif args.planner == "v2":
        planner_fn = create_v2_planner(include_reasoning=False)
    elif args.planner == "v2_reasoning":
        planner_fn = create_v2_planner(include_reasoning=True)
    else:
        raise ValueError(f"Unknown planner: {args.planner}")

    run_evaluation(
        cases_file=args.cases,
        planner_fn=planner_fn,
        planner_name=args.planner,
        max_workers=args.workers,
        output_dir=args.output_dir,
        execute=args.execute,
    )


if __name__ == "__main__":
    main()
