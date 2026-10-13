"""
Baseline adapter for Pappu Assistant v2 evaluation.

Adapts the old intent system (IntentObject from SarvamLLMClient) into
the PlanV2 schema shape where expressible, and marks inexpressible cases.
"""

from typing import Optional, Dict, Any, Tuple
from app.schemas.intent import IntentObject
from app.schemas.plan_v2 import (
    PlanV2,
    AddOp,
    EditOp,
    DeleteOp,
    QueryOp,
    ClarifyOp,
    Selector,
)


def is_case_expressible(case: Dict[str, Any]) -> bool:
    """
    Determines whether a test case can be expressed by the old v1 intent schema.
    The old schema only supports a single action (add/edit/delete/query) without
    conversation context, multi-actions, undo, disambiguation choices, chat, or budget rejections.
    """
    group = case.get("group", "")
    expected_ops = case.get("expected_plan", {}).get("ops", [])

    # The old schema cannot express multi-action plans
    if len(expected_ops) != 1:
        return False

    op_dict = expected_ops[0]
    op = op_dict.get("op")

    # The old schema has no ops for undo, answer_pending, or chat
    if op in ("undo", "answer_pending", "chat"):
        return False

    if group in ("multi_action", "undo", "disambiguation_replies", "off_topic_chat", "unsupported_budgets"):
        return False

    # The old schema has no last_touched context resolution
    if op == "edit":
        selector = op_dict.get("selector", {})
        if selector.get("ref") == "last_touched":
            return False

    # The old schema does not support advanced query kinds
    if op == "query":
        query_kind = op_dict.get("query_kind")
        if query_kind in ("compare", "biggest", "count"):
            return False
        if query_kind == "balances" and not op_dict.get("selector", {}).get("contact"):
            return False

    return True


def old_intent_to_v2_plan(intent: IntentObject) -> PlanV2:
    """
    Maps a legacy IntentObject into the new PlanV2 schema shape.
    """
    # If the legacy LLM marked low confidence or missing fields, map to clarify
    if intent.confidence == "low" or (intent.missing_fields and len(intent.missing_fields) > 0):
        missing = list(intent.missing_fields)
        return PlanV2(
            ops=[
                ClarifyOp(
                    op="clarify",
                    question=f"Please clarify missing information: {', '.join(missing)}",
                    missing=missing,
                )
            ],
            reasoning=intent.reasoning,
        )

    f = intent.fields

    if intent.action == "add":
        # Check if person transaction
        if f.contact_name or (f.category and f.category.lower() == "people"):
            direction = "received" if f.type == "income" else "sent"
            amount = f.amount if f.amount is not None else 0
            op = AddOp(
                op="add",
                kind="person",
                amount=amount,
                direction=direction,
                contact=f.contact_name,
                category=f.category,
                date=f.date,
                description=f.description,
            )
        elif f.type == "income" or (f.category and f.category.lower() == "salary"):
            amount = f.amount if f.amount is not None else 0
            op = AddOp(
                op="add",
                kind="income",
                amount=amount,
                category=f.category or "Salary",
                date=f.date,
                description=f.description,
            )
        else:
            amount = f.amount if f.amount is not None else 0
            op = AddOp(
                op="add",
                kind="expense",
                amount=amount,
                category=f.category or "Other",
                date=f.date,
                description=f.description,
            )
        return PlanV2(ops=[op], reasoning=intent.reasoning)

    elif intent.action == "delete":
        selector = Selector(
            contact=f.contact_name,
            category=f.category,
            amount=f.amount,
            date_from=f.date,
            date_to=f.date,
            text=f.description,
        )
        return PlanV2(ops=[DeleteOp(op="delete", selector=selector)], reasoning=intent.reasoning)

    elif intent.action == "edit":
        selector = Selector(
            contact=f.contact_name,
            category=f.category,
            date_from=f.date,
            date_to=f.date,
        )
        patch: Dict[str, Any] = {}
        if f.amount is not None:
            patch["amount"] = f.amount
        if f.category:
            patch["category"] = f.category
        if f.description:
            patch["description"] = f.description
        if f.date:
            patch["date"] = f.date
        return PlanV2(ops=[EditOp(op="edit", selector=selector, patch=patch)], reasoning=intent.reasoning)

    elif intent.action == "query":
        query_kind = "balances" if f.contact_name else "sum"
        selector = Selector(
            contact=f.contact_name,
            category=f.category,
            date_from=f.date,
            date_to=f.date,
        )
        return PlanV2(
            ops=[QueryOp(op="query", query_kind=query_kind, selector=selector)],
            reasoning=intent.reasoning,
        )

    # Fallback to clarify
    return PlanV2(
        ops=[ClarifyOp(op="clarify", question="Unable to process request.")],
        reasoning=intent.reasoning,
    )
