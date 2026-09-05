from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_mode: Literal["demo", "production"] = "demo"
    ai_mode: Literal["mock", "live"] = "mock"
    service_token: str = Field(default="dev-python-backend-token-change-me", alias="PYTHON_BACKEND_TOKEN")
    host: str = "0.0.0.0"
    port: int = 8090
    log_level: str = "info"

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    openai_generation_model: str = "gpt-4o-mini"
    anthropic_audit_model: str = "claude-sonnet-4-20250514"
    openai_final_model: str = "gpt-4o-mini"
    embedding_provider: Literal["mock", "openai"] = "mock"
    embedding_model: str = "text-embedding-3-small"
    ranker_backend: Literal["hybrid", "cross_encoder"] = "hybrid"

    database_url: str | None = None
    http_timeout_seconds: float = 60.0
    http_max_connections: int = 20
    schema_version: str = "2026-09-resume-intelligence.v1"

    def ready_errors(self) -> list[str]:
        errors: list[str] = []
        if self.app_mode == "production":
            if self.ai_mode == "mock":
                errors.append("AI_MODE=mock is forbidden in production")
            if self.service_token.startswith("dev-"):
                errors.append("PYTHON_BACKEND_TOKEN must be set for production")
            if self.ai_mode == "live" and not self.openai_api_key and not self.anthropic_api_key:
                errors.append("At least one live provider API key is required")
        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
