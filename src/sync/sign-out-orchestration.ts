export type PreparedLocalSignOut = () => Promise<void>;

/**
 * Coordinate web sign-out without risking the user's only local copy.
 *
 * `prepareLocalSignOut` may capture the current account/store identity and
 * pause sync, but it must not copy, clear, or reset local data. The returned
 * commit is deliberately held until the remote session has been positively
 * signed out. This also lets the commit keep using the captured store after
 * React has observed logout and switched the provider to the local profile.
 */
export async function orchestrateRemoteFirstSignOut({
  prepareLocalSignOut,
  signOutRemotely,
  resumeAfterRemoteFailure,
}: {
  prepareLocalSignOut: () => PreparedLocalSignOut;
  signOutRemotely: () => Promise<void>;
  resumeAfterRemoteFailure: () => void;
}): Promise<void> {
  const commitLocalSignOut = prepareLocalSignOut();

  try {
    await signOutRemotely();
  } catch (error) {
    resumeAfterRemoteFailure();
    throw error;
  }

  await commitLocalSignOut();
}
