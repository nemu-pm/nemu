# Nemu proxy service

This service is the Cloudflare Worker and local Bun implementation behind
`https://service.nemu.pm`. It exposes a general source relay at `/proxy` and a
strict OAuth token relay at `/oauth-proxy-v2`.

`bun run deploy` deploys Convex only. The Worker has its own build and rollout:

```bash
bun test ./services/proxy/service.test.ts
npx --yes wrangler@4.127.0 deploy --dry-run --config services/proxy/wrangler.toml
npx --yes wrangler@4.127.0 deploy --config services/proxy/wrangler.toml
```

`workers_dev` and preview URLs are disabled. Before deploying, verify that the
production `service.nemu.pm` route/custom domain is still attached to the
`nemu-service` Worker in Cloudflare; it is not declared in this repository.

## Security contract

- Destinations must be credential-free HTTP(S) hostnames on their default
  ports. IP literals, local/reserved names, recursive proxy URLs, HTTPS
  downgrades, and unsafe redirect body replay are refused. Cloudflare's
  `global_fetch_strictly_public` compatibility flag is the production DNS and
  same-zone enforcement boundary.
- Every upstream subrequest uses `redirect: manual`, `cache: no-store`, a
  bounded body, and a whole-request timeout. The incoming request signal is
  propagated so disconnects cancel upstream work.
- `/oauth-proxy-v2` is POST-only, HTTPS-only, form-encoded, never follows a
  redirect, accepts at most 64 KiB, and returns at most 128 KiB. These limits
  are server-owned; caller headers cannot relax them. The body must be a
  standard `authorization_code` PKCE exchange and may contain only
  `grant_type`, `code`, `code_verifier`, `redirect_uri`, and `client_id`.
- Returned representations are `private, no-store`. The private in-isolate GET
  cache accepts only explicitly public, fresh, unauthenticated responses and
  accounts for active readers even after eviction.
- Returned content receives a service-owned sandbox CSP, `no-referrer`, and
  `nosniff`, so navigating to attacker-controlled HTML/SVG cannot turn the
  relay into active content under the `service.nemu.pm` origin.
- `ALLOWED_ORIGINS` controls browser callers. `ALLOWED_DOMAINS` optionally
  narrows upstream hostnames. The Bun server binds to loopback by default and
  requires an allowlist for a non-loopback bind; operators must also enforce
  private/reserved destination blocking at the network layer to prevent DNS
  rebinding.

The compatibility flags in `wrangler.toml` are part of this contract:
`cache_option_enabled` permits `cache: no-store` at the pinned compatibility
date, and `enable_request_signal` exposes live client cancellation. Always run
the pinned Wrangler dry-run when changing the date, flags, or fetch behavior;
Bun unit tests do not emulate these workerd gates. Wrangler 4.127.0 is the
validated release for this runbook; update the pin only with a successful
dry-run and local workerd smoke pass. Run Wrangler with its supported Node.js
runtime (`npx`), not through `bunx`.

Optional environment settings:

- `RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_MS`
- `CACHE_TTL_MS` (hard-capped at 24 hours), `MAX_CACHE_SIZE`
- `ALLOWED_ORIGINS`, `ALLOWED_DOMAINS`, `PROXY_ORIGINS`
- `UPSTREAM_TIMEOUT_MS` (default 30 seconds, hard-capped at 60 seconds)

## Production rollout

The Worker must deploy before any frontend that calls `/oauth-proxy-v2`:

1. Run the focused tests and Wrangler dry-run above.
2. Deploy the Worker and wait for Cloudflare propagation.
3. Run the non-secret smoke checks below against the production custom domain.
4. Only after all checks pass, deploy the web client that uses the v2 route.
5. Monitor Worker errors, 429s, 499s, 502s, 503s, and 504s during rollout.

```bash
curl --fail --silent --show-error https://service.nemu.pm/health
curl --silent --show-error --output /dev/null --write-out '%{http_code}\n' \
  'https://service.nemu.pm/oauth-proxy-v2?url=https%3A%2F%2Fexample.com%2Ftoken'
curl --silent --show-error --include --request OPTIONS \
  --header 'Origin: https://nemu.pm' \
  --header 'Access-Control-Request-Method: POST' \
  https://service.nemu.pm/oauth-proxy-v2
curl --fail --silent --show-error \
  'https://service.nemu.pm/proxy?url=https%3A%2F%2Fexample.com%2F' \
  --output /dev/null
```

The health JSON must contain `"policyVersion":2`; the v2 GET must return 405;
the preflight must return 204 with `Access-Control-Allow-Methods: POST,
OPTIONS`; and the generic fetch must succeed. Do not use a real authorization
code, verifier, token endpoint, or client secret in a smoke command.

## Rollback

- Before the matching frontend ships, roll back the Worker through Cloudflare's
  version history if any smoke check fails.
- After the frontend ships, do not independently roll the Worker back to a
  version without policy v2. First roll the frontend back (or otherwise stop
  v2 OAuth submissions), then roll back the Worker. A legacy Worker returns 404
  for the versioned path, so secrets fail closed, but source OAuth is
  unavailable until the compatible Worker returns.
- After any rollback, repeat the health, v2-GET, preflight, and generic-fetch
  checks and confirm the expected client version is live.
