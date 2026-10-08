import { Stack } from "expo-router";
import { hapticPress } from "@/lib/haptics";
import { isMobileHeaderActionDisabled } from "@/lib/mobileHeaderActions";
import type { NemuNativeHeaderAction } from "@/design-system";

/** The detail page's bar title actions as one menu button. */
export const mobileExploreDetailBarMode = "menu" as const;

/**
 * The detail page's actions as one platform menu (a `UIMenu` on a bar button).
 * Like every bar item it takes the platform colour: no tint anywhere. Its
 * symbol is the ellipsis, the system's own glyph for "more about this item"
 * (the bar's overflow on a Duo collapses into the same glyph, which is fine
 * here: there is nothing else for it to hold).
 */
export function renderExploreDetailBarMenu(actions: NemuNativeHeaderAction[], label: string) {
  if (!actions.length) return null;
  return (
    <Stack.Toolbar.Menu icon="ellipsis" accessibilityLabel={label}>
      {actions.map((action) => {
        const disabled = isMobileHeaderActionDisabled(action);
        return (
          <Stack.Toolbar.MenuAction
            key={action.label}
            icon={action.icon}
            destructive={action.icon === "trash"}
            disabled={disabled}
            onPress={() => {
              if (disabled) return;
              void hapticPress();
              action.onPress();
            }}
          >
            {action.label}
          </Stack.Toolbar.MenuAction>
        );
      })}
    </Stack.Toolbar.Menu>
  );
}
