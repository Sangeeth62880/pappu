"""
Pappu Assistant v2 Plan Schema.

Defines the contract for the v2 LLM planner output.
All planner decisions are represented as a PlanV2 with one or more ops.
"""

from typing import List, Optional, Literal, Union, Dict, Any, Annotated
from pydantic import BaseModel, Field, model_validator


def direction_to_type(direction: str) -> str:
    """
    Direction maps to type in one place:
    sent maps to expense.
    received maps to income.
    """
    if direction == "sent":
        return "expense"
    if direction == "received":
        return "income"
    raise ValueError(f"Invalid direction: {direction}. Expected 'sent' or 'received'.")


class Selector(BaseModel):
    """
    Criteria used by edit, delete, and query operations to identify target transactions.
    """
    contact: Optional[str] = None
    category: Optional[str] = None
    direction: Optional[Literal["sent", "received"]] = None
    amount: Optional[Union[float, int]] = None
    amount_min: Optional[Union[float, int]] = None
    amount_max: Optional[Union[float, int]] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    recency: Optional[Literal["latest", "earliest"]] = None
    nth: Optional[int] = None
    ref: Optional[Literal["last_touched"]] = None
    text: Optional[str] = None
    limit: Optional[int] = None


class AddOp(BaseModel):
    op: Literal["add"] = "add"
    kind: Literal["expense", "income", "person"]
    amount: Union[float, int]
    direction: Optional[Literal["sent", "received"]] = None
    contact: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def validate_person_direction(self) -> "AddOp":
        if self.kind == "person" and not self.direction:
            raise ValueError("Person transactions require direction ('sent' or 'received').")
        return self


class EditOp(BaseModel):
    op: Literal["edit"] = "edit"
    selector: Selector
    patch: Dict[str, Any]


class DeleteOp(BaseModel):
    op: Literal["delete"] = "delete"
    selector: Selector


class QueryOp(BaseModel):
    op: Literal["query"] = "query"
    query_kind: Literal["balances", "sum", "list", "count", "biggest", "compare"]
    selector: Selector = Field(default_factory=Selector)
    compare_to: Optional[Selector] = None


class UndoOp(BaseModel):
    op: Literal["undo"] = "undo"
    ref: Optional[str] = None


class AnswerPendingOp(BaseModel):
    op: Literal["answer_pending"] = "answer_pending"
    value: Any


class ClarifyOp(BaseModel):
    op: Literal["clarify"] = "clarify"
    question: str
    missing: Optional[List[str]] = None


class ChatOp(BaseModel):
    op: Literal["chat"] = "chat"
    message: Optional[str] = None


OpType = Annotated[
    Union[AddOp, EditOp, DeleteOp, QueryOp, UndoOp, AnswerPendingOp, ClarifyOp, ChatOp],
    Field(discriminator="op"),
]


class PlanV2(BaseModel):
    ops: List[OpType]
    reasoning: Optional[str] = None
