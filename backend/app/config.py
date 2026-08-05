"""Runtime configuration, sourced from environment variables / HF Space secrets."""

from __future__ import annotations

from functools import lru_cache

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "SpeedNum API"
    environment: str = Field(default="production", alias="ENVIRONMENT")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    # --- Supabase -------------------------------------------------------------
    # Pooler connection string, e.g.
    #   postgresql://postgres.<ref>:<password>@aws-0-ca-central-1.pooler.supabase.com:6543/postgres
    database_url: str = Field(default="", alias="DATABASE_URL")
    supabase_url: str = Field(default="", alias="SUPABASE_URL")
    supabase_anon_key: str = Field(default="", alias="SUPABASE_ANON_KEY")
    supabase_service_role_key: str = Field(default="", alias="SUPABASE_SERVICE_ROLE_KEY")
    # Legacy projects sign JWTs with a shared secret (HS256). Newer projects use
    # asymmetric keys published at /auth/v1/.well-known/jwks.json — both work.
    supabase_jwt_secret: str = Field(default="", alias="SUPABASE_JWT_SECRET")
    jwt_audience: str = Field(default="authenticated", alias="JWT_AUDIENCE")

    # --- Web ------------------------------------------------------------------
    public_app_url: str = Field(default="http://localhost:3000", alias="PUBLIC_APP_URL")
    cors_origins: str = Field(default="*", alias="CORS_ORIGINS")

    # --- Email (optional; falls back to logging the message) -------------------
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")
    email_from: str = Field(default="SpeedNum <onboarding@resend.dev>", alias="EMAIL_FROM")

    @field_validator("database_url")
    @classmethod
    def _normalise_database_url(cls, value: str) -> str:
        """Accept any of the connection strings Supabase hands out."""
        if not value:
            return value
        for prefix in ("postgresql+asyncpg://", "postgresql://", "postgres://"):
            if value.startswith(prefix):
                return "postgresql+asyncpg://" + value[len(prefix) :]
        return value

    @property
    def cors_origin_list(self) -> list[str]:
        raw = (self.cors_origins or "").strip()
        if not raw or raw == "*":
            return ["*"]
        return [origin.strip().rstrip("/") for origin in raw.split(",") if origin.strip()]

    @property
    def jwks_url(self) -> str:
        return f"{self.supabase_url.rstrip('/')}/auth/v1/.well-known/jwks.json"

    @property
    def is_configured(self) -> bool:
        return bool(self.database_url)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
