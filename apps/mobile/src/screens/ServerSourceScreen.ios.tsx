import { View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  Form as SwiftForm,
  HStack as SwiftHStack,
  Host as SwiftHost,
  LabeledContent as SwiftLabeledContent,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  SecureField as SwiftSecureField,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  autocorrectionDisabled,
  foregroundStyle,
  keyboardType,
  multilineTextAlignment,
  textContentType,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { renderNemuNativeToolbarButtons, useNemuTheme } from "@/design-system";
import { useServerSourceForm, type ServerSourceFormParams } from "./useServerSourceForm";

type Form = ReturnType<typeof useServerSourceForm>;

// No username/password content types: a reader app's server login must not be offered to (or saved by) the system password manager.
const plainText = [textInputAutocapitalization("never"), autocorrectionDisabled(true), multilineTextAlignment("trailing")];

/** Server setup (Komga, Kavita): a native grouped form pushed from Add Source or a source's settings. */
export function ServerSourceScreen() {
  const { scheme } = useNemuTheme();
  const params = useLocalSearchParams<ServerSourceFormParams>();
  const form = useServerSourceForm(params);
  const { strings } = form;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: form.editing ? form.fields.name || form.kindName : form.kindName }} />
      <Stack.Toolbar placement="right">
        {renderNemuNativeToolbarButtons([
          { icon: "checkmark", label: strings.common.save, disabled: !form.canSave, onPress: () => void form.save() },
        ])}
      </Stack.Toolbar>
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        {form.loaded ? <ServerForm form={form} /> : <SwiftSpacer />}
      </SwiftHost>
    </View>
  );
}

function ServerForm({ form }: { form: Form }) {
  const { strings, fields } = form;
  const server = useNativeState(fields.server);
  const name = useNativeState(fields.name);
  const username = useNativeState(fields.username);
  const password = useNativeState(fields.password);
  const apiKey = useNativeState(fields.apiKey);
  form.clearSecretsRef.current = () => {
    password.set("");
    apiKey.set("");
  };

  return (
    <SwiftForm>
      <SwiftSection>
        <SwiftLabeledContent label={strings.selfHosted.serverAddress}>
          <SwiftTextField
            text={server}
            placeholder={form.serverPlaceholder}
            onTextChange={form.setServer}
            modifiers={[...plainText, keyboardType("url")]}
          />
        </SwiftLabeledContent>
        <SwiftLabeledContent label={strings.selfHosted.name}>
          <SwiftTextField
            text={name}
            placeholder={form.kindName}
            onTextChange={form.setName}
            modifiers={[multilineTextAlignment("trailing")]}
          />
        </SwiftLabeledContent>
      </SwiftSection>
      <SwiftSection footer={<SwiftText>{strings.selfHosted.loginFooter}</SwiftText>}>
        <SwiftLabeledContent label={strings.selfHosted.username}>
          <SwiftTextField text={username} placeholder={strings.selfHosted.username} onTextChange={form.setUsername} modifiers={plainText} />
        </SwiftLabeledContent>
        <SwiftLabeledContent label={strings.selfHosted.password}>
          <SwiftSecureField text={password} placeholder={strings.selfHosted.password} onTextChange={form.setPassword} modifiers={[multilineTextAlignment("trailing"), textContentType("oneTimeCode")]} />
        </SwiftLabeledContent>
        <SwiftLabeledContent label={strings.selfHosted.apiKey}>
          {/* A plain field: two secure fields in one form read as account sign-up, and iOS offers to generate a password. */}
          <SwiftTextField text={apiKey} placeholder={strings.selfHosted.apiKey} onTextChange={form.setApiKey} modifiers={plainText} />
        </SwiftLabeledContent>
      </SwiftSection>
      {form.saving ? (
        <SwiftSection>
          <SwiftHStack spacing={10}>
            <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              {strings.selfHosted.connecting}
            </SwiftText>
            <SwiftSpacer />
            <SwiftProgressView />
          </SwiftHStack>
        </SwiftSection>
      ) : null}
    </SwiftForm>
  );
}
