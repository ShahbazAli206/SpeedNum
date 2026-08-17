# Runs as a Docker container on any host. The listen port is taken from the
# $PORT env var when present (Render, Cloud Run, etc.) and falls back to 7860
# (Hugging Face Spaces / local) when it is not set. Runs as non-root uid 1000.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN useradd -m -u 1000 user
WORKDIR /app

# pg_dump for services/backup_snapshots.py. The distro's own
# `postgresql-client` package doesn't reliably match Postgres 16, and
# pg_dump must be >= the server's major version or it can misdump newer
# catalogs — so this pulls the matching v16 client from the official PGDG
# apt repo instead. The codename is read from /etc/os-release rather than
# hardcoded: python:3.12-slim's underlying Debian release has changed
# before (bookworm -> trixie) and will again, and a hardcoded codename
# fails closed (apt 404s) rather than silently installing the wrong thing.
# gnupg/curl/ca-certificates are build-time only for adding that repo's
# signing key; nothing here is needed at runtime beyond the client itself.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
       -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
       > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client-16 \
    && apt-get purge -y --auto-remove curl gnupg \
    && rm -rf /var/lib/apt/lists/*

COPY --chown=user:user requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user:user . .

USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

EXPOSE 7860

HEALTHCHECK --interval=60s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','7860'); sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:'+p+'/health', timeout=4).status == 200 else 1)"

# Worker processes. One is right on a 512 MB PaaS instance; a 4-vCPU VPS should
# set WEB_CONCURRENCY=4 to use the box. Each worker runs its own copy of the
# reminder scheduler, which is why services/scheduler.py takes a Postgres
# advisory lock before sweeping — only one of them does the work.
ENV WEB_CONCURRENCY=1

# Shell form so ${PORT} is expanded at runtime; exec keeps uvicorn as PID 1 for signals.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-7860} --workers ${WEB_CONCURRENCY:-1} --proxy-headers --forwarded-allow-ips '*'"]
