import { useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import appIcon from "../../assets/icon.jpg";
import packageJson from "../../package.json";
import { MobileInlineErrorBanner } from "@/components/MobileInlineErrorBanner";
import {
  MobileNativeSheetScaffold,
  NemuPressable,
  radius,
  nemuBrandTextStyle,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  useNemuTheme,
} from "@/design-system";
import { NemuAppIconHalo } from "@/components/NemuAppIconHalo";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  canOpenMobileAboutSourceCode,
  type MobileAboutActionState,
} from "@/lib/mobileAboutActions";
import { getMobileStrings } from "@/lib/mobileI18n";
import { describeMobileErrorDetail } from "@/lib/mobileSourceErrors";
import { getMobileAboutSheetLayout } from "@/lib/mobileAboutLayout";

const APP_VERSION = packageJson.version;
const SOURCE_URL = "https://github.com/nemu-pm/nemu";
const githubIconPaths = [
  "M6.51734 17.1132C6.91177 17.6905 8.10883 18.9228 9.74168 19.2333M9.86428 22C8.83582 21.8306 2 19.6057 2 12.0926C2 5.06329 8.0019 2 12.0008 2C15.9996 2 22 5.06329 22 12.0926C22 19.6057 15.1642 21.8306 14.1357 22C14.1357 22 13.9267 18.5826 14.0487 17.9969C14.1706 17.4113 13.7552 16.4688 13.7552 16.4688C14.7262 16.1055 16.2043 15.5847 16.7001 14.1874C17.0848 13.1032 17.3268 11.5288 16.2508 10.0489C16.2508 10.0489 16.5318 7.65809 15.9996 7.56548C15.4675 7.47287 13.8998 8.51192 13.8998 8.51192C13.4432 8.38248 12.4243 8.13476 12.0018 8.17939C11.5792 8.13476 10.5568 8.38248 10.1002 8.51192C10.1002 8.51192 8.53249 7.47287 8.00036 7.56548C7.46823 7.65809 7.74917 10.0489 7.74917 10.0489C6.67316 11.5288 6.91516 13.1032 7.2999 14.1874C7.79575 15.5847 9.27384 16.1055 10.2448 16.4688C10.2448 16.4688 9.82944 17.4113 9.95135 17.9969C10.0733 18.5826 9.86428 22 9.86428 22Z",
] as const;

const linkSquareIconPaths = [
  "M11.1004 3.00208C7.4515 3.00864 5.54073 3.09822 4.31962 4.31931C3.00183 5.63706 3.00183 7.75796 3.00183 11.9997C3.00183 16.2415 3.00183 18.3624 4.31962 19.6801C5.6374 20.9979 7.75836 20.9979 12.0003 20.9979C16.2421 20.9979 18.3631 20.9979 19.6809 19.6801C20.902 18.4591 20.9916 16.5484 20.9982 12.8996",
  "M20.4803 3.51751L14.931 9.0515M20.4803 3.51751C19.9863 3.023 16.6587 3.0691 15.9552 3.0791M20.4803 3.51751C20.9742 4.01202 20.9282 7.34329 20.9182 8.04754",
] as const;

type MobileAboutSheetProps = {
  visible: boolean;
  onClose: () => void;
};

