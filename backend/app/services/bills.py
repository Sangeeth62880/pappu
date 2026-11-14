"""
Bill split service (PROJECT_SPEC.md §5b Bill Split).

Everything that reads or writes a bill lives here. Every function takes the verified
user_id and scopes its queries with it; another user's bill is indistinguishable from a
bill that does not exist (BillError 404).

Nothing in this module writes to `transactions` except confirm_bill, mark_share_paid and
undo_bill, and each of those is an explicit user action.
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, List, Optional, Sequence
from urllib.parse import quote

from sqlalchemy.orm import Session

from app.assistant.contacts import create_contact, resolve_contact
from app.models.bill import Bill, BillItem, BillShare
from app.models.category import Category
from app.models.contact import Contact
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.services import budgets as budget_service
from app.services.bill_planner import (
    MAX_ITEM_NAME_LENGTH, MAX_NAME_LENGTH, PlannerItem, SplitPlanError, SplitPlanner, clean_label,
    merge_plan,
)
from app.services.bill_split import (
    MAX_ITEMS, MAX_PEOPLE, ME, SplitError, SplitItem, adds_up, bill_difference, compute_shares,
    items_total, unassigned_positions,
)
from app.services.date_utils import get_current_ist_datetime

YOU = "You"
DEFAULT_MERCHANT = "Bill"


class BillError(Exception):
    """An expected failure with the HTTP status and a stable machine readable code."""

    def __init__(self, status_code: int, code: str, message: str, detail: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.detail = detail


# ---------------------------------------------------------------- lookups

def get_bill(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, for_update: bool = False) -> Bill:
    query = db.query(Bill).filter(Bill.id == bill_id, Bill.user_id == user_id)
    if for_update:
        query = query.with_for_update()
    bill = query.first()
    if not bill:
        raise BillError(404, "not_found", "Bill not found")
    return bill


def _require_draft(bill: Bill) -> None:
    if bill.status != "draft":
        raise BillError(409, "not_a_draft", "This bill can no longer be changed.")


def _category(db: Session, name: str) -> Category:
    category = db.query(Category).filter(Category.name == name).first()
    if not category:
        raise BillError(500, "category_missing", f"The {name} category is missing.")
    return category


def _profile_language(db: Session, user_id: uuid.UUID) -> str:
    row = db.query(Profile.preferred_language).filter(Profile.id == user_id).first()
    return row[0] if row and row[0] in ("en", "ml") else "en"


def _split_items(bill: Bill) -> List[SplitItem]:
    return [SplitItem(i.position, Decimal(i.amount), tuple(i.assigned_to or ())) for i in bill.items]


def _people(bill: Bill) -> List[Dict[str, Any]]:
    return [dict(p) for p in (bill.people or [])]


def _friend_names(bill: Bill) -> List[str]:
    return [p["name"] for p in _people(bill)]


def _transaction_exists(db: Session, user_id: uuid.UUID, txn_id: Optional[uuid.UUID]) -> bool:
    if not txn_id:
        return False
    return db.query(Transaction.id).filter(Transaction.id == txn_id, Transaction.user_id == user_id).first() is not None


# ---------------------------------------------------------------- draft create / edit

def _validated_items(raw_items: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not raw_items:
        raise BillError(422, "no_items", "A bill needs at least one item.")
    if len(raw_items) > MAX_ITEMS:
        raise BillError(422, "too_many_items", f"A bill can have at most {MAX_ITEMS} items.")
    cleaned = []
    for raw in raw_items:
        name = clean_label(raw.get("name"), MAX_ITEM_NAME_LENGTH)
        amount = Decimal(str(raw.get("amount", "0")))
        quantity = Decimal(str(raw.get("quantity") or "1"))
        if not name:
            raise BillError(422, "bad_item", "Every item needs a name.")
        if amount <= 0:
            raise BillError(422, "bad_item", f"{name} needs an amount above zero.")
        if quantity <= 0:
            raise BillError(422, "bad_item", f"{name} needs a quantity above zero.")
        cleaned.append({
            "id": raw.get("id"),
            "name": name,
            "amount": amount,
            "quantity": quantity,
            "needs_check": bool(raw.get("needs_check", False)),
        })
    return cleaned


def _non_negative(value: Any, label: str) -> Decimal:
    amount = Decimal(str(value or "0"))
    if amount < 0:
        raise BillError(422, "bad_charge", f"{label} cannot be negative.")
    return amount


def create_draft(
    db: Session,
    user_id: uuid.UUID,
    *,
    merchant: Optional[str],
    bill_date: Optional[date],
    items: Sequence[Dict[str, Any]],
    tax: Any = 0,
    service_charge: Any = 0,
    discount: Any = 0,
    total: Any,
) -> Bill:
    cleaned = _validated_items(items)
    total_amount = Decimal(str(total or "0"))
    if total_amount <= 0:
        raise BillError(422, "bad_total", "The bill total must be more than zero.")

    bill = Bill(
        id=uuid.uuid4(),
        user_id=user_id,
        merchant=clean_label(merchant, MAX_ITEM_NAME_LENGTH) or None,
        bill_date=bill_date or get_current_ist_datetime().date(),
        tax=_non_negative(tax, "Tax"),
        service_charge=_non_negative(service_charge, "Service charge"),
        discount=_non_negative(discount, "Discount"),
        total=total_amount,
        status="draft",
        people=[],
    )
    bill.items = [
        BillItem(
            id=uuid.uuid4(), position=n + 1, name=i["name"], quantity=i["quantity"], amount=i["amount"],
            needs_check=i["needs_check"], assigned_to=None,
        )
        for n, i in enumerate(cleaned)
    ]
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


def update_draft(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, patch: Dict[str, Any]) -> Bill:
    """Review screen edits. Only the keys present in `patch` change."""
    bill = get_bill(db, user_id, bill_id, for_update=True)
    _require_draft(bill)

    if "merchant" in patch:
        bill.merchant = clean_label(patch["merchant"], MAX_ITEM_NAME_LENGTH) or None
    if patch.get("bill_date"):
        bill.bill_date = patch["bill_date"]
    for key, label in (("tax", "Tax"), ("service_charge", "Service charge"), ("discount", "Discount")):
        if patch.get(key) is not None:
            setattr(bill, key, _non_negative(patch[key], label))
    if patch.get("total") is not None:
        total_amount = Decimal(str(patch["total"]))
        if total_amount <= 0:
            raise BillError(422, "bad_total", "The bill total must be more than zero.")
        bill.total = total_amount

    if patch.get("items") is not None:
        cleaned = _validated_items(patch["items"])
        existing = {str(i.id): i for i in bill.items}
        kept: List[BillItem] = []
        for n, raw in enumerate(cleaned):
            item = existing.pop(str(raw["id"]), None) if raw["id"] else None
            if item is None:
                item = BillItem(id=uuid.uuid4(), assigned_to=None)
            item.position = n + 1
            item.name = raw["name"]
            item.quantity = raw["quantity"]
            item.amount = raw["amount"]
            item.needs_check = False  # the user has now looked at this line
            kept.append(item)
        bill.items = kept  # delete-orphan removes the rest

    db.commit()
    db.refresh(bill)
    return bill


def cancel_draft(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID) -> None:
    bill = get_bill(db, user_id, bill_id, for_update=True)
    if bill.status == "cancelled":
        return
    _require_draft(bill)
    bill.status = "cancelled"
    db.commit()


# ---------------------------------------------------------------- people and assignment

def _resolve_new_people(db: Session, user_id: uuid.UUID, bill: Bill, spoken_names: Sequence[str]) -> Dict[str, str]:
    """
    Adds any name not yet on the bill to bill.people, resolved through the contact resolver.
    Returns spoken name (casefolded) -> the display name the bill uses for that person.

    exact match  -> the contact's own name, status "matched"
    close match  -> status "ambiguous" with the candidate; the user must say which (resolve_person)
    no match     -> status "new"; the contact is created only on confirm
    """
    people = _people(bill)
    by_key = {p["name"].casefold(): p["name"] for p in people}
    by_contact = {p["contact_id"]: p["name"] for p in people if p.get("contact_id")}
    mapping: Dict[str, str] = {}

    for spoken in spoken_names:
        key = spoken.casefold()
        if key in by_key:
            mapping[key] = by_key[key]
            continue
        resolution = resolve_contact(db, user_id, spoken)
        if resolution.status == "exact" and resolution.contact is not None:
            contact_id = str(resolution.contact.id)
            if contact_id in by_contact:  # two spellings of someone already on the bill
                mapping[key] = by_contact[contact_id]
                continue
            entry = {"name": resolution.contact.name, "contact_id": contact_id, "status": "matched"}
            by_contact[contact_id] = entry["name"]
        elif resolution.status == "fuzzy" and resolution.candidate is not None:
            entry = {
                "name": spoken, "contact_id": None, "status": "ambiguous",
                "candidate_id": str(resolution.candidate.id), "candidate_name": resolution.candidate.name,
            }
        else:
            entry = {"name": spoken, "contact_id": None, "status": "new"}
        if entry["name"].casefold() in by_key:
            mapping[key] = by_key[entry["name"].casefold()]
            continue
        people.append(entry)
        by_key[entry["name"].casefold()] = entry["name"]
        mapping[key] = entry["name"]

    if len(people) > MAX_PEOPLE:
        raise BillError(422, "too_many_people", f"A bill can be split with at most {MAX_PEOPLE} people.")
    bill.people = people
    return mapping


def _apply_assignments(bill: Bill, assignments: Dict[int, List[str]], mapping: Dict[str, str]) -> None:
    for item in bill.items:
        if item.position not in assignments:
            continue
        names = [ME if n == ME else mapping.get(n.casefold(), n) for n in assignments[item.position]]
        names = list(dict.fromkeys(names))
        item.assigned_to = names or None


def asked_about(bill: Bill) -> Optional[int]:
    """The item Pappu is currently asking about: the first unassigned one, once anything is assigned."""
    missing = unassigned_positions(_split_items(bill))
    if missing and len(missing) < len(bill.items):
        return missing[0]
    return None


def assign_from_text(
    db: Session,
    user_id: uuid.UUID,
    bill_id: uuid.UUID,
    text: str,
    planner: SplitPlanner,
) -> Dict[str, Any]:
    """Runs the split planner on what the user said and merges the result into the draft."""
    bill = get_bill(db, user_id, bill_id, for_update=True)
    _require_draft(bill)
    text = (text or "").strip()
    if not text:
        raise BillError(422, "empty_text", "Say or type who had what.")

    planner_items = [
        PlannerItem(i.position, i.name, f"{Decimal(i.quantity).normalize():f}", i.assigned_to) for i in bill.items
    ]
    known = _friend_names(bill)
    try:
        plan = planner.plan(text, planner_items, known, asked_about(bill))
        merged = merge_plan(planner_items, known, plan)
    except SplitPlanError as err:
        db.rollback()
        raise BillError(
            422, "planner_failed",
            "I could not work that out. Try again, or tap an item to choose who had it.",
        ) from err

    mapping = _resolve_new_people(db, user_id, bill, merged.people)
    _apply_assignments(bill, merged.assignments, mapping)
    db.commit()
    db.refresh(bill)

    language = plan.language if plan.language in ("en", "ml") else _profile_language(db, user_id)
    result = serialize_bill(db, bill, language=language)
    result["understood"] = bool(merged.changed)
    result["planner"] = {
        "confidence": plan.confidence,
        "requires_confirmation": True,
        "missing_fields": merged.missing_fields,
        "low_confidence_items": merged.low_confidence,
    }
    return result


def set_item_people(
    db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, item_id: uuid.UUID, people: Sequence[str]
) -> Bill:
    """Manual assignment by tapping. No LLM. An empty list clears the item."""
    bill = get_bill(db, user_id, bill_id, for_update=True)
    _require_draft(bill)
    item = next((i for i in bill.items if i.id == item_id), None)
    if item is None:
        raise BillError(404, "not_found", "Item not found")

    names: List[str] = []
    for raw in people:
        name = clean_label(raw, MAX_NAME_LENGTH)
        if name:
            names.append(ME if name.casefold() == ME else name)
    friends = [n for n in names if n != ME]
    mapping = _resolve_new_people(db, user_id, bill, friends)
    _apply_assignments(bill, {item.position: names}, mapping)
    db.commit()
    db.refresh(bill)
    return bill


def resolve_person(
    db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, name: str, use_existing: bool
) -> Bill:
    """Answers "is <spoken name> the same person as <existing contact>?" for an ambiguous name."""
    bill = get_bill(db, user_id, bill_id, for_update=True)
    _require_draft(bill)
    people = _people(bill)
    entry = next((p for p in people if p["name"].casefold() == (name or "").strip().casefold()), None)
    if entry is None or entry.get("status") != "ambiguous":
        raise BillError(404, "not_found", "Nobody on this bill is waiting for that answer.")

    old_name = entry["name"]
    if use_existing:
        contact = (
            db.query(Contact)
            .filter(Contact.id == uuid.UUID(entry["candidate_id"]), Contact.user_id == user_id)
            .first()
        )
        if contact is None:
            raise BillError(404, "not_found", "That contact no longer exists.")
        duplicate = next((p for p in people if p is not entry and p.get("contact_id") == str(contact.id)), None)
        new_name = duplicate["name"] if duplicate else contact.name
        if duplicate:
            people.remove(entry)
        else:
            entry.update({"name": contact.name, "contact_id": str(contact.id), "status": "matched"})
    else:
        new_name = old_name
        entry["status"] = "new"
    entry.pop("candidate_id", None)
    entry.pop("candidate_name", None)

    bill.people = people
    for item in bill.items:
        if item.assigned_to and old_name in item.assigned_to:
            item.assigned_to = list(dict.fromkeys(new_name if n == old_name else n for n in item.assigned_to))
    db.commit()
    db.refresh(bill)
    return bill


# ---------------------------------------------------------------- preview and serialization

QUESTION_TEMPLATES = {
    "en": "Who had the {item}?",
    "ml": "{item} ആരാണ് കഴിച്ചത്?",
}


def _preview_shares(bill: Bill) -> Optional[List[Dict[str, Any]]]:
    """Computed shares for a draft, or None while the bill cannot be split yet."""
    try:
        result = compute_shares(_split_items(bill), bill.tax, bill.service_charge, bill.discount, bill.total)
    except SplitError:
        return None
    people = {p["name"]: p for p in _people(bill)}
    shares = []
    for name, amount in result.shares.items():
        person = people.get(name, {})
        shares.append({
            "id": None,
            "name": YOU if name == ME else name,
            "is_self": name == ME,
            "contact_id": person.get("contact_id"),
            "is_new": name != ME and person.get("status") == "new",
            "amount": float(amount),
            "items": [i.name for i in bill.items if name in (i.assigned_to or ())],
            "paid": False,
        })
    return shares


def _stored_shares(db: Session, bill: Bill) -> List[Dict[str, Any]]:
    shares = []
    for share in sorted(bill.shares, key=lambda s: (not s.is_self, s.name.casefold())):
        key = ME if share.is_self else share.name
        shares.append({
            "id": str(share.id),
            "name": share.name,
            "is_self": share.is_self,
            "contact_id": str(share.contact_id) if share.contact_id else None,
            "is_new": False,
            "amount": float(share.amount),
            "items": [i.name for i in bill.items if key in (i.assigned_to or ())],
            "paid": _transaction_exists(db, bill.user_id, share.paid_transaction_id),
        })
    return shares


def serialize_bill(db: Session, bill: Bill, language: Optional[str] = None) -> Dict[str, Any]:
    language = language if language in ("en", "ml") else _profile_language(db, bill.user_id)
    split_items = _split_items(bill)
    difference = bill_difference(split_items, bill.tax, bill.service_charge, bill.discount, bill.total)
    balanced = adds_up(split_items, bill.tax, bill.service_charge, bill.discount, bill.total)
    missing = unassigned_positions(split_items)
    people = _people(bill)
    ambiguous = [p["name"] for p in people if p.get("status") == "ambiguous"]

    if bill.status == "draft":
        shares = _preview_shares(bill) if not ambiguous else None
    else:
        shares = _stored_shares(db, bill)

    question = None
    asking = asked_about(bill) if bill.status == "draft" else None
    if asking is not None:
        item = next(i for i in bill.items if i.position == asking)
        question = {"item": asking, "item_id": str(item.id), "text": QUESTION_TEMPLATES[language].format(item=item.name)}

    your_share = next((s["amount"] for s in shares or [] if s["is_self"]), 0.0)
    friends_total = sum(s["amount"] for s in shares or [] if not s["is_self"])
    return {
        "id": str(bill.id),
        "status": bill.status,
        "merchant": bill.merchant,
        "bill_date": bill.bill_date.isoformat(),
        "tax": float(bill.tax),
        "service_charge": float(bill.service_charge),
        "discount": float(bill.discount),
        "total": float(bill.total),
        "items": [
            {
                "id": str(i.id), "position": i.position, "name": i.name, "quantity": float(i.quantity),
                "amount": float(i.amount), "needs_check": bool(i.needs_check), "assigned_to": list(i.assigned_to or []),
            }
            for i in bill.items
        ],
        "items_total": float(items_total(split_items)),
        "difference": float(difference),
        "adds_up": balanced,
        "people": [
            {
                "name": p["name"], "contact_id": p.get("contact_id"), "status": p.get("status", "new"),
                "candidate_name": p.get("candidate_name"),
            }
            for p in people
        ],
        "unassigned": missing,
        "ambiguous_people": ambiguous,
        "question": question,
        "ready": bill.status == "draft" and shares is not None,
        "shares": shares,
        "your_share": your_share,
        "friends_total": round(friends_total, 2),
        "language_code": "ml-IN" if language == "ml" else "en-IN",
    }


# ---------------------------------------------------------------- confirm, undo, mark paid

def _description(bill: Bill) -> str:
    return f"{bill.merchant or DEFAULT_MERCHANT} (split)"


def confirm_bill(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID) -> Dict[str, Any]:
    """
    The only place a split is written. One database transaction, one undo batch.
    Confirming a bill that is already confirmed writes nothing and returns it as stored.
    """
    bill = get_bill(db, user_id, bill_id, for_update=True)
    if bill.status == "confirmed":
        return serialize_bill(db, bill)
    _require_draft(bill)

    people = _people(bill)
    if any(p.get("status") == "ambiguous" for p in people):
        raise BillError(409, "ambiguous_people", "Choose who each person is before saving.",
                        [p["name"] for p in people if p.get("status") == "ambiguous"])
    try:
        result = compute_shares(_split_items(bill), bill.tax, bill.service_charge, bill.discount, bill.total)
    except SplitError as err:
        detail = float(err.detail) if isinstance(err.detail, Decimal) else err.detail
        raise BillError(409, err.code, str(err), detail) from err

    try:
        food = _category(db, "Food")
        people_category = _category(db, "People")
        by_name = {p["name"]: p for p in people}
        now = get_current_ist_datetime()
        batch_id = uuid.uuid4()
        description = _description(bill)
        own_txn: Optional[Transaction] = None

        for name, amount in result.shares.items():
            if amount <= 0:
                continue  # a zero share writes nothing
            contact_id: Optional[uuid.UUID] = None
            if name == ME:
                share_name, category, is_self = YOU, food, True
            else:
                entry = by_name[name]
                if entry.get("contact_id"):
                    contact = (
                        db.query(Contact)
                        .filter(Contact.id == uuid.UUID(entry["contact_id"]), Contact.user_id == user_id)
                        .first()
                    )
                else:
                    contact = None
                if contact is None:  # a new name, or a contact deleted since it was matched
                    contact = create_contact(db, user_id, name)
                    entry.update({"contact_id": str(contact.id), "status": "matched"})
                contact_id = contact.id
                share_name, category, is_self = name, people_category, False

            txn = Transaction(
                id=uuid.uuid4(), user_id=user_id, type="expense", amount=amount, category_id=category.id,
                contact_id=contact_id, description=description, txn_date=bill.bill_date, created_at=now,
            )
            db.add(txn)
            db.add(UndoAction(
                user_id=user_id, action_type="add", transaction_id=txn.id, batch_id=batch_id,
                previous_state=None, created_at=now,
            ))
            db.add(BillShare(
                id=uuid.uuid4(), bill_id=bill.id, is_self=is_self, contact_id=contact_id, name=share_name,
                amount=amount, transaction_id=txn.id,
            ))
            if is_self:
                own_txn = txn

        bill.people = list(by_name.values())
        bill.status = "confirmed"
        bill.undo_batch_id = batch_id
        db.commit()
    except Exception:
        db.rollback()
        raise

    db.refresh(bill)
    response = serialize_bill(db, bill)
    if own_txn is not None:
        alert = budget_service.alert_for_add(db, user_id, own_txn)
        if alert:
            response["budget_alert"] = alert
    return response


def mark_bills_undone(db: Session, user_id: uuid.UUID, batch_id: Optional[uuid.UUID]) -> None:
    """Called by the assistant's undo after it reverts a batch: a bill written by that batch is undone."""
    if not batch_id:
        return
    for bill in db.query(Bill).filter(Bill.user_id == user_id, Bill.undo_batch_id == batch_id, Bill.status == "confirmed"):
        bill.status = "undone"


