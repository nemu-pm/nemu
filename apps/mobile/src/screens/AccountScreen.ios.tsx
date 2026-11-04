import { useWindowDimensions, View } from "react-native";
import { Stack } from "expo-router";
import {
  Alert as SwiftAlert,
  Button as SwiftButton,
  Form as SwiftForm,
  HStack as SwiftHStack,
  Host as SwiftHost,
  LabeledContent as SwiftLabeledContent,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
} from "@expo/ui/swift-ui";
import {
  foregroundStyle,
  lineLimit,
  listSectionMargins,
  scrollContentBackground,
  tint,
  useScrollGeometryChange,
} from "@expo/ui/swift-ui/modifiers";
import { useCallback, useRef, useState } from "react";
import {
  NemuScrollEdgeSurface,
  nemuSoftScrollEdge,
  useNemuScrollEdgeTracking,
  useNemuTheme,
} from "@/design-system";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import {
  nextMobileFormScrollRest,
  resolveMobileFormScrollEdge,
} from "@/lib/mobileScrollEdgeEffect";
import { scrollEdgeEffectHidden } from "../../modules/nemu-window-layout/src/presentationColorScheme";
import {
  resolveMobileAccountFormSideMargin,
  type MobileAccountScreenProps,
} from "@/lib/mobileAccountLayout";
import { useMobileAccountPage } from "./useMobileAccountPage";

/**
 * Account: a native grouped list, pushed from Settings > Cloud sync. Three
 * sections: the account, Sign Out (app tint, door-and-arrow symbol: not
 * destructive), and Delete Account (system red, trash), always last.
 */
export function AccountScreen({ presentation = "page", onLeft }: MobileAccountScreenProps = {}) {
  const { scheme, tokens } = useNemuTheme();
  const page = useMobileAccountPage({ onLeft });
  const { width } = useWindowDimensions();
  // In the split's detail column the Form fills the column; a wide single
  // column caps its sections at the readable width, centred.
  const sideMargin = resolveMobileAccountFormSideMargin({ presentation, width });
  const edge = useAccountFormScrollEdge();
  const { strings } = page;
  const [confirming, setConfirming] = useState(false);

  const deleteRow = page.deleting ? (
    <SwiftHStack spacing={10}>
      <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
        {strings.account.deleting}
      </SwiftText>
      <SwiftSpacer />
      <SwiftProgressView />
    </SwiftHStack>
  ) : (
    <SwiftButton
      label={strings.account.deleteAccount}
      systemImage="trash"
      role="destructive"
      onPress={() => setConfirming(true)}
    />
  );

  return (
    // The Settings pages' background, not the grouped Form's own (pure black
    // in dark mode): the Form draws none of its own below.
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      {presentation === "page" ? (
        // Always set: on a route the split showed (then collapsed) the list
        // pane had hidden Back and the edge swipe (`setOptions` merges).
        <Stack.Screen
          options={{
            title: strings.account.title,
            headerBackVisible: true,
            gestureEnabled: true,
            headerTitle: undefined,
          }}
        />
      ) : null}
      {/* Beside the Duo's vertical bar: the Settings pages' own band (same
          height and blur), over a Form with no system edge. Elsewhere the
          surface draws nothing and the Form keeps the system's soft edge. */}
      <NemuScrollEdgeSurface nativeHeader tracking={edge.tracking}>
        <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
          <SwiftForm
            modifiers={[
              scrollContentBackground("hidden"),
              nemuSoftScrollEdge(),
              ...edge.formModifiers,
              ...(sideMargin !== null
                ? [listSectionMargins({ edges: "horizontal", length: sideMargin })]
                : []),
            ]}
          >
            <SwiftSection>
              <SwiftLabeledContent label={strings.account.name}>
                <SwiftText modifiers={[lineLimit(1)]}>{page.displayName}</SwiftText>
              </SwiftLabeledContent>
              <SwiftLabeledContent label={strings.account.email}>
                <SwiftText modifiers={[lineLimit(1)]}>{page.email}</SwiftText>
              </SwiftLabeledContent>
              <SwiftLabeledContent label={strings.account.signInMethod}>
                <SwiftText>{page.providerLabel}</SwiftText>
              </SwiftLabeledContent>
            </SwiftSection>
            <SwiftSection
              footer={<SwiftText>{strings.account.signOutFooter}</SwiftText>}
            >
              <SwiftButton
                label={strings.settings.cloudSyncSignOut}
                systemImage="rectangle.portrait.and.arrow.right"
                onPress={page.requestSignOut}
                modifiers={[tint(tokens.primary), foregroundStyle(tokens.primary)]}
              />
            </SwiftSection>
            <SwiftSection
              footer={<SwiftText>{strings.account.deleteFooter}</SwiftText>}
            >
              <SwiftAlert
                title={strings.account.deleteAlertTitle}
                isPresented={confirming}
                onIsPresentedChange={setConfirming}
              >
                <SwiftAlert.Trigger>{deleteRow}</SwiftAlert.Trigger>
                <SwiftAlert.Actions>
                  <SwiftButton label={strings.common.cancel} role="cancel" onPress={() => setConfirming(false)} />
                  <SwiftButton
                    label={strings.account.deleteConfirm}
                    role="destructive"
                    onPress={() => {
                      setConfirming(false);
                      void page.deleteAccount();
                    }}
                  />
                </SwiftAlert.Actions>
                <SwiftAlert.Message>
                  <SwiftText>{strings.account.deleteAlertMessage}</SwiftText>
                </SwiftAlert.Message>
              </SwiftAlert>
            </SwiftSection>
          </SwiftForm>
        </SwiftHost>
      </NemuScrollEdgeSurface>
      {page.signOutSheet}
    </View>
  );
}

/**
 * The Form's top and bottom edges (`resolveMobileFormScrollEdge`): beside a
 * vertical bar its system edge is hidden and the top band follows the Form's
 * scroll (none at rest, as on the React Native pages); otherwise nothing is
 * added to the system's soft edge and no scroll is observed.
 */
function useAccountFormScrollEdge() {
  const { verticalBarSide } = useMobileAdaptiveLayout();
  const band = resolveMobileFormScrollEdge({ platform: "ios", verticalBarSide }) === "app-band";
  // Its shared offset only: the ref is for a React Native scroll view and
  // stays unattached here.
  const { scrolledPastRest } = useNemuScrollEdgeTracking();
  const scroll = useRef<{ rest: number | null; width: number; height: number }>({
    rest: null,
    width: 0,
    height: 0,
  });
  const onGeometry = useCallback(
    (geometry: { contentOffsetY: number; containerWidth: number; containerHeight: number }) => {
      const last = scroll.current;
      const sizeChanged =
        last.rest !== null &&
        (geometry.containerWidth !== last.width || geometry.containerHeight !== last.height);
      const rest = nextMobileFormScrollRest({
        rest: last.rest,
        offset: geometry.contentOffsetY,
        sizeChanged,
        wasAtRest: scrolledPastRest.get() <= 0,
      });
      scroll.current = { rest, width: geometry.containerWidth, height: geometry.containerHeight };
      scrolledPastRest.set(geometry.contentOffsetY - rest);
    },
    [scrolledPastRest],
  );
  // JS-delivered (no worklet runtime needed): one short page, and only
  // observed while the band is drawn.
  const geometryModifier = useScrollGeometryChange(band ? onGeometry : undefined);
  return {
    tracking: { scrolledPastRest },
    formModifiers: band
      ? [scrollEdgeEffectHidden(), ...(geometryModifier ? [geometryModifier] : [])]
      : [],
  };
}
