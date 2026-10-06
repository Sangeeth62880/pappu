"""
Regression eval suite for intent classification on real ambiguous Malayalam and code-mixed inputs.

Per prompt engineering principles:
Catches prompt regressions on real failures (not synthetic examples).
Runs against the live Sarvam API when SARVAM_API_KEY is present (skipped if not).
"""

import os
import pytest

from app.llm.client import SarvamLLMClient
from app.schemas.intent import IntentObject, IntentFields
from app.services.routing import route_intent, RoutingDecision

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")

pytestmark = pytest.mark.skipif(
    not SARVAM_API_KEY,
    reason="SARVAM_API_KEY not set — skipping live regression tests",
)


@pytest.fixture(scope="module")
def llm_client():
    return SarvamLLMClient(api_key=SARVAM_API_KEY)


class TestIntentRegressionRealFailures:
    """Real failure cases that previously suffered shortcut/surface classification errors."""

    def test_manglish_food_deletion_ozhivakku(self, llm_client):
        """
        'Innalathe food inte 600 ozhivakku'
        Must parse as action:delete (NOT add) with category Food and amount 600.
        """
        intent = llm_client.parse_intent("Innalathe food inte 600 ozhivakku")
        assert isinstance(intent, IntentObject)
        assert intent.action == "delete"
        assert intent.fields.category == "Food"
        assert intent.fields.amount == 600
        assert intent.requires_confirmation is True
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0

    def test_manglish_amount_correction_athu_alla(self, llm_client):
        """
        'athu 500 alla 600 aayirunnu' (that wasn't 500, it was 600)
        Must parse as action:edit (NOT add), amount 600.
        """
        intent = llm_client.parse_intent("athu 500 alla 600 aayirunnu")
        assert isinstance(intent, IntentObject)
        assert intent.action == "edit"
        assert intent.fields.amount == 600
        assert intent.requires_confirmation is True
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0

    def test_manglish_tea_deletion_vendannu_vekku(self, llm_client):
        """
        'innalathe tea 20 vendannu vekku' (cancel/drop yesterday's 20 tea)
        Must parse as action:delete (NOT edit or add).
        """
        intent = llm_client.parse_intent("innalathe tea 20 vendannu vekku")
        assert isinstance(intent, IntentObject)
        assert intent.action == "delete"
        assert intent.fields.amount == 20
        assert intent.fields.category == "Food"
        assert intent.requires_confirmation is True
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0

    def test_manglish_negated_delete_with_add(self, llm_client):
        """
        'delete cheyyalle 200 add cheyyu' (don't delete, add 200)
        Must parse as action:add (NOT delete/edit), despite the word 'delete' appearing.
        """
        intent = llm_client.parse_intent("delete cheyyalle 200 add cheyyu")
        assert isinstance(intent, IntentObject)
        assert intent.action == "add"
        assert intent.fields.amount == 200
        assert intent.requires_confirmation is False
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0

    def test_manglish_unseen_removal_phrasing(self, llm_client):
        """
        'swiggy 350 venda maattikkalayu' (remove/discard swiggy 350)
        Generalizes to action:delete on unseen phrasing without keyword lists.
        """
        intent = llm_client.parse_intent("swiggy 350 venda maattikkalayu")
        assert isinstance(intent, IntentObject)
        assert intent.action == "delete"
        assert intent.fields.amount == 350
        assert intent.fields.category == "Food"
        assert intent.requires_confirmation is True
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0

    def test_manglish_reduction_kurakku(self, llm_client):
        """
        'petrolil ninn 1000 kurakku' (reduce 1000 from petrol)
        Must parse as action:edit (NOT add).
        """
        intent = llm_client.parse_intent("petrolil ninn 1000 kurakku")
        assert isinstance(intent, IntentObject)
        assert intent.action == "edit"
        assert intent.fields.amount == 1000
        assert intent.fields.category == "Transport"
        assert intent.requires_confirmation is True
        assert intent.reasoning is not None and len(intent.reasoning.strip()) > 0


class TestSelfVerificationConfirmationSurfacing:
    """Test that Tier 2 confirmation prompt surfaces the LLM's restated interpretation."""

    def test_tier2_surfaces_model_reasoning_in_confirmation_prompt(self):
        intent = IntentObject(
            reasoning="User wants to remove yesterday's 600 rupee food expense",
            action="delete",
            language="en",
            fields=IntentFields(amount=600, category="Food"),
            matched_transactions=["txn-uuid-123"],
            confidence="high",
            requires_confirmation=True,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CONFIRMATION
        assert result.confirmation_prompt is not None
        assert "User wants to remove yesterday's 600 rupee food expense" in result.confirmation_prompt
        assert "txn-uuid-123" in result.confirmation_prompt
