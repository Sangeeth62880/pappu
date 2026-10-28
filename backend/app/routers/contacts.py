import uuid
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user_id
from app.database import get_db
from app.models.contact import Contact
from app.models.profile import Profile
from app.models.transaction import Transaction
from app.services.balances import _compute_contact_balance
from app.assistant.contacts import create_contact, normalize_name, merge_contacts
from app.schemas.transaction import (
    ContactCreateRequest,
    ContactResponse,
    ContactDetailResponse,
    TransactionResponse,
    RemindTextResponse,
    ContactRenameRequest,
    ContactUpdateRequest,
    MergeContactsRequest,
)

router = APIRouter(prefix="/contacts", tags=["contacts"])


def build_remind_text(contact_name: str, net_balance: Decimal, language: str) -> str:
    """
    Generates friendly reminder text in user preferred language.
    Strictly follows the no hyphen and no em dash rule for user facing strings.
    """
    abs_net = abs(net_balance)
    if abs_net == int(abs_net):
        amount_str = f"{int(abs_net):,}"
    else:
        amount_str = f"{abs_net:,.2f}"

    is_ml = language == "ml"

    if net_balance > Decimal("0.00"):
        if is_ml:
            return f"ഹായ് {contact_name}, നമ്മുടെ കണക്കിലുള്ള ₹{amount_str} ഓർമ്മിപ്പിക്കുന്നു. സൗകര്യം പോലെ UPI വഴി അയക്കുമല്ലോ."
        return f"Hi {contact_name}, gentle reminder about the pending ₹{amount_str} from our recent split. You can settle via UPI when you get a chance."
    elif net_balance < Decimal("0.00"):
        if is_ml:
            return f"ഹായ് {contact_name}, ഞാൻ തരാനുള്ള ₹{amount_str} ഓർമ്മയുണ്ട്. വേഗം തന്നെ അയക്കാം."
        return f"Hi {contact_name}, checking in on our balance. I owe you ₹{amount_str} and will settle soon."
    else:
        if is_ml:
            return f"{contact_name}യുമായുള്ള എല്ലാ ഇടപാടുകളും തീർന്നു."
        return f"All settled with {contact_name}."


@router.post("", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ContactResponse, status_code=status.HTTP_201_CREATED)
def create_new_contact(
    body: ContactCreateRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Creates a new contact for the authenticated user.
    Rejects duplicate names case-insensitively, also checking existing aliases.
    Shares the V2 contact creation function.
    """
    raw_name = body.name or ""
    clean_name = normalize_name(raw_name).strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contact name is required",
        )

    clean_lower = clean_name.lower()

    # Reject duplicate names or aliases case-insensitively
    user_contacts = (
        db.query(Contact).filter(Contact.user_id == current_user_id).all()
    )
    for c in user_contacts:
        c_name = normalize_name(c.name).strip().lower()
        if c_name == clean_lower:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A contact with this name already exists",
            )
        for alias in (c.aliases or []):
            a_norm = normalize_name(str(alias)).strip().lower()
            if a_norm == clean_lower:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A contact with this alias already exists",
                )

    # Reuses V2 contact creation function
    contact = create_contact(db=db, user_id=current_user_id, name=clean_name)

    phone_val = body.phone.strip() if body.phone and body.phone.strip() else None
    upi_val = body.upi_id.strip() if body.upi_id and body.upi_id.strip() else None

    if phone_val is not None:
        contact.phone = phone_val
    if upi_val is not None:
        contact.upi_id = upi_val

    db.commit()
    db.refresh(contact)

    return ContactResponse(
        id=contact.id,
        name=contact.name,
        phone=contact.phone,
        upi_id=contact.upi_id,
        aliases=contact.aliases or [],
        created_at=contact.created_at,
    )


@router.get("", response_model=List[ContactResponse])
@router.get("/", response_model=List[ContactResponse])
def list_contacts(
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Lists all contacts for the authenticated user.
    """
    contacts = (
        db.query(Contact)
        .filter(Contact.user_id == current_user_id)
        .order_by(Contact.name.asc())
        .all()
    )
    return [
        ContactResponse(
            id=c.id,
            name=c.name,
            phone=c.phone,
            upi_id=c.upi_id,
            aliases=c.aliases or [],
            created_at=c.created_at,
        )
        for c in contacts
    ]


@router.get("/{contact_id}", response_model=ContactDetailResponse)
def get_contact_detail_by_id(
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
            detail="Contact not found",
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


@router.get("/{contact_id}/remind-text", response_model=RemindTextResponse)
def get_contact_remind_text(
    contact_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Returns friendly reminder text for the contact in the user's preferred language.
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
            detail="Contact not found",
        )

    contact_txns = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == current_user_id,
            Transaction.contact_id == contact.id,
        )
        .all()
    )

    summary_item = _compute_contact_balance(contact, contact_txns)

    profile = (
        db.query(Profile)
        .filter(Profile.id == current_user_id)
        .first()
    )
    preferred_lang = profile.preferred_language if profile and profile.preferred_language else "en"

    text_msg = build_remind_text(
        contact_name=contact.name,
        net_balance=summary_item.net_balance,
        language=preferred_lang,
    )

    return RemindTextResponse(
        remind_text=text_msg,
        text=text_msg,
        contact_id=contact.id,
        contact_name=contact.name,
        amount=float(abs(summary_item.net_balance)),
    )


