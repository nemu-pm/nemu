import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { READER_CAPSULE_COLORS, ReaderCapsule } from "@/components/reader/ReaderCapsule";
import { nemuFontWeight } from "@/design-system";

/** A chapter crossing in seamless paged reading: the chapter turned into. */
export type ReaderChapterCrossingCapsuleState = { id: number; title: string };

/** Shown this long before it fades. */
export const READER_CHAPTER_CROSSING_VISIBLE_MS = 1200;
const FADE_MS = 240;

/**
 * Names the chapter a page turn just crossed into (seamless paged reading):
 * a small glass capsule, never interactive (taps go through to the page),
 * that dematerializes after 1.2 s. The title is the chapter's formatted
 * title (formatChapterTitle), never built here.
 */
export function ReaderChapterCrossingCapsule({
  capsule,
  onDone,
  topOffset,
  insets,
}: {
  capsule: ReaderChapterCrossingCapsuleState | null;
  onDone: (id: number) => void;
  topOffset: number;
  insets?: { left: number; right: number };
}) {
  const [shownId, setShownId] = useState<number | null>(null);
  const visible = capsule != null && shownId === capsule.id;
  useEffect(() => {
    if (!capsule) return;
    setShownId(capsule.id);
    const fade = setTimeout(() => setShownId(null), READER_CHAPTER_CROSSING_VISIBLE_MS);
    const done = setTimeout(() => onDone(capsule.id), READER_CHAPTER_CROSSING_VISIBLE_MS + FADE_MS);
    return () => {
      clearTimeout(fade);
      clearTimeout(done);
    };
  }, [capsule, onDone]);

  if (!capsule) return null;
  return (
    <View
      // Never interactive: the reader keeps turning pages under it.
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.host, { top: topOffset, left: insets?.left ?? 12, right: insets?.right ?? 12 }]}
    >
      <ReaderCapsule
        key={capsule.id}
        interactive={false}
        pointerEvents="box-none"
        materialized={visible}
        animateAppearance
        materializeDurationMs={FADE_MS}
        style={styles.capsule}
      >
        <Text numberOfLines={1} style={styles.title}>
          {capsule.title}
        </Text>
      </ReaderCapsule>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    alignItems: "center",
    zIndex: 30,
    elevation: 30,
  },
  capsule: {
    height: 36,
    maxWidth: 420,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: READER_CAPSULE_COLORS.primaryText,
    fontSize: 15,
    fontWeight: nemuFontWeight.semibold,
  },
});
