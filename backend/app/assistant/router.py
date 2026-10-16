"""
Assistant Router module for Pappu Assistant v2.

Re-exports the router from app.routers.assistant for package consistency.
"""

from app.routers.assistant import (
    router,
    handle_assistant_message,
    answer_pending_endpoint,
)

__all__ = ["router", "handle_assistant_message", "answer_pending_endpoint"]
