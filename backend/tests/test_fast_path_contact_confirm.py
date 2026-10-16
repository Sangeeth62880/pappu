"""
Tests for Fix 4:
Fast path rules for contact_confirm:
- 'new', 'yeah', 'yep', 'haan' -> 'yes'
- 'nope' -> 'no'
- ONLY applies when pending item is contact_confirm; other pending items do not match these.
"""
from app.assistant.planner import check_fast_path
from app.assistant.schemas import PendingSummary


def test_contact_confirm_fast_path_aliases():
    pending_contact = PendingSummary(
        id="p1",
        kind="contact_confirm",
        question="Did you mean Pooja?",
    )

    # Yes aliases for contact_confirm
    for phrase in ["new", "yeah", "yep", "haan"]:
        plan = check_fast_path(phrase, pending_contact)
        assert plan is not None, f"Expected fast path for {phrase}"
        assert plan.actions[0].op == "answer_pending"
        assert plan.actions[0].value == "yes"

    # No alias for contact_confirm
    plan_no = check_fast_path("nope", pending_contact)
    assert plan_no is not None
    assert plan_no.actions[0].op == "answer_pending"
    assert plan_no.actions[0].value == "no"


def test_non_contact_confirm_ignores_new_aliases():
    pending_delete = PendingSummary(
        id="p2",
        kind="confirm",
        question="Delete Food 250 on 14 Oct?",
    )

    # These aliases must NOT trigger on general confirm
    for phrase in ["new", "yeah", "yep", "haan", "nope"]:
        plan = check_fast_path(phrase, pending_delete)
        assert plan is None, f"Expected NO fast path for {phrase} on non-contact_confirm"

    # But standard yes/no still work
    plan_yes = check_fast_path("yes", pending_delete)
    assert plan_yes is not None
    assert plan_yes.actions[0].value == "yes"

    plan_cancel = check_fast_path("cancel", pending_delete)
    assert plan_cancel is not None
    assert plan_cancel.actions[0].value == "no"
