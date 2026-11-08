import type { ReactNode } from "react";
import {
  Background as SwiftBackground,
  Form as SwiftForm,
  Rectangle as SwiftRectangle,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
} from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  ignoreSafeArea,
  lineLimit,
  listSectionMargins,
  scrollContentBackground,
  scrollEdgeEffectStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useMobileNativeSheetVeil, useNemuTheme } from "@/design-system";
import { MOBILE_GROUPED_FORM_TOP_MARGIN } from "@/lib/mobileLibrarySheetLayout";
import {
  inlineToolbarTitle,
  zeroTopScrollContentMargin,
} from "../../modules/nemu-window-layout/src/presentationColorScheme";
import { ToolbarActionButton } from "./MobileNativeFormSheet.ios";
import type { MobileNativeFormSheetAction } from "./MobileNativeFormSheet.types";

/**
 * A grouped form pushed on a sheet's native stack: the system back, its title, and an optional
 * confirming action. Its backdrop is the sheet's tint, so the page reads as the same surface as the
 * stack's root (Add Sources' list) rather than an opaque grouped grey.
 */
export function MobilePushedFormPage({
  title,
  confirm,
  children,
}: {
  title: string;
  confirm?: MobileNativeFormSheetAction;
  children: ReactNode;
}) {
  const { tokens } = useNemuTheme();
  const veil = useMobileNativeSheetVeil();
  const form = (
    <SwiftForm
      modifiers={[
        tint(tokens.primary),
        scrollContentBackground("hidden"),
        scrollEdgeEffectStyle("soft", "vertical"),
        inlineToolbarTitle(),
        zeroTopScrollContentMargin(),
        listSectionMargins({ edges: "top", length: MOBILE_GROUPED_FORM_TOP_MARGIN }),
      ]}
    >
      {children}
    </SwiftForm>
  );
  return (
    <SwiftToolbar>
      {veil ? (
        // The stack paints each pushed page white; the root's tint over it
        // gives the root's surface (its content draws the veil itself). A
        // shape that ignores every safe area, the keyboard's too: a background
        // style ignores only the container's, so with a field focused the
        // stack's white showed under the keyboard (a band at a floating
        // sheet's bottom on iPad, the keyboard's corners on iPhone).
        <SwiftBackground>
          {form}
          <SwiftBackground.Content>
            <SwiftRectangle modifiers={[foregroundStyle(veil), ignoreSafeArea()]} />
          </SwiftBackground.Content>
        </SwiftBackground>
      ) : (
        form
      )}
      <SwiftToolbar.Content>
        <SwiftToolbarItem placement="principal">
          <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>{title}</SwiftText>
        </SwiftToolbarItem>
        {confirm ? (
          <SwiftToolbarItem placement="confirmationAction">
            <ToolbarActionButton action={confirm} accent={tokens.primary} />
          </SwiftToolbarItem>
        ) : null}
      </SwiftToolbar.Content>
    </SwiftToolbar>
  );
}
