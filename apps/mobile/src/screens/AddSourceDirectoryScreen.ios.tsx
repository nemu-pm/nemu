import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  Button as SwiftButton,
  Form as SwiftForm,
  HStack as SwiftHStack,
  Host as SwiftHost,
  Label as SwiftLabel,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  autocorrectionDisabled,
  disabled,
  foregroundStyle,
  keyboardType,
  onSubmit,
  submitLabel,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { nemuSoftScrollEdge, renderNemuNativeToolbarButtons, useNemuTheme } from "@/design-system";
import { useAddSourceDirectoryForm, type AddSourceDirectoryFormParams } from "./useAddSourceDirectoryForm";

type Form = ReturnType<typeof useAddSourceDirectoryForm>;

/**
 * Add Source Directory: a native grouped form pushed from Add Sources or
 * Settings › Source directories. Two ways in, as two groups: an
 * Aidoku-compatible list (its address or an Aidoku add link, pasted here, and
 * Aidoku's own guide), and nemu:// links that websites offer (with nemu's
 * directory page once it exists). Add sits in the bar, as Save does on the
 * server form.
 */
export function AddSourceDirectoryScreen() {
  const { scheme } = useNemuTheme();
  const params = useLocalSearchParams<AddSourceDirectoryFormParams>();
  const form = useAddSourceDirectoryForm(params);
  const { strings } = form;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: strings.browse.addSourceDirectory }} />
      <Stack.Toolbar placement="right">
        {renderNemuNativeToolbarButtons([
          { icon: "checkmark", label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() },
        ])}
      </Stack.Toolbar>
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        <DirectoryForm form={form} />
      </SwiftHost>
    </View>
  );
}

function DirectoryForm({ form }: { form: Form }) {
  const { tokens } = useNemuTheme();
  const { strings } = form;
  const s = strings.settings;
  const address = useNativeState(form.address);

  return (
    <SwiftForm modifiers={[nemuSoftScrollEdge()]}>
      <SwiftSection
        header={<SwiftText>{s.sourceDirectoryAidokuHeader}</SwiftText>}
        footer={<SwiftText>{`${s.sourceDirectoryAidokuFooter}\n\n${s.sourceDirectoryDisclaimer}`}</SwiftText>}
      >
        <SwiftTextField
          text={address}
          autoFocus
          placeholder={s.sourceDirectoryUrlPlaceholder}
          onTextChange={form.setAddress}
          modifiers={[
            accessibilityLabel(s.sourceDirectoryAddress),
            textInputAutocapitalization("never"),
            autocorrectionDisabled(true),
            keyboardType("url"),
            submitLabel("go"),
            onSubmit(() => void form.submit()),
            ...(form.checking ? [disabled(true)] : []),
          ]}
        />
        {form.canPaste ? (
          <SwiftButton
            label={s.pasteSourceDirectoryAddress}
            systemImage="doc.on.clipboard"
            onPress={() => {
              void form.paste().then((pasted) => {
                if (pasted) address.set(pasted);
              });
            }}
          />
        ) : null}
        <SwiftButton
          label={s.openAidokuSourceListsGuide}
          systemImage="safari"
          onPress={form.openAidokuGuide}
        />
      </SwiftSection>
      {form.checking ? (
        <SwiftSection>
          <SwiftHStack spacing={10}>
            <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              {s.checkingSourceDirectory}
            </SwiftText>
            <SwiftSpacer />
            <SwiftProgressView />
          </SwiftHStack>
        </SwiftSection>
      ) : null}
      {form.error ? (
        <SwiftSection>
          <SwiftLabel
            title={form.error}
            systemImage="exclamationmark.triangle"
            color={tokens.danger}
            modifiers={[foregroundStyle(tokens.danger)]}
          />
        </SwiftSection>
      ) : null}
      <SwiftSection
        header={<SwiftText>{s.sourceDirectoryNemuHeader}</SwiftText>}
        footer={<SwiftText>{s.sourceDirectoryNemuFooter}</SwiftText>}
      >
        {form.nemuDirectoriesPageUrl ? (
          <SwiftButton
            label={s.openNemuSourceDirectoriesPage}
            systemImage="globe"
            onPress={form.openNemuDirectoriesPage}
          />
        ) : null}
      </SwiftSection>
    </SwiftForm>
  );
}
