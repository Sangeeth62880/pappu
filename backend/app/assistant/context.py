"""
Context loader for Pappu Assistant v2.

Loads user context in parallel:
1. Today's date and weekday in IST.
2. Up to 30 recent contacts with aliases.
3. Last 3 chat_messages turns (up to 6 messages).
4. Last touched transaction.
5. Active pending item summary if any.
Returns a typed AssistantContext object and a token estimate.
"""

import uuid
from concurrent.futures import ThreadPoolExecutor
from typing import List, Optional, Dict, Any, Callable
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, sessionmaker

from app.database import SessionLocal
from app.models.contact import Contact
from app.models.chat_message import ChatMessage
from app.models.transaction import Transaction
from app.models.pending_action import PendingAction
from app.services.date_utils import get_current_ist_datetime
from app.assistant.last_touched import get_last_touched_id


class ContactContextItem(BaseModel):
    id: str
    name: str
    aliases: List[str] = Field(default_factory=list)


class ChatTurnContextItem(BaseModel):
    role: str
    text: str


class LastTouchedContextItem(BaseModel):
    id: str
    amount: float
    category: Optional[str] = None
    contact: Optional[str] = None
    date: str
    description: Optional[str] = None


class PendingItemContextItem(BaseModel):
    id: str
    kind: str
    plan: Optional[Any] = None
    candidates: Optional[Any] = None
    created_at: Optional[str] = None


