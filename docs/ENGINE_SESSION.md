# Engine session and same-origin proxy (SCC-003)

Command Center is a backend-for-frontend for the Superintelligence Engine:

- **Sign-in** (`/signin` → `POST /api/session`): the user pastes an engine API token. The server verifies it
  against the engine (`/v1/me`, `/v1/tenants`) and stores it sealed (AES-256-GCM, `SCC_SESSION_SECRET`) in an
  `HttpOnly; SameSite=Lax; Secure` cookie. Browser scripts never see the token. When the engine gets an OIDC
  provider, the engine's SSO cookie flow can replace this step.
- **Proxy** (`/v1/*` → `ENGINE_API_URL/v1/*`): adds `Authorization: Bearer <token>` and `X-SIE-Product: command`,
  forwards `X-Tenant-Id`, streams SSE responses through, refuses cross-site writes (`Sec-Fetch-Site`/`Origin`),
  never proxies `/v1/dev/*`, caps bodies at 25 MB.
- `/auth/command/{session,logout,start}` give the shared `ProjectPortal` client the endpoints it expects, so the
  portal and project explorer use this origin as their "engine origin".
- The browser uses the engine SDK (`EngineClient`) against `window.location.origin`.

Environment: `ENGINE_API_URL` (engine base URL), `SCC_SESSION_SECRET` (64 hex characters; `openssl rand -hex 32`).

Tests: `test/engine-e2e.test.mjs` runs the pinned engine with PostgreSQL and the simulator and drives sign-in,
the proxy, streaming generation, a domain operation and the job tray adapter (`TEST_ADMIN_DATABASE_URL`).
