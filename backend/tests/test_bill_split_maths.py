"""
Bill split maths (Phase 14 task 2): app/services/bill_split.py. Pure logic, no LLM or database.
"""

from decimal import Decimal as D

import pytest

from app.services.bill_split import (
    MAX_ITEMS, MAX_PEOPLE, ME, SplitError, SplitItem, adds_up, bill_difference, compute_shares,
    unassigned_positions,
)

EVERYONE = (ME, "Rahul", "Anu", "Pooja")


def paragon_items():
    """The bill from the approved screens: ₹1,620 of items, 5% GST, 5% service charge, ₹1,782."""
    return [
        SplitItem(1, D("560"), (ME, "Rahul")),          # Chicken Biriyani x2
        SplitItem(2, D("320"), EVERYONE),               # Beef Fry
        SplitItem(3, D("120"), EVERYONE),               # Porotta x6
        SplitItem(4, D("280"), ("Anu",)),               # Fish Curry Meals
        SplitItem(5, D("180"), (ME, "Rahul", "Anu")),   # Lime Soda x3
        SplitItem(6, D("160"), ("Pooja",)),             # Falooda
    ]


def split(items, tax=0, service=0, discount=0, total=None):
    if total is None:
        total = sum(i.amount for i in items) + D(str(tax)) + D(str(service)) - D(str(discount))
    return compute_shares(items, tax, service, discount, total)


class TestComputeShares:
    def test_matches_the_approved_screens(self):
        result = split(paragon_items(), tax=81, service=81, total=1782)
        assert result.shares == {ME: D("495"), "Rahul": D("495"), "Anu": D("495"), "Pooja": D("297")}
        assert result.item_subtotals == {ME: D("450"), "Rahul": D("450"), "Anu": D("450"), "Pooja": D("270")}

    def test_user_share_comes_first(self):
        items = [SplitItem(1, D("100"), ("Rahul",)), SplitItem(2, D("100"), (ME,))]
        assert list(split(items).shares) == [ME, "Rahul"]

    def test_single_item_one_person(self):
        assert split([SplitItem(1, D("250"), (ME,))]).shares == {ME: D("250")}

    def test_item_shared_equally(self):
        result = split([SplitItem(1, D("300"), (ME, "Rahul", "Anu"))])
        assert result.shares == {ME: D("100"), "Rahul": D("100"), "Anu": D("100")}

    def test_charges_follow_what_each_person_had(self):
        items = [SplitItem(1, D("300"), (ME,)), SplitItem(2, D("100"), ("Rahul",))]
        result = split(items, tax=20, service=20)  # 10% on top
        assert result.shares == {ME: D("330"), "Rahul": D("110")}

    def test_discount_lowers_every_share_in_proportion(self):
        items = [SplitItem(1, D("300"), (ME,)), SplitItem(2, D("100"), ("Rahul",))]
        result = split(items, discount=40)
        assert result.shares == {ME: D("270"), "Rahul": D("90")}

    def test_friends_round_to_whole_rupees_and_user_absorbs_the_rest(self):
        result = split([SplitItem(1, D("100"), (ME, "Rahul", "Anu"))])
        assert result.shares == {ME: D("34"), "Rahul": D("33"), "Anu": D("33")}

    def test_paise_in_the_total_land_on_the_user(self):
        items = [SplitItem(1, D("100.50"), (ME, "Rahul"))]
        result = split(items)
        assert result.shares == {ME: D("50.50"), "Rahul": D("50")}

    def test_half_rupee_rounds_up_for_the_friend(self):
        result = split([SplitItem(1, D("101"), (ME, "Rahul"))])
        assert result.shares == {ME: D("50"), "Rahul": D("51")}

    def test_the_same_name_twice_on_an_item_counts_once(self):
        result = split([SplitItem(1, D("200"), ("Rahul", "Rahul", ME))])
        assert result.shares == {ME: D("100"), "Rahul": D("100")}

    def test_round_off_within_one_rupee_is_accepted_and_shared(self):
        items = [SplitItem(1, D("300"), (ME,)), SplitItem(2, D("100.40"), ("Rahul",))]
        result = compute_shares(items, 0, 0, 0, D("400"))  # bill rounded 400.40 down
        assert sum(result.shares.values()) == D("400")
        assert result.shares["Rahul"] == D("100")

    def test_user_who_had_nothing_gets_no_share(self):
        items = [SplitItem(1, D("100"), ("Rahul", "Anu", "Pooja"))]
        result = split(items)
        assert ME not in result.shares
        assert sum(result.shares.values()) == D("100")
        assert sorted(result.shares.values()) == [D("33"), D("33"), D("34")]

    def test_user_share_never_goes_negative(self):
        # The user's exact share is 0.90; nine friends each round 11.01 down, so this stays
        # positive. Flip it: friends at x.5 each round up and would overdraw the user.
        items = [SplitItem(1, D("1"), (ME,))] + [
            SplitItem(n + 2, D("10.5"), (f"F{n}",)) for n in range(4)
        ]
        result = split(items)  # total 43; friends round to 11 each = 44
        assert sum(result.shares.values()) == D("43")
        assert all(v >= 0 for v in result.shares.values())
        assert result.shares[ME] == D("0")

    def test_ten_friends_is_the_limit(self):
        friends = tuple(f"F{n}" for n in range(MAX_PEOPLE))
        result = split([SplitItem(1, D("1100"), (ME,) + friends)])
        assert len(result.shares) == MAX_PEOPLE + 1
        assert sum(result.shares.values()) == D("1100")

        with pytest.raises(SplitError) as err:
            split([SplitItem(1, D("1200"), (ME,) + friends + ("extra",))])
        assert err.value.code == "too_many_people"

    @pytest.mark.parametrize("seed", range(40))
    def test_shares_always_sum_to_the_total(self, seed):
        import random

        rng = random.Random(seed)
        names = [ME] + [f"P{n}" for n in range(rng.randint(1, MAX_PEOPLE))]
        items = [
            SplitItem(n + 1, D(rng.randint(1, 90000)) / 100, tuple(rng.sample(names, rng.randint(1, len(names)))))
            for n in range(rng.randint(1, MAX_ITEMS))
        ]
        base = sum(i.amount for i in items)
        tax = (base * D(rng.choice(["0", "0.05", "0.18"]))).quantize(D("0.01"))
        service = (base * D(rng.choice(["0", "0.05", "0.10"]))).quantize(D("0.01"))
        discount = (base * D(rng.choice(["0", "0", "0.1"]))).quantize(D("0.01"))
        total = base + tax + service - discount

        result = compute_shares(items, tax, service, discount, total)
        assert sum(result.shares.values()) == total
        assert all(v >= 0 for v in result.shares.values())
        for name, amount in result.shares.items():
            if name != ME and ME in result.shares:
                assert amount == amount.to_integral_value()


