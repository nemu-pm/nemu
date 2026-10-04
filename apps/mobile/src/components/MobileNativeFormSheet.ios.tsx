import type { SFSymbol } from "sf-symbols-typescript";
import {
  BottomSheet as SwiftBottomSheet,
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  Host as SwiftHost,
  NavigationStack as SwiftNavigationStack,
  ProgressView as SwiftProgressView,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  interactiveDismissDisabled,
  labelStyle,
  lineLimit,
  listSectionMargins,
  listSectionSpacing,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  scrollContentBackground,
  scrollEdgeEffectStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { PlatformColor, StyleSheet, View, type ColorValue } from "react-native";
import { useNemuTheme } from "@/design-system";
import { MOBILE_GROUPED_FORM_TOP_MARGIN } from "@/lib/mobileLibrarySheetLayout";
import {
  inlineToolbarTitle,
  zeroTopScrollContentMargin,
} from "../../modules/nemu-window-layout/src/presentationColorScheme";
import type { MobileNativeFormSheetAction, MobileNativeFormSheetProps } from "./MobileNativeFormSheet.types";

export const mobileNativeFormSheetAvailable = true;

/** `background="grouped"`: the grouped-table backdrop, resolved per appearance. */
const GROUPED_SHEET_BACKGROUND = PlatformColor("systemGroupedBackground");

function ToolbarActionButton({
  action,
  role,
  accent,
}: {
  action: MobileNativeFormSheetAction;
  role?: "cancel";
  /** The app accent, for the one item the system draws in it (the confirming action). */
  accent?: ColorValue;
}) {
  if (action.busy) return <SwiftProgressView />;
  return (
    <SwiftButton
      label={action.label}
      role={role}
      onPress={action.onPress}
      modifiers={[
        ...(accent ? [tint(accent)] : []),
        ...(action.disabled ? [swiftDisabled(true)] : []),
      ]}
    />
  );
}

/**
 * A system sheet with a grouped `Form` in a navigation bar — the shape of
 * Apple's own pickers and editors (Photos "Add to Album", Reminders' list
 * info, Settings detail sheets): the title (and a secondary line) centred in
 * the bar, Cancel at the leading edge (a lone close X at the trailing edge,
 * as in every other sheet), the confirming action at the
 * trailing edge, rows as native inset-grouped cells, the system grabber and
 * detents. Positioning off the Duo fold and Dynamic Type come from the
 * system. iOS only: other platforms keep their React Native sheets.
 */
export function MobileNativeFormSheet({
  visible,
  onClose,
  onDismiss,
  title,
  subtitle,
  detents,
  background = "glass",
  interactiveDismissDisabled: dismissDisabled = false,
  cancel,
  closeAccessibilityLabel,
  confirm,
  primaryAction,
  children,
  wrapForm,
  formKey,
  testID,
}: MobileNativeFormSheetProps) {
  const { scheme, tokens } = useNemuTheme();
  const grouped = background === "grouped";
  const form = (
    <SwiftForm
      key={formKey}
      modifiers={[
        // The accent is for the form's own controls; the bar above keeps the
        // system's item colours (see the toolbar below).
        tint(tokens.primary),
        ...(grouped
          ? [
              scrollContentBackground("hidden"),
              listSectionSpacing("compact"),
              // The first group sits just under the bar instead of below an
              // empty large-title row and the grouped list's top margin.
              inlineToolbarTitle(),
              zeroTopScrollContentMargin(),
              listSectionMargins({ edges: "top", length: MOBILE_GROUPED_FORM_TOP_MARGIN }),
            ]
          : []),
      ]}
    >
      {children}
    </SwiftForm>
  );

  return (
    <View pointerEvents="none" style={styles.host} testID={testID}>
      {/* No `seedColor`: it tints the whole host, bar items included. The
          form carries the accent itself. */}
      <SwiftHost colorScheme={scheme} style={StyleSheet.absoluteFill}>
        <SwiftBottomSheet
          isPresented={visible}
          onIsPresentedChange={(presented) => {
            if (!presented && visible) onClose();
          }}
          onDismiss={onDismiss}
        >
          <SwiftGroup
            modifiers={[
              presentationDetents(detents),
              presentationDragIndicator("visible"),
              ...(grouped ? [presentationBackground(GROUPED_SHEET_BACKGROUND)] : []),
              interactiveDismissDisabled(dismissDisabled),
              // Rows fade softly under the sheet's bar, as on every page.
              scrollEdgeEffectStyle("soft", "vertical"),
            ]}
          >
            {/* No tint on the stack: bar items take the system's own colours
                (Cancel and the close X included). Only the confirming action,
                which the system draws in the app accent, is given ours. */}
            <SwiftNavigationStack>
              <SwiftToolbar>
                {wrapForm ? wrapForm(form) : form}
                <SwiftToolbar.Content>
                  {cancel ? (
                    <SwiftToolbarItem placement="cancellationAction">
                      <ToolbarActionButton action={cancel} role="cancel" />
                    </SwiftToolbarItem>
                  ) : (
                    // The close X sits at the trailing edge like every other
                    // sheet (reader settings, the React Native sheets).
                    <SwiftToolbarItem placement="topBarTrailing">
                      <SwiftButton
                        role="close"
                        onPress={onClose}
                        modifiers={
                          closeAccessibilityLabel ? [swiftAccessibilityLabel(closeAccessibilityLabel)] : []
                        }
                      />
                    </SwiftToolbarItem>
                  )}
                  <SwiftToolbarItem placement="principal">
                    <SwiftVStack spacing={1}>
                      <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{title}</SwiftText>
                      {subtitle ? (
                        <SwiftText
                          modifiers={[
                            font({ textStyle: "caption" }),
                            foregroundStyle({ type: "hierarchical", style: "secondary" }),
                            lineLimit(1),
                          ]}
                        >
                          {subtitle}
                        </SwiftText>
                      ) : null}
                    </SwiftVStack>
                  </SwiftToolbarItem>
                  {primaryAction ? (
                    <SwiftToolbarItem placement="primaryAction">
                      {primaryAction.busy ? (
                        <SwiftProgressView />
                      ) : (
                        <SwiftButton
                          label={primaryAction.label}
                          systemImage={primaryAction.systemImage as SFSymbol}
                          onPress={primaryAction.onPress}
                          modifiers={[
                            labelStyle("iconOnly"),
                            ...(primaryAction.disabled ? [swiftDisabled(true)] : []),
                          ]}
                        />
                      )}
                    </SwiftToolbarItem>
                  ) : null}
                  {confirm ? (
                    <SwiftToolbarItem placement="confirmationAction">
                      <ToolbarActionButton action={confirm} accent={tokens.primary} />
                    </SwiftToolbarItem>
                  ) : null}
                </SwiftToolbar.Content>
              </SwiftToolbar>
            </SwiftNavigationStack>
          </SwiftGroup>
        </SwiftBottomSheet>
      </SwiftHost>
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  },
});
