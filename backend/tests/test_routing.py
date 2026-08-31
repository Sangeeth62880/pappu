"""
Pure logic unit tests for confirmation & error-recovery routing (PROJECT_SPEC.md §6).

Tests all 4 tiers using mock IntentObject instances:
- Tier 1: 'add' (high confidence) -> EXECUTE
- Tier 2: 'edit'/'delete' (single match, high confidence) -> ASK_CONFIRMATION
- Tier 3: 'edit'/'delete' (multiple matches) -> ASK_DISAMBIGUATION
- Tier 4: 'missing_fields' non-empty or 'low' confidence -> ASK_CLARIFICATION
"""

import pytest
from app.schemas.intent import IntentObject, IntentFields
from app.services.routing import route_intent, RoutingDecision, RoutingResult


class TestRoutingTier1Execute:
    """Tier 1: 'add' or 'query' with high confidence executes immediately."""

    def test_add_high_confidence_routes_to_execute(self):
        intent = IntentObject(
            action="add",
            language="en",
            fields=IntentFields(amount=500, category="Food", date="2026-08-31", description="lunch"),
            matched_transactions=[],
            confidence="high",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert isinstance(result, RoutingResult)
        assert result.decision == RoutingDecision.EXECUTE
        assert result.action == "add"

    def test_query_high_confidence_routes_to_execute(self):
        intent = IntentObject(
            action="query",
            language="en",
            fields=IntentFields(category="Transport"),
            matched_transactions=[],
            confidence="high",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.EXECUTE
        assert result.action == "query"


class TestRoutingTier2Confirmation:
    """Tier 2: 'edit' or 'delete' with exactly one match asks for confirmation."""

    def test_delete_single_match_routes_to_confirmation(self):
        intent = IntentObject(
            action="delete",
            language="en",
            fields=IntentFields(category="Food", date="2026-08-30"),
            matched_transactions=["txn_uuid_1"],
            confidence="high",
            requires_confirmation=True,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CONFIRMATION
        assert result.action == "delete"
        assert result.matched_transactions == ["txn_uuid_1"]
        assert result.confirmation_prompt is not None
        assert "txn_uuid_1" in result.confirmation_prompt

    def test_edit_single_match_routes_to_confirmation(self):
        intent = IntentObject(
            action="edit",
            language="en",
            fields=IntentFields(amount=150),
            matched_transactions=["txn_uuid_2"],
            confidence="high",
            requires_confirmation=True,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CONFIRMATION
        assert result.action == "edit"
        assert result.matched_transactions == ["txn_uuid_2"]
        assert result.confirmation_prompt is not None

    def test_malayalam_confirmation_prompt(self):
        intent = IntentObject(
            action="delete",
            language="ml",
            fields=IntentFields(),
            matched_transactions=["txn_uuid_1"],
            confidence="high",
            requires_confirmation=True,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CONFIRMATION
        assert "തീർച്ചയാണോ" in result.confirmation_prompt


class TestRoutingTier3Disambiguation:
    """Tier 3: 'edit' or 'delete' with multiple matches asks user to disambiguate."""

    def test_delete_multiple_matches_routes_to_disambiguation(self):
        intent = IntentObject(
            action="delete",
            language="en",
            fields=IntentFields(category="Food"),
            matched_transactions=["txn_1", "txn_2", "txn_3"],
            confidence="high",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_DISAMBIGUATION
        assert result.action == "delete"
        assert len(result.matched_transactions) == 3
        assert result.disambiguation_prompt is not None
        assert "3 found" in result.disambiguation_prompt

    def test_edit_multiple_matches_routes_to_disambiguation(self):
        intent = IntentObject(
            action="edit",
            language="en",
            fields=IntentFields(amount=300),
            matched_transactions=["txn_1", "txn_2"],
            confidence="high",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_DISAMBIGUATION
        assert result.action == "edit"
        assert len(result.matched_transactions) == 2


class TestRoutingTier4Clarification:
    """Tier 4: 'missing_fields' non-empty or 'low' confidence asks for targeted clarification."""

    def test_low_confidence_routes_to_clarification(self):
        intent = IntentObject(
            action="add",
            language="en",
            fields=IntentFields(amount=100),
            matched_transactions=[],
            confidence="low",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CLARIFICATION
        assert result.clarification_prompt is not None

    def test_missing_fields_routes_to_clarification(self):
        intent = IntentObject(
            action="add",
            language="en",
            fields=IntentFields(),
            matched_transactions=[],
            confidence="high",
            requires_confirmation=False,
            missing_fields=["amount", "category"],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CLARIFICATION
        assert result.missing_fields == ["amount", "category"]
        assert "amount, category" in result.clarification_prompt

    def test_edit_with_no_matched_transactions_routes_to_clarification(self):
        intent = IntentObject(
            action="edit",
            language="en",
            fields=IntentFields(amount=200),
            matched_transactions=[],
            confidence="high",
            requires_confirmation=False,
            missing_fields=[],
        )
        result = route_intent(intent)
        assert result.decision == RoutingDecision.ASK_CLARIFICATION
        assert "No matching transaction found" in result.clarification_prompt
