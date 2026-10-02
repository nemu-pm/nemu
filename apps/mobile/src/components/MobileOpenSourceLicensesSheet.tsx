import { useState } from "react";
import { Linking, Platform, StyleSheet, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  NemuText,
  radius,
  useNemuTheme,
  useMobileNativeSheetTheme,
} from "@/design-system";
import { hapticError } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import {
  groupMobileOpenSourceNotices,
  type MobileOpenSourceNotice,
  type MobileOpenSourceNoticeSection,
} from "@/lib/mobileOpenSourceLicenses";

type MobileOpenSourceLicensesSheetProps = {
  visible: boolean;
  strings: MobileStrings;
  onClose: () => void;
};

function sectionTitle(
  section: MobileOpenSourceNoticeSection,
  strings: MobileStrings,
): string {
  const copy = strings.openSourceLicenses;
  switch (section) {
    case "japaneseAnalysis":
      return copy.sectionJapaneseAnalysis;
    case "fonts":
      return copy.sectionFonts;
    case "software":
      return copy.sectionSoftware;
  }
}

/**
 * Settings → About nemu → Open-source licenses: the third-party notices the
 * app and its on-device dictionary redistribute, grouped under localized
 * headings; every notice's own text stays verbatim.
 */
export function MobileOpenSourceLicensesSheet({
  visible,
  strings,
  onClose,
}: MobileOpenSourceLicensesSheetProps) {
  const { tokens } = useMobileNativeSheetTheme();
  const groups = groupMobileOpenSourceNotices(Platform.OS);

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      title={strings.openSourceLicenses.title}
      snapPoints={["92%"]}
      scroll
      scrollContentBottomInset={24}
      testID="OpenSourceLicensesSheet"
      contentStyle={styles.content}
    >
      <NemuText color={tokens.mutedForeground} variant="rowSubtitle">
        {strings.openSourceLicenses.intro}
      </NemuText>
      {groups.map((group) => (
        <View key={group.section} style={styles.section}>
          <NemuText
            accessibilityRole="header"
            color={tokens.mutedForeground}
            style={styles.sectionTitle}
            variant="label"
          >
            {sectionTitle(group.section, strings)}
          </NemuText>
          <View
            style={[
              styles.card,
              { backgroundColor: tokens.card, borderColor: tokens.border },
            ]}
          >
            {group.notices.map((notice, index) => (
              <MobileOpenSourceNoticeRow
                key={notice.id}
                first={index === 0}
                notice={notice}
                strings={strings}
              />
            ))}
          </View>
        </View>
      ))}
    </MobileNativeSheetScaffold>
  );
}

function MobileOpenSourceNoticeRow({
  first,
  notice,
  strings,
}: {
  first: boolean;
  notice: MobileOpenSourceNotice;
  strings: MobileStrings;
}) {
  const { tokens } = useNemuTheme();
  const [expanded, setExpanded] = useState(false);
  const copy = strings.openSourceLicenses;

  return (
    <View
      style={[
        styles.notice,
        !first && { borderTopColor: tokens.border, borderTopWidth: StyleSheet.hairlineWidth },
      ]}
    >
      <View style={styles.noticeHeader}>
        <NemuText
          color={tokens.foreground}
          style={styles.noticeName}
          variant="rowTitle"
        >
          {notice.name}
        </NemuText>
        <View style={[styles.licenseBadge, { backgroundColor: tokens.muted }]}>
          <NemuText color={tokens.mutedForeground} variant="label">
            {notice.license}
          </NemuText>
        </View>
      </View>
      <NemuText color={tokens.mutedForeground} selectable variant="caption">
        {notice.notice}
      </NemuText>
      {/* Links and the license toggle share one wrapping row of 44pt targets. */}
      <View style={styles.links}>
        {notice.links.map((link) => (
          <NemuPressable
            key={link.url}
            accessibilityRole="link"
            accessibilityLabel={formatMobileString(copy.openLinkAccessibility, {
              name: link.label,
            })}
            minimumTouchTarget
            onPress={() => {
              Linking.openURL(link.url).catch(() => {
                void hapticError();
              });
            }}
            pressedScale={0.97}
            style={styles.link}
          >
            <NemuText color={tokens.primary} numberOfLines={1} variant="label">
              {link.label}
            </NemuText>
            <Ionicons name="open-outline" size={12} color={tokens.primary} />
          </NemuPressable>
        ))}
        {notice.licenseText ? (
          <NemuPressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            accessibilityLabel={`${expanded ? copy.hideLicense : copy.showLicense}, ${notice.name}`}
            minimumTouchTarget
            onPress={() => setExpanded((value) => !value)}
            pressedScale={0.97}
            style={styles.link}
          >
            <NemuText color={tokens.foreground} variant="label">
              {expanded ? copy.hideLicense : copy.showLicense}
            </NemuText>
            <Ionicons
              name={expanded ? "chevron-up" : "chevron-down"}
              size={13}
              color={tokens.mutedForeground}
            />
          </NemuPressable>
        ) : null}
      </View>
      {notice.licenseText && expanded ? (
        <View style={[styles.licenseText, { backgroundColor: tokens.secondary }]}>
          <NemuText
            color={tokens.mutedForeground}
            selectable
            style={styles.licenseBody}
          >
            {notice.licenseText}
          </NemuText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    textTransform: "uppercase",
    paddingHorizontal: 4,
  },
  card: {
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
  },
  notice: {
    gap: 4,
    paddingTop: 12,
    paddingBottom: 4,
  },
  noticeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  noticeName: {
    flex: 1,
    minWidth: 0,
  },
  licenseBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    maxWidth: "46%",
  },
  links: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: 14,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    minHeight: 28,
  },
  licenseText: {
    borderRadius: radius.md,
    padding: 10,
  },
  licenseBody: {
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }),
    fontSize: 10.5,
    lineHeight: 15,
  },
});
