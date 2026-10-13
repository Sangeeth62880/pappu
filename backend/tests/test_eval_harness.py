"""
Tests for the evaluation harness and PlanV2 schema.
Verifies cases.jsonl completeness, schema validation, and baseline adapter mapping.
"""

import json
from pathlib import Path
import pytest

from app.schemas.plan_v2 import (
    PlanV2,
    AddOp,
    EditOp,
    DeleteOp,
    QueryOp,
    UndoOp,
    AnswerPendingOp,
    ClarifyOp,
    ChatOp,
    direction_to_type,
)
from tests.eval.runner import validate_plan_schema, compare_plans
from tests.eval.baseline_adapter import is_case_expressible, old_intent_to_v2_plan
from app.schemas.intent import IntentObject, IntentFields


def test_direction_to_type_mapping():
    assert direction_to_type("sent") == "expense"
    assert direction_to_type("received") == "income"
    with pytest.raises(ValueError):
        direction_to_type("unknown")


def test_plan_v2_validation():
    # Valid add plan
    plan = PlanV2(ops=[AddOp(op="add", kind="expense", amount=250, category="Food")])
    assert len(plan.ops) == 1
    assert plan.ops[0].amount == 250

    # Person add without direction should fail
    with pytest.raises(ValueError, match="Person transactions require direction"):
        PlanV2(ops=[AddOp(op="add", kind="person", amount=500, contact="Pooja")])

    # Valid person add with direction
    person_plan = PlanV2(ops=[AddOp(op="add", kind="person", direction="sent", amount=500, contact="Pooja")])
    assert person_plan.ops[0].direction == "sent"


def test_eval_runner_fails_loudly_on_invalid_schema():
    with pytest.raises(ValueError, match="Planner returned None"):
        validate_plan_schema(None)

    with pytest.raises(ValueError, match="CRITICAL: Schema invalid output"):
        validate_plan_schema({"ops": [{"op": "invalid_op_type"}]})


def test_cases_jsonl_integrity_and_minimum_counts():
    cases_path = Path(__file__).parent / "eval" / "cases.jsonl"
    assert cases_path.exists(), "cases.jsonl must exist"

    cases = []
    with open(cases_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                cases.append(json.loads(line))

    # Total count must be at least 120
    assert len(cases) >= 120, f"Expected at least 120 cases, got {len(cases)}"

    # All cases must validate against PlanV2
    for case in cases:
        PlanV2.model_validate(case["expected_plan"])

    # Required groups and minimum counts
    min_counts = {
        "basic_add": 10,
        "add_dates": 8,
        "income": 5,
        "person_txns": 12,
        "queries": 14,
        "edit": 10,
        "delete": 14,
        "undo": 4,
        "disambiguation_replies": 8,
        "multi_action": 10,
        "missing_info_clarify": 8,
        "off_topic_chat": 6,
        "unsupported_budgets": 4,
        "malayalam_script": 8,
        "manglish": 10,
        "mixed_language": 6,
        "amount_formats": 8,
        "injection_sql": 4,
    }

    from collections import Counter
    counts = Counter(c["group"] for c in cases)
    for grp, min_cnt in min_counts.items():
        assert counts[grp] >= min_cnt, f"Group {grp} has {counts[grp]} cases, expected at least {min_cnt}"

    # Required regression cases
    case_ids = {c["id"] for c in cases}
    required_regressions = [
        "regression_delete_last_pooja",
        "regression_delete_last_food",
        "regression_multi_lunch_pooja",
        "regression_multi_lunch_auto",
        "regression_query_who_owes_me",
        "regression_edit_change_to_300",
        "regression_delete_manglish_yesterday_food",
    ]
    for reg_id in required_regressions:
        assert reg_id in case_ids, f"Missing required regression case: {reg_id}"


def test_baseline_adapter_expressibility():
    # Multi-action is not expressible
    multi_case = {
        "group": "multi_action",
        "expected_plan": {
            "ops": [
                {"op": "add", "kind": "expense", "amount": 250},
                {"op": "add", "kind": "expense", "amount": 80}
            ]
        }
    }
    assert is_case_expressible(multi_case) is False

    # Undo is not expressible
    undo_case = {"group": "undo", "expected_plan": {"ops": [{"op": "undo"}]}}
    assert is_case_expressible(undo_case) is False

    # Simple add is expressible
    add_case = {"group": "basic_add", "expected_plan": {"ops": [{"op": "add", "kind": "expense", "amount": 250}]}}
    assert is_case_expressible(add_case) is True


def test_baseline_adapter_mapping():
    legacy_intent = IntentObject(
        action="add",
        language="en",
        fields=IntentFields(amount=250, category="Food", description="lunch"),
        confidence="high",
        requires_confirmation=False,
    )
    v2_plan = old_intent_to_v2_plan(legacy_intent)
    assert len(v2_plan.ops) == 1
    assert v2_plan.ops[0].op == "add"
    assert v2_plan.ops[0].amount == 250
    assert v2_plan.ops[0].category == "Food"
