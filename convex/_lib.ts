import { v } from "convex/values";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ============ Constants ============

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ============ Auth Helpers ============

export async function requireAuth(ctx: QueryCtx | MutationCtx): Promise<string> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");
  return identity.subject;
}

// ============ Shared Validators ============

export const chapterProgressValidator = v.object({
  progress: v.number(),
  total: v.number(),
  completed: v.boolean(),
  dateRead: v.number(),
});

export const sourceRefValidator = v.object({
  registryId: v.string(),
  sourceId: v.string(),
  mangaId: v.string(),
});

export const installedSourceValidator = v.object({
  id: v.string(),
  registryId: v.string(),
  version: v.number(),
});

export const readingModeValidator = v.union(
  v.literal("rtl"),
  v.literal("ltr"),
  v.literal("scrolling")
);

// ============ Merge Helpers ============

export type ChapterProgress = {
  progress: number;
  total: number;
  completed: boolean;
  dateRead: number;
};

export function mergeChapterProgress(
  existing: ChapterProgress | undefined,
  incoming: ChapterProgress
): ChapterProgress {
  if (!existing) return incoming;
  return {
    progress: Math.max(existing.progress, incoming.progress),
    total: Math.max(existing.total, incoming.total),
    completed: existing.completed || incoming.completed,
    dateRead: Math.max(existing.dateRead, incoming.dateRead),
  };
}

