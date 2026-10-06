"""
Mocked tests for the LLM intent parsing pipeline (Phase 3).

Tests the full parse_intent flow with mocked HTTP responses from Sarvam API.
Covers, for each action type (add/edit/delete/query):
  - Clean high-confidence English input
  - Clean high-confidence Malayalam/code-mixed input
  - Input missing a required field → missing_fields populated
  - Ambiguous input matching multiple transactions → matched_transactions > 1

Also tests schema validation rejection of malformed LLM output.

Per BUILD_PHASES.md Phase 3 and CLAUDE.md testing conventions.
"""

import json
from decimal import Decimal
from unittest.mock import patch, MagicMock

import pytest

from app.llm.client import SarvamLLMClient, _extract_json_from_response
from app.schemas.intent import IntentObject, IntentValidationError


# --- Helper to create a mock SarvamLLMClient ---

def _make_client():
    """Create a SarvamLLMClient with a dummy API key (won't hit real API)."""
    return SarvamLLMClient(api_key="test_key_not_real")


def _mock_llm_response(response_json: dict):
    """
    Create a mock that patches _make_request to return the given JSON as a string.
    """
    return json.dumps(response_json)


# --- JSON extraction tests ---

class TestJsonExtraction:
    """Test the _extract_json_from_response helper."""

    def test_raw_json(self):
        raw = '{"action": "add", "language": "en"}'
        assert _extract_json_from_response(raw) == raw.strip()

    def test_json_in_code_fence(self):
        raw = '```json\n{"action": "add"}\n```'
        assert _extract_json_from_response(raw) == '{"action": "add"}'

    def test_json_in_plain_code_fence(self):
        raw = '```\n{"action": "query"}\n```'
        assert _extract_json_from_response(raw) == '{"action": "query"}'

    def test_json_with_surrounding_text(self):
        raw = 'Here is the result: {"action": "add", "language": "en"} done.'
        result = _extract_json_from_response(raw)
        assert '"action": "add"' in result


# --- Add action tests ---

