import { useEffect, useRef, type ReactNode } from "react";
import { View, type StyleProp, type ViewInstance, type ViewStyle } from "react-native";
import {
  preferExploreDissolveTarget,
  registerExploreDissolveTarget,
  useExploreDissolveHidden,
} from "./mobileExploreDissolve";

/**
 * Makes `children` a view that can turn to dust when its library title is
 * removed (design-explore): it registers with the dust host, becomes the
 * preferred one as soon as a finger lands on it (the view the user is acting
 * on is the one that dissolves), and stands aside while its dust is in the air.
 * `preferred`: the page's own view (the title page's cover), preferred from
 * the start, since a removal there comes from its bar, not a touch on it.
 */
export function ExploreDissolveTarget({
  id,
  style,
  preferred = false,
  children,
}: {
  id: string;
  preferred?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const ref = useRef<ViewInstance>(null);
  useEffect(() => {
    const unregister = registerExploreDissolveTarget(id, ref);
    if (preferred) preferExploreDissolveTarget(id, ref);
    return unregister;
  }, [id, preferred]);
  const hidden = useExploreDissolveHidden(id);
  return (
    <View
      ref={ref}
      collapsable={false}
      onTouchStart={() => preferExploreDissolveTarget(id, ref)}
      style={[style, hidden ? { opacity: 0 } : null]}
    >
      {children}
    </View>
  );
}