def undo_bill(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID) -> Dict[str, Any]:
    """Reverts a confirmed bill: removes every transaction its confirm wrote."""
    bill = get_bill(db, user_id, bill_id, for_update=True)
    if bill.status == "undone":
        return serialize_bill(db, bill)
    if bill.status != "confirmed":
        raise BillError(409, "not_confirmed", "Only a saved split can be undone.")
    if any(_transaction_exists(db, user_id, s.paid_transaction_id) for s in bill.shares):
        raise BillError(409, "share_paid", "Someone is already marked as paid. Undo that repayment first.")

    txn_ids = [s.transaction_id for s in bill.shares if s.transaction_id]
    if txn_ids:
        db.query(Transaction).filter(Transaction.user_id == user_id, Transaction.id.in_(txn_ids)).delete(
            synchronize_session=False
        )
    if bill.undo_batch_id:
        db.query(UndoAction).filter(UndoAction.user_id == user_id, UndoAction.batch_id == bill.undo_batch_id).delete(
            synchronize_session=False
        )
    bill.status = "undone"
    db.commit()
    db.refresh(bill)
    return serialize_bill(db, bill)


def _friend_share(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, share_id: uuid.UUID, for_update: bool = False):
    bill = get_bill(db, user_id, bill_id, for_update=for_update)
    share = next((s for s in bill.shares if s.id == share_id), None)
    if share is None:
        raise BillError(404, "not_found", "Share not found")
    if bill.status != "confirmed":
        raise BillError(409, "not_confirmed", "Save the split first.")
    if share.is_self:
        raise BillError(409, "own_share", "That is your own share.")
    return bill, share


