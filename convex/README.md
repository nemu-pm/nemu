# Convex Backend

This directory contains Nemu's Convex backend, not the default Convex sample app.

## What Lives Here

- `schema.ts`: cloud tables and validators
- `auth.ts`: Better Auth integration
- `http.ts` and `proxy.ts`: HTTP actions, including the fallback proxy endpoint
- `library.ts`, `history.ts`, `settings.ts`: sync-facing mutations and queries

## How It Fits The App

- the frontend is local-first and writes to IndexedDB immediately
- when authenticated, sync code in `src/sync` mirrors canonical cloud state through these functions
- Convex HTTP actions also provide a non-Cloudflare proxy path for APIs that block the worker proxy

## Local Development

- `bun dev` already runs `convex dev` alongside Vite
- use `bun run typecheck` to typecheck both the app and this directory
- use `bun run deploy` to deploy the current Convex backend

## Notes

- prefer updating validators in `schema.ts` before changing mutation/query payloads
- if docs elsewhere disagree with the code here, treat the code in this directory as the source of truth
