# SpeedNum Desktop

An admin desktop app whose primary job is disaster recovery: sync encrypted backup snapshots
from the VPS to the administrator's own machine, and prove they're actually restorable. It is
**not** a re-implementation of the web admin dashboard — clients, invoices, users, reports,
imports, and settings all still live in the existing Next.js app. See
[`desktop/README.md`](desktop/README.md) for how to run and test it, and
[`BACKUP_ARCHITECTURE.md`](BACKUP_ARCHITECTURE.md) for the backup format/encryption/sync design
this app implements.

## Why Electron, not Tauri

Tauri was the starting preference — smaller binaries, no bundled Chromium, and Rust for the
parts that touch the filesystem and Docker. It was not used because **this development
environment has no Rust or MSVC toolchain**, and installing one non-interactively on Windows
(rustup, several GB of Visual Studio Build Tools, no GUI available for the parts of that
installer that expect one) was impractical within this pass. Electron's toolchain is Node.js,
which was already present and working. This is a concrete practicality constraint of the
environment this was built in, not a judgment that Tauri is the wrong long-term choice — if a
future pass has a working Rust toolchain available, a Tauri rewrite of this same module
boundary (the `src/*.js` files are already framework-agnostic Node modules; only `main.js`,
`preload.js`, and `renderer/` are Electron-specific) is a reasonable next step.

## Architecture

```
SpeedNum Desktop (Electron)
      │ HTTPS only
      ▼
https://test.spidnums.com  (same FastAPI backend every other client uses)
      │
      ├──▶ Postgres   (never touched directly — no Postgres credential ever reaches this app)
      └──▶ MinIO      (never touched directly — only via presigned URLs the backend issues)
```

The desktop app authenticates like any other client (`POST /auth/login`) and only additionally
calls the six superadmin-only `/admin/backups/*` endpoints
(`backend/app/routers/admin_backups.py`). It never receives a Postgres or MinIO admin
credential — see `backend/README.md`'s architecture diagram for how those stay backend-only.

### Module boundary (`desktop/src/`)

| Module | Responsibility | Network/Docker access |
|---|---|---|
| `crypto-envelope.js` | Streaming AES-256-GCM encrypt/decrypt | None |
| `backup-client.js` | The only code that calls the SpeedNum backend | HTTPS to the backend |
| `sync.js` | Orchestrates one sync run (download, verify, encrypt, publish) | Via `backup-client.js` |
| `sync-state.js` | Local JSON state, atomic writes | Local disk only |
| `restore-drill.js` | Restores a decrypted snapshot into disposable Docker containers | Local `docker` CLI |
| `secure-store.js` | Wraps Electron's `safeStorage` (OS keychain/DPAPI) for the refresh token | Local OS keychain |
| `updater.js` | Wraps `electron-updater` — checks/downloads/installs new versions | HTTPS to the update feed |
| `main.js` / `preload.js` / `renderer/` | The Electron shell and its IPC surface | — |

### Security model

- **HTTPS only** to the backend — enforced in `main.js`'s login handler, not just a convention.
- **Superadmin-gated at the app layer too** — the desktop app's own login handler refuses a
  successful backend login if the account isn't `is_superadmin`, on top of the backend already
  enforcing this on every `/admin/backups/*` call. Belt and suspenders: the backend is the real
  boundary, but failing fast in the app gives a clearer error than a string of 403s.
- **`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`** — the renderer (the
  HTML/CSS/JS in `renderer/`) never has direct Node or Electron API access. `preload.js` exposes
  a fixed, named set of IPC calls via `contextBridge`; there is no path from the renderer to an
  arbitrary filesystem read/write or to spawning a process.
- **No plaintext secret at rest.** The refresh token is the only credential persisted locally,
  and it goes through `safeStorage`, which is backed by the OS's own credential store. The
  backup encryption key is never persisted at all — it's derived fresh from the administrator's
  password every time a file is encrypted or decrypted.