def mark_share_paid(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, share_id: uuid.UUID) -> Dict[str, Any]:
    """Writes the repayment for one friend's share: an income in People from that contact."""
    bill, share = _friend_share(db, user_id, bill_id, share_id, for_update=True)
    if _transaction_exists(db, user_id, share.paid_transaction_id):
        return serialize_bill(db, bill)
    contact = (
        db.query(Contact).filter(Contact.id == share.contact_id, Contact.user_id == user_id).first()
        if share.contact_id else None
    )
    if contact is None:
        raise BillError(409, "contact_missing", "That person is no longer in your contacts.")

    now = get_current_ist_datetime()
    txn = Transaction(
        id=uuid.uuid4(), user_id=user_id, type="income", amount=share.amount,
        category_id=_category(db, "People").id, contact_id=contact.id,
        description=f"{_description(bill)} paid back", txn_date=now.date(), created_at=now,
    )
    db.add(txn)
    db.add(UndoAction(
        user_id=user_id, action_type="add", transaction_id=txn.id, batch_id=uuid.uuid4(),
        previous_state=None, created_at=now,
    ))
    share.paid_transaction_id = txn.id
    db.commit()
    db.refresh(bill)
    return serialize_bill(db, bill)


# ---------------------------------------------------------------- pay requests

