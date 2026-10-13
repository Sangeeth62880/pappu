"""
Intent router for Phase 3 and Phase 4.

Endpoints:
- POST /intent/parse: Plain text -> validated IntentObject (Phase 3)
- POST /intent/route: IntentObject -> RoutingDecision + DB execution/prompts (Phase 4)
- POST /intent/confirm: Explicit confirmation -> executes pending edit/delete (Phase 4)
"""

import uuid
import logging
from decimal import Decimal
from datetime import datetime, date
from typing import Optional, List, Literal, Any, Union
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.auth import get_current_user_id
from app.llm.client import SarvamLLMClient
from app.models.transaction import Transaction
from app.models.category import Category
from app.models.profile import Profile
from app.models.contact import Contact
from app.schemas.intent import IntentObject, IntentFields, IntentValidationError
from app.services.routing import route_intent, RoutingDecision, RoutingResult
from app.services.matcher import match_transactions
from app.services.contact_matcher import find_similar_contacts
from app.llm.response_generator import generate_spoken_response

router = APIRouter(prefix="/intent", tags=["intent"])
logger = logging.getLogger(__name__)


class IntentParseRequest(BaseModel):
    """Request body for /intent/parse."""
    text: str


class IntentParseResponse(BaseModel):
    """Response body wrapping the parsed intent."""
    intent: IntentObject


class IntentRouteRequest(BaseModel):
    """Request body for /intent/route."""
    intent: IntentObject


class IntentRouteResponse(BaseModel):
    """Response body for /intent/route containing routing decisions, prompts, and execution results."""
    decision: RoutingDecision
    action: str
    confidence: str
    matched_transactions: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    clarification_prompt: Optional[str] = None
    confirmation_prompt: Optional[str] = None
    disambiguation_prompt: Optional[str] = None
    spoken_response: Optional[str] = None
    target_transaction: Optional[dict] = None
    candidates: Optional[List[dict]] = None
    contact_match: Optional[dict] = None
    execution_result: Optional[dict] = None


class IntentConfirmRequest(BaseModel):
    """Request body for /intent/confirm."""
    transaction_id: Optional[uuid.UUID] = None
    action: Literal["edit", "delete", "add"]
    fields: Optional[IntentFields] = None
    contact_id: Optional[uuid.UUID] = None
    contact_name: Optional[str] = None


# Lazily initialized client (avoids requiring SARVAM_API_KEY at import time)
_llm_client: SarvamLLMClient | None = None


def _get_llm_client() -> SarvamLLMClient:
    """Get or create the LLM client singleton."""
    global _llm_client
    if _llm_client is None:
        _llm_client = SarvamLLMClient()
    return _llm_client


def _ensure_profile_exists(db: Session, user_id: uuid.UUID):
    profile = db.query(Profile).filter(Profile.id == user_id).first()
    if not profile:
        profile = Profile(id=user_id, name="User", preferred_language="en")
        db.add(profile)
        db.commit()


def _format_transaction_dict(txn: Transaction) -> dict:
    return {
        "id": str(txn.id),
        "user_id": str(txn.user_id),
        "type": txn.type,
        "amount": float(txn.amount),
        "category_id": txn.category_id,
        "category_name": txn.category.name if txn.category else None,
        "contact_id": str(txn.contact_id) if txn.contact_id else None,
        "contact_name": txn.contact.name if txn.contact else None,
        "description": txn.description,
        "txn_date": str(txn.txn_date),
        "created_at": txn.created_at.isoformat() if txn.created_at else None,
    }


