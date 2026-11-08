import { useEffect } from "react";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
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
import { useNemuTheme } from "@/design-system";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet.ios";
import { MobilePushedFormPage } from "./MobilePushedFormPage.ios";
import type {
  MobileAddSourceDirectorySheetProps,
  MobileAddSourcesDirectoryPageProps,
} from "./MobileAddSourceDirectorySheet.types";
import {
  useAddSourceDirectoryForm,
  useAddSourceDirectorySheetForm,
  type AddSourceDirectoryForm,
} from "./useAddSourceDirectoryForm";

/**
 * Add Source Directory's group, in a native grouped Form: an Aidoku-compatible
 * list's address or add link, typed or pasted. It lists no directory.
 */
function DirectorySections({ form }: { form: AddSourceDirectoryForm }) {
  const { tokens } = useNemuTheme();
  const { strings } = form;
  const s = strings.settings;
  const address = useNativeState(form.address);

  return (
    <>
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
    </>
  );
}

/**
 * From Settings: a form sheet with Cancel and Add in its bar; centred on a
 * regular-width iPad. Added, it comes down and a toast offers the sources.
 */
export function MobileAddSourceDirectorySheet(props: MobileAddSourceDirectorySheetProps) {
  const { form, close, handleDismiss } = useAddSourceDirectorySheetForm(props);
  const { strings } = form;

  return (
    <MobileNativeFormSheet
      visible={props.visible}
      onClose={close}
      onDismiss={handleDismiss}
      title={strings.browse.addSourceDirectory}
      detents={[{ fraction: 0.75 }, "large"]}
      tightTop
      padSizing="form"
      interactiveDismissDisabled={form.blocksDismiss}
      cancel={{ label: strings.common.cancel, onPress: close }}
      confirm={{ label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() }}
      testID="AddSourceDirectorySheet"
    >
      <DirectorySections form={form} />
    </MobileNativeFormSheet>
  );
}

/** From Add Sources: the page pushed on that sheet's stack (`MobileAddSourcesStack`). */
export function MobileAddSourcesDirectoryPage({ open, onAdded, onDismissBlockedChange }: MobileAddSourcesDirectoryPageProps) {
  const form = useAddSourceDirectoryForm({ onAdded: (added) => onAdded(added.id) });
  const { strings, cancel, blocksDismiss } = form;

  // Back while a check runs walks away from it.
  useEffect(() => {
    if (!open) cancel();
  }, [cancel, open]);
  useEffect(() => {
    onDismissBlockedChange(open && blocksDismiss);
  }, [blocksDismiss, onDismissBlockedChange, open]);

  return (
    <MobilePushedFormPage
      title={strings.browse.addSourceDirectory}
      confirm={{ label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() }}
    >
      <DirectorySections form={form} />
    </MobilePushedFormPage>
  );
}