def build_upi_link(upi_id: str, payee_name: str, amount: Decimal, note: str) -> str:
    """upi://pay link per the NPCI deep linking format. Values are percent encoded."""
    return (
        f"upi://pay?pa={quote(upi_id, safe='@.-_')}&pn={quote(payee_name)}"
        f"&am={Decimal(amount):.2f}&cu=INR&tn={quote(note)}"
    )


REQUEST_TEMPLATES = {
    "en": "Hi {name}, your share of {merchant} is ₹{amount}. You can pay me on UPI at {upi_id}, or scan the QR code.",
    "ml": "ഹായ് {name}, {merchant} ബില്ലിലെ നിങ്ങളുടെ പങ്ക് ₹{amount} ആണ്. {upi_id} എന്ന UPI ഐഡിയിലേക്ക് അയക്കാം, അല്ലെങ്കിൽ QR കോഡ് സ്കാൻ ചെയ്യാം.",
}


def pay_request(db: Session, user_id: uuid.UUID, bill_id: uuid.UUID, share_id: uuid.UUID) -> Dict[str, Any]:
    """UPI link and message for one friend's share. Pappu never moves money itself."""
    bill, share = _friend_share(db, user_id, bill_id, share_id)
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if profile is None or not profile.upi_id:
        raise BillError(422, "upi_id_missing", "Add your UPI ID on the Me screen first.")

    merchant = bill.merchant or DEFAULT_MERCHANT
    amount = Decimal(share.amount)
    language = profile.preferred_language if profile.preferred_language in ("en", "ml") else "en"
    amount_text = f"{amount:,.0f}" if amount == amount.to_integral_value() else f"{amount:,.2f}"
    return {
        "share_id": str(share.id),
        "name": share.name,
        "amount": float(amount),
        "upi_id": profile.upi_id,
        "upi_link": build_upi_link(profile.upi_id, profile.name, amount, merchant),
        "message": REQUEST_TEMPLATES[language].format(
            name=share.name, merchant=merchant, amount=amount_text, upi_id=profile.upi_id
        ),
        "paid": _transaction_exists(db, user_id, share.paid_transaction_id),
    }
