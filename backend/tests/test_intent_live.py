"""
Live integration tests for the LLM intent parsing against the real Sarvam API.

These tests are skipped when SARVAM_API_KEY is not set in the environment.
They verify that the prompt template actually produces schema-conformant
output from the real LLM, not just that mocked responses validate correctly.

Per BUILD_PHASES.md Phase 3: "verified against a hand-written expected-output
test set, not just spot-checked manually."
"""

import os
import pytest

from app.llm.client import SarvamLLMClient
from app.schemas.intent import IntentObject

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

# Skip all tests in this module if no API key is set
pytestmark = pytest.mark.skipif(
    not SARVAM_API_KEY,
    reason="SARVAM_API_KEY not set — skipping live LLM tests"
)


@pytest.fixture(scope="module")
def llm_client():
    """Create a real SarvamLLMClient for live tests."""
    return SarvamLLMClient(api_key=SARVAM_API_KEY)


class TestLiveAddIntent:
    """Live tests for 'add' intents against real Sarvam API."""

    def test_english_add_food(self, llm_client):
        """'I spent 500 on food today' → add, Food, 500"""
        intent = llm_client.parse_intent("I spent 500 on food today")
        assert isinstance(intent, IntentObject)
        assert intent.action == "add"
        assert intent.fields.amount is not None
        assert isinstance(intent.fields.amount, (int, float))
        assert type(intent.model_dump()["fields"]["amount"]) in (int, float)
        assert intent.fields.category is not None
        assert intent.requires_confirmation is False

    def test_english_add_with_k_shorthand(self, llm_client):
        """'Paid 2k for shopping yesterday' → add, Shopping, 2000"""
        intent = llm_client.parse_intent("Paid 2k for shopping yesterday")
        assert intent.action == "add"
        assert intent.fields.amount == 2000
        assert isinstance(intent.fields.amount, (int, float))
        assert type(intent.model_dump()["fields"]["amount"]) in (int, float)
        assert intent.fields.category == "Shopping"

    def test_malayalam_add_food_numeric_amount(self, llm_client):
        """'ഇന്ന് ഭക്ഷണത്തിന് 300 രൂപ ചെലവായി' → add, Food, 300 as a JSON number."""
        intent = llm_client.parse_intent("ഇന്ന് ഭക്ഷണത്തിന് 300 രൂപ ചെലവായി")
        assert isinstance(intent, IntentObject)
        assert intent.action == "add"
        assert intent.fields.amount == 300
        assert isinstance(intent.fields.amount, (int, float))
        assert type(intent.model_dump()["fields"]["amount"]) in (int, float)
        assert intent.fields.category == "Food"



class TestLiveQueryIntent:
    """Live tests for 'query' intents against real Sarvam API."""

    def test_english_query(self, llm_client):
        """'How much did I spend this month?' → query"""
        intent = llm_client.parse_intent("How much did I spend this month?")
        assert isinstance(intent, IntentObject)
        assert intent.action == "query"
        assert intent.requires_confirmation is False

    def test_malayalam_query(self, llm_client):
        """'ഈ മാസം എത്ര ചെലവായി?' → query, ml"""
        intent = llm_client.parse_intent("ഈ മാസം എത്ര ചെലവായി?")
        assert isinstance(intent, IntentObject)
        assert intent.action == "query"
        assert intent.language == "ml"


class TestLiveEditIntent:
    """Live tests for 'edit' intents."""

    def test_english_edit(self, llm_client):
        """'Change yesterday's transport expense to 150' → edit"""
        intent = llm_client.parse_intent(
            "Change yesterday's transport expense to 150"
        )
        assert isinstance(intent, IntentObject)
        assert intent.action == "edit"
        assert intent.fields.amount is not None
        assert intent.requires_confirmation is True


class TestLiveDeleteIntent:
    """Live tests for 'delete' intents."""

    def test_english_delete(self, llm_client):
        """'Delete the food expense from yesterday' → delete"""
        intent = llm_client.parse_intent("Delete the food expense from yesterday")
        assert isinstance(intent, IntentObject)
        assert intent.action == "delete"
        assert intent.requires_confirmation is True



class TestLiveCodeMixed:
    """Live tests for code-mixed (English + Malayalam) inputs."""

    def test_code_mixed_add(self, llm_client):
        """'Yesterday 2k shopping cheythu' → add, mixed"""
        intent = llm_client.parse_intent("yesterday 2k shopping cheythu")
        assert isinstance(intent, IntentObject)
        assert intent.action == "add"
        assert intent.language in ("mixed", "en")  # LLM may detect as either


class TestLiveMissingFields:
    """Live tests for inputs with missing/ambiguous fields."""

    def test_vague_input(self, llm_client):
        """'I bought something' → add, low confidence or missing_fields"""
        intent = llm_client.parse_intent("I bought something")
        assert isinstance(intent, IntentObject)
        assert intent.action == "add"
        # Should have low confidence or missing amount
        assert intent.confidence == "low" or "amount" in intent.missing_fields


class TestLiveSchemaConformance:
    """Verify all live responses conform to the schema."""

    @pytest.mark.parametrize("text", [
        "I spent 500 on food today",
        "How much did I spend on transport this month?",
        "Delete the food expense from yesterday",
        "Change yesterday's transport to 150",
        "ഇന്ന് ഭക്ഷണത്തിന് 300 രൂപ ചെലവായി",
        "I got my salary of 50000 today",
        "yesterday 2k shopping cheythu",
        "Show all my expenses",
    ])
    def test_schema_conformance(self, llm_client, text):
        """Every response must be a valid IntentObject."""
        intent = llm_client.parse_intent(text)
        assert isinstance(intent, IntentObject)
        assert intent.action in ("add", "edit", "delete", "query")
        assert intent.language in ("en", "ml", "mixed")
        assert intent.confidence in ("high", "low")
        assert isinstance(intent.requires_confirmation, bool)
        assert isinstance(intent.missing_fields, list)
        if intent.fields.amount is not None:
            assert isinstance(intent.fields.amount, (int, float))
            assert type(intent.model_dump()["fields"]["amount"]) in (int, float)