@router.patch("/{contact_id}/rename", response_model=ContactResponse)
@router.put("/{contact_id}/rename", response_model=ContactResponse)
def rename_contact(
    contact_id: uuid.UUID,
    body: ContactRenameRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Renames a contact for the authenticated user.
    Maintains aliases: adds previous name to aliases so speech/references still resolve.
    Rejects duplicate names or aliases against other contacts of this user.
    """
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.user_id == current_user_id)
        .first()
    )
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    raw_name = body.name or ""
    clean_name = normalize_name(raw_name).strip()
    if not clean_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Contact name is required",
        )

    clean_lower = clean_name.lower()
    curr_name_lower = normalize_name(contact.name).strip().lower()

    if clean_lower != curr_name_lower:
        # Check duplicate name/alias against all OTHER contacts of current user
        other_contacts = (
            db.query(Contact)
            .filter(Contact.user_id == current_user_id, Contact.id != contact.id)
            .all()
        )
        for c in other_contacts:
            c_name = normalize_name(c.name).strip().lower()
            if c_name == clean_lower:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A contact with this name already exists",
                )
            for alias in (c.aliases or []):
                a_norm = normalize_name(str(alias)).strip().lower()
                if a_norm == clean_lower:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail="A contact with this alias already exists",
                    )

        # Preserve the previous name as an alias
        old_name_norm = normalize_name(contact.name).strip()
        existing_aliases = [normalize_name(str(a)) for a in (contact.aliases or [])]
        existing_lower = {a.lower() for a in existing_aliases}
        if old_name_norm and old_name_norm.lower() not in existing_lower and old_name_norm.lower() != clean_lower:
            existing_aliases.append(old_name_norm)

        # Remove the new name from aliases if it was present
        existing_aliases = [a for a in existing_aliases if a.lower() != clean_lower]
        contact.aliases = existing_aliases

    contact.name = clean_name
    db.commit()
    db.refresh(contact)

    return ContactResponse(
        id=contact.id,
        name=contact.name,
        phone=contact.phone,
        upi_id=contact.upi_id,
        aliases=contact.aliases or [],
        created_at=contact.created_at,
    )


@router.patch("/{contact_id}", response_model=ContactResponse)
def update_contact(
    contact_id: uuid.UUID,
    body: ContactUpdateRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Updates contact fields (name, phone, upi_id).
    """
    contact = (
        db.query(Contact)
        .filter(Contact.id == contact_id, Contact.user_id == current_user_id)
        .first()
    )
    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found",
        )

    if body.name is not None:
        rename_contact(
            contact_id=contact_id,
            body=ContactRenameRequest(name=body.name),
            db=db,
            current_user_id=current_user_id,
        )
        db.refresh(contact)

    if body.phone is not None:
        phone_val = body.phone.strip() if body.phone.strip() else None
        contact.phone = phone_val

    if body.upi_id is not None:
        upi_val = body.upi_id.strip() if body.upi_id.strip() else None
        contact.upi_id = upi_val

    db.commit()
    db.refresh(contact)

    return ContactResponse(
        id=contact.id,
        name=contact.name,
        phone=contact.phone,
        upi_id=contact.upi_id,
        aliases=contact.aliases or [],
        created_at=contact.created_at,
    )


@router.post("/merge")
def merge_contacts_route(
    body: MergeContactsRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Merges secondary contact into primary contact for the authenticated user.
    Reassigns transactions, consolidates aliases, and removes secondary contact.
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
