"""
Bill split API (Phase 14 task 4): /bills routes with the split planner's LLM mocked.

Covers draft create/edit, assignment by text and by tapping, name resolution, the confirm
gate (nothing in `transactions` before it), what confirm writes, idempotent confirm, undo,
mark paid, pay requests, the budget alert, and two-user isolation through the API.
"""

import json
import uuid
from decimal import Decimal
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.assistant.executors.undo import execute_undo
from app.main import app
from app.models.bill import Bill, BillShare
from app.models.budget import CategoryBudget
from app.models.category import Category
from app.models.contact import Contact
from app.models.transaction import Transaction
from app.models.undo_action import UndoAction
from app.routers.bills import get_split_planner
from app.services.bill_planner import SplitPlanner
from app.services.date_utils import get_current_ist_datetime

client = TestClient(app)

PARAGON = {
    "merchant": "Paragon Restaurant",
    "items": [
        {"name": "Chicken Biriyani", "quantity": 2, "amount": 560},
        {"name": "Beef Fry", "quantity": 1, "amount": 320},
        {"name": "Porotta", "quantity": 6, "amount": 120},
        {"name": "Fish Curry Meals", "quantity": 1, "amount": 280},
        {"name": "Lime Soda", "quantity": 3, "amount": 180},
        {"name": "Falooda", "quantity": 1, "amount": 160},
    ],
    "tax": 81,
    "service_charge": 81,
    "total": 1782,
}


def plan_json(assignments, people, language="en", confidence="high"):
    return json.dumps({
        "language": language, "assignments": assignments, "people": people, "confidence": confidence,
        "requires_confirmation": True, "missing_fields": [],
    }, ensure_ascii=False)


FIRST_TURN = [
    {"item": 1, "people": ["me", "Rahul"]},
    {"item": 4, "people": ["Anu"]},
    {"item": 6, "people": ["Pooja"]},
    {"item": 2, "people": "all"},
    {"item": 3, "people": "all"},
]
SODA_ANSWER = [{"item": 5, "people": ["me", "Rahul", "Anu"]}]
FRIENDS = ["Rahul", "Anu", "Pooja"]


@pytest.fixture
def llm():
    """The split planner's LLM. Tests queue raw outputs on llm._make_request.side_effect."""
    mock = MagicMock()
    app.dependency_overrides[get_split_planner] = lambda: SplitPlanner(llm_client=mock)
    yield mock
    app.dependency_overrides.pop(get_split_planner, None)


def create(headers, **overrides):
    body = {**PARAGON, **overrides}
    res = client.post("/bills/manual", headers=headers, json=body)
    assert res.status_code == 201, res.text
    return res.json()


def say(llm, headers, bill_id, assignments, people=FRIENDS, language="en", text="who had what"):
    llm._make_request.side_effect = [plan_json(assignments, people, language)]
    res = client.post(f"/bills/{bill_id}/assign", headers=headers, json={"text": text})
    assert res.status_code == 200, res.text
    return res.json()


def ready_bill(llm, headers, **overrides):
    bill = create(headers, **overrides)
    say(llm, headers, bill["id"], FIRST_TURN)
    return say(llm, headers, bill["id"], SODA_ANSWER)


