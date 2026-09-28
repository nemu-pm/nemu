/**
 * Study desk (学習台) — the notebook posture's bottom pane hosting the
 * existing Japanese Learning surfaces (transcript, sentence analysis, nemu
 * chat) under the page. State and tabs live in `mobileReaderNotebookPane.ts`.
 */

/** Notebook posture with the learning tools docked in the bottom pane. */
export function isMobileStudyDeskPose(pose: {
  posture: string;
  learning: { presentation: string; region?: string };
}): boolean {
  return pose.posture === "notebook"
    && pose.learning.presentation === "docked"
    && pose.learning.region === "console";
}