- **A compromised desktop app can only do what a compromised superadmin browser session could
  already do** — list/trigger/download backups, report drill results. It cannot restore *to*
  the live VPS (no such endpoint exists over HTTP at all, by the backend's own design) and
  cannot read or write arbitrary application data (no CRUD endpoints beyond `/admin/backups/*`
  and the same `/auth/*` surface every client uses).

## Auto-update

`electron-updater`, checking on startup and every 4 hours while running (`main.js`'s
`UPDATE_CHECK_INTERVAL_MS`). A failed/offline check never blocks the app — it just logs and the
user keeps working on the current version.

**Feed: the VPS, not GitHub Releases.** electron-updater supports a "generic" provider (any
HTTPS host serving a `latest.yml` + the installer) as well as a "github" provider. GitHub was
the first instinct — this repo already lives there, and `gh auth status` confirms a working
token — but **the repository is private**, and GitHub's release-asset download requires an
authenticated request for a private repo. The only way to make that work is embedding a GitHub
token in every installed copy of the app, which turns every user's machine into a place that
token can leak from — a real problem, not a hypothetical one, for a credential with `repo`
scope. The VPS already serves public, non-sensitive content over HTTPS via Caddy (the same
pattern `/documents/*` and `/backups/*` presigned URLs use, just without the presigning since
nothing here is sensitive), so a new, deliberately public-read MinIO bucket
(`desktop-releases`, `mc anonymous set download`) was the more correct fit — it needs no
credential embedded anywhere, and it holds only installer binaries, never business data. Both
`documents` and `backups` remain private; this is a new, separate, narrowly-scoped bucket.

```
Feed:      https://test.spidnums.com/desktop-releases/
Contains:  <ProductName> Setup <version>.exe, .exe.blockmap, latest.yml
Caddy:     handle /desktop-releases/* { reverse_proxy speednum-minio:9000 }  (deploy/Caddyfile.example)
```

**Publishing a new version** (once code signing exists — see the gap below):

```bash
cd desktop
# bump "version" in package.json first
npm run dist                                  # electron-builder, produces dist/*.exe + latest.yml
# upload dist/*.exe, *.exe.blockmap, and latest.yml to the desktop-releases bucket,
# e.g. via `mc cp` (see the release commands actually run this session, same shape)
```

Every installed copy still running the old version picks up the new `latest.yml` on its next
periodic check (within 4 hours) or the next app launch, and shows the update modal — no rebuild
or redistribution step needed beyond uploading those three files.

**Live-verified this session** (against the real feed above, not a local mock):
- A packaged 0.1.0 build correctly reported "up to date" against a real published 0.1.0 feed.
- The same build correctly detected a real published 0.1.1 feed as "update available" and
  showed the modal with the real version numbers.
- Clicking "Update Now" downloaded the real ~95MB installer from the live VPS
  (~1.2 MB/s observed) and reached electron-updater's internal "downloaded" state, which it
  only reaches after the file's sha512 matches `latest.yml` — a deliberately corrupted or
  truncated download would surface as an `error` event instead, never a false "downloaded".
- The test's `latest.yml` was restored to the real 0.1.0 metadata immediately after; nothing
  was left in a bumped/fake state on the live feed.

**Not verified — the actual "Restart & Update" install-and-relaunch step.** Reaching
"downloaded" and clicking through to `quitAndInstall()` are two different things to prove; the
former was verified for real, the latter would quit the very process running the test. Nothing
about the code path is untested logic, but the literal "watch the app restart into the new
version" moment wasn't clicked through end-to-end this session.

## Web distribution: the dashboard's "Download App" button

Separate from electron-updater's own feed above (which the *installed app* uses for its
authoritative update check), the web dashboard has its own small distribution layer for
someone who doesn't have the app yet:

- **`GET /desktop/latest`** (`backend/app/routers/desktop_releases.py`, public, no auth) —
  returns `{version, platform, installer, sha256, released_at, release_notes}` from a new
  `desktop_releases` table (migration `0015`). Deliberately a separate source of truth from
  `latest.yml`, not a parser of it — the website's release awareness shouldn't depend on
  electron-builder's YAML format.
- **`POST /admin/desktop-releases`** (superadmin-only) registers a release that has already
  been built and uploaded (this endpoint never touches MinIO or builds anything). Validates
  server-side, not just in whatever admin UI calls it: the version must be a real `X.Y.Z`
  semver (`services/semver.py`, integer-tuple comparison — `1.10.0 > 1.9.0`, not a string
  sort), strictly newer than the current latest (no downgrade, no re-publishing the same
  version), the `installer_url` must start with the exact configured `desktop-releases`
  bucket URL (rejects an attacker-controlled or typo'd host), and `sha256` must be a
  well-formed 64-hex-char digest.
- **Sidebar button** (`frontend/src/components/dashboard/desktop-app-button.tsx`, bottom of
  the firm sidebar) opens `speednum://check-update`. A browser has no reliable way to ask
  "is this custom protocol registered" — the button uses the same best-effort heuristic every
  "open in app" web feature does: if the page hasn't lost focus within ~1.5s, nothing
  answered the link, so it assumes the app isn't installed and offers the real installer
  download instead, with copy that's explicit Windows will ask the user to run it (never
  claims to have installed anything itself).
