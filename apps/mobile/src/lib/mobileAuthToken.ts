import { mobileAuthClient } from "@/sync/mobileAuthClient";

/** The signed-in session's Convex/Better Auth JWT, or null (signed out / unreachable). */
export async function getMobileConvexAuthToken(): Promise<string | null> {
  try {
    const { data } = await mobileAuthClient.convex.token({ fetchOptions: { throw: false } });
    return data?.token ?? null;
  } catch {
    return null;
  }
}
