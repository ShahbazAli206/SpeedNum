# SpeedNum — Migration Procedure

Two distinct kinds of migration are covered here. Don't confuse them:

1. **[Moving to a different VPS/hosting provider](#moving-to-a-different-vpsprovider)** — the
   application is already portable; this is the procedure for when you actually do it.
2. **[Supabase → VPS cutover status](#supabase--vps-cutover-status)** — where the *original*
   Supabase-to-VPS migration currently stands, and what's left before Supabase can be retired.

---

## Moving to a different VPS/provider

Nothing in this codebase depends on Hostinger specifically — no hardcoded IP, no
Hostinger-only API call, no filesystem path that only makes sense on this one host. Moving
means: stand up the same four Docker services somewhere else, restore data into them, point
DNS at the new IP, verify, then decommission the old host.

### Procedure

```
Old VPS                                    New VPS
   │                                           │
   │ 1. Fresh backup (verified — see           │
   │    BACKUP_AND_RESTORE.md)                 │
   │                                           │
   │ 2. Install Docker + Docker Compose ───────►
   │                                           │
   │ 3. Install/configure Caddy (or reuse an   │
   │    existing instance) with a `web`        │
   │    Docker network ────────────────────────►
   │                                           │
   │ 4. Clone the repo, copy `.env`/`api.env`  │
   │    across (still gitignored — transfer    │
   │    out of band, e.g. `scp`, never via git)─►
   │                                           │
   │ 5. Copy backup files across (scp/rsync) ──►
   │                                           │
   │ 6. `docker compose up -d` (postgres/minio │
   │    /api come up against EMPTY data first) │
   │                                           │
   │ 7. Restore Postgres: gunzip the backup    │
   │    into the new postgres container        │
   │    directly (not through the --live       │
   │    verify-first ceremony — this IS the    │
   │    ceremony, on a database with nothing    │
   │    to lose yet):                          │
   │      gunzip -c postgres-<stamp>.sql.gz \  │
   │        | docker compose exec -T postgres \│
   │          psql -U "$POSTGRES_USER" \       │
   │          -d "$POSTGRES_DB"                │
   │                                           │
   │ 8. Restore MinIO: extract storage-<stamp> │
   │    .tar.gz directly into                  │
   │    /home/deploy/data/speednum/minio        │
   │    BEFORE first starting the minio        │
   │    service (or stop it first if already   │
   │    started against empty data)             │
   │                                           │
   │ 9. `docker compose run --rm migrate       │
   │    status` — confirm "up to date", no     │
   │    surprises                               │
   │                                           │
   │ 10. Update S3_PUBLIC_ENDPOINT_URL in      │
   │     api.env to the new hostname (presigned│
   │     URLs are signed for a specific host —  │
   │     see SECURITY.md/storage_s3.py)         │
   │                                           │
   │ 11. Add the new site block to Caddy       │
   │     (deploy/Caddyfile.example, same        │
   │     pattern — new hostname, or reuse the   │
   │     old one once DNS moves)                │
   │                                           │
   │ 12. Verify EVERYTHING against a staging    │
   │     hostname first — health, migrations,   │
   │     a real presigned upload/download round │
   │     trip, CORS from the actual Vercel      │
   │     origin — before touching production    │
   │     DNS. See DEPLOYMENT.md's verification   │
   │     steps; run them all again here.        │
   │                                           │
   │ 13. Cut DNS over (api.spidnums.com A       │
   │     record → new IP). Keep the old VPS      │
   │     running and reachable until the new     │
   │     one has been live and healthy for a     │
   │     real observation window — this is the   │
   │     rollback path (see below), not just a   │
   │     formality.                              │
   │                                           │
   │ 14. Once confident: decommission the old    │
   │     VPS. Not before.                        │
```

### Rollback (if the new VPS turns out to have a problem)

Revert the DNS record back to the old VPS's IP. Because step 13 above keeps the old VPS running
and untouched until confidence is established, this is a plain DNS revert, not a data-recovery
operation — the old VPS's Postgres/MinIO were never modified.

### What needs to change per-migration (and what doesn't)

| Changes | Doesn't change |
|---|---|
| `S3_PUBLIC_ENDPOINT_URL` (new hostname) | Application code — nothing |
| Caddy site block (new/reused hostname) | Docker Compose structure |
| DNS A record | Postgres schema/migrations |
| `.env`/`api.env` secrets (rotate on move — don't reuse across hosts indefinitely) | The MinIO bucket layout / storage path scheme |
| `NEXT_PUBLIC_API_URL` on Vercel, if the hostname changes | Supabase Auth configuration (unaffected by where Postgres/Storage live) |

---

## Supabase → VPS cutover status

This is the *original* migration this branch implements — moving Postgres and Storage off
Supabase onto this VPS, while deliberately keeping Supabase Auth (see `SECURITY.md`'s
"Authentication decision"). Current state:

| Component | Status |
|---|---|
| Postgres | Portable schema verified on a fresh VPS Postgres 16. **Production data has not been migrated** — Supabase's actual project data was never read, exported, or touched this session (no credentials available, and doing so is explicitly an approval-gated action regardless). |
| Storage | MinIO deployed and verified (presigned round-trip). **No production documents migrated** — same reasoning as above. |
| Auth | Unchanged — still Supabase, by deliberate decision, not as a temporary stopgap. |

### If/when a real production data migration happens

This is **not** covered by this document as a "just run it" procedure, because it is
explicitly one of the actions requiring owner approval before it happens (see the
architecture brief's approval boundary — production data migration, and especially the DNS
cutover that would follow it, are both listed there). When approved, the shape of it:

1. Verified backup of Supabase Postgres (`pg_dump` against the Supabase connection string)
   **and** Supabase Storage (enumerate + download every object) — both kept, neither deleted,
   until the new system has been fully validated.
2. Import the Postgres dump into VPS Postgres; verify table/row counts, foreign keys, and
   `schema_migrations` state match expectations.
3. Upload every Storage object into MinIO under the same `{tenant}/{client}/{uuid}-{name}`
   paths the `documents` table's `storage_path` column already points at — no path changes,
   since the schema doesn't change.
4. Verify checksums where practical.
5. Point `DATABASE_URL`/`STORAGE_PROVIDER` at the VPS (already the default in this branch's
   `api.env` — this step is really "stop overriding it back to Supabase," if a rollback config
   was in place during validation).
6. Smoke-test the full application against real data before considering Supabase's copies
   disposable.
7. Only after a real validation period, and only with explicit approval, retire the Supabase
   database/storage resources — not delete them at the first sign the new system looks fine.

Until that approval and that data migration happen, Supabase Postgres/Storage remain the
**actual source of truth for any existing production data** — this branch's VPS deployment is
a parallel, freshly-migrated, currently-empty environment proven to work structurally, not yet
a replacement for live data.
