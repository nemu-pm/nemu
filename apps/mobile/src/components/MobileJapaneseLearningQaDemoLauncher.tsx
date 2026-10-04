import { useEffect } from "react";
import { router } from "expo-router";
import {
  MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE,
  mobileJapaneseLearningQaDemoChapterHref,
} from "@/lib/mobileJapaneseLearningQa";

/**
 * QA builds with `EXPO_PUBLIC_JL_QA_TIMELINE=real` only: once the app has
 * settled on its first tab, open the Japanese Learning demo chapter (地縛少年
 * 花子くん ch.1 raw, demo page) so the real-pipeline timeline runs without a
 * deep link. Renders nothing; every other build returns before the effect.
 */
export function MobileJapaneseLearningQaDemoLauncher() {
  useEffect(() => {
    if (MOBILE_JAPANESE_LEARNING_QA_TIMELINE_MODE !== "real") return;
    const timer = setTimeout(() => {
      router.push(mobileJapaneseLearningQaDemoChapterHref());
    }, 2500);
    return () => clearTimeout(timer);
  }, []);
  return null;
}