@router.post("/parse", response_model=IntentParseResponse)
def parse_intent(
    payload: IntentParseRequest,
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Parse plain text into a structured intent object.
    Requires a valid Supabase JWT.
    """
    if not payload.text or not payload.text.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Text input cannot be empty",
        )

    try:
        client = _get_llm_client()
        intent = client.parse_intent(payload.text.strip())
        return IntentParseResponse(intent=intent)
    except IntentValidationError as e:
        logger.warning(f"Intent validation error: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse intent: {e}",
        )
    except Exception as e:
        logger.error(f"LLM service error in /intent/parse: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM service error: {e}",
        )


@router.post("/route", response_model=IntentRouteResponse)
def route_intent_endpoint(
    payload: IntentRouteRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Routes an IntentObject per PROJECT_SPEC.md §6 and executes or returns prompts.
    Guarantees per-user data isolation via verified user_id filtering.
    """
    _ensure_profile_exists(db, current_user_id)
    intent = payload.intent

    # If action is edit or delete, match transactions in DB for current user if not already matched
    if intent.action in ("edit", "delete") and not intent.matched_transactions:
        matched = match_transactions(db, current_user_id, intent.fields)
        intent.matched_transactions = [str(txn.id) for txn in matched]
        if len(matched) == 1:
            intent.requires_confirmation = True
        else:
            intent.requires_confirmation = False

    # Execute 4-tier routing
    routing_result = route_intent(intent)

    response = IntentRouteResponse(
        decision=routing_result.decision,
        action=routing_result.action,
        confidence=routing_result.confidence,
        matched_transactions=routing_result.matched_transactions,
        missing_fields=routing_result.missing_fields,
        clarification_prompt=routing_result.clarification_prompt,
        confirmation_prompt=routing_result.confirmation_prompt,
        disambiguation_prompt=routing_result.disambiguation_prompt,
    )

    # Handle Tier 1: EXECUTE
    if routing_result.decision == RoutingDecision.EXECUTE:
        if intent.action == "add":
            contact_id = None
            if intent.fields.contact_name and intent.fields.contact_name.strip():
                clean_name = intent.fields.contact_name.strip()
                exact_match, similar_contacts = find_similar_contacts(db, current_user_id, clean_name)

                # If there is no exact match, but similar existing contacts exist -> Ask confirmation/disambiguation
                if not exact_match and similar_contacts:
                    intent.fields.category = "People"
                    if len(similar_contacts) == 1:
                        c = similar_contacts[0]
                        response.decision = RoutingDecision.ASK_CONFIRMATION
                        if intent.language == "ml":
                            prompt = f"'{c.name}' ആണോ ഉദ്ദേശിച്ചത്? അതോ പുതിയ ആളായി '{clean_name}' എന്ന് ചേർക്കണോ?"
                            spoken = f"{c.name} ആണോ ഉദ്ദേശിച്ചത്?"
                        elif intent.language == "mixed":
                            prompt = f"'{c.name}' ആണോ ഉദ്ദേശിച്ചത്? Or add as new person '{clean_name}'?"
                            spoken = f"{c.name} ആണോ ഉദ്ദേശിച്ചത്?"
                        else:
                            prompt = f"Did you mean '{c.name}'? Or add as new person '{clean_name}'?"
                            spoken = f"Did you mean {c.name}?"

                        response.confirmation_prompt = prompt
                        response.spoken_response = spoken
                        response.candidates = [
                            {"id": str(c.id), "name": c.name, "type": "existing"},
                            {"id": "new", "name": clean_name, "type": "new"},
                        ]
                        response.contact_match = {"id": str(c.id), "name": c.name, "original": clean_name}
                        return response
                    else:
                        response.decision = RoutingDecision.ASK_DISAMBIGUATION
                        names_str = ", ".join(c.name for c in similar_contacts)
                        if intent.language == "ml":
                            prompt = f"സമാനമായ ആളുകൾ കണ്ടെത്തി: {names_str}. ഏതാണ് ഉദ്ദേശിച്ചത്?"
                            spoken = "സമാനമായ ആളുകൾ കണ്ടെത്തി. തിരഞ്ഞെടുക്കുക."
                        else:
                            prompt = f"Multiple similar contacts found ({names_str}). Which one did you mean?"
                            spoken = "Multiple similar contacts found. Please choose one."

                        response.disambiguation_prompt = prompt
                        response.spoken_response = spoken
                        response.candidates = [
                            {"id": str(c.id), "name": c.name, "type": "existing"} for c in similar_contacts
                        ] + [{"id": "new", "name": clean_name, "type": "new"}]
                        return response

                elif exact_match:
                    contact_id = exact_match.id
                    intent.fields.category = "People"
                else:
                    contact = Contact(user_id=current_user_id, name=clean_name)
                    db.add(contact)
                    db.commit()
                    db.refresh(contact)
                    contact_id = contact.id
                    intent.fields.category = "People"

            # Resolve category
            category_name = intent.fields.category or "Other"
            category = db.query(Category).filter(func.lower(Category.name) == category_name.lower().strip()).first()
            if not category:
                category = db.query(Category).filter(Category.name == "Other").first()
                if not category:
                    category = Category(name="Other", type="expense")
                    db.add(category)
                    db.commit()

            # Parse date
            txn_date = date.today()
            if intent.fields.date:
                try:
                    txn_date = datetime.strptime(intent.fields.date[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    txn_date = date.today()

            txn_amount = Decimal(str(intent.fields.amount or 0))

            # Determine transaction type (direction semantics)
            if intent.fields.type:
                txn_type = intent.fields.type
            elif contact_id:
                desc = (intent.fields.description or "").lower()
                if any(w in desc for w in ["receive", "got back", "paid back", "returned", "thannu", "income"]):
                    txn_type = "income"
                else:
                    txn_type = "expense"
            elif category.type == "income":
                txn_type = "income"
            else:
                txn_type = "expense"

            new_txn = Transaction(
                user_id=current_user_id,
                type=txn_type,
                amount=txn_amount,
                category_id=category.id,
                contact_id=contact_id,
                description=intent.fields.description,
                txn_date=txn_date,
            )
            db.add(new_txn)
            db.commit()
            db.refresh(new_txn)

            response.execution_result = {
                "status": "created",
                "transaction": _format_transaction_dict(new_txn),
            }

        elif intent.action == "query":
            if intent.fields.contact_name and intent.fields.contact_name.strip():
                clean_name = intent.fields.contact_name.strip()
                exact_match, similar_contacts = find_similar_contacts(db, current_user_id, clean_name)
                contact = exact_match or (similar_contacts[0] if similar_contacts else None)

                if contact:
                    contact_txns = (
                        db.query(Transaction)
                        .filter(
                            Transaction.user_id == current_user_id,
                            Transaction.contact_id == contact.id,
                        )
                        .order_by(Transaction.txn_date.desc(), Transaction.created_at.desc())
                        .all()
                    )

                    total_sent = sum((t.amount for t in contact_txns if t.type == "expense"), Decimal("0.00"))
                    total_received = sum((t.amount for t in contact_txns if t.type == "income"), Decimal("0.00"))
                    net_balance = total_sent - total_received
                    if net_balance > Decimal("0.00"):
                        c_status = "owes_you"
                        display_text = f"{contact.name} owes you ₹{net_balance:.2f}"
                    elif net_balance < Decimal("0.00"):
                        c_status = "you_owe"
                        display_text = f"You owe {contact.name} ₹{abs(net_balance):.2f}"
                    else:
                        c_status = "settled"
                        display_text = f"Settled up with {contact.name} (₹0.00)"

                    response.execution_result = {
                        "status": "queried_contact",
                        "contact_id": str(contact.id),
                        "contact_name": contact.name,
                        "category": "People",
                        "total_sent": float(total_sent),
                        "total_received": float(total_received),
                        "total_amount": float(total_sent if total_sent > 0 else total_received),
                        "net_balance": float(net_balance),
                        "contact_status": c_status,
                        "display_text": display_text,
                        "count": len(contact_txns),
                        "transactions": [_format_transaction_dict(t) for t in contact_txns],
                    }
                else:
                    response.execution_result = {
                        "status": "queried_contact",
                        "contact_id": None,
                        "contact_name": clean_name,
                        "category": "People",
                        "total_sent": 0.0,
                        "total_received": 0.0,
                        "total_amount": 0.0,
                        "net_balance": 0.0,
                        "contact_status": "not_found",
                        "display_text": f"No transactions found with {clean_name}.",
                        "count": 0,
                        "transactions": [],
                    }
            else:
                matched_txns = match_transactions(db, current_user_id, intent.fields, limit=50, reasoning=intent.reasoning)
                total_expense = sum((t.amount for t in matched_txns if t.type == "expense"), Decimal("0.00"))
                total_income = sum((t.amount for t in matched_txns if t.type == "income"), Decimal("0.00"))
                cat_name = intent.fields.category or "All"
                period_name = "This month" if any(w in (intent.reasoning or "").lower() for w in ["month", "മാസം"]) else "Recent"

                response.execution_result = {
                    "status": "queried",
                    "category": cat_name,
                    "period": period_name,
                    "total_expense": float(total_expense),
                    "total_income": float(total_income),
                    "total_amount": float(total_expense if total_expense > 0 else total_income),
                    "count": len(matched_txns),
                    "transactions": [_format_transaction_dict(t) for t in matched_txns],
                }


    # Handle Tier 2: Confirmation data enrichment
    elif routing_result.decision == RoutingDecision.ASK_CONFIRMATION:
        if routing_result.matched_transactions:
            target_id_str = routing_result.matched_transactions[0]
            try:
                target_uuid = uuid.UUID(target_id_str)
                txn = db.query(Transaction).filter(
                    Transaction.id == target_uuid,
                    Transaction.user_id == current_user_id,
                ).first()
                if txn:
                    response.target_transaction = _format_transaction_dict(txn)
            except ValueError:
                pass

    # Handle Tier 3: Disambiguation data enrichment
    elif routing_result.decision == RoutingDecision.ASK_DISAMBIGUATION:
        candidates = []
        for txn_id_str in routing_result.matched_transactions:
            try:
                txn_uuid = uuid.UUID(txn_id_str)
                txn = db.query(Transaction).filter(
                    Transaction.id == txn_uuid,
                    Transaction.user_id == current_user_id,
                ).first()
                if txn:
                    candidates.append(_format_transaction_dict(txn))
            except ValueError:
                pass
        response.candidates = candidates

    # Generate natural spoken response matching input language
    response.spoken_response = generate_spoken_response(
        decision=response.decision,
        action=response.action,
        language=intent.language,
        fields=intent.fields.model_dump() if intent.fields else {},
        execution_result=response.execution_result,
        matched_count=len(response.matched_transactions),
        target_transaction=response.target_transaction,
        reasoning=intent.reasoning,
    )

    return response


@router.post("/confirm")
def confirm_intent_action(
    payload: IntentConfirmRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Executes a confirmed add, edit, or delete action after Tier 2 confirmation.
    Scoped strictly via WHERE user_id = :verified_user_id.
    """
    if payload.action == "add":
        contact_id = None
        if payload.contact_id:
            contact = db.query(Contact).filter(
                Contact.id == payload.contact_id,
                Contact.user_id == current_user_id,
            ).first()
            if contact:
                contact_id = contact.id
        elif payload.contact_name:
            clean_name = payload.contact_name.strip()
            contact = db.query(Contact).filter(
                Contact.user_id == current_user_id,
                func.lower(Contact.name) == clean_name.lower(),
            ).first()
            if not contact:
                contact = Contact(user_id=current_user_id, name=clean_name)
                db.add(contact)
                db.commit()
                db.refresh(contact)
            contact_id = contact.id

        category = db.query(Category).filter(Category.name == "People").first()
        if not category:
            category = db.query(Category).filter(Category.name == "Other").first()

        txn_date = date.today()
        if payload.fields and payload.fields.date:
            try:
                txn_date = datetime.strptime(payload.fields.date[:10], "%Y-%m-%d").date()
            except (ValueError, TypeError):
                pass

        txn_amount = Decimal(str(payload.fields.amount if payload.fields and payload.fields.amount else 0))
        txn_type = "expense"
        if payload.fields:
            if payload.fields.type:
                txn_type = payload.fields.type
            elif payload.fields.description:
                desc = payload.fields.description.lower()
                if any(w in desc for w in ["receive", "got back", "paid back", "returned", "thannu", "income"]):
                    txn_type = "income"

        new_txn = Transaction(
            user_id=current_user_id,
            type=txn_type,
            amount=txn_amount,
            category_id=category.id,
            contact_id=contact_id,
            description=payload.fields.description if payload.fields else None,
            txn_date=txn_date,
        )
        db.add(new_txn)
        db.commit()
        db.refresh(new_txn)
        return {
            "status": "executed",
            "action": "add",
            "transaction": _format_transaction_dict(new_txn),
        }

    if not payload.transaction_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="transaction_id is required for edit and delete actions",
        )

    txn = db.query(Transaction).filter(
        Transaction.id == payload.transaction_id,
        Transaction.user_id == current_user_id,
    ).first()

    if not txn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Transaction {payload.transaction_id} not found",
        )

    if payload.action == "delete":
        deleted_data = _format_transaction_dict(txn)
        db.delete(txn)
        db.commit()
        return {
            "status": "executed",
            "action": "delete",
            "transaction": deleted_data,
        }

    elif payload.action == "edit":
        if payload.fields:
            if payload.fields.amount is not None:
                txn.amount = Decimal(str(payload.fields.amount))
            if payload.fields.description is not None:
                txn.description = payload.fields.description
            if payload.fields.date:
                try:
                    txn.txn_date = datetime.strptime(payload.fields.date[:10], "%Y-%m-%d").date()
                except (ValueError, TypeError):
                    pass
            if payload.fields.category:
                cat = db.query(Category).filter(
                    func.lower(Category.name) == payload.fields.category.lower().strip()
                ).first()
                if cat:
                    txn.category_id = cat.id

        db.commit()
        db.refresh(txn)
        return {
            "status": "executed",
            "action": "edit",
            "transaction": _format_transaction_dict(txn),
        }

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=f"Unsupported action {payload.action}",
    )