def confirmed_bill(llm, headers, **overrides):
    bill = ready_bill(llm, headers, **overrides)
    res = client.post(f"/bills/{bill['id']}/confirm", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def txns(db, user_id):
    db.expire_all()
    return db.query(Transaction).filter(Transaction.user_id == user_id).all()


def people_balances(headers):
    """Each contact's net balance from GET /summary/people (positive = they owe the user)."""
    body = client.get("/summary/people", headers=headers).json()
    rows = body if isinstance(body, list) else next(v for v in body.values() if isinstance(v, list))
    return {(r.get("name") or r.get("contact_name")): float(r["net_balance"]) for r in rows}


def share_of(bill, name):
    return next(s for s in bill["shares"] if s["name"] == name)


class TestDraft:
    def test_manual_bill_is_a_draft_that_adds_up_and_writes_nothing(self, bill_db, make_user):
        user_id, headers = make_user()
        bill = create(headers)
        assert bill["status"] == "draft"
        assert bill["adds_up"] is True and bill["difference"] == 0
        assert bill["items_total"] == 1620
        assert [i["position"] for i in bill["items"]] == [1, 2, 3, 4, 5, 6]
        assert bill["unassigned"] == [1, 2, 3, 4, 5, 6]
        assert bill["ready"] is False and bill["shares"] is None and bill["question"] is None
        assert txns(bill_db, user_id) == []

    def test_bill_date_defaults_to_today_in_ist(self, bill_db, make_user):
        _, headers = make_user()
        assert create(headers)["bill_date"] == get_current_ist_datetime().date().isoformat()

    def test_mismatch_is_reported_not_fixed(self, bill_db, make_user):
        _, headers = make_user()
        items = [dict(i) for i in PARAGON["items"]]
        items[4] = {"name": "Lime Soda", "quantity": 2, "amount": 120}
        bill = create(headers, items=items)
        assert bill["adds_up"] is False
        assert bill["difference"] == 60
        assert bill["total"] == 1782  # nothing was changed to make it balance

    def test_patch_fixes_the_bill_and_keeps_assignments_on_kept_items(self, bill_db, make_user, llm):
        _, headers = make_user()
        items = [dict(i) for i in PARAGON["items"]]
        items[4] = {"name": "Lime Soda", "quantity": 2, "amount": 120}
        bill = create(headers, items=items)
        bill = say(llm, headers, bill["id"], [{"item": 1, "people": ["me", "Rahul"]}], ["Rahul"])

        patched_items = [{"id": i["id"], "name": i["name"], "quantity": i["quantity"], "amount": i["amount"]}
                         for i in bill["items"]]
        patched_items[4].update({"quantity": 3, "amount": 180})
        res = client.patch(f"/bills/{bill['id']}", headers=headers, json={"items": patched_items})
        assert res.status_code == 200
        body = res.json()
        assert body["adds_up"] is True and body["difference"] == 0
        assert body["items"][0]["assigned_to"] == ["me", "Rahul"]

    def test_patch_can_add_and_remove_items(self, bill_db, make_user):
        _, headers = make_user()
        bill = create(headers)
        kept = [{"id": i["id"], "name": i["name"], "quantity": i["quantity"], "amount": i["amount"]}
                for i in bill["items"][:2]]
        kept.append({"name": "Tea", "amount": 20})
        body = client.patch(f"/bills/{bill['id']}", headers=headers,
                            json={"items": kept, "tax": 0, "service_charge": 0, "total": 900}).json()
        assert [i["name"] for i in body["items"]] == ["Chicken Biriyani", "Beef Fry", "Tea"]
        assert [i["position"] for i in body["items"]] == [1, 2, 3]
        assert body["adds_up"] is True

    @pytest.mark.parametrize(
        "overrides",
        [
            {"items": []},
            {"total": 0},
            {"items": [{"name": "Tea", "amount": 0}]},
            {"items": [{"name": "Tea", "amount": 10}] * 41},
            {"tax": -1},
        ],
    )
    def test_invalid_bills_are_rejected(self, bill_db, make_user, overrides):
        _, headers = make_user()
        res = client.post("/bills/manual", headers=headers, json={**PARAGON, **overrides})
        assert res.status_code == 422

    def test_cancel_a_draft(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = create(headers)
        assert client.delete(f"/bills/{bill['id']}", headers=headers).status_code == 204
        assert client.get(f"/bills/{bill['id']}", headers=headers).json()["status"] == "cancelled"
        res = client.post(f"/bills/{bill['id']}/assign", headers=headers, json={"text": "mine"})
        assert res.status_code == 409 and res.json()["detail"]["code"] == "not_a_draft"
        llm._make_request.assert_not_called()

    def test_requests_without_a_token_are_refused(self, bill_db):
        assert client.post("/bills/manual", json=PARAGON).status_code in (401, 403)
        assert client.get(f"/bills/{uuid.uuid4()}").status_code in (401, 403)


class TestAssign:
    def test_first_turn_assigns_and_asks_about_the_one_item_left(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = create(headers)
        body = say(llm, headers, bill["id"], FIRST_TURN)

        assert body["items"][0]["assigned_to"] == ["me", "Rahul"]
        assert body["items"][1]["assigned_to"] == ["me", "Rahul", "Anu", "Pooja"]
        assert body["unassigned"] == [5]
        assert body["question"]["item"] == 5
        assert body["question"]["text"] == "Who had the Lime Soda?"
        assert body["planner"] == {"confidence": "high", "requires_confirmation": True,
                                   "missing_fields": ["item:5"], "low_confidence_items": []}
        assert [p["name"] for p in body["people"]] == FRIENDS
        assert all(p["status"] == "new" for p in body["people"])
        assert body["ready"] is False and body["shares"] is None
        assert txns(bill_db, user_id) == []
        assert bill_db.query(Contact).count() == 0  # new names are not contacts yet

    def test_answer_completes_the_split_preview(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        body = ready_bill(llm, headers)

        system_prompt = llm._make_request.call_args.args[0][0]["content"]
        assert '"asked_about": 5' in system_prompt
        assert body["ready"] is True and body["question"] is None and body["unassigned"] == []
        assert [(s["name"], s["amount"], s["is_self"]) for s in body["shares"]] == [
            ("You", 495, True), ("Rahul", 495, False), ("Anu", 495, False), ("Pooja", 297, False),
        ]
        assert share_of(body, "Pooja")["items"] == ["Beef Fry", "Porotta", "Falooda"]
        assert body["your_share"] == 495 and body["friends_total"] == 1287
        assert txns(bill_db, user_id) == []  # still only a preview

    def test_question_language_follows_the_message_then_the_profile(self, bill_db, make_user, llm):
        _, en_headers = make_user(language="en")
        _, ml_headers = make_user(language="ml")

        bill = create(en_headers)
        body = say(llm, en_headers, bill["id"], FIRST_TURN, language="ml")
        assert body["question"]["text"] == "Lime Soda ആരാണ് കഴിച്ചത്?"
        assert body["language_code"] == "ml-IN"

        bill = create(ml_headers)
        body = say(llm, ml_headers, bill["id"], FIRST_TURN, language="mixed")
        assert body["language_code"] == "ml-IN"

        bill = create(en_headers)
        body = say(llm, en_headers, bill["id"], FIRST_TURN, language="mixed")
        assert body["question"]["text"] == "Who had the Lime Soda?"

    def test_existing_contact_is_matched_by_name(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        rahul = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[])
        bill_db.add(rahul)
        bill_db.commit()
        body = say(llm, headers, create(headers)["id"], FIRST_TURN)
        people = {p["name"]: p for p in body["people"]}
        assert people["Rahul"]["status"] == "matched"
        assert people["Rahul"]["contact_id"] == str(rahul.id)
        assert people["Anu"]["status"] == "new"

    def test_close_name_is_ambiguous_until_the_user_says_which(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        rahul = Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[])
        bill_db.add(rahul)
        bill_db.commit()
        bill = create(headers)
        turn = [dict(a) for a in FIRST_TURN]
        turn[0] = {"item": 1, "people": ["me", "Rahool"]}
        say(llm, headers, bill["id"], turn, ["Rahool", "Anu", "Pooja"])
        body = say(llm, headers, bill["id"], [{"item": 5, "people": ["me", "Rahool", "Anu"]}],
                   ["Rahool", "Anu", "Pooja"])

        person = next(p for p in body["people"] if p["name"] == "Rahool")
        assert person["status"] == "ambiguous" and person["candidate_name"] == "Rahul"
        assert body["ambiguous_people"] == ["Rahool"]
        assert body["ready"] is False and body["shares"] is None

        res = client.post(f"/bills/{bill['id']}/confirm", headers=headers)
        assert res.status_code == 409 and res.json()["detail"]["code"] == "ambiguous_people"
        assert txns(bill_db, user_id) == []

        res = client.post(f"/bills/{bill['id']}/people/resolve", headers=headers,
                          json={"name": "Rahool", "use_existing": True})
        body = res.json()
        assert res.status_code == 200 and body["ready"] is True
        assert body["items"][0]["assigned_to"] == ["me", "Rahul"]
        assert next(p for p in body["people"] if p["name"] == "Rahul")["contact_id"] == str(rahul.id)

    def test_ambiguous_name_can_be_kept_as_a_new_person(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill_db.add(Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[]))
        bill_db.commit()
        bill = create(headers, items=[{"name": "Tea", "amount": 100}], tax=0, service_charge=0, total=100)
        say(llm, headers, bill["id"], [{"item": 1, "people": ["me", "Rahool"]}], ["Rahool"])
        body = client.post(f"/bills/{bill['id']}/people/resolve", headers=headers,
                           json={"name": "Rahool", "use_existing": False}).json()
        assert body["people"] == [{"name": "Rahool", "contact_id": None, "status": "new", "candidate_name": None}]
        assert body["ready"] is True

    def test_planner_failure_changes_nothing(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = create(headers)
        llm._make_request.side_effect = ["no json here", "still not json"]
        res = client.post(f"/bills/{bill['id']}/assign", headers=headers, json={"text": "blah"})
        assert res.status_code == 422
        assert res.json()["detail"]["code"] == "planner_failed"
        assert client.get(f"/bills/{bill['id']}", headers=headers).json()["unassigned"] == [1, 2, 3, 4, 5, 6]

    def test_low_confidence_assignment_is_left_for_the_user(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = create(headers)
        say(llm, headers, bill["id"], FIRST_TURN)
        llm._make_request.side_effect = [json.dumps({
            "language": "en", "assignments": [{"item": 5, "people": ["Anu"], "confidence": "low"}],
            "people": FRIENDS, "confidence": "low", "requires_confirmation": True, "missing_fields": ["item:5"],
        })]
        body = client.post(f"/bills/{bill['id']}/assign", headers=headers, json={"text": "maybe Anu"}).json()
        assert body["understood"] is False
        assert body["unassigned"] == [5] and body["question"]["item"] == 5
        assert body["planner"]["low_confidence_items"] == [5]

    def test_tapping_assigns_without_the_llm(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = create(headers, items=[{"name": "Tea", "amount": 60}, {"name": "Vada", "amount": 40}],
                      tax=0, service_charge=0, total=100)
        tea, vada = bill["items"]
        body = client.put(f"/bills/{bill['id']}/items/{tea['id']}/people", headers=headers,
                          json={"people": ["me", "Anu"]}).json()
        assert body["items"][0]["assigned_to"] == ["me", "Anu"]
        assert body["question"]["item"] == 2
        body = client.put(f"/bills/{bill['id']}/items/{vada['id']}/people", headers=headers,
                          json={"people": ["anu"]}).json()
        assert body["items"][1]["assigned_to"] == ["Anu"]  # same person, first spelling kept
        assert body["ready"] is True
        assert [(s["name"], s["amount"]) for s in body["shares"]] == [("You", 30), ("Anu", 70)]

        body = client.put(f"/bills/{bill['id']}/items/{vada['id']}/people", headers=headers,
                          json={"people": []}).json()
        assert body["unassigned"] == [2] and body["ready"] is False
        llm._make_request.assert_not_called()


class TestConfirm:
    def test_confirm_writes_one_food_expense_and_one_people_expense_per_friend(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        assert bill["status"] == "confirmed"

        rows = txns(bill_db, user_id)
        assert len(rows) == 4
        assert sum(t.amount for t in rows) == Decimal("1782")
        assert {t.type for t in rows} == {"expense"}
        assert {t.description for t in rows} == {"Paragon Restaurant (split)"}
        assert {t.txn_date.isoformat() for t in rows} == {bill["bill_date"]}

        categories = {c.id: c.name for c in bill_db.query(Category).all()}
        own = [t for t in rows if t.contact_id is None]
        assert len(own) == 1 and categories[own[0].category_id] == "Food" and own[0].amount == Decimal("495")
        friends = {t.contact.name: t for t in rows if t.contact_id}
        assert {n: t.amount for n, t in friends.items()} == {
            "Rahul": Decimal("495"), "Anu": Decimal("495"), "Pooja": Decimal("297")}
        assert {categories[t.category_id] for t in friends.values()} == {"People"}

        assert sorted(c.name for c in bill_db.query(Contact).filter(Contact.user_id == user_id)) == [
            "Anu", "Pooja", "Rahul"]
        stored = bill_db.query(Bill).one()
        undo_rows = bill_db.query(UndoAction).filter(UndoAction.user_id == user_id).all()
        assert len(undo_rows) == 4 and {u.batch_id for u in undo_rows} == {stored.undo_batch_id}
        assert {str(s.transaction_id) for s in bill_db.query(BillShare).all()} == {str(t.id) for t in rows}
        assert all(s["id"] and s["paid"] is False for s in bill["shares"])

    def test_second_confirm_writes_nothing(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        again = client.post(f"/bills/{bill['id']}/confirm", headers=headers)
        assert again.status_code == 200
        assert [s["id"] for s in again.json()["shares"]] == [s["id"] for s in bill["shares"]]
        assert len(txns(bill_db, user_id)) == 4
        assert bill_db.query(BillShare).count() == 4

    def test_existing_contact_is_reused_not_duplicated(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill_db.add(Contact(id=uuid.uuid4(), user_id=user_id, name="Rahul", aliases=[]))
        bill_db.commit()
        confirmed_bill(llm, headers)
        assert bill_db.query(Contact).filter(Contact.user_id == user_id, Contact.name == "Rahul").count() == 1

    @pytest.mark.parametrize("problem, code", [("mismatch", "does_not_add_up"), ("unassigned", "unassigned_items")])
    def test_confirm_is_blocked_until_the_bill_is_complete(self, bill_db, make_user, llm, problem, code):
        user_id, headers = make_user()
        if problem == "mismatch":
            bill = ready_bill(llm, headers, total=1842)
        else:
            bill = create(headers)
            say(llm, headers, bill["id"], FIRST_TURN)
        res = client.post(f"/bills/{bill['id']}/confirm", headers=headers)
        assert res.status_code == 409
        assert res.json()["detail"]["code"] == code
        assert txns(bill_db, user_id) == []
        assert client.get(f"/bills/{bill['id']}", headers=headers).json()["status"] == "draft"

    def test_a_confirmed_bill_cannot_be_edited_or_cancelled(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = confirmed_bill(llm, headers)
        assert client.patch(f"/bills/{bill['id']}", headers=headers, json={"total": 5}).status_code == 409
        assert client.delete(f"/bills/{bill['id']}", headers=headers).status_code == 409
        item_id = bill["items"][0]["id"]
        assert client.put(f"/bills/{bill['id']}/items/{item_id}/people", headers=headers,
                          json={"people": ["me"]}).status_code == 409

    def test_friend_shares_stay_out_of_spending(self, bill_db, make_user, llm):
        _, headers = make_user()
        confirmed_bill(llm, headers)
        summary = client.get("/summary?period=month", headers=headers).json()
        assert float(summary["total_spent"]) == 495
        assert people_balances(headers) == {"Rahul": 495, "Anu": 495, "Pooja": 297}

    def test_budget_alert_fires_on_the_users_own_share(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        food = bill_db.query(Category).filter(Category.name == "Food").one()
        bill_db.add(CategoryBudget(user_id=user_id, category_id=food.id, amount=Decimal("500")))
        bill_db.commit()
        bill = confirmed_bill(llm, headers)
        assert bill["budget_alert"]["category"] == "Food"
        assert bill["budget_alert"]["state"] == "near"

    def test_user_who_had_nothing_gets_no_food_expense(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = create(headers, items=[{"name": "Tea", "amount": 100}], tax=0, service_charge=0, total=100)
        say(llm, headers, bill["id"], [{"item": 1, "people": ["Anu", "Pooja"]}], ["Anu", "Pooja"])
        body = client.post(f"/bills/{bill['id']}/confirm", headers=headers).json()
        rows = txns(bill_db, user_id)
        assert len(rows) == 2 and all(t.contact_id for t in rows)
        assert sum(t.amount for t in rows) == Decimal("100")
        assert body["your_share"] == 0 and "budget_alert" not in body


class TestUndo:
    def test_undo_removes_every_row_the_confirm_wrote(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        res = client.post(f"/bills/{bill['id']}/undo", headers=headers)
        assert res.status_code == 200 and res.json()["status"] == "undone"
        assert txns(bill_db, user_id) == []
        assert bill_db.query(UndoAction).filter(UndoAction.user_id == user_id).count() == 0
        assert client.post(f"/bills/{bill['id']}/undo", headers=headers).json()["status"] == "undone"
        assert client.post(f"/bills/{bill['id']}/confirm", headers=headers).status_code == 409

    def test_undo_leaves_other_transactions_alone(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        other = Transaction(id=uuid.uuid4(), user_id=user_id, type="expense", amount=Decimal("80"),
                            category_id=bill_db.query(Category).filter(Category.name == "Transport").one().id,
                            description="auto", txn_date=get_current_ist_datetime().date())
        bill_db.add(other)
        bill_db.commit()
        bill = confirmed_bill(llm, headers)
        client.post(f"/bills/{bill['id']}/undo", headers=headers)
        assert [t.description for t in txns(bill_db, user_id)] == ["auto"]

    def test_assistant_undo_of_the_batch_marks_the_bill_undone(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        result = execute_undo(bill_db, user_id)
        assert result.ok and result.data["undone_count"] == 4
        assert txns(bill_db, user_id) == []
        assert client.get(f"/bills/{bill['id']}", headers=headers).json()["status"] == "undone"

    def test_a_draft_cannot_be_undone(self, bill_db, make_user):
        _, headers = make_user()
        res = client.post(f"/bills/{create(headers)['id']}/undo", headers=headers)
        assert res.status_code == 409 and res.json()["detail"]["code"] == "not_confirmed"


class TestMarkPaid:
    def test_mark_paid_writes_the_repayment(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        pooja = share_of(bill, "Pooja")
        res = client.post(f"/bills/{bill['id']}/shares/{pooja['id']}/paid", headers=headers)
        assert res.status_code == 200
        assert share_of(res.json(), "Pooja")["paid"] is True
        assert share_of(res.json(), "Rahul")["paid"] is False

        income = [t for t in txns(bill_db, user_id) if t.type == "income"]
        assert len(income) == 1
        assert income[0].amount == Decimal("297") and income[0].contact.name == "Pooja"
        assert bill_db.get(Category, income[0].category_id).name == "People"

        assert people_balances(headers)["Pooja"] == 0

    def test_mark_paid_twice_writes_once(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        url = f"/bills/{bill['id']}/shares/{share_of(bill, 'Pooja')['id']}/paid"
        client.post(url, headers=headers)
        assert client.post(url, headers=headers).status_code == 200
        assert len([t for t in txns(bill_db, user_id) if t.type == "income"]) == 1

    def test_undoing_the_repayment_makes_the_share_unpaid_again(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        client.post(f"/bills/{bill['id']}/shares/{share_of(bill, 'Pooja')['id']}/paid", headers=headers)
        assert execute_undo(bill_db, user_id).data["undone_count"] == 1  # only the repayment
        body = client.get(f"/bills/{bill['id']}", headers=headers).json()
        assert body["status"] == "confirmed" and share_of(body, "Pooja")["paid"] is False

    def test_a_bill_with_a_paid_share_cannot_be_undone(self, bill_db, make_user, llm):
        user_id, headers = make_user()
        bill = confirmed_bill(llm, headers)
        client.post(f"/bills/{bill['id']}/shares/{share_of(bill, 'Pooja')['id']}/paid", headers=headers)
        res = client.post(f"/bills/{bill['id']}/undo", headers=headers)
        assert res.status_code == 409 and res.json()["detail"]["code"] == "share_paid"
        assert len(txns(bill_db, user_id)) == 5

    def test_the_users_own_share_cannot_be_marked_paid(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = confirmed_bill(llm, headers)
        res = client.post(f"/bills/{bill['id']}/shares/{share_of(bill, 'You')['id']}/paid", headers=headers)
        assert res.status_code == 409 and res.json()["detail"]["code"] == "own_share"


class TestPayRequest:
    def test_needs_the_users_upi_id(self, bill_db, make_user, llm):
        _, headers = make_user()
        bill = confirmed_bill(llm, headers)
        res = client.get(f"/bills/{bill['id']}/shares/{share_of(bill, 'Rahul')['id']}/request", headers=headers)
        assert res.status_code == 422 and res.json()["detail"]["code"] == "upi_id_missing"

    def test_builds_a_upi_link_for_the_share(self, bill_db, make_user, llm):
        _, headers = make_user(name="Sangeeth P S", upi_id="sangeeth@okhdfcbank")
        bill = confirmed_bill(llm, headers)
        body = client.get(f"/bills/{bill['id']}/shares/{share_of(bill, 'Rahul')['id']}/request",
                          headers=headers).json()
        assert body["upi_link"] == (
            "upi://pay?pa=sangeeth@okhdfcbank&pn=Sangeeth%20P%20S&am=495.00&cu=INR&tn=Paragon%20Restaurant"
        )
        assert body["amount"] == 495 and body["name"] == "Rahul" and body["paid"] is False
        assert body["message"] == (
            "Hi Rahul, your share of Paragon Restaurant is ₹495. "
            "You can pay me on UPI at sangeeth@okhdfcbank, or scan the QR code."
        )

    def test_message_is_malayalam_for_a_malayalam_profile(self, bill_db, make_user, llm):
        _, headers = make_user(language="ml", upi_id="me@upi")
        bill = confirmed_bill(llm, headers)
        body = client.get(f"/bills/{bill['id']}/shares/{share_of(bill, 'Pooja')['id']}/request",
                          headers=headers).json()
        assert "₹297" in body["message"] and "പങ്ക്" in body["message"]

    def test_no_request_before_the_split_is_saved(self, bill_db, make_user, llm):
        _, headers = make_user(upi_id="me@upi")
        bill = ready_bill(llm, headers)
        res = client.get(f"/bills/{bill['id']}/shares/{uuid.uuid4()}/request", headers=headers)
        assert res.status_code == 404


class TestIsolation:
    def test_another_users_bill_is_a_404_on_every_route(self, bill_db, make_user, llm):
        a_id, a_headers = make_user(name="A", upi_id="a@upi")
        b_id, b_headers = make_user(name="B", upi_id="b@upi")
        draft = create(a_headers)
        saved = confirmed_bill(llm, a_headers)
        item_id = draft["items"][0]["id"]
        share_id = share_of(saved, "Rahul")["id"]
        llm._make_request.reset_mock()

        attempts = [
            client.get(f"/bills/{draft['id']}", headers=b_headers),
            client.patch(f"/bills/{draft['id']}", headers=b_headers, json={"total": 1}),
            client.post(f"/bills/{draft['id']}/assign", headers=b_headers, json={"text": "all mine"}),
            client.put(f"/bills/{draft['id']}/items/{item_id}/people", headers=b_headers, json={"people": ["me"]}),
            client.post(f"/bills/{draft['id']}/people/resolve", headers=b_headers,
                        json={"name": "Rahul", "use_existing": False}),
            client.post(f"/bills/{draft['id']}/confirm", headers=b_headers),
            client.delete(f"/bills/{draft['id']}", headers=b_headers),
            client.post(f"/bills/{saved['id']}/undo", headers=b_headers),
            client.get(f"/bills/{saved['id']}/shares/{share_id}/request", headers=b_headers),
            client.post(f"/bills/{saved['id']}/shares/{share_id}/paid", headers=b_headers),
        ]
        assert [r.status_code for r in attempts] == [404] * len(attempts)
        llm._make_request.assert_not_called()

        assert txns(bill_db, b_id) == []
        assert len(txns(bill_db, a_id)) == 4
        assert client.get(f"/bills/{draft['id']}", headers=a_headers).json()["status"] == "draft"
        assert client.get(f"/bills/{saved['id']}", headers=a_headers).json()["status"] == "confirmed"

    def test_names_resolve_only_against_the_users_own_contacts(self, bill_db, make_user, llm):
        a_id, a_headers = make_user(name="A")
        b_id, b_headers = make_user(name="B")
        bill_db.add(Contact(id=uuid.uuid4(), user_id=a_id, name="Rahul", aliases=[]))
        bill_db.commit()
        body = say(llm, b_headers, create(b_headers)["id"], FIRST_TURN)
        assert next(p for p in body["people"] if p["name"] == "Rahul")["status"] == "new"