export function MobileAboutSheet({ visible, onClose }: MobileAboutSheetProps) {
  const { tokens } = useNemuTheme();
  const insets = useSafeAreaInsets();
  const { fontScale, height, width } = useWindowDimensions();
  const sheetLayout = getMobileAboutSheetLayout({
    bottomInset: insets.bottom,
    fontScale,
    height,
    platform: Platform.OS,
    topInset: insets.top,
    width,
  });
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [openingSourceCode, setOpeningSourceCode] = useState(false);
  const openingSourceCodeRef = useRef(false);

  const getGuardedActionState = (): MobileAboutActionState => ({
    openingSourceCode: openingSourceCodeRef.current || openingSourceCode,
  });

  const closeSheet = () => {
    setLinkError(null);
    onClose();
  };

  const openSourceCode = async () => {
    if (!canOpenMobileAboutSourceCode(getGuardedActionState())) return;
    openingSourceCodeRef.current = true;
    setOpeningSourceCode(true);
    setLinkError(null);
    try {
      await Linking.openURL(SOURCE_URL);
      await hapticConfirm();
    } catch (error) {
      await hapticError();
      setLinkError(
        describeMobileErrorDetail(
          error,
          strings.common.externalLinkFailedDetail,
        ),
      );
    } finally {
      openingSourceCodeRef.current = false;
      setOpeningSourceCode(false);
    }
  };

  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={closeSheet}
      snapPoints={
        sheetLayout.snapPointHeight ? [sheetLayout.snapPointHeight] : undefined
      }
      scroll={sheetLayout.scroll}
      scrollContentBottomInset={18}
      testID="AboutNemuSheet"
      contentStyle={styles.sheet}
    >
      <NemuAppIconHalo
        accessibilityLabel={strings.about.appIconLabel}
        source={appIcon}
        style={styles.iconCluster}
      />

      <View style={styles.titleBlock}>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.brandTitle, nemuBrandTextStyle, { color: tokens.primary }]}
        >
          nemu
        </Text>
        <Text
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={[styles.tagline, { color: tokens.mutedForeground }]}
        >
          {strings.about.tagline}
        </Text>
      </View>

      <View style={styles.versionWrap}>
        <View style={[styles.versionBadge, { backgroundColor: tokens.muted }]}>
          <View style={[styles.versionDot, { backgroundColor: tokens.success }]} />
          <Text
            maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
            style={[styles.versionText, { color: tokens.mutedForeground }]}
          >
            v{APP_VERSION}
          </Text>
        </View>
      </View>

      <Text
        maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
        style={[styles.description, { color: tokens.mutedForeground }]}
      >
        {strings.about.description}
      </Text>

      <View style={styles.links}>
        <NemuPressable
          accessibilityRole="link"
          accessibilityLabel={strings.about.openSourceCode}
          accessibilityState={{
            busy: openingSourceCode || undefined,
            disabled: openingSourceCode,
          }}
          disabled={openingSourceCode}
          onPress={() => {
            void openSourceCode();
          }}
          pressedScale={0.98}
          style={[
            styles.linkRow,
            {
              backgroundColor: colorWithOpacity(tokens.muted, 0.42),
              opacity: openingSourceCode ? 0.66 : 1,
            },
          ]}
        >
          <View style={[styles.linkIcon, { backgroundColor: tokens.sourceIconGlass }]}>
            {openingSourceCode ? (
              <ActivityIndicator size="small" color={tokens.foreground} />
            ) : (
              <HugeiconsNativeIcon
                color={tokens.foreground}
                paths={githubIconPaths}
                size={17}
              />
            )}
          </View>
          <View style={styles.linkText}>
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              style={[styles.linkTitle, { color: tokens.foreground }]}
            >
              {strings.about.sourceCode}
            </Text>
            <Text
              maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
              numberOfLines={1}
              style={[styles.linkSubtitle, { color: tokens.mutedForeground }]}
            >
              github.com/nemu-pm/nemu
            </Text>
          </View>
          <HugeiconsNativeIcon
            color={tokens.mutedForeground}
            paths={linkSquareIconPaths}
            size={17}
          />
        </NemuPressable>
      </View>

      {linkError ? (
        <MobileInlineErrorBanner
          title={strings.common.externalLinkFailed}
          detail={linkError}
          dismissLabel={strings.common.clear}
          onDismiss={() => setLinkError(null)}
          variant="embedded"
        />
      ) : null}

    </MobileNativeSheetScaffold>
  );
}

function HugeiconsNativeIcon({
  color,
  paths,
  size,
}: {
  color: string;
  paths: readonly string[];
  size: number;
}) {
  return (
    <Svg fill="none" height={size} viewBox="0 0 24 24" width={size}>
      {paths.map((d) => (
        <Path
          d={d}
          key={d}
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
        />
      ))}
    </Svg>
  );
}

function colorWithOpacity(color: string, opacity: number) {
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (!hex) return color;
  const raw = hex[1];
  const red = Number.parseInt(raw.slice(0, 2), 16);
  const green = Number.parseInt(raw.slice(2, 4), 16);
  const blue = Number.parseInt(raw.slice(4, 6), 16);
  return `rgba(${red},${green},${blue},${Math.max(0, Math.min(1, opacity))})`;
}

const styles = StyleSheet.create({
  sheet: {
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  iconCluster: {
    width: 104,
    height: 96,
  },
  titleBlock: {
    alignItems: "center",
    gap: 5,
  },
  brandTitle: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: nemuFontWeight.medium,
  },
  tagline: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 15,
    lineHeight: 21,
  },
  versionWrap: {
    minHeight: 28,
    justifyContent: "center",
  },
  versionBadge: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 12,
  },
  versionDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
  },
  versionText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  description: {
    maxWidth: 310,
    textAlign: "center",
    fontSize: 14,
    lineHeight: 21,
  },
  links: {
    width: "100%",
    gap: 8,
    paddingTop: 2,
  },
  linkRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: radius.xl,
    paddingHorizontal: 12,
  },
  linkIcon: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  linkTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  linkSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
});
