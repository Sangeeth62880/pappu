"""
Bill split maths (PROJECT_SPEC.md §5b Bill Split, "Split maths").

Pure functions: no LLM, no database. Everything here is Decimal arithmetic so the
shares always add up to the bill total exactly.

Rules
- An item's amount is divided equally among the people assigned to it.
- Tax, service charge, discount and round off are shared in proportion to each
  person's item subtotal (each share is subtotal * total / items total).
- Each friend's share is rounded to the nearest whole rupee. The user's share is
  the bill total minus the friends' shares.
- When the user had nothing, there is no user share: the friend with the largest
  share absorbs the rounding remainder instead.
"""

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import Dict, List, Sequence

ME = "me"
MAX_ITEMS = 40
MAX_PEOPLE = 10  # friends, not counting the user
ROUND_OFF_TOLERANCE = Decimal("1")

_ZERO = Decimal("0")
_RUPEE = Decimal("1")


class SplitError(ValueError):
    """A bill that cannot be split yet. `code` is stable; `detail` carries what is wrong."""

    def __init__(self, code: str, message: str, detail=None):
        super().__init__(message)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class SplitItem:
    position: int
    amount: Decimal
    people: Sequence[str] = field(default_factory=tuple)  # "me" or a friend's name; empty = nobody yet


@dataclass(frozen=True)
class SplitResult:
    shares: Dict[str, Decimal]        # ordered: "me" first when the user has a share, then friends
    item_subtotals: Dict[str, Decimal]  # each person's items before charges, unrounded


def _dec(value) -> Decimal:
    return value if isinstance(value, Decimal) else Decimal(str(value))


def items_total(items: Sequence[SplitItem]) -> Decimal:
    return sum((_dec(i.amount) for i in items), _ZERO)


def bill_difference(items: Sequence[SplitItem], tax, service_charge, discount, total) -> Decimal:
    """Bill total minus what the items and charges come to. Positive = the items come to less."""
    computed = items_total(items) + _dec(tax) + _dec(service_charge) - _dec(discount)
    return _dec(total) - computed


def adds_up(items: Sequence[SplitItem], tax, service_charge, discount, total) -> bool:
    """True when items and charges match the total, allowing up to one rupee of round off."""
    return abs(bill_difference(items, tax, service_charge, discount, total)) <= ROUND_OFF_TOLERANCE


def unassigned_positions(items: Sequence[SplitItem]) -> List[int]:
    return [i.position for i in items if not i.people]


def _unique(people: Sequence[str]) -> List[str]:
    seen, out = set(), []
    for p in people:
        if p not in seen:
            seen.add(p)
            out.append(p)
    return out


def compute_shares(items: Sequence[SplitItem], tax, service_charge, discount, total) -> SplitResult:
    """
    Splits a bill. Raises SplitError when the bill is empty, too big, does not add up,
    or still has an item nobody is assigned to.
    """
    total = _dec(total)
    if not items:
        raise SplitError("no_items", "The bill has no items.")
    if len(items) > MAX_ITEMS:
        raise SplitError("too_many_items", f"A bill can have at most {MAX_ITEMS} items.")
    if total <= _ZERO:
        raise SplitError("bad_total", "The bill total must be more than zero.")
    if any(_dec(i.amount) <= _ZERO for i in items):
        raise SplitError("bad_item_amount", "Every item needs an amount above zero.")

    difference = bill_difference(items, tax, service_charge, discount, total)
    if abs(difference) > ROUND_OFF_TOLERANCE:
        raise SplitError("does_not_add_up", "The items and charges do not add up to the total.", difference)

    missing = unassigned_positions(items)
    if missing:
        raise SplitError("unassigned_items", "Some items are not assigned to anyone.", missing)

    subtotals: Dict[str, Decimal] = {}
    for item in items:
        people = _unique(item.people)
        each = _dec(item.amount) / len(people)
        for person in people:
            subtotals[person] = subtotals.get(person, _ZERO) + each

    friends = [p for p in subtotals if p != ME]
    if len(friends) > MAX_PEOPLE:
        raise SplitError("too_many_people", f"A bill can be split with at most {MAX_PEOPLE} people.")

    base = items_total(items)
    friend_shares = {
        p: (subtotals[p] * total / base).quantize(_RUPEE, rounding=ROUND_HALF_UP) for p in friends
    }
    remainder = total - sum(friend_shares.values(), _ZERO)

    shares: Dict[str, Decimal] = {}
    if ME in subtotals:
        if remainder < _ZERO:
            # Rounding the friends up left less than nothing for the user. Take it back from the
            # largest friend share so nobody ends up with a negative amount.
            largest = max(friends, key=lambda p: (friend_shares[p], -friends.index(p)))
            friend_shares[largest] += remainder
            remainder = _ZERO
        shares[ME] = remainder
    elif friends:
        largest = max(friends, key=lambda p: (friend_shares[p], -friends.index(p)))
        friend_shares[largest] += remainder
    shares.update(friend_shares)

    return SplitResult(shares=shares, item_subtotals=subtotals)
