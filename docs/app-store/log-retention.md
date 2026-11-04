# Log retention (30 days)

Policy statement (`src/locales/en.json`, `privacy.sections` > "Analytics,
advertising and logs"): operational logs from nemu's servers contain no content and
**are kept for 30 days**.
<!-- TODO: only true once the Convex log stream below exists and the OCR host runs
the rotation from services/ocr/logrotate.conf. Remove this note after both. -->

## What exists

| Source | Content | Kept by | Action |
|---|---|---|---|
| Convex function logs (`console.*`, executions) | counts, durations, error classes only (guarded by `tests/convex-no-content-logging.test.ts`) | Convex; the dashboard shows recent logs and no retention period is documented | Stream to Axiom (below), retention 30 days |
| OCR host (vast.ai) `/app/server.log`, `/app/vllm.log` | uvicorn access lines, vLLM metrics; no request bodies | the host | `services/ocr/logrotate.conf` (30 daily files, `maxage 30`), installed by `deploy.ts` |
| Cloudflare Worker `service.nemu.pm` | error class only; Workers Logs not enabled | Cloudflare | none |
| Better Auth `session` rows (IP, user agent) | account data, not diagnostics | until expiry or account deletion | none |

Convex itself keeps: its internal logs for the dashboard (retention undocumented),
and function-execution metadata it needs to run the service. These are the
provider's own records, which the policy states separately.

## Recommended destination: Axiom

Axiom is a first-class Convex log-stream destination
([Convex docs](https://docs.convex.dev/production/integrations/log-streams)).
Its Personal (free) plan lists 30-day retention
([axiom.co/pricing](https://axiom.co/pricing)); the pricing page does not say
whether retention can be set per dataset, so **verify in the Axiom console** that
the dataset's retention reads exactly 30 days (Dataset > Settings). If the free plan
cannot be pinned to 30, use a paid plan with configurable retention.

## Owner setup (Convex dashboard; Convex Pro is confirmed)

1. Axiom: create a dataset (e.g. `nemu-convex-prod`), set its retention to 30 days,
   create an API token with ingest permission for that dataset only.
2. Convex dashboard > production deployment > Settings > Integrations > Log
   Streams > Axiom: enter the dataset name and the API token (optionally an
   attribute such as `env=prod`), save.
3. Confirm the `verification` event arrives in Axiom. Axiom adds a Convex
   dashboard under Dashboards > Integrations.
4. Delivery is best-effort (events can be dropped or duplicated); fine for
   diagnostics.
5. Deploy `services/ocr` (`bun deploy.ts <host> <port>`) so the log rotation is
   installed on the vast.ai box; check `ls /app/*.log*` after a day.
6. Then delete the TODO notes (above and in `src/pages/privacy.tsx`).

Never put the Axiom token in the repo.