class TestAddIntentParsing:
    """Tests for 'add' action intent parsing."""

    def test_add_english_high_confidence(self):
        """English: 'I spent 500 on food today' → add, Food, 500, high."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": 500,
                "category": "Food",
                "date": "2026-08-30",
                "description": "food expense"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("I spent 500 on food today")
        assert intent.action == "add"
        assert intent.fields.amount == 500
        assert intent.fields.category == "Food"
        assert intent.confidence == "high"
        assert intent.requires_confirmation is False

    def test_add_malayalam_high_confidence(self):
        """Malayalam: 'ഇന്ന് ഭക്ഷണത്തിന് 300 രൂപ ചെലവായി' → add, Food, 300."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "add",
            "language": "ml",
            "fields": {
                "amount": 300,
                "category": "Food",
                "date": "2026-08-30",
                "description": "ഭക്ഷണ ചെലവ്"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("ഇന്ന് ഭക്ഷണത്തിന് 300 രൂപ ചെലവായി")
        assert intent.action == "add"
        assert intent.language == "ml"
        assert intent.fields.amount == 300

    def test_add_code_mixed_high_confidence(self):
        """Code-mixed: 'yesterday 2k shopping cheythu' → add, Shopping, 2000."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "add",
            "language": "mixed",
            "fields": {
                "amount": 2000,
                "category": "Shopping",
                "date": "2026-08-29",
                "description": "shopping"
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("yesterday 2k shopping cheythu")
        assert intent.action == "add"
        assert intent.language == "mixed"
        assert intent.fields.amount == 2000

    def test_add_missing_amount_field(self):
        """'I bought something' → add, low confidence, missing_fields=['amount']."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "add",
            "language": "en",
            "fields": {
                "amount": None,
                "category": "Shopping",
                "date": "2026-08-30",
                "description": "purchase"
            },
            "matched_transactions": [],
            "confidence": "low",
            "requires_confirmation": False,
            "missing_fields": ["amount"]
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("I bought something")
        assert intent.action == "add"
        assert intent.confidence == "low"
        assert "amount" in intent.missing_fields


# --- Edit action tests ---

class TestEditIntentParsing:
    """Tests for 'edit' action intent parsing."""

    def test_edit_english_high_confidence(self):
        """English: 'Change yesterday's transport to 150' → edit, Transport, 150."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "edit",
            "language": "en",
            "fields": {
                "amount": 150,
                "category": "Transport",
                "date": "2026-08-29",
                "description": None
            },
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Change yesterday's transport to 150")
        assert intent.action == "edit"
        assert intent.requires_confirmation is True
        assert intent.fields.amount == 150

    def test_edit_malayalam_high_confidence(self):
        """Malayalam edit: 'ഇന്നലത്തെ ട്രാൻസ്പോർട്ട് 200 ആക്കുക' → edit."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "edit",
            "language": "ml",
            "fields": {
                "amount": 200,
                "category": "Transport",
                "date": "2026-08-29",
                "description": None
            },
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("ഇന്നലത്തെ ട്രാൻസ്പോർട്ട് 200 ആക്കുക")
        assert intent.action == "edit"
        assert intent.language == "ml"

    def test_edit_missing_field(self):
        """'Edit the food expense' → edit, missing_fields=['amount'] (what to change?)."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "edit",
            "language": "en",
            "fields": {
                "amount": None,
                "category": "Food",
                "date": None,
                "description": None
            },
            "matched_transactions": ["txn_1"],
            "confidence": "low",
            "requires_confirmation": True,
            "missing_fields": ["amount"]
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Edit the food expense")
        assert intent.confidence == "low"
        assert "amount" in intent.missing_fields

    def test_edit_multiple_matches_disambiguation(self):
        """'Change the food expense' with multiple matches → disambiguation."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "edit",
            "language": "en",
            "fields": {
                "amount": 300,
                "category": "Food",
                "date": None,
                "description": None
            },
            "matched_transactions": ["txn_1", "txn_2"],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Change the food expense to 300")
        assert len(intent.matched_transactions) > 1
        assert intent.requires_confirmation is False


# --- Delete action tests ---

class TestDeleteIntentParsing:
    """Tests for 'delete' action intent parsing."""

    def test_delete_english_high_confidence(self):
        """'Delete the food expense from yesterday' → delete, Food."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "delete",
            "language": "en",
            "fields": {
                "amount": None,
                "category": "Food",
                "date": "2026-08-29",
                "description": None
            },
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Delete the food expense from yesterday")
        assert intent.action == "delete"
        assert intent.requires_confirmation is True

    def test_delete_malayalam_high_confidence(self):
        """Malayalam delete: 'ഇന്നലത്തെ ഭക്ഷണ ചെലവ് ഡിലീറ്റ് ചെയ്യുക'."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "delete",
            "language": "ml",
            "fields": {
                "amount": None,
                "category": "Food",
                "date": "2026-08-29",
                "description": None
            },
            "matched_transactions": ["txn_1"],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("ഇന്നലത്തെ ഭക്ഷണ ചെലവ് ഡിലീറ്റ് ചെയ്യുക")
        assert intent.action == "delete"
        assert intent.language == "ml"

    def test_delete_missing_identification(self):
        """'Delete something' → delete, low confidence, missing info."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "delete",
            "language": "en",
            "fields": {
                "amount": None,
                "category": None,
                "date": None,
                "description": None
            },
            "matched_transactions": [],
            "confidence": "low",
            "requires_confirmation": False,
            "missing_fields": ["category", "date"]
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Delete something")
        assert intent.confidence == "low"
        assert len(intent.missing_fields) > 0

    def test_delete_multiple_matches_disambiguation(self):
        """'Delete the food expense' with multiple matches → disambiguation."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "delete",
            "language": "en",
            "fields": {
                "amount": None,
                "category": "Food",
                "date": None,
                "description": None
            },
            "matched_transactions": ["txn_1", "txn_2", "txn_3"],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Delete the food expense")
        assert len(intent.matched_transactions) == 3
        assert intent.requires_confirmation is False


# --- Query action tests ---

class TestQueryIntentParsing:
    """Tests for 'query' action intent parsing."""

    def test_query_english_high_confidence(self):
        """'How much did I spend on transport this month?' → query, Transport."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "query",
            "language": "en",
            "fields": {
                "amount": None,
                "category": "Transport",
                "date": "2026-08-01",
                "description": None
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent(
                "How much did I spend on transport this month?"
            )
        assert intent.action == "query"
        assert intent.fields.category == "Transport"

    def test_query_malayalam_high_confidence(self):
        """Malayalam query: 'ഈ മാസം എത്ര ചെലവായി?' → query."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "query",
            "language": "ml",
            "fields": {
                "amount": None,
                "category": None,
                "date": "2026-08-01",
                "description": None
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("ഈ മാസം എത്ര ചെലവായി?")
        assert intent.action == "query"
        assert intent.language == "ml"

    def test_query_missing_filter_criteria(self):
        """'Show my transactions' → query, low confidence, vague."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "query",
            "language": "en",
            "fields": {
                "amount": None,
                "category": None,
                "date": None,
                "description": None
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("Show my transactions")
        assert intent.action == "query"

    def test_query_code_mixed(self):
        """Code-mixed query: 'ente food expense engane?' → query, mixed."""
        client = _make_client()
        mock_response = _mock_llm_response({
            "action": "query",
            "language": "mixed",
            "fields": {
                "amount": None,
                "category": "Food",
                "date": None,
                "description": None
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=mock_response):
            intent = client.parse_intent("ente food expense engane?")
        assert intent.action == "query"
        assert intent.language == "mixed"
        assert intent.fields.category == "Food"


# --- Schema validation rejection via client ---

class TestClientSchemaRejection:
    """Malformed LLM output should be rejected, not passed downstream."""

    def test_malformed_json_retried_then_fails(self):
        """If LLM returns garbage twice, IntentValidationError is raised."""
        client = _make_client()
        with patch.object(
            client, "_make_request", return_value="this is not json at all"
        ):
            with pytest.raises(IntentValidationError, match="Failed to get valid"):
                client.parse_intent("test input")

    def test_malformed_json_retried_then_succeeds(self):
        """If first response is bad but retry succeeds, intent is returned."""
        client = _make_client()
        bad_response = "oops not json"
        good_response = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 100, "category": "Food", "date": "2026-08-30"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(
            client, "_make_request", side_effect=[bad_response, good_response]
        ):
            intent = client.parse_intent("test input")
        assert intent.action == "add"

    def test_invalid_schema_fields_rejected(self):
        """LLM output with invalid enum values is rejected."""
        client = _make_client()
        bad_response = json.dumps({
            "action": "transfer",  # invalid action
            "language": "en",
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError):
                client.parse_intent("test input")

    def test_response_in_code_fence_extracted_correctly(self):
        """LLM wrapping JSON in markdown code fence should still work."""
        client = _make_client()
        fenced_response = '```json\n' + json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 250, "category": "Food", "date": "2026-08-30"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        }) + '\n```'
        with patch.object(client, "_make_request", return_value=fenced_response):
            intent = client.parse_intent("add 250 for food")
        assert intent.action == "add"
        assert intent.fields.amount == 250

    def test_missing_required_action_field_rejected(self):
        """LLM response missing 'action' field is rejected, not passed downstream."""
        client = _make_client()
        bad_response = json.dumps({
            "language": "en",
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError, match="Schema validation failed"):
                client.parse_intent("some user input")

    def test_invalid_confidence_enum_rejected(self):
        """LLM response with invalid confidence ('medium') is rejected."""
        client = _make_client()
        bad_response = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 100, "category": "Food"},
            "matched_transactions": [],
            "confidence": "medium",  # invalid enum value
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError, match="Schema validation failed"):
                client.parse_intent("add 100 food")

    def test_missing_confidence_field_rejected(self):
        """LLM response missing 'confidence' field is rejected."""
        client = _make_client()
        bad_response = json.dumps({
            "action": "query",
            "language": "en",
            "fields": {},
            "matched_transactions": [],
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError, match="Schema validation failed"):
                client.parse_intent("show summary")

    def test_missing_requires_confirmation_field_rejected(self):
        """LLM response missing 'requires_confirmation' field is rejected."""
        client = _make_client()
        bad_response = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 200, "category": "Food"},
            "matched_transactions": [],
            "confidence": "high",
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError, match="Schema validation failed"):
                client.parse_intent("add 200 food")

    def test_add_with_illegal_requires_confirmation_true_rejected(self):
        """LLM response for 'add' with requires_confirmation=True violates §5 and is rejected."""
        client = _make_client()
        bad_response = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": 500, "category": "Food"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,  # illegal for add per §5
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=bad_response):
            with pytest.raises(IntentValidationError, match="requires_confirmation=false"):
                client.parse_intent("add 500 food")

    def test_non_numeric_amount_coerced_to_low_confidence_missing_field(self):
        """Non-numeric amount string ('unknown') is safely coerced to None + low confidence."""
        client = _make_client()
        response_with_str_amount = json.dumps({
            "action": "add",
            "language": "en",
            "fields": {"amount": "unknown", "category": "Food"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": []
        })
        with patch.object(client, "_make_request", return_value=response_with_str_amount):
            intent = client.parse_intent("I bought food")
        assert intent.fields.amount is None
        assert "amount" in intent.missing_fields
        assert intent.confidence == "low"

    def test_malayalam_manglish_kurakku_parsed_as_edit(self):
        """Input 'petrolil ninn 1000 kurakku' must be parsed as an 'edit' action, not 'add'."""
        client = _make_client()
        expected = {
            "action": "edit",
            "language": "mixed",
            "fields": {
                "amount": 1000,
                "category": "Transport",
                "date": None,
                "description": "reduce petrol",
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("petrolil ninn 1000 kurakku")
        assert intent.action == "edit"
        assert intent.language == "mixed"
        assert intent.fields.amount == Decimal("1000")
        assert intent.fields.category == "Transport"
        assert intent.requires_confirmation is True

    def test_malayalam_script_kurakkuka_parsed_as_edit(self):
        """Input with Malayalam script 'കുറയ്ക്കണം' must be parsed as 'edit'."""
        client = _make_client()
        expected = {
            "action": "edit",
            "language": "ml",
            "fields": {
                "amount": 200,
                "category": "Food",
                "date": None,
                "description": "ഭക്ഷണ ചിലവ് കുറയ്ക്കുക",
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("ഭക്ഷണ ചിലവിൽ നിന്ന് 200 രൂപ കുറയ്ക്കണം")
        assert intent.action == "edit"
        assert intent.language == "ml"
        assert intent.fields.amount == Decimal("200")
        assert intent.fields.category == "Food"
        assert intent.requires_confirmation is True

    def test_english_subtract_parsed_as_edit(self):
        """Input 'subtract 1000 from transport' must be parsed as 'edit'."""
        client = _make_client()
        expected = {
            "action": "edit",
            "language": "en",
            "fields": {
                "amount": 1000,
                "category": "Transport",
                "date": None,
                "description": "subtract transport",
            },
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("subtract 1000 from transport")
        assert intent.action == "edit"
        assert intent.language == "en"
        assert intent.fields.amount == Decimal("1000")
        assert intent.fields.category == "Transport"
        assert intent.requires_confirmation is True

    def test_empty_raw_llm_response_raises_validation_error(self):
        """Empty completion from LLM is handled cleanly and raises IntentValidationError."""
        client = _make_client()
        with patch.object(client, "_make_request", return_value=""):
            with pytest.raises(IntentValidationError, match="Failed to get valid intent"):
                client.parse_intent("subtract 1000 from transport")

    def test_malayalam_script_delete_intent(self):
        """Delete intent in Malayalam script ('ഇന്നലത്തെ ചായ കുടിച്ച 50 രൂപ ഒഴിവാക്കൂ')."""
        client = _make_client()
        expected = {
            "action": "delete",
            "language": "ml",
            "fields": {"amount": 50, "category": "Food", "date": "2026-08-30", "description": "ചായ"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("ഇന്നലത്തെ ചായ കുടിച്ച 50 രൂപ ഒഴിവാക്കൂ")
        assert intent.action == "delete"
        assert intent.language == "ml"
        assert intent.fields.amount == Decimal("50")
        assert intent.fields.category == "Food"
        assert intent.requires_confirmation is True

    def test_manglish_delete_intent(self):
        """Delete intent in Manglish ('swiggy 350 delete chey')."""
        client = _make_client()
        expected = {
            "action": "delete",
            "language": "mixed",
            "fields": {"amount": 350, "category": "Food", "date": None, "description": "swiggy"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("swiggy 350 delete chey")
        assert intent.action == "delete"
        assert intent.language == "mixed"
        assert intent.fields.amount == Decimal("350")
        assert intent.requires_confirmation is True

    def test_malayalam_script_query_intent(self):
        """Query intent in Malayalam script ('ഈ മാസം ഭക്ഷണത്തിന് ആകെ എത്ര ചിലവായി?')."""
        client = _make_client()
        expected = {
            "action": "query",
            "language": "ml",
            "fields": {"amount": None, "category": "Food", "date": "2026-08-01", "description": "ഭക്ഷണ ചിലവ്"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("ഈ മാസം ഭക്ഷണത്തിന് ആകെ എത്ര ചിലവായി?")
        assert intent.action == "query"
        assert intent.language == "ml"
        assert intent.fields.category == "Food"
        assert intent.requires_confirmation is False

    def test_manglish_query_intent(self):
        """Query intent in Manglish ('yesterday total ethra aayi?')."""
        client = _make_client()
        expected = {
            "action": "query",
            "language": "mixed",
            "fields": {"amount": None, "category": None, "date": "2026-08-30", "description": "yesterday total"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": False,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("yesterday total ethra aayi?")
        assert intent.action == "query"
        assert intent.language == "mixed"
        assert intent.requires_confirmation is False

    def test_manglish_edit_change_intent(self):
        """Edit/change amount intent in Manglish ('food bill 450 aakku')."""
        client = _make_client()
        expected = {
            "action": "edit",
            "language": "mixed",
            "fields": {"amount": 450, "category": "Food", "date": None, "description": "food bill change"},
            "matched_transactions": [],
            "confidence": "high",
            "requires_confirmation": True,
            "missing_fields": [],
        }
        with patch.object(client, "_make_request", return_value=json.dumps(expected)):
            intent = client.parse_intent("food bill 450 aakku")
        assert intent.action == "edit"
        assert intent.language == "mixed"
        assert intent.fields.amount == Decimal("450")
        assert intent.requires_confirmation is True



