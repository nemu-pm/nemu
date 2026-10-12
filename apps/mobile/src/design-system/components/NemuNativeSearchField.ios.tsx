/**
 * A genuinely native iOS search field: a SwiftUI `TextField` hosted by
 * `@expo/ui/swift-ui`, composed as `Host > HStack > [magnifier, TextField,
 * clear Button]` on a capsule.
 *
 * Surface: on iOS 26+ the capsule is the system Liquid Glass material
 * (`glassEffect(.regular.interactive(), in: .capsule)`), sized like UIKit's
 * own iOS 26 `UISearchTextField` (44pt, 17pt text) so it reads as the same
 * control as the header search bars. Its text and glyphs use the material's
 * hierarchical styles so they stay legible whatever the glass refracts. Below
 * iOS 26 `glassEffect` is a no-op, so the field keeps the 36pt
 * secondary-filled capsule there (`resolveNemuSearchFieldSurface`).
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
 * `value` prop in `@expo/ui` 56; `text` takes an `ObservableState`). The
 * caller still owns `value`: the observable state is seeded with it on mount
 * and an effect writes it back whenever it changes out of band — a
 * programmatic clear, or a sheet reopening with the query reset. Echoing every
 * keystroke back is deliberately avoided: writes from JS reach the UI thread
 * asynchronously and would fight the user's own typing.
 */
import { useEffect, useImperativeHandle, useRef } from "react";
import { Platform, PlatformColor, StyleSheet } from "react-native";
import {
  Button as SwiftButton,
  HStack as SwiftHStack,
  Host as SwiftHost,
  Image as SwiftImage,
  Text as SwiftText,
  TextField as SwiftTextField,
  useNativeState,
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
  glassEffect,
  keyboardType,
  onSubmit as swiftOnSubmit,
  padding,
  shapes,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design/useNemuTheme";
import { resolveNemuSearchFieldSurface } from "@/lib/nemuSearchFieldAppearance";
import type { NemuNativeSearchFieldProps } from "./NemuNativeSearchField.types";

/**
 * Field metrics per surface. `filled` is the pre-iOS 26 `UISearchTextField`
 * (36pt capsule, 15pt text); `liquid-glass` is the iOS 26 one (44pt glass
 * capsule, 17pt text), matching the header search bars on the same screens.
 */
const FIELD_METRICS = {
  filled: {
    height: 36,
    horizontalInset: 12,
    fontSize: 15,
    glyphSize: 15,
    clearGlyphSize: 17,
    spacing: 8,
  },
  "liquid-glass": {
    height: 44,
    horizontalInset: 14,
    fontSize: 17,
    glyphSize: 17,
    clearGlyphSize: 17,
    spacing: 8,
  },
} as const;

/** Platform facts do not change at runtime; resolve the surface once. */
const FIELD_SURFACE = resolveNemuSearchFieldSurface(Platform.OS, Platform.Version);
const metrics = FIELD_METRICS[FIELD_SURFACE];
const glass = FIELD_SURFACE === "liquid-glass";
/** Hierarchical styles adapt to whatever the glass refracts; tokens cannot. */
const GLASS_PRIMARY = { type: "hierarchical", style: "primary" } as const;
/**
 * The placeholder is a `prompt`, which SwiftUI already dims; a hierarchical
 * `.secondary` would compound with that and wash out. UIKit's own glass
 * search field draws its placeholder in `secondaryLabel`, so use it directly.
 */
const GLASS_PLACEHOLDER = PlatformColor("secondaryLabel");

export function NemuNativeSearchField({
  ref,
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
  // `@expo/ui`'s TextField owns its text natively; the supported way to seed
  // and drive it from JS is an observable state (`useNativeState`), which the
  // native view reads on mount. The metadata editor mounts this field with the
  // manga title already set, and `ref.setText` issued before the SwiftUI view
  // existed was silently dropped — the state object has no such race.
  const textState = useNativeState(value);
  // Mirrors what SwiftUI currently holds so an unchanged `value` prop does not
  // schedule a redundant UI-thread write on every render.
  const nativeTextRef = useRef(value);
  const fieldRef = useRef<TextFieldRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        void fieldRef.current?.focus();
      },
    }),
    [],
  );

  useEffect(() => {
    if (nativeTextRef.current === value) return;
    nativeTextRef.current = value;
    textState.set(value);
  }, [textState, value]);

  const handleTextChange = (next: string) => {
    nativeTextRef.current = next;
    onChangeText(next);
  };

  const handleClear = () => {
    nativeTextRef.current = "";
    textState.set("");
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
        spacing={metrics.spacing}
        modifiers={[
          padding({ horizontal: metrics.horizontalInset }),
          frame({ height: metrics.height }),
          glass
            ? // Regular, untinted, interactive glass: the material Apple's own
              // search fields use. A token fill here would hide it.
              glassEffect({
                glass: { variant: "regular", interactive: true },
                shape: "capsule",
              })
            : background(tokens.secondary, shapes.capsule()),
        ]}
      >
        {/*
          iOS 26 draws the glass field's magnifier and clear glyph in the
          primary label style and its placeholder in the secondary one; the
          filled field keeps the muted token glyphs and SwiftUI's default
          placeholder.
        */}
        <SwiftImage
          systemName="magnifyingglass"
          size={metrics.glyphSize}
          {...(glass
            ? {
                modifiers: [
                  font({ size: metrics.glyphSize, weight: "medium" }),
                  foregroundStyle(GLASS_PRIMARY),
                ],
              }
            : { color: tokens.mutedForeground })}
        />
        <SwiftTextField
          ref={fieldRef}
          text={textState}
          placeholder={placeholder}
          onTextChange={handleTextChange}
          modifiers={[
            font({ size: metrics.fontSize }),
            foregroundStyle(glass ? GLASS_PRIMARY : tokens.foreground),
            tint(tokens.primary),
            keyboardType("web-search"),
            submitLabel("search"),
            autocorrectionDisabled(true),
            textInputAutocapitalization("never"),
            swiftAccessibilityLabel(accessibilityLabel),
            ...(onSubmit ? [swiftOnSubmit(onSubmit)] : []),
          ]}
        >
          {glass ? (
            <SwiftTextField.Placeholder>
              <SwiftText
                modifiers={[
                  font({ size: metrics.fontSize }),
                  foregroundStyle(GLASS_PLACEHOLDER),
                ]}
              >
                {placeholder}
              </SwiftText>
            </SwiftTextField.Placeholder>
          ) : null}
        </SwiftTextField>
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
              size={metrics.clearGlyphSize}
              {...(glass
                ? { modifiers: [foregroundStyle(GLASS_PRIMARY)] }
                : { color: tokens.mutedForeground })}
            />
          </SwiftButton>
        ) : null}
      </SwiftHStack>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  host: {
    height: metrics.height,
  },
});
