from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.core.config import get_settings


async def require_service_token(authorization: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Bearer token required"})
    token = authorization.split(" ", 1)[1].strip()
    if not token or token != settings.service_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail={"code": "UNAUTHORIZED", "message": "Invalid service token"})
