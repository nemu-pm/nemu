import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Label as SwiftLabel,
  SecureField as SwiftSecureField,
  Section as SwiftSection,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  autocorrectionDisabled,
  disabled as swiftDisabled,
  foregroundStyle,
  keyboardType,
  lineLimit,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { useMobileDesignExplore } from "@/lib/mobileDesignExplore";
import { MOBILE_NATIVE_FORM_ROW, getMobileNativeFormSheetHeight } from "@/lib/mobileNativeFormSheetLayout";
import { MobileNativeFormSheet } from "./MobileNativeFormSheet";
import type { MobileSourceLoginNativeField, MobileSourceLoginNativeSheetProps } from "./MobileSourceLoginNativeSheet.types";

export const mobileSourceLoginNativeSheetAvailable = true;

/** A multi-line field's height (cookies, local storage): about four lines. */
const MULTILINE_ROW = 100;

/**
 * A source's login as a native form sheet: Cancel and the submit action in
 * the bar (Cancel stays live while the credentials are checked: it is the
 * sheet's escape), the fields as Form rows, the instructions under them and a
 * rejection as its own group.
 */
export function MobileSourceLoginNativeSheet({
  visible,
  title,
  instructions,
  method,
  fields,
  error,
  submitting,
  cancelLabel,
  submitLabel,
  submitAccessibilityLabel,
  onClose,
  onDismiss,
  onSubmit,
}: MobileSourceLoginNativeSheetProps) {
  const { tokens } = useNemuTheme();
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Design-explore: the fields start under the bar, not below an empty band.
  const tightTop = useMobileDesignExplore();
  const rowHeight = (field: MobileSourceLoginNativeField) => (field.multiline ? MULTILINE_ROW : MOBILE_NATIVE_FORM_ROW);
  const groups =
    method === "basic"
      ? [{ rows: fields.map(rowHeight), footer: instructions }]
      : fields.map((field, index) => ({
          header: field.label,
          rows: [rowHeight(field)],
          footer: [field.footer, index === fields.length - 1 ? instructions : null].filter(Boolean).join("\n"),
        }));
  const sheetHeight = getMobileNativeFormSheetHeight({
    sections: error ? [...groups, { rows: [MOBILE_NATIVE_FORM_ROW], footer: error }] : groups,
    sheetWidth: Math.min(width - insets.left - insets.right - 16, 620),
    fontScale,
    maxHeight: height - insets.top,
    tightTop,
    bottomInset: insets.bottom,
  });
  const lastIndex = fields.length - 1;
  const field = (item: MobileSourceLoginNativeField) => (
    <LoginField key={item.label} field={item} disabled={submitting} />
  );

  return (
    <MobileNativeFormSheet
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={title}
      detents={[{ height: sheetHeight }, "large"]}
      tightTop={tightTop}
      padSizing="form"
      // Swiping away mid-request is blocked; Cancel stays the escape.
      interactiveDismissDisabled={submitting}
      cancel={{ label: cancelLabel, onPress: onClose }}
      confirm={{
        label: submitLabel,
        accessibilityLabel: submitAccessibilityLabel,
        busy: submitting,
        onPress: onSubmit,
      }}
      testID="MobileSourceLoginSheet"
    >
      {method === "basic" ? (
        <SwiftSection footer={<SwiftText>{instructions}</SwiftText>}>{fields.map(field)}</SwiftSection>
      ) : (
        fields.map((item, index) => {
          const footer = [item.footer, index === lastIndex ? instructions : null].filter(Boolean).join("\n");
          return (
            <SwiftSection
              key={item.label}
              header={<SwiftText>{item.label}</SwiftText>}
              footer={footer ? <SwiftText>{footer}</SwiftText> : undefined}
            >
              {field(item)}
            </SwiftSection>
          );
        })
      )}
      {error ? (
        <SwiftSection>
          <SwiftLabel
            title={error}
            systemImage="exclamationmark.triangle"
            color={tokens.danger}
            modifiers={[foregroundStyle(tokens.danger)]}
          />
        </SwiftSection>
      ) : null}
    </MobileNativeFormSheet>
  );
}

function LoginField({ field, disabled }: { field: MobileSourceLoginNativeField; disabled: boolean }) {
  const text = useNativeState(field.value);
  const modifiers = [
    swiftAccessibilityLabel(field.label),
    textInputAutocapitalization("never"),
    autocorrectionDisabled(),
    ...(field.keyboard === "email-address" ? [keyboardType("email-address")] : []),
    ...(field.multiline ? [lineLimit(4)] : []),
    ...(disabled ? [swiftDisabled(true)] : []),
  ];
  if (field.secure) {
    return (
      <SwiftSecureField
        text={text}
        placeholder={field.placeholder}
        onTextChange={field.onChange}
        modifiers={modifiers}
      />
    );
  }
  return (
    <SwiftTextField
      text={text}
      placeholder={field.placeholder}
      axis={field.multiline ? "vertical" : "horizontal"}
      onTextChange={field.onChange}
      modifiers={modifiers}
    />
  );
}
