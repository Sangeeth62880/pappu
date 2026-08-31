"""
Intent router for Phase 3 and Phase 4.

Endpoints:
- POST /intent/parse: Plain text -> validated IntentObject (Phase 3)
- POST /intent/route: IntentObject -> RoutingDecision + DB execution/prompts (Phase 4)
- POST /intent/confirm: Explicit confirmation -> executes pending edit/delete (Phase 4)
"""

import uuid
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
from app.schemas.intent import IntentObject, IntentFields, IntentValidationError
from app.services.routing import route_intent, RoutingDecision, RoutingResult
from app.services.matcher import match_transactions

router = APIRouter(prefix="/intent", tags=["intent"])


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
    target_transaction: Optional[dict] = None
    candidates: Optional[List[dict]] = None
    execution_result: Optional[dict] = None


class IntentConfirmRequest(BaseModel):
    """Request body for /intent/confirm."""
    transaction_id: uuid.UUID
    action: Literal["edit", "delete"]
    fields: Optional[IntentFields] = None


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
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse intent: {e}",
        )
    except Exception as e:
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
            txn_type = "income" if category.type == "income" else "expense"

            new_txn = Transaction(
                user_id=current_user_id,
                type=txn_type,
                amount=txn_amount,
                category_id=category.id,
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
            matched_txns = match_transactions(db, current_user_id, intent.fields)
            response.execution_result = {
                "status": "queried",
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

    return response


@router.post("/confirm")
def confirm_intent_action(
    payload: IntentConfirmRequest,
    db: Session = Depends(get_db),
    current_user_id: uuid.UUID = Depends(get_current_user_id),
):
    """
    Executes a confirmed edit or delete action after Tier 2 confirmation.
    Scoped strictly via WHERE user_id = :verified_user_id.
    """
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
