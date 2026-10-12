import { useMemo } from "react";
import { StyleSheet, View } from "react-native";
import type { Filter, FilterValue } from "@/sources/aidokuContract";
import { hapticSelection } from "@/lib/haptics";
import type { MobileStrings } from "@/lib/mobileI18n";
import {
  buildMobileSourceFilterMenus,
  resolveMobileSourceFilterMenuEvent,
} from "@/lib/mobileSourceFilterMenu";
import { ExploreMenuPill } from "./ExploreMenuPill";

type Actions = Parameters<typeof ExploreMenuPill>[0]["actions"];

/**
 * The search filters in the new design: one "Filters (n)" menu and one sort
 * menu, both native, instead of a strip of chips that clips on every width.
 * "All Filters…" still opens the full panel for what a menu cannot hold.
 */
export function ExploreSourceFilterMenus({
  filters,
  values,
  strings,
  onChange,
  onClear,
  onOpenPanel,
}: {
  filters: Filter[];
  values: FilterValue[];
  strings: MobileStrings;
  onChange: (filter: Filter, value: FilterValue["value"] | undefined) => void;
  onClear: () => void;
  onOpenPanel: () => void;
}) {
  const menus = useMemo(() => buildMobileSourceFilterMenus(filters, values, strings), [filters, values, strings]);
  const onPressAction = ({ nativeEvent: { event } }: { nativeEvent: { event: string } }) => {
    const resolved = resolveMobileSourceFilterMenuEvent(event, filters, values);
    if (!resolved) return;
    void hapticSelection();
    if (resolved.kind === "clear") onClear();
    else if (resolved.kind === "panel") onOpenPanel();
    else onChange(resolved.filter, resolved.value);
  };
  return (
    <View style={styles.row}>
      <ExploreMenuPill
        label={menus.filtersLabel}
        accent={menus.filterCount > 0}
        actions={menus.filterActions as Actions}
        onPressAction={onPressAction}
      />
      {menus.sortLabel ? (
        <ExploreMenuPill
          label={`${strings.designExplore.sortMenu}: ${menus.sortLabel}`}
          actions={menus.sortActions as Actions}
          onPressAction={onPressAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "nowrap" },
});
