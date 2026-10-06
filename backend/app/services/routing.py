"""
Routing logic for confirmation & error-recovery tiers per PROJECT_SPEC.md §6.

Given an IntentObject, determines the appropriate system action:
- EXECUTE (Tier 1)
- ASK_CONFIRMATION (Tier 2)
- ASK_DISAMBIGUATION (Tier 3)
- ASK_CLARIFICATION (Tier 4)
"""

from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, Field
from app.schemas.intent import IntentObject


class RoutingDecision(str, Enum):
    EXECUTE = "EXECUTE"
    ASK_CONFIRMATION = "ASK_CONFIRMATION"
    ASK_DISAMBIGUATION = "ASK_DISAMBIGUATION"
    ASK_CLARIFICATION = "ASK_CLARIFICATION"


class RoutingResult(BaseModel):
    decision: RoutingDecision
    action: str
    confidence: str
    matched_transactions: List[str] = Field(default_factory=list)
    missing_fields: List[str] = Field(default_factory=list)
    clarification_prompt: Optional[str] = None
    confirmation_prompt: Optional[str] = None
    disambiguation_prompt: Optional[str] = None


def route_intent(intent: IntentObject) -> RoutingResult:
    """
    Pure routing function described in PROJECT_SPEC.md §6:
    Intent in -> RoutingResult out (EXECUTE, ASK_CONFIRMATION, ASK_DISAMBIGUATION, ASK_CLARIFICATION).

    Priority rules:
    1. Tier 4: If missing_fields is non-empty OR confidence is 'low' -> ASK_CLARIFICATION.
    2. Tier 3: If action in ('edit', 'delete') and multiple transactions match (>1) -> ASK_DISAMBIGUATION.
    3. Tier 2: If action in ('edit', 'delete') and exactly 1 transaction matches -> ASK_CONFIRMATION.
    4. Tier 1: If action is 'add' or 'query' with high confidence -> EXECUTE.
    """
    # Tier 4: Low confidence or missing required fields
    if intent.confidence == "low" or len(intent.missing_fields) > 0:
        missing_str = ", ".join(intent.missing_fields) if intent.missing_fields else "required information"
        clarification_msg = f"Please specify {missing_str}."
        if intent.language == "ml":
            clarification_msg = f"ദയവായി {missing_str} വ്യക്തമാക്കുക."

        return RoutingResult(
            decision=RoutingDecision.ASK_CLARIFICATION,
            action=intent.action,
            confidence=intent.confidence,
            matched_transactions=intent.matched_transactions,
            missing_fields=intent.missing_fields,
            clarification_prompt=clarification_msg,
        )

    # Edit and Delete routing
    if intent.action in ("edit", "delete"):
        num_matches = len(intent.matched_transactions)

        # Tier 3: Multiple matches -> Disambiguation
        if num_matches > 1:
            disambig_msg = f"Multiple transactions match your request ({num_matches} found). Please select which one to {intent.action}."
            if intent.language == "ml":
                disambig_msg = f"{num_matches} ഇടപാടുകൾ കണ്ടെത്തി. ഏതാണ് {intent.action} ചെയ്യേണ്ടതെന്ന് തിരഞ്ഞെടുക്കുക."

            return RoutingResult(
                decision=RoutingDecision.ASK_DISAMBIGUATION,
                action=intent.action,
                confidence=intent.confidence,
                matched_transactions=intent.matched_transactions,
                missing_fields=intent.missing_fields,
                disambiguation_prompt=disambig_msg,
            )

        # Tier 2: Single match -> Confirmation
        if num_matches == 1:
            target_id = intent.matched_transactions[0]
            prefix = f"{intent.reasoning}. " if intent.reasoning else ""
            confirm_msg = f"{prefix}Are you sure you want to {intent.action} transaction {target_id}?"
            if intent.language == "ml":
                confirm_msg = f"{prefix}{target_id} എന്ന ഇടപാട് {intent.action} ചെയ്യാൻ തീർച്ചയാണോ?"

            return RoutingResult(
                decision=RoutingDecision.ASK_CONFIRMATION,
                action=intent.action,
                confidence=intent.confidence,
                matched_transactions=intent.matched_transactions,
                missing_fields=intent.missing_fields,
                confirmation_prompt=confirm_msg,
            )

        # 0 matches found for edit/delete -> Cannot execute, ask clarification/disambiguation
        return RoutingResult(
            decision=RoutingDecision.ASK_CLARIFICATION,
            action=intent.action,
            confidence=intent.confidence,
            matched_transactions=[],
            missing_fields=["transaction_match"],
            clarification_prompt="No matching transaction found. Please provide more details.",
        )

    # Tier 1: Add or Query with high confidence -> Execute immediately
    return RoutingResult(
        decision=RoutingDecision.EXECUTE,
        action=intent.action,
        confidence=intent.confidence,
        matched_transactions=intent.matched_transactions,
        missing_fields=intent.missing_fields,
    )