- **Desktop-side deep link** (`desktop/src/main.js`'s `handleDeepLink`) is registered via
  `package.json`'s `build.protocols` (NSIS registers `speednum://` at install time) plus a
  runtime `app.setAsDefaultProtocolClient` call, with `requestSingleInstanceLock` +
  `second-instance`/`open-url` routing a link to the already-running app instead of opening a
  second session-less window. The handler recognizes exactly two hardcoded commands
  (`check-update`, `version`) via an allow-list match on the parsed URL — nothing from the
  link is ever concatenated into a shell command or filesystem path — and triggers an
  immediate `updater.checkForUpdates({manual: true})`, which now also surfaces "you're on the
  latest version" for a manual check (previously that electron-updater event was unsurfaced,
  since the silent 4-hour background check should never nag when there's nothing new).

**Publishing a new version end to end** (extends the steps above):

```bash
cd desktop
# bump "version" in package.json first
npm run dist                                  # produces dist/*.exe, *.exe.blockmap, latest.yml
sha256sum "dist/SpeedNum Desktop Setup <version>.exe"
# upload the three dist/ files to the desktop-releases bucket (same bucket, same shape
# as the electron-updater feed above), then register the release for the website:
curl -X POST https://test.spidnums.com/api/v1/admin/desktop-releases \
  -H "Authorization: Bearer <superadmin token>" -H "Content-Type: application/json" \
  -d '{"version":"<version>","installer_url":"https://test.spidnums.com/desktop-releases/<file>.exe","sha256":"<sha256>"}'
```

**Live-verified this session**: registered a real disposable tenant, opened the real
production dashboard, confirmed the button renders correctly bottom-left in light mode, dark
mode, collapsed rail, and the mobile drawer, confirmed `.animate-ring`'s pulse correctly
disables under `prefers-reduced-motion`, clicked it with no `speednum://` handler present
(this sandbox can't register a real OS protocol handler) and got the honest "isn't installed"
dialog showing the real published version and a working download link. A full v1.0.0
installer was actually built, checksummed, uploaded, and published through the real
`POST /admin/desktop-releases` flow — `GET /desktop/latest` and the HTTPS download URL were
both re-verified against production afterward. **Not verified**: the actual
`speednum://` → running-app handoff end to end, since that requires a real Windows machine
with the app installed running a real browser against it — this sandbox cannot host that.
The code path (single-instance lock, `second-instance` argv parsing, the allow-listed
command switch) was reviewed and syntax/logic-checked, not click-tested on a live install.

### The one remaining gap: code signing

The built installer is **not code-signed** — confirmed directly
(`Get-AuthenticodeSignature` reports `NotSigned`), not assumed. No certificate was available or
fabricated. Practical effect: Windows SmartScreen will warn on first run of the installer, and
on some Windows security postures an unsigned executable can be blocked outright rather than
just warned about. This does not break the auto-update *mechanism* — checking, downloading, and
integrity-verification via sha512 all work identically whether or not the binary is signed —
but it does affect the end-user experience of running the installer at all.

```text
Credential:              Windows code-signing certificate (EV or OV, from a CA like
                          DigiCert/Sectigo, or a cheaper OV cert if EV's identity-vetting
                          process is more than this needs)
Where to obtain:          Any public certificate authority selling Authenticode certs
Where it belongs:         electron-builder's `win.certificateFile` / `win.certificatePassword`
                          config (package.json's `build.win`), or CSC_LINK/CSC_KEY_PASSWORD
                          env vars at build time — never committed to the repo
Environment variable:     CSC_LINK, CSC_KEY_PASSWORD
Why required:             Removes the Windows SmartScreen warning and (on stricter postures)
                          the outright execution block for an unsigned .exe
Whether it can be safely
deferred:                 Yes — everything else in this document works without it. It only
                          affects the polish of the install experience, not correctness.
```

## What's real vs. what's scoped out of this pass

**Real, live-tested (see the 2026-08-17/18 session reports for full output):**
- Login, snapshot listing, triggering a server-side backup, downloading + checksum-verifying +
  encrypting all four snapshot components, and acking the download — all run for real against
  production through the actual Electron GUI (Playwright-driven, screenshotted).
- A real restore drill: a real snapshot decrypted, restored into disposable Postgres, and a
  real login succeeded against the restored data. This surfaced and fixed a real gap (see
  BACKUP_ARCHITECTURE.md's "A real gap this found").
- Device registration/revocation (added by a concurrent session mid-audit) — the desktop app
  registers itself and sends `X-Device-Id` on every call that needs one; verified live that an
  unregistered or revoked device is rejected and a freshly registered one succeeds.
- Auto-update: a real installer built, published to a real (new) VPS-hosted feed, and a real
  packaged build both correctly detecting "up to date" and "update available", downloading a
  real ~95MB update from the live feed, and passing electron-updater's sha512 integrity check —
  see the "Auto-update" section above for exactly what was and wasn't clicked through.
- 12 automated tests (`desktop/test/`) covering the crypto envelope and the sync pipeline's
  atomicity/idempotency/checksum-failure behavior.

**Scoped out of this pass, left as documented future work:**
- Full feature parity with the web admin dashboard (clients, invoices, reports, imports,
  settings) — this app's scope is backup/sync/restore-drill plus a read-only snapshot list.
- Code signing (see "The one remaining gap" above) — a real, distributable, working installer
  now exists; it just isn't signed.
- Automating the restore-drill's Docker orchestration inside the Electron GUI end-to-end in an
  environment with a working Docker install — `restore-drill.js` mirrors an exact sequence
  already proven manually against the VPS's Docker (this development sandbox has no local
  Docker), but the module itself was not exercised as a black box by the GUI in this session.
- A Tauri rewrite (see "Why Electron, not Tauri" above).
