"""
Tests for the intent schema and validator (PROJECT_SPEC.md §5).

Covers:
- Valid intent objects for each action type parse successfully
- Malformed JSON is rejected
- Validation rules enforced (add requires_confirmation=false, etc.)
"""

import json
import pytest
from app.schemas.intent import (
    IntentObject,
    IntentFields,
    IntentValidationError,
    parse_and_validate_intent,
)


# -- Valid intent objects for each action type --

class TestValidIntents:
    """Valid intents for all action types should parse without error."""

    def test_valid_add_intent(self):
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": 500,
                "category": "Food",
                "date": "2026-08-30",
                "description": "lunch"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert intent.action == "add"
        assert intent.confidence == "high"
        assert intent.requires_confirmation is False
        assert intent.fields.amount == 500
        assert intent.fields.category == "Food"

    def test_valid_edit_intent_single_match(self):
        raw = json.dumps({
            "action": "edit",
            "language": "en",
            "fields": {
                "amount": 750,
                "category": "Transport",
                "date": "2026-08-29",
                "description": "uber ride"
            },
            "matched_transactions": ["txn_id_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert intent.action == "edit"
        assert intent.requires_confirmation is True
        assert len(intent.matched_transactions) == 1

    def test_valid_delete_intent_single_match(self):
        raw = json.dumps({
            "action": "delete",
            "language": "ml",
            "fields": {},
            "matched_transactions": ["txn_id_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert intent.action == "delete"
        assert intent.language == "ml"

    def test_valid_query_intent(self):
        raw = json.dumps({
            "action": "query",
            "language": "mixed",
            "fields": {
                "category": "Food",
                "date": "2026-08"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert intent.action == "query"
        assert intent.language == "mixed"

    def test_valid_add_with_missing_fields(self):
        """Add intent with missing_fields and low confidence is valid."""
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": 200
            },
            "matched_transactions": [],
            "confidence": "low",
            "requires_confirmation": False,
            "missing_fields": ["category", "date"]
        })
        intent = parse_and_validate_intent(raw)
        assert intent.missing_fields == ["category", "date"]
        assert intent.confidence == "low"

    def test_valid_delete_multiple_matches_disambiguation(self):
        """Delete with multiple matches → requires_confirmation=false (disambiguation)."""
        raw = json.dumps({
            "action": "delete",
            "language": "en",
            "fields": {},
            "matched_transactions": ["txn_1", "txn_2", "txn_3"],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert len(intent.matched_transactions) == 3
        assert intent.requires_confirmation is False


# -- Malformed/invalid JSON rejection --

class TestMalformedInput:
    """Malformed or incomplete LLM output must be rejected."""

    def test_invalid_json_string(self):
        with pytest.raises(IntentValidationError, match="Invalid JSON"):
            parse_and_validate_intent("not json at all")

    def test_json_array_instead_of_object(self):
        with pytest.raises(IntentValidationError, match="Expected JSON object"):
            parse_and_validate_intent('[{"action": "add"}]')

    def test_missing_required_field_action(self):
        raw = json.dumps({
            "language": "en",
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="Schema validation failed"):
            parse_and_validate_intent(raw)

    def test_missing_required_field_confidence(self):
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="Schema validation failed"):
            parse_and_validate_intent(raw)

    def test_invalid_action_enum(self):
        raw = json.dumps({
            "action": "transfer",
            "language": "en",
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="Schema validation failed"):
            parse_and_validate_intent(raw)

    def test_invalid_language_enum(self):
        raw = json.dumps({
            "action": "add",
            "language": "hindi",
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="Schema validation failed"):
            parse_and_validate_intent(raw)

    def test_invalid_confidence_enum(self):
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "confidence": "medium",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="Schema validation failed"):
            parse_and_validate_intent(raw)

    def test_empty_json_object(self):
        with pytest.raises(IntentValidationError):
            parse_and_validate_intent("{}")


# -- Validation rule enforcement (§5 rules) --

class TestValidationRules:
    """Intent rules from PROJECT_SPEC.md §5 must be enforced."""

    def test_add_with_requires_confirmation_true_rejected(self):
        """add → requires_confirmation must be false."""
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 100, "category": "Food"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="requires_confirmation=false"):
            parse_and_validate_intent(raw)

    def test_edit_single_match_requires_confirmation_false_rejected(self):
        """edit with single match → requires_confirmation must be true."""
        raw = json.dumps({
            "action": "edit",
            "language": "en",
            "fields": {"amount": 200},
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="requires_confirmation=true"):
            parse_and_validate_intent(raw)

    def test_delete_single_match_requires_confirmation_false_rejected(self):
        """delete with single match → requires_confirmation must be true."""
        raw = json.dumps({
            "action": "delete",
            "language": "en",
            "fields": {},
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="requires_confirmation=true"):
            parse_and_validate_intent(raw)

    def test_edit_multiple_matches_requires_confirmation_true_rejected(self):
        """edit with >1 matches → requires_confirmation must NOT be true."""
        raw = json.dumps({
            "action": "edit",
            "language": "en",
            "fields": {"amount": 300},
            "matched_transactions": ["txn_1", "txn_2"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="disambiguation"):
            parse_and_validate_intent(raw)

    def test_delete_multiple_matches_requires_confirmation_true_rejected(self):
        """delete with >1 matches → requires_confirmation must NOT be true."""
        raw = json.dumps({
            "action": "delete",
            "language": "en",
            "fields": {},
            "matched_transactions": ["txn_1", "txn_2"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with pytest.raises(IntentValidationError, match="disambiguation"):
            parse_and_validate_intent(raw)


# -- Amount Coercion and Validation Tests --

class TestAmountCoercionAndValidation:
    """Explicitly verify that amount is parsed as numeric, coerced, and serialized as a JSON number."""

    def test_numeric_string_coerced_to_number(self):
        """String '300' must be coerced to numeric (int or float)."""
        raw = json.dumps({
            "action": "add",
            "language": "ml",
            "fields": {
                "amount": "300",
                "category": "Food",
                "date": "2026-08-31",
                "description": "lunch"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert isinstance(intent.fields.amount, (int, float))
        assert intent.fields.amount == 300

        # Assert serialized output is a JSON number, not a string
        dumped = intent.model_dump()
        assert type(dumped["fields"]["amount"]) in (int, float)
        assert dumped["fields"]["amount"] == 300

    def test_numeric_string_with_comma_and_decimals_coerced(self):
        """String '1,250.50' must be coerced to numeric float 1250.5."""
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": "1,250.50",
                "category": "Shopping",
                "date": "2026-08-31",
                "description": "shoes"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert isinstance(intent.fields.amount, (int, float))
        assert intent.fields.amount == 1250.5

    def test_non_numeric_string_handled_as_missing_field_and_low_confidence(self):
        """Genuinely non-numeric string 'unknown' triggers missing_fields=['amount'] and low confidence."""
        raw = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": "unknown",
                "category": "Food",
                "date": "2026-08-31",
                "description": "something"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        intent = parse_and_validate_intent(raw)
        assert intent.fields.amount is None
        assert "amount" in intent.missing_fields
        assert intent.confidence == "low"

