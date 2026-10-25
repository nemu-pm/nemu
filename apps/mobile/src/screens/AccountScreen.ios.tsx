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
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { nemuSoftScrollEdge, useNemuTheme } from "@/design-system";
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
    <View style={{ flex: 1 }}>
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
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        <SwiftForm
          modifiers={[
            nemuSoftScrollEdge(),
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
      {page.signOutSheet}
    </View>
  );
}
