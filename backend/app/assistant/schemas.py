"""
Pappu Assistant v2 Plan and Action Schemas.

Defines the contract for the v2 LLM planner output.
All planner decisions are represented as a Plan with up to 5 actions.
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


PeriodLiteral = Literal[
    "today",
    "yesterday",
    "this_week",
    "last_week",
    "this_month",
    "last_month",
    "last_7_days",
    "last_30_days",
    "this_year",
]


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
    period: Optional[PeriodLiteral] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    recency: Optional[Literal["latest", "earliest"]] = None
    nth: Optional[int] = None
    ref: Optional[Literal["last_touched"]] = None
    text: Optional[str] = None
    limit: Optional[int] = None


class AddAction(BaseModel):
    op: Literal["add"] = "add"
    kind: Literal["expense", "income", "person"]
    amount: Union[float, int]
    direction: Optional[Literal["sent", "received"]] = None
    contact: Optional[str] = None
    category: Optional[str] = None
    date: Optional[str] = None
    description: Optional[str] = None

    @model_validator(mode="after")
    def validate_add_action(self) -> "AddAction":
        if self.amount <= 0:
            raise ValueError("Amount must be greater than 0.")
        if self.kind == "person":
            if not self.contact or not self.contact.strip():
                raise ValueError("Person transactions require a non-empty contact.")
            if not self.direction:
                raise ValueError("Person transactions require direction ('sent' or 'received').")
        return self


class EditAction(BaseModel):
    op: Literal["edit"] = "edit"
    selector: Selector
    patch: Dict[str, Any]

    @model_validator(mode="after")
    def validate_edit_action(self) -> "EditAction":
        if not self.patch:
            raise ValueError("Edit action requires non-empty patch fields.")
        return self


class DeleteAction(BaseModel):
    op: Literal["delete"] = "delete"
    selector: Selector


class QueryAction(BaseModel):
    op: Literal["query"] = "query"
    query_kind: Literal["balances", "sum", "list", "count", "biggest", "compare", "category_breakdown"]
    selector: Selector = Field(default_factory=Selector)
    compare_to: Optional[Selector] = None
    balance_side: Optional[Literal["owed_to_me", "i_owe", "all"]] = None


class UndoActionOp(BaseModel):
    op: Literal["undo"] = "undo"
    ref: Optional[str] = None


class AnswerPendingAction(BaseModel):
    op: Literal["answer_pending"] = "answer_pending"
    value: Any


class ClarifyAction(BaseModel):
    op: Literal["clarify"] = "clarify"
    question: str
    missing_fields: Optional[List[str]] = Field(default=None)

    @model_validator(mode="before")
    @classmethod
    def sync_missing_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "missing" in data and "missing_fields" not in data:
                data["missing_fields"] = data["missing"]
            elif "missing_fields" in data and "missing" not in data:
                data["missing"] = data["missing_fields"]
        return data

    @property
    def missing(self) -> Optional[List[str]]:
        return self.missing_fields


class ChatAction(BaseModel):
    op: Literal["chat"] = "chat"
    kind: Literal["greeting", "help", "off_topic", "unsupported", "unsupported_bulk"] = "off_topic"
    message: Optional[str] = None


Action = Annotated[
    Union[
        AddAction,
        EditAction,
        DeleteAction,
        QueryAction,
        UndoActionOp,
        AnswerPendingAction,
        ClarifyAction,
        ChatAction,
    ],
    Field(discriminator="op"),
]


class Plan(BaseModel):
    actions: List[Action] = Field(default_factory=list, min_length=1, max_length=5)
    reasoning: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def populate_actions_and_ops(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "ops" in data and "actions" not in data:
                data["actions"] = data["ops"]
            elif "actions" in data and "ops" not in data:
                data["ops"] = data["actions"]
        return data

    @property
    def ops(self) -> List[Action]:
        return self.actions

    def model_dump(self, *args, **kwargs) -> Dict[str, Any]:
        d = super().model_dump(*args, **kwargs)
        if "actions" in d and "ops" not in d:
            d["ops"] = d["actions"]
        return d


# Alias for backward compatibility
PlanV2 = Plan
AddOp = AddAction
EditOp = EditAction
DeleteOp = DeleteAction
QueryOp = QueryAction
UndoOp = UndoActionOp
AnswerPendingOp = AnswerPendingAction
ClarifyOp = ClarifyAction
ChatOp = ChatAction
OpType = Action


class PendingAnswerRequest(BaseModel):
    """
    Request body for POST /assistant/pending/{id}/answer.
    """
    answer: str
    index: Optional[int] = None


class PendingSummary(BaseModel):
    """
    Client-facing summary of an active pending item awaiting user resolution.
    """
    id: str
    kind: Literal["confirm", "disambiguate", "contact_confirm", "future_date"]
    question: str
    candidates: Optional[List[Any]] = None
    expires_at: Optional[str] = None


class AssistantResponse(BaseModel):
    """
    Unified response shape returned by assistant endpoints.
    """
    reply_text: str
    spoken_text: str
    language: str = "en"
    results: List[Dict[str, Any]] = Field(default_factory=list)
    pending: Optional[PendingSummary] = None
    changed: bool = False


class AssistantMessageRequest(BaseModel):
    """
    Request body for POST /assistant/message.
    """
    text: str
    input: Literal["typed", "voice"] = "typed"
    client_msg_id: Optional[str] = None
