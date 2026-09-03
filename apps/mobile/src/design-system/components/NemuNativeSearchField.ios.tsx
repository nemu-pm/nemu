/**
 * A genuinely native iOS search field: a SwiftUI `TextField` hosted by
 * `@expo/ui/swift-ui`, composed as `Host > HStack > [magnifier, TextField,
 * clear Button]` on a secondary-filled capsule.
 *
 * KNOWN CAVEAT — read before debugging focus bugs. This field is rendered
 * inside a sheet that is itself a SwiftUI/UIKit presentation, so the SwiftUI
 * `TextField` lives in a `UIHostingController` nested inside that presentation.
 * That nesting is the classic spot where first-responder ownership and IME
 * hand-off go wrong: the keyboard can fail to raise on first tap, dismiss when
 * the sheet animates a detent change, or leave a marked-text composition (CJK,
 * emoji, dictation) stranded when the sheet closes. If any of that shows up on
 * device, the escape hatch is one `Platform` switch away: delete this
 * `.ios.tsx` file — or make it delegate to the sibling — and Metro resolves
 * `NemuNativeSearchField.tsx`, the RN `TextInput` capsule, with no caller
 * changes. Ship-blocking bugs here should not be worked around inside the
 * SwiftUI tree.
 *
 * Controlled/uncontrolled: `@expo/ui`'s `TextField` is uncontrolled — it owns
 * its text natively and reports edits through `onTextChange` (there is no
 * `value` prop in `@expo/ui` 56; `text` takes an `ObservableState` and the
 * imperative `ref` exposes `setText`/`clear`). The caller still owns `value`,
 * so an effect mirrors it back through the ref whenever it changes out of band
 * — a programmatic clear, or a sheet reopening with the query reset. Echoing
 * every keystroke back is deliberately avoided: writes from JS reach the UI
 * thread asynchronously and would fight the user's own typing.
 */
import { useEffect, useRef } from "react";
import { StyleSheet } from "react-native";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
  Host as SwiftHost,
  Image as SwiftImage,
  TextField as SwiftTextField,
  type TextFieldRef,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  autocorrectionDisabled,
  background,
  buttonStyle,
  font,
  foregroundStyle,
  frame,
  keyboardType,
  onSubmit as swiftOnSubmit,
  padding,
  shapes,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design/useNemuTheme";
import type { NemuNativeSearchFieldProps } from "./NemuNativeSearchField.types";

/** iOS 26 search field metrics: a 36pt capsule with 17pt text. */
const FIELD_HEIGHT = 36;
const FIELD_HORIZONTAL_INSET = 12;
const FIELD_FONT_SIZE = 17;
const GLYPH_POINT_SIZE = 15;
const CLEAR_GLYPH_POINT_SIZE = 17;
const CONTENT_SPACING = 8;

export function NemuNativeSearchField({
  value,
  onChangeText,
  onSubmit,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel,
  testID,
  clearActionTestID,
}: NemuNativeSearchFieldProps) {
  const { scheme, tokens } = useNemuTheme();
  const fieldRef = useRef<TextFieldRef | null>(null);
  // Mirrors what SwiftUI currently holds. Seeded with the field's own native
  // starting text ("") rather than `value`, so a field mounted with a
  // non-empty query still gets pushed down on the first effect pass.
  const nativeTextRef = useRef("");

  useEffect(() => {
    if (nativeTextRef.current === value) return;
    nativeTextRef.current = value;
    void fieldRef.current?.setText(value);
  }, [value]);

  const handleTextChange = (next: string) => {
    nativeTextRef.current = next;
    onChangeText(next);
  };

  const handleClear = () => {
    nativeTextRef.current = "";
    void fieldRef.current?.setText("");
    onChangeText("");
  };

  return (
    // `ignoreSafeArea="keyboard"` keeps SwiftUI from insetting this small
    // inline host when the keyboard it raises comes up under the sheet.
    <SwiftHost
      colorScheme={scheme}
      ignoreSafeArea="keyboard"
      style={styles.host}
      testID={testID}
    >
      <SwiftHStack
        alignment="center"
        spacing={CONTENT_SPACING}
        modifiers={[
          padding({ horizontal: FIELD_HORIZONTAL_INSET }),
          frame({ height: FIELD_HEIGHT }),
          background(tokens.secondary, shapes.capsule()),
        ]}
      >
        <SwiftImage
          systemName="magnifyingglass"
          color={tokens.mutedForeground}
          size={GLYPH_POINT_SIZE}
        />
        <SwiftTextField
          ref={fieldRef}
          placeholder={placeholder}
          onTextChange={handleTextChange}
          modifiers={[
            font({ size: FIELD_FONT_SIZE }),
            foregroundStyle(tokens.foreground),
            tint(tokens.primary),
            keyboardType("web-search"),
            submitLabel("search"),
            autocorrectionDisabled(true),
            textInputAutocapitalization("never"),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(onSubmit ? [swiftOnSubmit(onSubmit)] : []),
          ]}
        />
        {value.length > 0 ? (
          <SwiftButton
            onPress={handleClear}
            testID={clearActionTestID}
            modifiers={[
              // `.plain` keeps the glyph as the whole control, the way UIKit's
              // own text-field clear button reads — no bordered chrome.
              buttonStyle("plain"),
              swiftAccessibilityLabel(clearAccessibilityLabel),
            ]}
          >
            <SwiftImage
              systemName="xmark.circle.fill"
              color={tokens.mutedForeground}
              size={CLEAR_GLYPH_POINT_SIZE}
            />
          </SwiftButton>
        ) : null}
      </SwiftHStack>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  host: {
    height: FIELD_HEIGHT,
  },
});
