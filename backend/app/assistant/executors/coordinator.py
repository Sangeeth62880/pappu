"""
Execution coordinator for Pappu Assistant v2 operations.

Dispatches operations to specialized executors with a shared batch_id.
Enforces failure isolation: a failure in one operation never aborts sibling operations.
"""

import uuid
from typing import List, Optional
from sqlalchemy.orm import Session

from app.assistant.schemas import PlanV2, OpType, AddOp, EditOp, DeleteOp, QueryOp, UndoOp
from app.assistant.executors.base import ActionResult
from app.assistant.executors.add import execute_add
from app.assistant.executors.edit import execute_edit
from app.assistant.executors.delete import execute_delete
from app.assistant.executors.query import execute_query
from app.assistant.executors.undo import execute_undo


def execute_ops(
    db: Session,
    user_id: uuid.UUID,
    ops: List[OpType],
    last_touched_id: Optional[uuid.UUID] = None,
    confirmed_deletes: bool = False,
    batch_id: Optional[uuid.UUID] = None,
) -> List[ActionResult]:
    """
    Executes a list of operations for user_id with a shared batch_id.
    Isolates failures across actions.
    """
    if batch_id is None:
        batch_id = uuid.uuid4()

    results: List[ActionResult] = []

    for op in ops:
        try:
            if isinstance(op, AddOp) or getattr(op, "op", None) == "add":
                res = execute_add(db, user_id, op, batch_id)
            elif isinstance(op, EditOp) or getattr(op, "op", None) == "edit":
                res = execute_edit(db, user_id, op, batch_id, last_touched_id)
            elif isinstance(op, DeleteOp) or getattr(op, "op", None) == "delete":
                res = execute_delete(
                    db,
                    user_id,
                    op,
                    batch_id,
                    last_touched_id,
                    confirmed=confirmed_deletes,
                )
            elif isinstance(op, QueryOp) or getattr(op, "op", None) == "query":
                res = execute_query(db, user_id, op, last_touched_id)
            elif isinstance(op, UndoOp) or getattr(op, "op", None) == "undo":
                res = execute_undo(db, user_id, op)
            else:
                res = ActionResult(
                    ok=False,
                    action=getattr(op, "op", "unknown"),
                    error=f"Unsupported operation type: {type(op)}",
                )
            results.append(res)
        except Exception as e:
            db.rollback()
            results.append(
                ActionResult(
                    ok=False,
                    action=getattr(op, "op", "unknown"),
                    error=str(e),
                )
            )

    return results
