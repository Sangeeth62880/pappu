"""
Query executor for Pappu Assistant v2.

Supports:
- balances (with optional contact)
- sum
- list
- count
- biggest
- compare (using two period sums)
"""

import uuid
from decimal import Decimal
from datetime import date
from typing import Optional, Union
from sqlalchemy.orm import Session

from app.assistant.schemas import QueryOp, Selector
from app.services.balances import balances
from app.assistant.resolver import resolve
from app.assistant.executors.base import ActionResult, serialize_transaction


def execute_query(
    db: Session,
    user_id: uuid.UUID,
    op: QueryOp,
    last_touched_id: Optional[uuid.UUID] = None,
    ref_date: Optional[Union[date, str]] = None,
) -> ActionResult:
    """
    Executes a Query operation for user_id.
    """
    try:
        kind = op.query_kind

        if kind == "balances":
            contact_needle = op.selector.contact if op.selector else None
            res_balances = balances(db, user_id, contact=contact_needle)
            return ActionResult(
                ok=True,
                action="query",
                status="balances",
                data={
                    "balances": [item.model_dump() for item in res_balances],
                    "count": len(res_balances),
                },
            )

        elif kind == "sum":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            total = sum((Decimal(str(r.amount)) for r in res.rows), Decimal("0.00"))
            return ActionResult(
                ok=True,
                action="query",
                status="sum",
                data={
                    "sum": float(total),
                    "count": len(res.rows),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "list":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            return ActionResult(
                ok=True,
                action="query",
                status="list",
                data={
                    "transactions": [serialize_transaction(r) for r in res.rows],
                    "count": len(res.rows),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "count":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            return ActionResult(
                ok=True,
                action="query",
                status="count",
                data={
                    "count": len(res.rows),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "biggest":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            if not res.rows:
                return ActionResult(
                    ok=True,
                    action="query",
                    status="biggest",
                    data={
                        "biggest": None,
                        "filters_used": res.filters_used,
                    },
                    filters_used=res.filters_used,
                )
            sorted_txns = sorted(res.rows, key=lambda r: r.amount, reverse=True)
            biggest_txn = sorted_txns[0]
            return ActionResult(
                ok=True,
                action="query",
                status="biggest",
                data={
                    "biggest": serialize_transaction(biggest_txn),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "compare":
            selector_1 = op.selector or Selector()
            selector_2 = op.compare_to or Selector()

            res_1 = resolve(db, user_id, selector_1, last_touched_id, ref_date=ref_date)
            res_2 = resolve(db, user_id, selector_2, last_touched_id, ref_date=ref_date)

            sum_1 = sum((Decimal(str(r.amount)) for r in res_1.rows), Decimal("0.00"))
            sum_2 = sum((Decimal(str(r.amount)) for r in res_2.rows), Decimal("0.00"))

            delta = sum_1 - sum_2
            delta_pct = (
                float(((sum_1 - sum_2) / sum_2) * Decimal("100.0"))
                if sum_2 > Decimal("0.00")
                else None
            )

            p1_lbl = selector_1.period.replace("_", " ").capitalize() if getattr(selector_1, "period", None) else "Period 1"
            p2_lbl = selector_2.period.replace("_", " ") if getattr(selector_2, "period", None) else "period 2"

            return ActionResult(
                ok=True,
                action="query",
                status="compare",
                data={
                    "sum_1": float(sum_1),
                    "sum_2": float(sum_2),
                    "delta": float(delta),
                    "delta_percentage": delta_pct,
                    "count_1": len(res_1.rows),
                    "count_2": len(res_2.rows),
                    "period1_label": p1_lbl,
                    "period2_label": p2_lbl,
                    "filters_used_1": res_1.filters_used,
                    "filters_used_2": res_2.filters_used,
                },
            )

        else:
            return ActionResult(
                ok=False,
                action="query",
                error=f"Unsupported query kind: {kind}",
            )

    except Exception as e:
        return ActionResult(
            ok=False,
            action="query",
            error=str(e),
        )
