"""
Intent schema models matching PROJECT_SPEC.md §5.

Defines the contract between the LLM layer and the confirmation/backend layers.
Every LLM output must conform to the IntentObject shape.
"""

import json
from typing import List, Optional, Literal
from decimal import Decimal
from pydantic import BaseModel, Field, model_validator


class IntentFields(BaseModel):
    """Fields extracted by the LLM from user input."""
    amount: Optional[Decimal] = None
    category: Optional[str] = None
    date: Optional[str] = None  # ISO date string, e.g. "2026-08-30"
    description: Optional[str] = None


class IntentObject(BaseModel):
    """
    The structured intent object produced by the LLM layer.
    This is the contract defined in PROJECT_SPEC.md §5.
    """
    action: Literal["add", "edit", "delete", "query"]
    language: Literal["en", "ml", "mixed"]
    fields: IntentFields = Field(default_factory=IntentFields)
    matched_transactions: List[str] = Field(default_factory=list)
    confidence: Literal["high", "low"]
    requires_confirmation: bool
    missing_fields: List[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_intent_rules(self) -> "IntentObject":
        """
        Enforce the intent rules from PROJECT_SPEC.md §5:
        - add → requires_confirmation must be false
        - edit/delete with single match → requires_confirmation must be true
        - If matched_transactions > 1 → requires_confirmation must not be set to true
          (route to disambiguation instead)
        """
        if self.action == "add" and self.requires_confirmation:
            raise ValueError(
                "action 'add' must have requires_confirmation=false "
                "(executes immediately per §5)"
            )

        if self.action in ("edit", "delete"):
            if len(self.matched_transactions) == 1 and not self.requires_confirmation:
                raise ValueError(
                    f"action '{self.action}' with exactly one matched transaction "
                    "must have requires_confirmation=true per §5"
                )

            if len(self.matched_transactions) > 1 and self.requires_confirmation:
                raise ValueError(
                    f"action '{self.action}' with multiple matched transactions "
                    "must not set requires_confirmation=true — route to "
                    "disambiguation instead per §5"
                )

        return self


class IntentValidationError(Exception):
    """Raised when LLM output does not conform to the intent schema."""
    pass


def parse_and_validate_intent(raw_json: str) -> IntentObject:
    """
    Parse raw JSON string (from LLM output) into a validated IntentObject.

    Raises IntentValidationError if the JSON is malformed or does not
    conform to the schema rules in PROJECT_SPEC.md §5.
    """
    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        raise IntentValidationError(f"Invalid JSON: {e}") from e

    if not isinstance(data, dict):
        raise IntentValidationError(
            f"Expected JSON object, got {type(data).__name__}"
        )

    try:
        return IntentObject(**data)
    except Exception as e:
        raise IntentValidationError(f"Schema validation failed: {e}") from e
