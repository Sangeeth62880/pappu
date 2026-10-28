import uuid
from decimal import Decimal
from datetime import datetime, date
from typing import Dict, List, Optional, Literal
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.auth import get_current_user_id
from app.models import Transaction, Contact, Category
from app.assistant.contacts import merge_contacts
from app.services.date_utils import (
    get_period_bounds,
    generate_zero_filled_buckets,
    get_current_ist_datetime,
    IST,
)
from app.services.balances import _compute_contact_balance, balances
from app.services.spending import is_spending_txn
from app.schemas.transaction import (
    SummaryResponse,
    DailyBucket,
    ExpenseCategoryItem,
    TopContactItem,
    PeopleCounts,
    PeoplePeriodBlock,
    TopExpenseItem,
    CategoryBreakdownItem,
    PeopleSummaryResponse,
    ContactSummaryItem,
    ContactDetailResponse,
    TransactionResponse,
)

router = APIRouter(prefix="/summary", tags=["summary"])

@router.get("", response_model=SummaryResponse)
def get_summary(
    period: Optional[Literal["week", "month", "year", "all"]] = Query(None),
    ref_date: Optional[date] = Query(None, description="Optional override date for period calculations (testing)"),
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Financial analytics endpoint.
    If period is provided ('week' | 'month' | 'year'): returns period-scoped analytics
    including IST period boundaries, previous period delta, zero-filled daily buckets,
    expense breakdown, and people balances.
    If period is None or 'all': returns all-time summary for backward compatibility.
    All calculations strictly filter by current_user_id.
    """
    ref_dt = None
    if ref_date:
        ref_dt = datetime(ref_date.year, ref_date.month, ref_date.day, 12, 0, 0, tzinfo=IST)

    is_period_scoped = period in ("week", "month", "year")

    if is_period_scoped:
        curr_start, curr_end, prev_start, prev_end = get_period_bounds(period, ref_dt)
        curr_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user_id,
                Transaction.txn_date >= curr_start,
                Transaction.txn_date <= curr_end,
            )
            .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
            .all()
        )
        prev_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user_id,
                Transaction.txn_date >= prev_start,
                Transaction.txn_date <= prev_end,
            )
            .all()
        )
        buckets_data = generate_zero_filled_buckets(period, curr_start, curr_end)
        bucket_map: Dict[str, int] = {b["date"]: i for i, b in enumerate(buckets_data)}
        period_start_str = curr_start.isoformat()
        period_end_str = curr_end.isoformat()
        period_label = period
    else:
        curr_txns = (
            db.query(Transaction)
            .filter(Transaction.user_id == current_user_id)
            .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
            .all()
        )
        prev_txns = []
        buckets_data = []
        bucket_map = {}
        period_start_str = ""
        period_end_str = ""
        period_label = "all"

    # Compute Totals (Excluding category "People")
    total_spent = Decimal("0.00")
    total_income = Decimal("0.00")
    expense_category_totals: Dict[str, Decimal] = {}
    expense_txns_for_top: List[Transaction] = []

    # Legacy category breakdown mapping (includes all categories for backward compatibility)
    legacy_breakdown_map: Dict[int, CategoryBreakdownItem] = {}

    for txn in curr_txns:
        cat_id = txn.category_id
        cat_name = txn.category.name if txn.category else "Other"
        cat_type = txn.category.type if txn.category else txn.type
        is_people = (cat_name.lower() == "people") or (txn.contact_id is not None)

        # Legacy breakdown
        if cat_id not in legacy_breakdown_map:
            legacy_breakdown_map[cat_id] = CategoryBreakdownItem(
                category_id=cat_id,
                category_name=cat_name,
                type=cat_type,
                total_amount=Decimal("0.00"),
                count=0,
            )
        legacy_breakdown_map[cat_id].total_amount += txn.amount
        legacy_breakdown_map[cat_id].count += 1

        # Period analytics totals
        if is_spending_txn(txn, allow_people=False):
            total_spent += txn.amount
            expense_category_totals[cat_name] = (
                expense_category_totals.get(cat_name, Decimal("0.00")) + txn.amount
            )
            expense_txns_for_top.append(txn)

            if is_period_scoped:
                bucket_key = (
                    txn.txn_date.strftime("%Y-%m")
                    if period == "year"
                    else txn.txn_date.isoformat()
                )
                if bucket_key in bucket_map:
                    idx = bucket_map[bucket_key]
                    buckets_data[idx]["amount"] = float(
                        Decimal(str(buckets_data[idx]["amount"])) + txn.amount
                    )
        elif txn.type == "income" and not is_people:
            total_income += txn.amount

    net = total_income - total_spent

    # Previous period spent (excluding People)
    prev_spent = Decimal("0.00")
    for txn in prev_txns:
        if is_spending_txn(txn, allow_people=False):
            prev_spent += txn.amount

    # Delta absolute change (always present: total_spent - prev_spent)
    delta_abs = total_spent - prev_spent

    # Delta percentage (null when previous_total is below 500 rupees)
    spent_delta_pct: Optional[float] = None
    if prev_spent >= Decimal("500.00"):
        delta = ((total_spent - prev_spent) / prev_spent) * Decimal("100")
        spent_delta_pct = float(round(delta, 2))

    # Mood: worried when this period's spend is more than 1.5 times previous period and above 500 rupees, otherwise neutral
    summary_mood: Literal["neutral", "worried"] = "neutral"
    if is_period_scoped and total_spent > Decimal("1.5") * prev_spent and total_spent > Decimal("500.00"):
        summary_mood = "worried"

    # Average spending per day
    if is_period_scoped:
        num_days = max(1, (curr_end - curr_start).days + 1)
        avg_per_day = round(total_spent / Decimal(num_days), 2)
    elif curr_txns:
        all_dates = [t.txn_date for t in curr_txns]
        num_days = max(1, (max(all_dates) - min(all_dates)).days + 1)
        avg_per_day = round(total_spent / Decimal(num_days), 2)
    else:
        avg_per_day = Decimal("0.00")

    # Expense Category Breakdown (Top 5 + Other) using single shared spending definition
    sorted_cats = sorted(
        expense_category_totals.items(), key=lambda item: item[1], reverse=True
    )
    categories_list: List[ExpenseCategoryItem] = []
    top_5 = sorted_cats[:5]
    other_cats = sorted_cats[5:]

    for cat_name, amt in top_5:
        pct = float(round((amt / total_spent) * Decimal("100"), 2)) if total_spent > 0 else 0.0
        categories_list.append(
            ExpenseCategoryItem(category=cat_name, amount=amt, percentage=pct)
        )

    if other_cats:
        other_total = sum((amt for _, amt in other_cats), Decimal("0.00"))
        other_pct = (
            float(round((other_total / total_spent) * Decimal("100"), 2))
            if total_spent > 0
            else 0.0
        )
        categories_list.append(
            ExpenseCategoryItem(category="Other", amount=other_total, percentage=other_pct)
        )

    # Populate percentage on legacy category breakdown
    for item in legacy_breakdown_map.values():
        item.percentage = (
            float(round((item.total_amount / total_spent) * Decimal("100"), 2))
            if total_spent > 0
            else 0.0
        )

    # Top 3 largest single expenses in the period
    sorted_expenses = sorted(expense_txns_for_top, key=lambda t: t.amount, reverse=True)[:3]
    top_expenses_list = [
        TopExpenseItem(
            id=t.id,
            description=t.description or (t.category.name if t.category else "Expense"),
            amount=t.amount,
            date=t.txn_date,
            category=t.category.name if t.category else "Other",
        )
        for t in sorted_expenses
    ]

    # People Block (Using the shared balances service)
    all_contact_balances = balances(db, current_user_id, include_settled=True)
    total_owed_to_user = Decimal("0.00")
    total_user_owes = Decimal("0.00")
    owed_to_you_count = 0
    you_owe_count = 0
    settled_count = 0
    nonzero_contact_items: List[TopContactItem] = []

    for c_bal in all_contact_balances:
        if c_bal.net_balance > Decimal("0.00"):
            total_owed_to_user += c_bal.net_balance
            owed_to_you_count += 1
        elif c_bal.net_balance < Decimal("0.00"):
            total_user_owes += abs(c_bal.net_balance)
            you_owe_count += 1
        else:
            settled_count += 1

        if c_bal.net_balance != Decimal("0.00"):
            nonzero_contact_items.append(
                TopContactItem(
                    id=c_bal.contact_id,
                    name=c_bal.contact_name,
                    net_balance=c_bal.net_balance,
                    status=c_bal.status,
                )
            )

    # Top 3 contacts by absolute net balance
    nonzero_contact_items.sort(key=lambda c: abs(c.net_balance), reverse=True)
    top_contacts = nonzero_contact_items[:3]

    people_block = PeoplePeriodBlock(
        total_owed_to_user=total_owed_to_user,
        total_user_owes=total_user_owes,
        owed_to_you=total_owed_to_user,
        you_owe=total_user_owes,
        counts=PeopleCounts(
            owed_to_you=owed_to_you_count,
            you_owe=you_owe_count,
            settled=settled_count,
            total=len(all_contact_balances),
        ),
        top_contacts=top_contacts,
    )

    # Recent transactions (At most 5 most recent overall)
    all_recent = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user_id)
        .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
        .limit(5)
        .all()
    )

    recent_txns_response = [
        TransactionResponse(
            id=t.id,
            user_id=t.user_id,
            type=t.type,
            amount=t.amount,
            category_id=t.category_id,
            category_name=t.category.name if t.category else None,
            contact_id=t.contact_id,
            contact_name=t.contact.name if t.contact else None,
            description=t.description,
            txn_date=t.txn_date,
            created_at=t.created_at,
        )
        for t in all_recent
    ]

    # Convert bucket data to DailyBucket Pydantic models
    daily_buckets = [
        DailyBucket(date=b["date"], label=b["label"], amount=Decimal(str(b["amount"])))
        for b in buckets_data
    ]

    # Max day (peak spending bucket in the period)
    max_day: Optional[DailyBucket] = None
    if daily_buckets and any(b.amount > Decimal("0.00") for b in daily_buckets):
        max_day = max(daily_buckets, key=lambda b: b.amount)

    return SummaryResponse(
        period=period_label,
        period_start=period_start_str,
        period_end=period_end_str,
        total_spent=total_spent,
        total_income=total_income,
        net=net,
        previous_period_spent=prev_spent,
        spent_delta_percentage=spent_delta_pct,
        delta_pct=spent_delta_pct,
        delta_abs=delta_abs,
        avg_per_day=avg_per_day,
        max_day=max_day,
        mood=summary_mood,
        daily_buckets=daily_buckets,
        categories=categories_list,
        people=people_block,
        top_expenses=top_expenses_list,
        recent_transactions=recent_txns_response,
        # Legacy fields
        balance=net,
        total_expense=total_spent,
        category_breakdown=list(legacy_breakdown_map.values()),
        transaction_count=len(curr_txns),
    )


@router.get("/people", response_model=PeopleSummaryResponse)
def get_people_summary(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    List all contacts for the user with net balances, total sent, and total received.
    Formula: net_balance = sum(money sent [expense]) - sum(money received [income]).
    """
    contacts = (
        db.query(Contact)
        .filter(Contact.user_id == current_user_id)
        .order_by(Contact.name.asc())
        .all()
    )

    contact_summaries = []
    total_owed_to_user = Decimal("0.00")
    total_user_owes = Decimal("0.00")

    for contact in contacts:
        contact_txns = (
            db.query(Transaction)
            .filter(
                Transaction.user_id == current_user_id,
                Transaction.contact_id == contact.id,
            )
            .all()
        )
        item = _compute_contact_balance(contact, contact_txns)
        contact_summaries.append(item)

        if item.net_balance > Decimal("0.00"):
            total_owed_to_user += item.net_balance
        elif item.net_balance < Decimal("0.00"):
            total_user_owes += abs(item.net_balance)

    return PeopleSummaryResponse(
        contacts=contact_summaries,
        total_owed_to_user=total_owed_to_user,
        total_user_owes=total_user_owes,
    )


@router.get("/people/{contact_id}", response_model=ContactDetailResponse)
def get_contact_detail(
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Full transaction history with that contact plus net balance and contact details.
    """
    contact = (
        db.query(Contact)
        .filter(
            Contact.id == contact_id,
            Contact.user_id == current_user_id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Contact with id {contact_id} not found",
        )

    contact_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user_id,
            Transaction.contact_id == contact.id,
        )
        .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
        .all()
    )

    summary_item = _compute_contact_balance(contact, contact_txns)

    formatted_txns = [
        TransactionResponse(
            id=t.id,
            user_id=t.user_id,
            type=t.type,
            amount=t.amount,
            category_id=t.category_id,
            category_name=t.category.name if t.category else None,
            contact_id=t.contact_id,
            contact_name=contact.name,
            description=t.description,
            txn_date=t.txn_date,
            created_at=t.created_at,
        )
        for t in contact_txns
    ]

    return ContactDetailResponse(
        contact_id=contact.id,
        contact_name=contact.name,
        phone=contact.phone,
        upi_id=contact.upi_id,
        total_sent=summary_item.total_sent,
        total_received=summary_item.total_received,
        net_balance=summary_item.net_balance,
        status=summary_item.status,
        display_text=summary_item.display_text,
        transactions=formatted_txns,
    )


@router.get("/people/{contact_id}/remind-text")
def get_people_contact_remind_text(
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    from app.routers.contacts import get_contact_remind_text
    return get_contact_remind_text(contact_id=contact_id, db=db, current_user_id=current_user_id)


class MergeContactsRequest(BaseModel):
    primary_contact_id: uuid.UUID
    secondary_contact_id: uuid.UUID


@router.post("/people/merge")
def merge_people_contacts(
    body: MergeContactsRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Merges contact B into contact A for the authenticated user.
    Moves all transactions, adds B name and aliases to A, and deletes B.
    """
    try:
        return merge_contacts(
            db=db,
            user_id=current_user_id,
            primary_id=body.primary_contact_id,
            secondary_id=body.secondary_contact_id,
        )
    except ValueError as e:
        msg = str(e)
        if "not found" in msg.lower():
            raise HTTPException(status_code=404, detail=msg)
        raise HTTPException(status_code=400, detail=msg)


people_router = APIRouter(prefix="/people", tags=["people"])


@people_router.post("/merge")
def merge_people_contacts_direct(
    body: MergeContactsRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Direct alias route for merging contact B into contact A.
    """
    return merge_people_contacts(body=body, db=db, current_user_id=current_user_id)


@router.patch("/people/{contact_id}/rename")
@router.put("/people/{contact_id}/rename")
def rename_people_contact_route(
    contact_id: uuid.UUID,
    body: dict,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    from app.routers.contacts import rename_contact, ContactRenameRequest
    return rename_contact(contact_id=contact_id, body=ContactRenameRequest(name=body.get("name", "")), db=db, current_user_id=current_user_id)

