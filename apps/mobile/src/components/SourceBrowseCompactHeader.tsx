import Ionicons from "@expo/vector-icons/Ionicons";
import { StyleSheet, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NemuPressable, NemuText as Text, nemuFontWeight, spacing, useMobilePageGutters, useNemuTheme } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  MOBILE_COMPACT_SOURCE_HEADER_ROW_HEIGHT as ROW_HEIGHT,
  MOBILE_COMPACT_SOURCE_HEADER_SEARCH_ROW_HEIGHT as SEARCH_ROW_HEIGHT,
} from "@/lib/mobileSourceBrowseHeader";

/**
 * Android source browse header: owns the title and search geometry together
 * instead of compensating native bar insets. Its row heights feed the page's
 * top padding (getCompactSourceBrowseHeaderBarHeight), so title-to-content
 * spacing matches the other screens.
 */
export function SourceBrowseCompactHeader({ title, strings, searching, query, onQueryChange,
  onSubmit, onBack, onSearch, onCancel, onFilters, canSearch,
}: {
  title: string; strings: MobileStrings; searching: boolean; query: string;
  onQueryChange: (query: string) => void; onSubmit: () => void;
  onBack: () => void; onSearch: () => void; onCancel: () => void;
  onFilters?: () => void; canSearch: boolean;
}) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const gutters = useMobilePageGutters();
  // Some edge-to-edge windows report zero safe-area insets despite rounded
  // display corners. Keep a design gutter there, while honoring larger system
  // insets (status bar, camera, or sidebar) whenever they are supplied.
  return <View style={{ backgroundColor: tokens.background,
    paddingTop: Math.max(insets.top, spacing.md),
    paddingLeft: Math.max(gutters.left, spacing.xl),
    paddingRight: Math.max(gutters.right, spacing.xl) }}>
    <View style={styles.row}>
      <NemuPressable accessibilityLabel={strings.common.back} onPress={onBack} style={styles.action}>
        <Ionicons name="arrow-back" size={23} color={tokens.foreground} />
      </NemuPressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[styles.title, { color: tokens.foreground }]}>{title}</Text>
      {canSearch && !searching ? <NemuPressable accessibilityLabel={strings.sourceBrowse.searchSource}
        onPress={onSearch} style={styles.action}>
        <Ionicons name="search-outline" size={23} color={tokens.foreground} />
      </NemuPressable> : onFilters && searching ? <NemuPressable accessibilityLabel={strings.sourceBrowse.openAllFilters}
        onPress={onFilters} style={styles.action}>
        <Ionicons name="options-outline" size={23} color={tokens.foreground} />
      </NemuPressable> : null}
    </View>
    {searching ? <View style={styles.searchRow}>
      <TextInput autoFocus autoCapitalize="none" autoCorrect={false} returnKeyType="search"
        accessibilityLabel={strings.sourceBrowse.searchSource} value={query} onChangeText={onQueryChange}
        onSubmitEditing={onSubmit} onBlur={onSubmit} placeholder={strings.sourceBrowse.searchSourcePlaceholder}
        placeholderTextColor={tokens.mutedForeground} selectionColor={tokens.primary}
        style={[styles.input, { color: tokens.foreground, backgroundColor: tokens.secondary }]} />
      {query ? <NemuPressable accessibilityLabel={strings.common.clear} onPress={() => onQueryChange("")} style={styles.action}>
        <Ionicons name="close-circle" size={22} color={tokens.mutedForeground} />
      </NemuPressable> : null}
      <NemuPressable accessibilityLabel={strings.common.cancel} onPress={onCancel} style={styles.cancel}>
        <Text style={{ color: tokens.primary }}>{strings.common.cancel}</Text>
      </NemuPressable>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  row: { minHeight: ROW_HEIGHT, flexDirection: "row", alignItems: "center", gap: 4 },
  action: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  title: { flex: 1, fontSize: 17, fontWeight: nemuFontWeight.semibold },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: SEARCH_ROW_HEIGHT - ROW_HEIGHT },
  input: { flex: 1, minHeight: ROW_HEIGHT, fontSize: 16, borderRadius: 12, paddingHorizontal: 12 },
  cancel: { minHeight: 44, justifyContent: "center", paddingHorizontal: 8 },
});
