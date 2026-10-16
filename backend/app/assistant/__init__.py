"""
Pappu Assistant v2 core package.
"""

from app.assistant.schemas import (
    Plan,
    PlanV2,
    Action,
    Selector,
    AddAction,
    EditAction,
    DeleteAction,
    QueryAction,
    UndoActionOp,
    AnswerPendingAction,
    ClarifyAction,
    ChatAction,
)
from app.assistant.context import AssistantContext, load_assistant_context
from app.assistant.planner import AssistantPlanner, check_fast_path
from app.assistant.resolver import resolve, ResolveResult
from app.assistant.last_touched import get_last_touched_id

from app.assistant.pending import (
    create_pending,
    get_active_pending,
    get_pending_by_id,
    supersede_pending,
    handle_answer_pending,
)
from app.assistant.contacts import (
    resolve_contact,
    create_contact,
    add_alias_to_contact,
    ContactResolution,
)

__all__ = [
    "Plan",
    "PlanV2",
    "Action",
    "Selector",
    "AddAction",
    "EditAction",
    "DeleteAction",
    "QueryAction",
    "UndoActionOp",
    "AnswerPendingAction",
    "ClarifyAction",
    "ChatAction",
    "AssistantContext",
    "load_assistant_context",
    "AssistantPlanner",
    "check_fast_path",
    "resolve",
    "ResolveResult",
    "get_last_touched_id",
    "create_pending",
    "get_active_pending",
    "get_pending_by_id",
    "supersede_pending",
    "handle_answer_pending",
    "resolve_contact",
    "create_contact",
    "add_alias_to_contact",
    "ContactResolution",
]
