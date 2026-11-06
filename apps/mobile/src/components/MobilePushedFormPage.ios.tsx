import type { ReactNode } from "react";
import {
  Form as SwiftForm,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
} from "@expo/ui/swift-ui";
import {
  font,
  lineLimit,
  listSectionMargins,
  scrollEdgeEffectStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { MOBILE_GROUPED_FORM_TOP_MARGIN } from "@/lib/mobileLibrarySheetLayout";
import {
  inlineToolbarTitle,
  zeroTopScrollContentMargin,
} from "../../modules/nemu-window-layout/src/presentationColorScheme";
import { ToolbarActionButton } from "./MobileNativeFormSheet.ios";
import type { MobileNativeFormSheetAction } from "./MobileNativeFormSheet.types";

/** A grouped form pushed on a sheet's native stack: the system back, its title, and an optional confirming action. */
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
  return (
    <SwiftToolbar>
      <SwiftForm
        modifiers={[
          tint(tokens.primary),
          scrollEdgeEffectStyle("soft", "vertical"),
          inlineToolbarTitle(),
          zeroTopScrollContentMargin(),
          listSectionMargins({ edges: "top", length: MOBILE_GROUPED_FORM_TOP_MARGIN }),
        ]}
      >
        {children}
      </SwiftForm>
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