class TestRejections:
    def test_unassigned_item_blocks_the_split(self):
        items = paragon_items()
        items[4] = SplitItem(5, D("180"), ())
        with pytest.raises(SplitError) as err:
            split(items, tax=81, service=81, total=1782)
        assert err.value.code == "unassigned_items"
        assert err.value.detail == [5]

    def test_mismatch_above_one_rupee_blocks_the_split(self):
        with pytest.raises(SplitError) as err:
            compute_shares(paragon_items(), 81, 81, 0, D("1842"))
        assert err.value.code == "does_not_add_up"
        assert err.value.detail == D("60")

    def test_mismatch_is_reported_before_unassigned_items(self):
        items = [SplitItem(1, D("100"), ())]
        with pytest.raises(SplitError) as err:
            compute_shares(items, 0, 0, 0, D("500"))
        assert err.value.code == "does_not_add_up"

    @pytest.mark.parametrize(
        "items, total, code",
        [
            ([], D("100"), "no_items"),
            ([SplitItem(1, D("100"), (ME,))], D("0"), "bad_total"),
            ([SplitItem(1, D("0"), (ME,))], D("100"), "bad_item_amount"),
            ([SplitItem(1, D("-5"), (ME,))], D("100"), "bad_item_amount"),
            ([SplitItem(n, D("1"), (ME,)) for n in range(1, MAX_ITEMS + 2)], D(MAX_ITEMS + 1), "too_many_items"),
        ],
    )
    def test_bad_bills(self, items, total, code):
        with pytest.raises(SplitError) as err:
            compute_shares(items, 0, 0, 0, total)
        assert err.value.code == code


class TestAddsUp:
    def test_exact_bill_adds_up(self):
        assert adds_up(paragon_items(), 81, 81, 0, 1782)
        assert bill_difference(paragon_items(), 81, 81, 0, 1782) == 0

    @pytest.mark.parametrize("total, ok", [(1783, True), (1781, True), ("1783.01", False), (1780, False)])
    def test_one_rupee_of_round_off_is_allowed(self, total, ok):
        assert adds_up(paragon_items(), 81, 81, 0, D(str(total))) is ok

    def test_difference_is_positive_when_items_come_to_less(self):
        items = paragon_items()
        items[4] = SplitItem(5, D("120"), (ME,))  # Lime Soda misread as 2 x 60
        assert bill_difference(items, 81, 81, 0, 1782) == D("60")

    def test_unassigned_positions_lists_items_with_nobody(self):
        items = [SplitItem(1, D("10"), (ME,)), SplitItem(2, D("10"), ()), SplitItem(3, D("10"), [])]
        assert unassigned_positions(items) == [2, 3]
