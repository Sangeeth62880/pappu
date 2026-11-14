"""
Bill split schema (Phase 14 task 1): bills, bill_items, bill_shares and profiles.upi_id.
"""

import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.exc import IntegrityError

from app.main import app
from app.models.bill import Bill, BillItem, BillShare
from app.models.profile import Profile

client = TestClient(app)


def _bill(user_id, **overrides):
    fields = dict(user_id=user_id, merchant="Paragon", bill_date=date(2026, 11, 14), total=Decimal("1782"))
    fields.update(overrides)
    return Bill(**fields)


def test_bill_tables_and_columns_exist(bill_db):
    insp = inspect(bill_db.get_bind())
    assert {"bills", "bill_items", "bill_shares"} <= set(insp.get_table_names())
    bill_cols = {c["name"] for c in insp.get_columns("bills")}
    assert {"merchant", "bill_date", "tax", "service_charge", "discount", "total", "status", "people",
            "undo_batch_id"} <= bill_cols
    assert "upi_id" in {c["name"] for c in insp.get_columns("profiles")}


def test_bill_defaults_and_children_round_trip(bill_db, make_user):
    user_id, _ = make_user()
    bill = _bill(user_id)
    bill.items = [
        BillItem(position=2, name="Beef Fry", amount=Decimal("320")),
        BillItem(position=1, name="Chicken Biriyani", quantity=2, amount=Decimal("560"),
                 assigned_to=["me", "Rahul"]),
    ]
    bill_db.add(bill)
    bill_db.commit()
    bill_db.refresh(bill)

    assert bill.status == "draft"
    assert bill.people == []
    assert bill.tax == 0 and bill.service_charge == 0 and bill.discount == 0
    assert [i.name for i in bill.items] == ["Chicken Biriyani", "Beef Fry"]  # ordered by position
    assert bill.items[0].assigned_to == ["me", "Rahul"]
    assert bill.items[1].assigned_to is None and bill.items[1].needs_check is False


def test_deleting_a_bill_removes_its_items_and_shares(bill_db, make_user):
    user_id, _ = make_user()
    bill = _bill(user_id)
    bill.items = [BillItem(position=1, name="Falooda", amount=Decimal("160"))]
    bill.shares = [BillShare(is_self=True, name="You", amount=Decimal("160"))]
    bill_db.add(bill)
    bill_db.commit()

    bill_db.delete(bill)
    bill_db.commit()
    assert bill_db.query(BillItem).count() == 0
    assert bill_db.query(BillShare).count() == 0


@pytest.mark.parametrize("overrides", [{"total": Decimal("0")}, {"status": "paid"}])
def test_bill_constraints_reject_bad_rows(bill_db, make_user, overrides):
    user_id, _ = make_user()
    bill_db.add(_bill(user_id, **overrides))
    with pytest.raises(IntegrityError):
        bill_db.commit()
    bill_db.rollback()


def test_bill_requires_an_existing_profile(bill_db):
    bill_db.add(_bill(uuid.uuid4()))
    with pytest.raises(IntegrityError):
        bill_db.commit()
    bill_db.rollback()


class TestProfileUpiId:
    def test_defaults_to_none_and_can_be_set(self, bill_db, make_user):
        user_id, headers = make_user()
        assert client.get("/profile", headers=headers).json()["upi_id"] is None

        res = client.patch("/profile", headers=headers, json={"upi_id": "  sangeeth@okhdfcbank "})
        assert res.status_code == 200
        assert res.json()["upi_id"] == "sangeeth@okhdfcbank"
        assert client.get("/profile", headers=headers).json()["upi_id"] == "sangeeth@okhdfcbank"

    def test_empty_string_clears_it_and_omitting_keeps_it(self, bill_db, make_user):
        _, headers = make_user(upi_id="me@upi")
        assert client.patch("/profile", headers=headers, json={"language": "ml"}).json()["upi_id"] == "me@upi"
        assert client.patch("/profile", headers=headers, json={"upi_id": ""}).json()["upi_id"] is None

    @pytest.mark.parametrize("bad", ["no-at-sign", "@bank", "a@", "has space@upi", "x@1bank"])
    def test_rejects_things_that_are_not_upi_ids(self, bill_db, make_user, bad):
        user_id, headers = make_user(upi_id="keep@upi")
        res = client.patch("/profile", headers=headers, json={"upi_id": bad})
        assert res.status_code == 422
        bill_db.expire_all()
        assert bill_db.get(Profile, user_id).upi_id == "keep@upi"

    def test_one_user_cannot_see_or_change_anothers_upi_id(self, bill_db, make_user):
        a_id, a_headers = make_user(upi_id="a@upi")
        _, b_headers = make_user(upi_id="b@upi")
        client.patch("/profile", headers=b_headers, json={"upi_id": "changed@upi"})
        assert client.get("/profile", headers=a_headers).json()["upi_id"] == "a@upi"
