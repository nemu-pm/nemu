import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import type { LocalChapterProgress } from "@/data/schema";
import {
  nemuColorWithAlpha,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";
import {
  getMobileChapterProgressAccessory,
  getMobileChapterProgressTone,
} from "@/lib/mobileChapterProgress";

const RING_SIZE = 20;
const RING_CENTER = 10;
const RING_RADIUS = 8;
const RING_STROKE = 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

type MobileChapterProgressAccessoryProps = {
  progress?: LocalChapterProgress | null;
  locked?: boolean;
  showChevron?: boolean;
};

export function MobileChapterProgressAccessory({
  progress,
  locked,
  showChevron = true,
}: MobileChapterProgressAccessoryProps) {
  const { tokens } = useNemuTheme();
  const accessory = getMobileChapterProgressAccessory(progress, { locked });
  const tone = tokens[getMobileChapterProgressTone(accessory)];

  if (accessory.status === "locked") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.locked}
      >
        <Ionicons name="lock-closed" size={18} color={tone} />
      </View>
    );
  }

  if (accessory.status === "completed") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.completed}
      >
        <Ionicons name="checkmark-circle" size={20} color={tone} />
      </View>
    );
  }

  if (accessory.status === "progress") {
    return (
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={styles.progressGroup}
      >
        <Text style={[styles.progressText, { color: tokens.mutedForeground }]}>
          {accessory.page}/{accessory.total}
        </Text>
        <Svg
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          style={styles.progressRing}
        >
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={nemuColorWithAlpha(tone, 0.14)}
            strokeWidth={RING_STROKE}
          />
          <Circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke={tone}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - accessory.ratio)}
          />
        </Svg>
      </View>
    );
  }

  if (!showChevron) return null;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.chevron}
    >
      <Ionicons name="chevron-forward" size={18} color={tokens.mutedForeground} />
    </View>
  );
}

const styles = StyleSheet.create({
  completed: {
    minWidth: 28,
    alignItems: "flex-end",
  },
  locked: {
    minWidth: 28,
    alignItems: "flex-end",
  },
  progressGroup: {
    minWidth: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  progressText: {
    fontSize: 11,
    lineHeight: 14,
    fontVariant: ["tabular-nums"],
    fontWeight: nemuFontWeight.medium,
  },
  progressRing: {
    transform: [{ rotate: "-90deg" }],
  },
  chevron: {
    minWidth: 28,
    alignItems: "flex-end",
  },
});
