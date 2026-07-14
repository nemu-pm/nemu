import { StyleSheet, View } from "react-native";
import { radius, useNemuTheme, GlassSurface } from "@/design-system";

const PLUGIN_ROWS = [0, 1] as const;
const SOURCE_ROWS = [0, 1, 2] as const;
const DATA_ROWS = [0, 1] as const;

type MobileSettingsSkeletonProps = {
  accessibilityLabel: string;
};

function SkeletonLine({
  width,
  height,
  subtle = false,
}: {
  width: number | `${number}%`;
  height: number;
  subtle?: boolean;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.line,
        {
          width,
          height,
          backgroundColor: subtle ? tokens.sourceIconGlass : tokens.muted,
        },
      ]}
    />
  );
}

function SkeletonIcon({ subtle = true }: { subtle?: boolean }) {
  const { tokens } = useNemuTheme();

  return (
    <View
      style={[
        styles.icon,
        {
          backgroundColor: subtle ? tokens.sourceIconGlass : tokens.muted,
          borderColor: tokens.border,
        },
      ]}
    />
  );
}

function SectionHeader({
  titleWidth,
  subtitleWidth,
  withAction = false,
}: {
  titleWidth: number;
  subtitleWidth: number;
  withAction?: boolean;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionCopy}>
        <SkeletonLine width={titleWidth} height={14} />
        <SkeletonLine width={subtitleWidth} height={11} subtle />
      </View>
      {withAction ? (
        <View style={styles.headerAction}>
          <SkeletonLine width={52} height={30} />
          <SkeletonLine width={30} height={24} subtle />
        </View>
      ) : (
        <SkeletonLine width={30} height={24} subtle />
      )}
    </View>
  );
}

function SettingsRowSkeleton({ action }: { action?: "buttons" | "switch" }) {
  const { tokens } = useNemuTheme();

  return (
    <GlassSurface style={styles.rowShell} contentStyle={styles.sourceRow}>
      <SkeletonIcon />
      <View style={styles.rowCopy}>
        <SkeletonLine width="68%" height={14} />
        <SkeletonLine width="54%" height={12} subtle />
        <SkeletonLine width={78} height={11} subtle />
      </View>
      {action === "switch" ? (
        <View
          style={[
            styles.switchPill,
            { backgroundColor: tokens.muted },
          ]}
        />
      ) : action === "buttons" ? (
        <View style={styles.rowActions}>
          <SkeletonLine width={32} height={32} subtle />
          <SkeletonLine width={32} height={32} subtle />
        </View>
      ) : null}
    </GlassSurface>
  );
}

function SegmentedSkeleton({ width }: { width: number }) {
  return (
    <View style={styles.settingBlock}>
      <SkeletonLine width={width} height={13} />
      <SkeletonLine width="78%" height={11} subtle />
      <View style={styles.segmented}>
        <SkeletonLine width="31%" height={38} />
        <SkeletonLine width="31%" height={38} subtle />
        <SkeletonLine width="31%" height={38} subtle />
      </View>
    </View>
  );
}

export function MobileSettingsSkeleton({
  accessibilityLabel,
}: MobileSettingsSkeletonProps) {
  const { tokens } = useNemuTheme();

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      style={styles.stack}
    >
      <GlassSurface style={styles.cardShell} contentStyle={styles.cardContent}>
        <View style={styles.cardHeader}>
          <SkeletonIcon />
          <View style={styles.rowCopy}>
            <SkeletonLine width={118} height={15} />
            <SkeletonLine width="72%" height={12} subtle />
          </View>
        </View>
        <View style={styles.accountRow}>
          <View
            style={[
              styles.accountAvatar,
              { backgroundColor: tokens.sourceIconGlass },
            ]}
          />
          <View style={styles.rowCopy}>
            <SkeletonLine width="64%" height={14} />
            <SkeletonLine width="48%" height={12} subtle />
          </View>
          <SkeletonLine width={78} height={34} />
        </View>
      </GlassSurface>

      <GlassSurface style={styles.cardShell} contentStyle={styles.cardContent}>
        <View style={styles.cardHeader}>
          <SkeletonIcon />
          <View style={styles.rowCopy}>
            <SkeletonLine width={96} height={15} />
            <SkeletonLine width="66%" height={12} subtle />
          </View>
        </View>
        <View style={styles.segmented}>
          <SkeletonLine width="31%" height={38} />
          <SkeletonLine width="31%" height={38} subtle />
          <SkeletonLine width="31%" height={38} subtle />
        </View>
      </GlassSurface>

      <View style={styles.section}>
        <SectionHeader titleWidth={104} subtitleWidth={178} />
        {PLUGIN_ROWS.map((row) => (
          <SettingsRowSkeleton key={row} action="switch" />
        ))}
      </View>

      <GlassSurface style={styles.cardShell} contentStyle={styles.cardContent}>
        <View style={styles.cardHeader}>
          <SkeletonIcon />
          <View style={styles.rowCopy}>
            <SkeletonLine width={104} height={15} />
            <SkeletonLine width="70%" height={12} subtle />
          </View>
        </View>
        <SegmentedSkeleton width={76} />
        <SegmentedSkeleton width={58} />
        <SegmentedSkeleton width={126} />
      </GlassSurface>

      <View style={styles.section}>
        <SectionHeader titleWidth={122} subtitleWidth={210} withAction />
        {SOURCE_ROWS.map((row) => (
          <SettingsRowSkeleton key={row} action="buttons" />
        ))}
      </View>

      <GlassSurface style={styles.cardShell} contentStyle={styles.cardContent}>
        <View style={styles.cardHeader}>
          <SkeletonIcon />
          <View style={styles.rowCopy}>
            <SkeletonLine width={126} height={15} />
            <SkeletonLine width="62%" height={12} subtle />
          </View>
        </View>
        <View style={[styles.dataActions, { borderColor: tokens.border }]}>
          {DATA_ROWS.map((row) => (
            <View key={row} style={styles.dataRow}>
              <SkeletonIcon />
              <View style={styles.rowCopy}>
                <SkeletonLine width="58%" height={13} />
                <SkeletonLine width="72%" height={11} subtle />
              </View>
              <SkeletonLine width={72} height={36} />
            </View>
          ))}
        </View>
      </GlassSurface>

      <GlassSurface style={styles.footerShell} contentStyle={styles.footerRow}>
        <SkeletonIcon />
        <SkeletonLine width="58%" height={14} />
        <SkeletonLine width={22} height={22} subtle />
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  cardShell: {
    borderRadius: radius.xl,
  },
  cardContent: {
    gap: 14,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    opacity: 0.8,
  },
  line: {
    borderRadius: radius.sm,
    opacity: 0.78,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  accountRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  accountAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    opacity: 0.78,
  },
  section: {
    gap: 12,
  },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  headerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  rowShell: {
    minHeight: 90,
    borderRadius: radius.xl,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  rowActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  switchPill: {
    width: 50,
    height: 30,
    borderRadius: 15,
    opacity: 0.78,
  },
  segmented: {
    flexDirection: "row",
    gap: 4,
  },
  settingBlock: {
    gap: 8,
  },
  dataActions: {
    gap: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  dataRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  footerShell: {
    minHeight: 50,
    borderRadius: radius.xl,
  },
  footerRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
  },
});
