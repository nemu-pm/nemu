import { Stack } from "expo-router";
import { hapticPress } from "@/lib/haptics";
import { isMobileHeaderActionDisabled } from "@/lib/mobileHeaderActions";
import type { NemuNativeHeaderAction } from "@/design-system";

/**
 * The detail page's actions as one platform menu (a `UIMenu` on a bar button).
 * Like every bar item it takes the platform colour: no tint anywhere. Its
 * symbol is the ellipsis, the system's own glyph for "more about this item"
 * (the bar's overflow on a Duo collapses into the same glyph, which is fine
 * here: there is nothing else for it to hold).
 */
/**
 * The page's primary bar item overflows last when the bar runs out of room (a
 * narrow window, or the vertical rail on the Duo): `visibilityPriority`,
 * react-native-screens 4.29, iOS 27+. expo-router's toolbar passes unknown
 * props through to the header item.
 */
const LAST_TO_OVERFLOW: object = { visibilityPriority: "high" };

export function renderExploreDetailBarMenu(
  actions: NemuNativeHeaderAction[],
  label: string,
  icon: "ellipsis" | "gearshape" = "ellipsis",
) {
  if (!actions.length) return null;
  return (
    <Stack.Toolbar.Menu icon={icon} accessibilityLabel={label} {...LAST_TO_OVERFLOW}>
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
