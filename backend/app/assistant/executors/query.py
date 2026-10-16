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
from typing import Optional, Union, Dict, Any, List
from sqlalchemy.orm import Session

from app.assistant.schemas import QueryOp, Selector
from app.services.balances import balances
from app.assistant.resolver import resolve
from app.assistant.executors.base import ActionResult, serialize_transaction
from app.services.spending import is_spending_txn, should_allow_people


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
            # The balances executor must ignore a stray direction field.
            contact_needle = op.selector.contact if op.selector else None
            if contact_needle:
                from app.models.contact import Contact
                user_contacts = db.query(Contact).filter(Contact.user_id == user_id).all()
                needle = contact_needle.strip().lower()
                matched = any(
                    c.name.strip().lower() == needle or (c.aliases and any(a.strip().lower() == needle for a in c.aliases))
                    for c in user_contacts
                )
                if not matched:
                    return ActionResult(
                        ok=False,
                        action="query",
                        error="Unknown contact",
                        filters_used={"contact": contact_needle, "unknown_contact": contact_needle},
                    )

            res_balances = balances(db, user_id, contact=contact_needle)

            # Filter by balance_side: "owed_to_me", "i_owe", "all"
            side = getattr(op, "balance_side", None) or "all"
            if side == "owed_to_me":
                res_balances = [b for b in res_balances if b.net_balance > Decimal("0.00")]
            elif side == "i_owe":
                res_balances = [b for b in res_balances if b.net_balance < Decimal("0.00")]
            elif side == "all":
                res_balances = [b for b in res_balances if b.net_balance != Decimal("0.00")]

            return ActionResult(
                ok=True,
                action="query",
                status="balances",
                data={
                    "balances": [item.model_dump() for item in res_balances],
                    "balance_side": side,
                    "count": len(res_balances),
                },
            )

        elif kind == "category_breakdown":
            sel = op.selector
            # Default period this month when none is given
            has_time_filter = bool(
                sel and (sel.period or sel.date_from or sel.date_to)
            )
            if not has_time_filter:
                if sel is None:
                    sel = Selector(period="this_month")
                else:
                    sel.period = "this_month"

            res = resolve(db, user_id, sel, last_touched_id, ref_date=ref_date)
            if res.filters_used.get("unknown_contact"):
                return ActionResult(
                    ok=False,
                    action="query",
                    error="Unknown contact",
                    filters_used=res.filters_used,
                )

            allow_people = should_allow_people(sel)
            rows = [r for r in res.rows if is_spending_txn(r, allow_people=allow_people)]

            groups: Dict[str, Decimal] = {}
            for r in rows:
                cat_name = r.category.name if r.category else "Other"
                groups[cat_name] = groups.get(cat_name, Decimal("0.00")) + Decimal(str(r.amount))

            sorted_cats = [
                {"category": k, "total": float(v)}
                for k, v in sorted(groups.items(), key=lambda item: item[1], reverse=True)
            ]

            return ActionResult(
                ok=True,
                action="query",
                status="category_breakdown",
                data={
                    "categories": sorted_cats,
                    "count": len(sorted_cats),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "sum":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            if res.filters_used.get("unknown_contact"):
                return ActionResult(
                    ok=False,
                    action="query",
                    error="Unknown contact",
                    filters_used=res.filters_used,
                )

            direction = res.filters_used.get("direction")
            allow_people = should_allow_people(op.selector)
            if direction == "received":
                rows = [r for r in res.rows if r.type == "income"]
            else:
                rows = [r for r in res.rows if is_spending_txn(r, allow_people=allow_people)]
            total = sum((Decimal(str(r.amount)) for r in rows), Decimal("0.00"))
            return ActionResult(
                ok=True,
                action="query",
                status="sum",
                data={
                    "sum": float(total),
                    "count": len(rows),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "list":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            if res.filters_used.get("unknown_contact"):
                return ActionResult(
                    ok=False,
                    action="query",
                    error="Unknown contact",
                    filters_used=res.filters_used,
                )

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
            if res.filters_used.get("unknown_contact"):
                return ActionResult(
                    ok=False,
                    action="query",
                    error="Unknown contact",
                    filters_used=res.filters_used,
                )

            direction = res.filters_used.get("direction")
            allow_people = should_allow_people(op.selector)
            if direction == "received":
                rows = [r for r in res.rows if r.type == "income"]
            elif direction == "sent" or not direction:
                rows = [r for r in res.rows if is_spending_txn(r, allow_people=allow_people)]
            else:
                rows = res.rows
            return ActionResult(
                ok=True,
                action="query",
                status="count",
                data={
                    "count": len(rows),
                    "filters_used": res.filters_used,
                },
                filters_used=res.filters_used,
            )

        elif kind == "biggest":
            res = resolve(db, user_id, op.selector, last_touched_id, ref_date=ref_date)
            if res.filters_used.get("unknown_contact"):
                return ActionResult(
                    ok=False,
                    action="query",
                    error="Unknown contact",
                    filters_used=res.filters_used,
                )
            direction = res.filters_used.get("direction")
            allow_people = should_allow_people(op.selector)
            if direction == "received":
                rows = [r for r in res.rows if r.type == "income"]
            else:
                rows = [r for r in res.rows if is_spending_txn(r, allow_people=allow_people)]

            if not rows:
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
            sorted_txns = sorted(rows, key=lambda r: r.amount, reverse=True)
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

            dir_1 = res_1.filters_used.get("direction")
            dir_2 = res_2.filters_used.get("direction")
            allow_people_1 = should_allow_people(selector_1)
            allow_people_2 = should_allow_people(selector_2)

            if dir_1 == "received":
                rows_1 = [r for r in res_1.rows if r.type == "income"]
            else:
                rows_1 = [r for r in res_1.rows if is_spending_txn(r, allow_people=allow_people_1)]

            if dir_2 == "received":
                rows_2 = [r for r in res_2.rows if r.type == "income"]
            else:
                rows_2 = [r for r in res_2.rows if is_spending_txn(r, allow_people=allow_people_2)]

            sum_1 = sum((Decimal(str(r.amount)) for r in rows_1), Decimal("0.00"))
            sum_2 = sum((Decimal(str(r.amount)) for r in rows_2), Decimal("0.00"))

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
