/**
 * R2 Storage
 *
 * Uses @convex-dev/r2 component for Cloudflare R2 file storage.
 *
 * Uploads require a signed-in user. Every object is attributed to its uploader
 * in `r2_uploads` (key -> userId; the key itself carries no user id because
 * cover URLs are public) so account deletion can remove it.
 */

import { R2 } from "@convex-dev/r2";
import { mutation } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { requireAuth } from "./_lib";
import { claimR2Upload } from "./r2Ownership";

export const r2 = new R2(components.r2);

const clientApi = r2.clientApi({
  checkUpload: async (ctx, _bucket) => {
    await requireAuth(ctx);
  },
  onUpload: async (ctx, _bucket, key) => {
    // Covers keys requested before ownership records existed, and rejects a
    // key that belongs to another user.
    await claimR2Upload(ctx, key);
  },
});

export const { syncMetadata } = clientApi;

export const generateUploadUrl = mutation({
  args: {},
  returns: v.object({ key: v.string(), url: v.string() }),
  handler: async (ctx) => {
    await requireAuth(ctx);
    const upload = await r2.generateUploadUrl();
    await claimR2Upload(ctx, upload.key);
    return upload;
  },
});

// Re-export for use in other Convex functions
export { r2 as r2Client };
