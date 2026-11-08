import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import {
  MobileChip,
  MobileNativeSheetScaffold,
  nemuFontWeight,
  NemuText,
  useMobileNativeSheetTheme,
} from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileDetailInfoRow } from "@/lib/mobileMangaDetailInfo";

/** Estimates (pt) of the sheet's chrome, a row and a row of genre chips, for whether it fits. */
const SHEET_CHROME = 96;
const ROW_HEIGHT = 60;
const CHIP_ROW_HEIGHT = 34;
const CHIPS_PER_ROW = 4;
/** The most of the window a content-sized sheet takes before it scrolls in a detent instead. */
const FIT_FRACTION = 0.88;

/**
 * 作品信息: everything the hero leaves out (status, the newest chapter, the
 * source and its language, authors, licence, every genre, when it was added
 * and last read), opened from the ⓘ beside the hero's facts. Icon rows, each
 * a small grey label over its value; the genres wrap as quiet chips.
 */
export function MobileMangaDetailInfoSheet({
  visible,
  rows,
  strings,
  onClose,
}: {
  visible: boolean;
  rows: MobileDetailInfoRow[];
  strings: MobileStrings;
  onClose: () => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  const { height: windowHeight, fontScale } = useWindowDimensions();
  const genreCount = rows.find((row) => row.key === "genre")?.chips?.length ?? 0;
  // Sized to its rows while they fit the window; else a tall detent that scrolls.
  const estimate =
    SHEET_CHROME +
    (rows.length * ROW_HEIGHT + Math.max(0, Math.ceil(genreCount / CHIPS_PER_ROW) - 1) * CHIP_ROW_HEIGHT) *
      Math.min(fontScale, 1.6);
  const scrolls = estimate > windowHeight * FIT_FRACTION;
  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      title={strings.designExplore.infoSheetTitle}
      dismissLabel={strings.designExplore.closeInfo}
      snapPoints={scrolls ? ["92%"] : undefined}
      scroll={scrolls}
      scrollContentBottomInset={24}
      testID="MangaDetailInfoSheet"
    >
      <View style={styles.rows}>
        {rows.map((row) => (
          <View
            key={row.key}
            accessible={!row.chips}
            accessibilityLabel={row.value ? `${row.label}, ${row.value}` : undefined}
            style={styles.row}
          >
            <Ionicons name={row.icon} size={22} color={tokens.mutedForeground} style={styles.icon} />
            <View style={styles.text}>
              <NemuText color={tokens.mutedForeground} style={styles.label}>
                {row.label}
              </NemuText>
              {row.chips ? (
                <View style={styles.chips}>
                  {row.chips.map((chip) => (
                    <MobileChip key={chip} accessibilityLabel={chip} label={chip} variant="static" wrapLabel />
                  ))}
                </View>
              ) : (
                <NemuText selectable color={tokens.foreground} style={styles.value}>
                  {row.value}
                </NemuText>
              )}
            </View>
          </View>
        ))}
      </View>
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  rows: {
    gap: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 14,
  },
  // Centred on the label and value pair's first line pair.
  icon: {
    width: 24,
    marginTop: 8,
    textAlign: "center",
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
  },
  value: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: nemuFontWeight.medium,
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingTop: 4,
  },
});
