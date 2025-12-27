/**
 * R2 Storage
 *
 * Uses @convex-dev/r2 component for Cloudflare R2 file storage.
 */

import { R2 } from "@convex-dev/r2";
import { components } from "./_generated/api";

export const r2 = new R2(components.r2);

// Client API for uploads - exposed to frontend
export const { generateUploadUrl, syncMetadata } = r2.clientApi({
  checkUpload: async (_ctx, _bucket) => {
    // TODO: Add auth check if needed
    // const user = await userFromAuth(ctx);
    // if (!user) throw new Error("Unauthorized");
  },
  onUpload: async (_ctx, _bucket, key) => {
    // Called after successful upload and metadata sync
    console.log("File uploaded:", key);
  },
});

// Re-export for use in other Convex functions
export { r2 as r2Client };
