import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileCachedImage,
  nemuColorWithAlpha,
  NemuPressable,
  radius,
  nemuFontWeight,
  useNemuTheme,
} from "@/design-system";

export type MobileSourceSelectorItem = {
  accessibilityLabel: string;
  count?: string | null;
  hasUpdate?: boolean;
  iconUri?: string | null;
  id: string;
  name: string;
};

type MobileSourceSelectorProps = {
  disabled?: boolean;
  items: MobileSourceSelectorItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

export function MobileSourceSelector({
  disabled = false,
  items,
  selectedId,
  onSelect,
}: MobileSourceSelectorProps) {
  const { tokens } = useNemuTheme();
  const scrollRef = useRef<ScrollView>(null);
  const itemOffsets = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!selectedId) return;
    const offset = itemOffsets.current[selectedId];
    if (offset === undefined) return;
    scrollRef.current?.scrollTo({
      x: Math.max(0, offset - 12),
      animated: true,
    });
  }, [selectedId]);

  if (items.length === 0) return null;

  return (
    <View style={styles.frame}>
      <ScrollView
        ref={scrollRef}
        horizontal
        accessibilityRole="tablist"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View
          style={[
            styles.track,
            {
              backgroundColor: tokens.tabGlass,
              borderColor: tokens.tabBorder,
            },
          ]}
        >
          {items.map((item) => {
            const selected = item.id === selectedId;
            const showsUpdate = Boolean(item.hasUpdate && item.count);
            return (
              <NemuPressable
                key={item.id}
                accessibilityLabel={item.accessibilityLabel}
                accessibilityRole="tab"
                accessibilityState={{ disabled, selected }}
                buttonDepth={selected ? "elevated" : undefined}
                disabled={disabled}
                hapticFeedback={disabled || selected ? "none" : "selection"}
                onLayout={(event) => {
                  itemOffsets.current[item.id] = event.nativeEvent.layout.x;
                  if (selectedId === item.id) {
                    scrollRef.current?.scrollTo({
                      x: Math.max(0, event.nativeEvent.layout.x - 12),
                      animated: true,
                    });
                  }
                }}
                onPress={() => {
                  if (disabled || selected) return;
                  onSelect(item.id);
                }}
                pressedScale={0.98}
                style={[
                  styles.item,
                  !selected
                    ? {
                        borderColor: "transparent",
                      }
                    : null,
                ]}
              >
                {item.iconUri ? (
                  <MobileCachedImage
                    fallback={
                      <Ionicons
                        name="globe-outline"
                        size={16}
                        color={tokens.mutedForeground}
                      />
                    }
                    uriOwnership="source"
                    source={{ uri: item.iconUri }}
                    style={styles.icon}
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.name,
                    { color: selected ? tokens.foreground : tokens.mutedForeground },
                  ]}
                >
                  {item.name}
                </Text>
                {item.count ? (
                  <View
                    style={[
                      styles.count,
                      {
                        backgroundColor: showsUpdate
                          ? nemuColorWithAlpha(tokens.primary, 0.14)
                          : tokens.sourceIconGlass,
                      },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.countText,
                        {
                          color: showsUpdate ? tokens.primary : tokens.mutedForeground,
                        },
                      ]}
                    >
                      {item.count}
                    </Text>
                  </View>
                ) : null}
              </NemuPressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    zIndex: 1,
    overflow: "visible",
  },
  scrollContent: {
    flexGrow: 1,
    paddingTop: 4,
    paddingBottom: 10,
  },
  track: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minWidth: "100%",
    borderRadius: radius.xl + 6,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 6,
  },
  item: {
    minHeight: 36,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  icon: {
    width: 18,
    height: 18,
    borderRadius: 4,
  },
  name: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  count: {
    minWidth: 22,
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    paddingHorizontal: 6,
  },
  countText: {
    fontSize: 11,
    lineHeight: 13,
    fontVariant: ["tabular-nums"],
    fontWeight: nemuFontWeight.semibold,
  },
});
