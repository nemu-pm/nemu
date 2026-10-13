# OCR gateway

Cloudflare Worker in front of the OCR service. Verifies the caller's Convex/Better
Auth JWT locally (issuer = `CONVEX_SITE_URL`, audience `convex`, JWKS at
`/api/auth/convex/jwks`, ~15 min lifetime) and proxies `/ocr` and `/detect` to
`OCR_ORIGIN` with an `x-nemu-gateway-secret` header; `/health` is open.

Not deployed by this repo's scripts. Owner rollout:

1. `OCR_ORIGIN`/`CONVEX_SITE_URL` in `wrangler.toml` (or dashboard), `wrangler secret put ORIGIN_SHARED_SECRET`.
2. Give the vast.ai server a new hostname (e.g. `ocr-origin.nemu.pm`) and
   - make `services/ocr/server.py` host firewall accept only Cloudflare's IP ranges, and
   - have the origin (reverse proxy or a middleware) reject requests lacking the
     shared secret header (the box then needs the secret, not Convex access).
3. `npx wrangler@4 deploy --config services/ocr-gateway/wrangler.toml --dry-run`, then deploy, then
   attach route `ocr.nemu.pm/*` to the Worker and repoint DNS (`services/ocr/deploy.ts`'s
   Cloudflare step currently points `ocr.nemu.pm` at the box: change it to the origin hostname).
4. Clients (web worker, mobile) already send `Authorization: Bearer <JWT>`.

Signed-out behaviour is unchanged: clients gate cloud OCR on sign-in before calling.
