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
    # Optional extra allowance for origins that cannot be listed literally —
    # in practice Vercel preview deployments, whose hostname carries a build
    # hash. Empty by default: this used to be a hardcoded `https://.*\.vercel\.app`,
    # which allowed *anyone's* Vercel project to call the API, not just ours.
    # Set it to your own project's pattern, e.g.
    #   CORS_ORIGIN_REGEX=https://speed-num[a-z0-9-]*\.vercel\.app
    cors_origin_regex: str = Field(default="", alias="CORS_ORIGIN_REGEX")

    # --- Email ----------------------------------------------------------------
    # Two transports, because the two hosts this app has targeted want different
    # ones. Resend's HTTPS API needs no outbound mail ports, which is the only
    # thing that works on a PaaS. SMTP lets a VPS send through the mailbox that
    # already exists on the firm's own domain — on Hostinger that is
    # smtp.hostinger.com, and no third-party API key is involved.
    #
    # "auto" resolves to resend when its key is set, then smtp when a host is
    # set, then "none" — which logs the message instead of sending it, so
    # development and a half-configured deploy still work.
    email_provider: str = Field(default="auto", alias="EMAIL_PROVIDER")
    resend_api_key: str = Field(default="", alias="RESEND_API_KEY")

    smtp_host: str = Field(default="", alias="SMTP_HOST")
    smtp_port: int = Field(default=587, ge=1, le=65535, alias="SMTP_PORT")
    smtp_username: str = Field(default="", alias="SMTP_USERNAME")
    smtp_password: str = Field(default="", alias="SMTP_PASSWORD")
    # Implicit TLS from the first byte (port 465) versus upgrading a plaintext
    # connection (port 587). Left unset the port decides, which is right for
    # every mainstream provider including Hostinger; set it only to override.
    smtp_ssl: bool | None = Field(default=None, alias="SMTP_SSL")
    smtp_timeout: int = Field(default=20, ge=1, le=120, alias="SMTP_TIMEOUT")

    # The envelope sender. The default is Resend's shared sandbox domain, which
    # only ever delivers to the Resend account owner's own address — fine for a
    # smoke test, silently useless for real clients. `email_sender_domain`
    # below is what the startup check and /admin/email/status read to say so.
    email_from: str = Field(default="SpeedNum <onboarding@resend.dev>", alias="EMAIL_FROM")
    # Where replies land when the caller has nobody more specific to name. The
    # reminder digest has no human sender, for instance.
    email_reply_to: str = Field(default="", alias="EMAIL_REPLY_TO")

    # --- Reminder scheduler ----------------------------------------------------
    # An in-process daily sweep (services/scheduler.py). Turn it off if you drive
    # POST /admin/reminders/sweep from an external cron, or if you run more than
    # one API replica and only want one of them sweeping.
    reminder_scheduler_enabled: bool = Field(default=True, alias="REMINDER_SCHEDULER_ENABLED")
    # Hour of day, UTC. Early morning means the digest is waiting when the firm
    # opens rather than landing mid-afternoon.
    reminder_sweep_hour: int = Field(default=6, ge=0, le=23, alias="REMINDER_SWEEP_HOUR")
    # Sweep once shortly after boot as well. Useful on a fresh deploy so the
    # board is populated without waiting for tomorrow.
    reminder_sweep_on_start: bool = Field(default=True, alias="REMINDER_SWEEP_ON_START")
    reminder_sweep_delay_seconds: int = Field(
        default=30, ge=0, alias="REMINDER_SWEEP_DELAY_SECONDS"
    )

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
    def cors_is_wildcard(self) -> bool:
        return "*" in self.cors_origin_list

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in {"production", "prod"}

    @property
    def resolved_email_provider(self) -> str:
        """Which transport send_email will actually use: resend | smtp | none.

        An explicit EMAIL_PROVIDER is honoured even when its credentials are
        missing, so a typo in SMTP_HOST surfaces as a failed send naming the
        provider the operator asked for, rather than silently falling through to
        a different transport and reporting success.
        """
        choice = (self.email_provider or "auto").strip().lower()
        if choice in {"resend", "smtp", "none"}:
            return choice
        if self.resend_api_key:
            return "resend"
        if self.smtp_host:
            return "smtp"
        return "none"

    @property
    def smtp_use_ssl(self) -> bool:
        """Implicit TLS (SMTPS). Explicit setting wins; otherwise port 465 is
        the long-standing convention for it and everything else is STARTTLS."""
        if self.smtp_ssl is not None:
            return self.smtp_ssl
        return self.smtp_port == 465

    @property
    def email_sender_address(self) -> str:
        """The bare address out of EMAIL_FROM, with any display name stripped:
        `SpeedNum <no-reply@firm.ca>` -> `no-reply@firm.ca`."""
        raw = (self.email_from or "").strip()
        if "<" in raw and ">" in raw:
            return raw[raw.rindex("<") + 1 : raw.rindex(">")].strip()
        return raw

    @property
    def email_sender_domain(self) -> str:
        address = self.email_sender_address
        return address.rsplit("@", 1)[-1].lower() if "@" in address else ""

    @property
    def email_is_configured(self) -> bool:
        return self.resolved_email_provider != "none"

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