class AssistantContext(BaseModel):
    today: str
    weekday: str
    contacts: List[ContactContextItem] = Field(default_factory=list)
    last_3_chat_turns: List[ChatTurnContextItem] = Field(default_factory=list)
    last_touched_transaction: Optional[LastTouchedContextItem] = None
    pending_item: Optional[PendingItemContextItem] = None
    token_estimate: int = 0

    def to_dict_for_prompt(self) -> Dict[str, Any]:
        return {
            "today": self.today,
            "weekday": self.weekday,
            "contacts": [c.model_dump() for c in self.contacts],
            "last_3_chat_turns": [t.model_dump() for t in self.last_3_chat_turns],
            "last_touched_transaction": (
                self.last_touched_transaction.model_dump()
                if self.last_touched_transaction
                else None
            ),
            "pending_item": (
                self.pending_item.model_dump()
                if self.pending_item
                else None
            ),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AssistantContext":
        contacts = [
            ContactContextItem(
                id=str(c.get("id", "")),
                name=c.get("name", ""),
                aliases=c.get("aliases", []),
            )
            for c in data.get("contacts", [])
        ]
        chat_turns = [
            ChatTurnContextItem(
                role=t.get("role", "user"),
                text=t.get("text", ""),
            )
            for t in data.get("last_3_chat_turns", [])
        ]
        lt_data = data.get("last_touched_transaction")
        last_touched = (
            LastTouchedContextItem(
                id=str(lt_data.get("id", "")),
                amount=float(lt_data.get("amount", 0)),
                category=lt_data.get("category"),
                contact=lt_data.get("contact"),
                date=str(lt_data.get("txn_date", "") or lt_data.get("date", "")),
                description=lt_data.get("description"),
            )
            if lt_data
            else None
        )
        p_data = data.get("pending_item")
        pending = (
            PendingItemContextItem(
                id=str(p_data.get("id", "p1")),
                kind=p_data.get("type", p_data.get("kind", "confirm")),
                plan=p_data.get("plan"),
                candidates=p_data.get("candidates") or p_data.get("contacts"),
                created_at=p_data.get("created_at"),
            )
            if p_data
            else None
        )
        ctx = cls(
            today=data.get("today", "2026-10-14"),
            weekday=data.get("weekday", "Wednesday"),
            contacts=contacts,
            last_3_chat_turns=chat_turns,
            last_touched_transaction=last_touched,
            pending_item=pending,
        )
        ctx.token_estimate = _estimate_tokens(str(ctx.to_dict_for_prompt()))
        return ctx


def _estimate_tokens(text: str) -> int:
    """Heuristic token estimate based on character and word count."""
    if not text:
        return 0
    # ~4 characters per token heuristic
    return max(1, len(text) // 4)


def load_assistant_context(
    user_id: uuid.UUID,
    db: Optional[Session] = None,
    session_factory: Optional[Callable[[], Session]] = None,
    current_message_text: Optional[str] = None,
) -> AssistantContext:
    """
    Loads assistant context in parallel using threads.
    Guarantees user isolation by filtering every query by user_id.
    Excludes the current message from last_3_chat_turns.
    """
    ist_now = get_current_ist_datetime()
    today_str = ist_now.date().isoformat()
    weekday_str = ist_now.strftime("%A")

    if session_factory is None:
        if db is not None:
            bind = db.get_bind()
            session_factory = sessionmaker(bind=bind)
        else:
            session_factory = SessionLocal

    def fetch_contacts() -> List[ContactContextItem]:
        with session_factory() as s:
            rows = (
                s.query(Contact)
                .filter(Contact.user_id == user_id)
                .order_by(Contact.created_at.desc())
                .limit(30)
                .all()
            )
            return [
                ContactContextItem(
                    id=str(c.id),
                    name=c.name,
                    aliases=c.aliases or [],
                )
                for c in rows
            ]

    def fetch_chat_turns() -> List[ChatTurnContextItem]:
        with session_factory() as s:
            query = s.query(ChatMessage).filter(ChatMessage.user_id == user_id)
            if current_message_text:
                norm_curr = current_message_text.strip().lower()
                # Exclude any user message matching the current message
                query = query.filter(
                    ~((ChatMessage.role == "user") & (ChatMessage.text == current_message_text))
                )
            rows = (
                query.order_by(ChatMessage.created_at.desc(), ChatMessage.id.desc())
                .limit(10)
                .all()
            )
            chronological = list(reversed(rows))
            # Deduplicate consecutive identical messages
            deduped: List[ChatTurnContextItem] = []
            for msg in chronological:
                if (
                    current_message_text
                    and msg.role == "user"
                    and (msg.text or "").strip().lower() == current_message_text.strip().lower()
                ):
                    continue
                if deduped and deduped[-1].role == msg.role and (deduped[-1].text or "").strip() == (msg.text or "").strip():
                    continue
                deduped.append(ChatTurnContextItem(role=msg.role, text=msg.text))
            return deduped[-6:]

    def fetch_last_touched() -> Optional[LastTouchedContextItem]:
        with session_factory() as s:
            t_id = get_last_touched_id(s, user_id)
            if not t_id:
                return None
            txn = (
                s.query(Transaction)
                .filter(Transaction.id == t_id, Transaction.user_id == user_id)
                .first()
            )
            if not txn:
                return None
            return LastTouchedContextItem(
                id=str(txn.id),
                amount=float(txn.amount),
                category=txn.category.name if txn.category else None,
                contact=txn.contact.name if txn.contact else None,
                date=txn.txn_date.isoformat(),
                description=txn.description,
            )

    def fetch_pending() -> Optional[PendingItemContextItem]:
        with session_factory() as s:
            from app.assistant.pending import get_active_pending
            row = get_active_pending(s, user_id)
            if not row:
                return None
            return PendingItemContextItem(
                id=str(row.id),
                kind=row.kind,
                plan=row.plan_json,
                candidates=row.candidates_json,
                created_at=row.created_at.isoformat() if row.created_at else None,
            )

    # Parallel execution
    with ThreadPoolExecutor(max_workers=4) as executor:
        f_contacts = executor.submit(fetch_contacts)
        f_turns = executor.submit(fetch_chat_turns)
        f_last_touched = executor.submit(fetch_last_touched)
        f_pending = executor.submit(fetch_pending)

        contacts = f_contacts.result()
        chat_turns = f_turns.result()
        last_touched = f_last_touched.result()
        pending_item = f_pending.result()

    context = AssistantContext(
        today=today_str,
        weekday=weekday_str,
        contacts=contacts,
        last_3_chat_turns=chat_turns,
        last_touched_transaction=last_touched,
        pending_item=pending_item,
    )

    # Calculate token estimate
    prompt_str = str(context.to_dict_for_prompt())
    context.token_estimate = _estimate_tokens(prompt_str)

    return context
