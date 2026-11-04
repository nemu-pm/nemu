import { scrollEdgeEffectStyle } from "@expo/ui/swift-ui/modifiers";

/**
 * The SwiftUI half of the soft scroll edge (see `useNemuScrollEdge`): every
 * `Form`, `List` or scroll view a screen or sheet hosts takes it. Left alone,
 * SwiftUI's style is `automatic`, which the iOS 27 SDK resolves to `hard` (a
 * cutoff with a dividing line under the bar).
 */
export function nemuSoftScrollEdge() {
  return scrollEdgeEffectStyle("soft", "vertical");
}
