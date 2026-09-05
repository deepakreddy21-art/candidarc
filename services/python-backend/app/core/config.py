from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

PRICING_TABLE_VERSION = "candidarc-pricing@v1"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_mode: Literal["demo", "production"] = Field(default="demo", alias="APP_MODE")
    ai_mode: Literal["mock", "live"] = Field(default="mock", alias="AI_MODE")
    service_token: str = Field(default="dev-python-backend-token-change-me", alias="PYTHON_BACKEND_TOKEN")
    host: str = "0.0.0.0"
    port: int = 8090
    log_level: str = "info"

    openai_api_key: str | None = Field(default=None, alias="OPENAI_API_KEY")
    anthropic_api_key: str | None = Field(default=None, alias="ANTHROPIC_API_KEY")

    # Per-role provider keys (optional overrides; fall back to shared keys)
    openai_generation_api_key: str | None = Field(default=None, alias="OPENAI_GENERATION_API_KEY")
    anthropic_audit_api_key: str | None = Field(default=None, alias="ANTHROPIC_AUDIT_API_KEY")
    openai_final_api_key: str | None = Field(default=None, alias="OPENAI_FINAL_API_KEY")

    generation_provider: Literal["openai", "mock"] = Field(default="openai", alias="GENERATION_PROVIDER")
    audit_provider: Literal["anthropic", "mock"] = Field(default="anthropic", alias="AUDIT_PROVIDER")
    final_review_provider: Literal["openai", "mock"] = Field(default="openai", alias="FINAL_REVIEW_PROVIDER")

    openai_generation_model: str = "gpt-4o-mini"
    anthropic_audit_model: str = "claude-sonnet-4-20250514"
    openai_final_model: str = "gpt-4o-mini"
    embedding_provider: Literal["mock", "openai"] = "mock"
    embedding_model: str = "text-embedding-3-small"
    ranker_backend: Literal["hybrid", "cross_encoder"] = "hybrid"
    ranker_artifact_path: str | None = Field(default=None, alias="RANKER_ARTIFACT_PATH")
    ranker_artifact_checksum: str | None = Field(default=None, alias="RANKER_ARTIFACT_CHECKSUM")
    enable_cross_encoder: bool = Field(default=False, alias="ENABLE_CROSS_ENCODER")

    redis_url: str | None = Field(default=None, alias="REDIS_URL")
    idempotency_ttl_seconds: int = Field(default=86_400, ge=60, le=604_800)
    shadow_sample_percent: float = Field(default=0.0, ge=0.0, le=100.0, alias="SHADOW_SAMPLE_PERCENT")
    pricing_table_version: str = Field(default=PRICING_TABLE_VERSION, alias="PRICING_TABLE_VERSION")

    http_timeout_seconds: float = 60.0
    http_max_connections: int = 20
    provider_max_retries: int = Field(default=2, ge=0, le=5)
    schema_version: str = "2026-09-resume-intelligence.v1"

    @field_validator("shadow_sample_percent", mode="before")
    @classmethod
    def _coerce_percent(cls, value: object) -> object:
        return value

    def generation_api_key(self) -> str | None:
        return self.openai_generation_api_key or self.openai_api_key

    def audit_api_key(self) -> str | None:
        return self.anthropic_audit_api_key or self.anthropic_api_key

    def final_review_api_key(self) -> str | None:
        return self.openai_final_api_key or self.openai_api_key

    def token_is_weak(self) -> bool:
        token = self.service_token
        return len(token) < 32 or token.startswith("dev-")

    def idempotency_required(self) -> bool:
        return self.app_mode == "production" or self.ai_mode == "live"

    def ready_errors(self) -> list[str]:
        errors: list[str] = []
        if self.app_mode != "production":
            # Demo may still fail readiness when cross-encoder is misconfigured.
            if self.enable_cross_encoder or self.ranker_backend == "cross_encoder":
                if not self.ranker_artifact_path or not self.ranker_artifact_checksum:
                    errors.append("Cross-encoder configured but RANKER_ARTIFACT_PATH/CHECKSUM missing")
                else:
                    from pathlib import Path

                    path = Path(self.ranker_artifact_path)
                    if not path.is_file():
                        errors.append("Configured ranker artifact file is missing")
            return errors

        if self.ai_mode == "mock":
            errors.append("AI_MODE=mock is forbidden in production")
        if self.token_is_weak():
            errors.append("PYTHON_BACKEND_TOKEN must be >=32 chars and not start with 'dev-'")
        if self.idempotency_required() and not self.redis_url:
            errors.append("REDIS_URL is required when AI_MODE=live or APP_MODE=production")

        if self.generation_provider == "openai" and not self.generation_api_key():
            errors.append("Generation role missing OpenAI API key")
        if self.audit_provider == "anthropic" and not self.audit_api_key():
            errors.append("Audit role missing Anthropic API key")
        if self.final_review_provider == "openai" and not self.final_review_api_key():
            errors.append("Final-review role missing OpenAI API key")

        if self.enable_cross_encoder or self.ranker_backend == "cross_encoder":
            if not self.ranker_artifact_path or not self.ranker_artifact_checksum:
                errors.append("Cross-encoder configured but RANKER_ARTIFACT_PATH/CHECKSUM missing")
            else:
                from pathlib import Path

                path = Path(self.ranker_artifact_path)
                if not path.is_file():
                    errors.append("Configured ranker artifact file is missing")

        return errors


@lru_cache
def get_settings() -> Settings:
    return Settings()
