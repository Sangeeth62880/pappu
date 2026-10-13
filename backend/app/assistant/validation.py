"""
Semantic checks and validation for Pappu Assistant v2.

All checks are consolidated here:
1. Amount greater than 0 and below a configurable cap.
2. Invalid calendar dates rejected.
3. Future dates flagged as needs_confirmation using IST date utility.
4. Unknown category maps to Other.
5. Person add requires a contact.
"""

from decimal import Decimal, InvalidOperation
from datetime import datetime, date
from typing import Optional, Union, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.category import Category
from app.services.date_utils import get_current_ist_datetime

# Configurable amount cap (default 10,000,000 INR)
MAX_AMOUNT_CAP = Decimal("10000000.00")

KNOWN_CATEGORIES = {
    "food": "Food",
    "transport": "Transport",
    "shopping": "Shopping",
    "bills": "Bills",
    "entertainment": "Entertainment",
    "salary": "Salary",
    "people": "People",
    "other": "Other",
}


def validate_amount(amount: Union[float, int, Decimal, str], cap: Decimal = MAX_AMOUNT_CAP) -> Decimal:
    """
    Validate that amount is strictly greater than 0 and does not exceed cap.
    """
    try:
        val = Decimal(str(amount))
    except (InvalidOperation, TypeError, ValueError):
        raise ValueError("Invalid amount format")

    if val <= Decimal("0.00"):
        raise ValueError("Amount must be greater than 0")

    if val > cap:
        raise ValueError(f"Amount exceeds maximum allowed limit of {cap}")

    return val


def validate_and_parse_date(date_val: Union[str, date, datetime, None]) -> Tuple[date, bool]:
    """
    Validate calendar date and check if it is in the future.
    Uses the IST date utility and never date.today().
    Returns (parsed_date, needs_confirmation).
    """
    today_ist = get_current_ist_datetime().date()

    if date_val is None:
        return today_ist, False

    if isinstance(date_val, datetime):
        parsed = date_val.date()
    elif isinstance(date_val, date):
        parsed = date_val
    elif isinstance(date_val, str):
        clean_str = date_val.strip()
        if not clean_str:
            return today_ist, False
        try:
            parsed = date.fromisoformat(clean_str)
        except ValueError:
            raise ValueError("Invalid calendar date")
    else:
        raise ValueError("Invalid calendar date format")

    needs_confirmation = parsed > today_ist
    return parsed, needs_confirmation


def resolve_category(
    db: Session,
    category_name: Optional[str],
    default_type: str = "expense",
) -> Category:
    """
    Resolves category name to a database Category row.
    Unknown or missing category maps to Other.
    """
    target_name = "Other"
    if category_name:
        clean = category_name.strip().lower()
        if clean in KNOWN_CATEGORIES:
            target_name = KNOWN_CATEGORIES[clean]

    cat = db.query(Category).filter(func.lower(Category.name) == target_name.lower()).first()
    if not cat:
        # Fallback to Other category
        cat = db.query(Category).filter(Category.name == "Other").first()
    if not cat:
        # Create Other if database was not seeded
        cat = Category(name="Other", type=default_type)
        db.add(cat)
        db.commit()
        db.refresh(cat)

    return cat


def validate_person_contact(contact: Optional[str]) -> str:
    """
    Person add requires a non empty contact name.
    """
    if not contact or not str(contact).strip():
        raise ValueError("Person transaction requires a contact")
    return str(contact).strip()
