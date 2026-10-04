import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ColorValue } from "react-native";
import {
  Alert as SwiftAlert,
  Button as SwiftButton,
  ConfirmationDialog as SwiftConfirmationDialog,
  HStack as SwiftHStack,
  Image as SwiftImage,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  TextField as SwiftTextField,
  VStack as SwiftVStack,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityAddTraits,
  accessibilityLabel as swiftAccessibilityLabel,
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  lineLimit,
  listRowBackground,
  monospacedDigit,
  submitLabel,
  textInputAutocapitalization,
} from "@expo/ui/swift-ui/modifiers";
import type { SFSymbol } from "sf-symbols-typescript";

const BUTTON_EVENT_GRACE_MS = 300;

/**
 * A SwiftUI alert with one text field — how Photos names a new album or
 * renames one. `children` is the view the alert is attached to.
 */
export function NativeNameAlert({
  presented,
  title,
  message,
  placeholder,
  initialValue = "",
  confirmLabel,
  cancelLabel,
  requireChange = false,
  onConfirm,
  onCancel,
  children,
}: {
  presented: boolean;
  title: string;
  message?: string;
  placeholder: string;
  initialValue?: string;
  confirmLabel: string;
  cancelLabel: string;
  /** Rename: the confirm action waits for a different name. */
  requireChange?: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const textState = useNativeState(initialValue);
  const [text, setText] = useState(initialValue);
  const textRef = useRef(initialValue);
  const settledRef = useRef(false);
  // Each presentation starts from `initialValue` (derived during render so
  // the confirm button's state is right on the alert's first frame).
  const [presentedSeen, setPresentedSeen] = useState(presented);
  if (presented !== presentedSeen) {
    setPresentedSeen(presented);
    if (presented) setText(initialValue);
  }
  useEffect(() => {
    if (!presented) return;
    settledRef.current = false;
    textState.set(initialValue);
    textRef.current = initialValue;
  }, [initialValue, presented, textState]);
  const trimmed = text.trim();
  const confirmDisabled = !trimmed || (requireChange && trimmed === initialValue.trim());
  // An alert closes itself on any button; report the outcome exactly once.
  const confirm = () => {
    if (settledRef.current) return;
    const name = textRef.current.trim();
    if (!name || (requireChange && name === initialValue.trim())) return;
    settledRef.current = true;
    onConfirm(name);
  };
  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onCancel();
  };

  return (
    <SwiftAlert
      title={title}
      isPresented={presented}
      onIsPresentedChange={(isPresented) => {
        // The alert also reports its dismissal after a button; give that
        // button's own event time to land before treating it as a cancel.
        if (!isPresented) setTimeout(cancel, BUTTON_EVENT_GRACE_MS);
      }}
    >
      <SwiftAlert.Trigger>{children}</SwiftAlert.Trigger>
      <SwiftAlert.Actions>
        <SwiftTextField
          text={textState}
          placeholder={placeholder}
          onTextChange={(value) => {
            textRef.current = value;
            setText(value);
          }}
          modifiers={[textInputAutocapitalization("words"), submitLabel("done")]}
        />
        <SwiftButton label={cancelLabel} role="cancel" onPress={cancel} />
        <SwiftButton
          label={confirmLabel}
          onPress={confirm}
          modifiers={confirmDisabled ? [swiftDisabled(true)] : []}
        />
      </SwiftAlert.Actions>
      {message ? (
        <SwiftAlert.Message>
          <SwiftText>{message}</SwiftText>
        </SwiftAlert.Message>
      ) : null}
    </SwiftAlert>
  );
}

/** A destructive confirmation (action sheet / popover from the row). */
export function NativeDestructiveDialog({
  presented,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  children,
}: {
  presented: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  children: ReactNode;
}) {
  const settledRef = useRef(false);
  useEffect(() => {
    if (presented) settledRef.current = false;
  }, [presented]);
  const settle = (confirmed: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;
    if (confirmed) onConfirm();
    else onCancel();
  };
  return (
    <SwiftConfirmationDialog
      title={title}
      titleVisibility="visible"
      isPresented={presented}
      onIsPresentedChange={(isPresented) => {
        if (!isPresented) setTimeout(() => settle(false), BUTTON_EVENT_GRACE_MS);
      }}
    >
      <SwiftConfirmationDialog.Trigger>{children}</SwiftConfirmationDialog.Trigger>
      <SwiftConfirmationDialog.Actions>
        <SwiftButton label={confirmLabel} role="destructive" onPress={() => settle(true)} />
        <SwiftButton label={cancelLabel} role="cancel" onPress={() => settle(false)} />
      </SwiftConfirmationDialog.Actions>
      {message ? (
        <SwiftConfirmationDialog.Message>
          <SwiftText>{message}</SwiftText>
        </SwiftConfirmationDialog.Message>
      ) : null}
    </SwiftConfirmationDialog>
  );
}

/**
 * A tappable Form row: leading symbol, title and an optional secondary line,
 * an optional trailing value (a count, as in Mail's mailbox list), and a
 * trailing checkmark when selected — Settings' choice-list cell.
 */
export function NativeCheckRow({
  title,
  detail,
  value,
  systemImage,
  selectedSystemImage,
  selected,
  disabled,
  tintColor,
  textColor,
  detailColor,
  rowBackground,
  accessibilityLabel,
  onPress,
}: {
  title: string;
  detail?: string;
  /** Trailing secondary text on the title's line (e.g. a book count). */
  value?: string;
  systemImage?: string;
  selectedSystemImage?: string;
  selected: boolean;
  disabled?: boolean;
  tintColor: ColorValue;
  /**
   * Label colours. A Form button tints its whole label with the accent, and
   * hierarchical styles resolve to that tint, so the row's text needs
   * explicit colours to read as a cell (black title, grey detail).
   */
  textColor: ColorValue;
  detailColor: ColorValue;
  /** The cell's fill (`listRowBackground`); omitted, the Form's default. */
  rowBackground?: ColorValue;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  const symbol = selected && selectedSystemImage ? selectedSystemImage : systemImage;
  return (
    <SwiftButton
      onPress={onPress}
      modifiers={[
        ...(rowBackground ? [listRowBackground(rowBackground)] : []),
        ...(accessibilityLabel ? [swiftAccessibilityLabel(accessibilityLabel)] : []),
        ...(selected ? [accessibilityAddTraits(["isSelected"])] : []),
        ...(disabled ? [swiftDisabled(true)] : []),
      ]}
    >
      <SwiftHStack spacing={12}>
        {symbol ? (
          <SwiftImage systemName={symbol as SFSymbol} color={tintColor} modifiers={[font({ textStyle: "body" })]} />
        ) : null}
        <SwiftVStack alignment="leading" spacing={2}>
          <SwiftText modifiers={[foregroundStyle(textColor), lineLimit(1)]}>{title}</SwiftText>
          {detail ? (
            <SwiftText
              modifiers={[
                font({ textStyle: "subheadline" }),
                foregroundStyle(detailColor),
                lineLimit(1),
              ]}
            >
              {detail}
            </SwiftText>
          ) : null}
        </SwiftVStack>
        <SwiftSpacer />
        {value ? (
          <SwiftText modifiers={[foregroundStyle(detailColor), monospacedDigit(), lineLimit(1)]}>
            {value}
          </SwiftText>
        ) : null}
        {selected ? (
          <SwiftImage
            systemName="checkmark"
            color={tintColor}
            modifiers={[font({ textStyle: "body", weight: "semibold" })]}
          />
        ) : null}
      </SwiftHStack>
    </SwiftButton>
  );
}
