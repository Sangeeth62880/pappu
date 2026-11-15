import uuid
from typing import Optional, Any, List, Literal, Union
from pydantic import BaseModel, Field


class ChatMessageCreate(BaseModel):
    role: Literal["user", "assistant"] = Field(..., description="Sender role: 'user' or 'assistant'")
    text: str = Field(..., min_length=1, max_length=8000, description="Message text")
    payload: Optional[Union[dict, list, str]] = None


class ChatMessageItem(BaseModel):
    id: str
    user_id: str
    role: str
    text: str
    payload: Optional[Union[dict, list, str]] = None
    created_at: str


class ChatHistoryResponse(BaseModel):
    messages: List[ChatMessageItem]
    total: int
