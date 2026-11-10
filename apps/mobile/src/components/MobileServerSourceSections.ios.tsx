import {
  HStack as SwiftHStack,
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
import type { useServerSourceForm } from "./useServerSourceForm";

// No username/password content types: a reader app's server login must not be offered to (or saved by) the system password manager.
const plainText = [textInputAutocapitalization("never"), autocorrectionDisabled(true), multilineTextAlignment("trailing")];

/** A server's address, name and login, in a native grouped Form. */
export function MobileServerSourceSections({
  form,
  autoFocus = false,
}: {
  form: ReturnType<typeof useServerSourceForm>;
  autoFocus?: boolean;
}) {
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
    <>
      <SwiftSection>
        <SwiftLabeledContent label={strings.selfHosted.serverAddress}>
          <SwiftTextField
            text={server}
            autoFocus={autoFocus}
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
      <SwiftSection footer={<SwiftText>{form.loginFooter}</SwiftText>}>
        <SwiftLabeledContent label={strings.selfHosted.username}>
          <SwiftTextField text={username} placeholder={strings.selfHosted.username} onTextChange={form.setUsername} modifiers={plainText} />
        </SwiftLabeledContent>
        <SwiftLabeledContent label={strings.selfHosted.password}>
          <SwiftSecureField text={password} placeholder={strings.selfHosted.password} onTextChange={form.setPassword} modifiers={[multilineTextAlignment("trailing"), textContentType("oneTimeCode")]} />
        </SwiftLabeledContent>
        {form.takesApiKey ? (
          <SwiftLabeledContent label={strings.selfHosted.apiKey}>
            {/* A plain field: two secure fields in one form read as account sign-up, and iOS offers to generate a password. */}
            <SwiftTextField text={apiKey} placeholder={strings.selfHosted.apiKey} onTextChange={form.setApiKey} modifiers={plainText} />
          </SwiftLabeledContent>
        ) : null}
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
    </>
  );
}
