"""Chat session REST API — Redis-backed lightweight session persistence."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from services.chat_session_cache import get_session, set_session, delete_session, append_message

router = APIRouter(prefix="/api/v1/chat/sessions", tags=["chat-sessions"])


class SessionMessage(BaseModel):
    id: str
    role: str
    content: str
    timestamp: int = 0


class SessionData(BaseModel):
    id: str = ""
    title: str = "新会话"
    messages: list[SessionMessage] = Field(default_factory=list)
    updatedAt: int = 0


@router.get("/{session_id}")
def get_chat_session(session_id: str):
    """Retrieve a chat session by ID."""
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"success": True, "data": session}


@router.post("/{session_id}")
def save_chat_session(session_id: str, body: SessionData):
    """Save or update a chat session."""
    data = body.model_dump()
    data["id"] = session_id
    ok = set_session(session_id, data)
    return {"success": ok, "sessionId": session_id}


@router.delete("/{session_id}")
def remove_chat_session(session_id: str):
    """Delete a chat session."""
    ok = delete_session(session_id)
    return {"success": ok}


@router.post("/{session_id}/messages")
def add_chat_message(session_id: str, body: SessionMessage):
    """Append a message to an existing session (auto-creates if missing)."""
    result = append_message(session_id, body.model_dump())
    if result is None:
        raise HTTPException(status_code=500, detail="Failed to append message")
    return {"success": True, "data": result}
