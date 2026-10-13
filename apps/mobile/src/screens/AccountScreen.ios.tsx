import { View } from "react-native";
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
import { foregroundStyle, lineLimit } from "@expo/ui/swift-ui/modifiers";
import { useState } from "react";
import { useNemuTheme } from "@/design-system";
import { useMobileAccountPage } from "./useMobileAccountPage";

/** Account: a native grouped list, pushed from Settings > Cloud sync. */
export function AccountScreen() {
  const { scheme } = useNemuTheme();
  const page = useMobileAccountPage();
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
      role="destructive"
      onPress={() => setConfirming(true)}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: strings.account.title }} />
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        <SwiftForm>
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
          <SwiftSection>
            <SwiftButton
              label={strings.settings.cloudSyncSignOut}
              onPress={page.requestSignOut}
              modifiers={[foregroundStyle({ type: "hierarchical", style: "primary" })]}
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
