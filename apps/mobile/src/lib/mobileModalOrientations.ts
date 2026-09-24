import type { ModalProps } from "react-native";

/**
 * Orientations every React Native `<Modal>` must declare. RN's iOS Modal
 * defaults `supportedOrientations` to `["portrait"]`, so presenting one while
 * the app is in landscape either force-rotates the whole UI to portrait for
 * as long as the modal is up, or — when the scene is currently limited to
 * landscape (e.g. `expo-screen-orientation` locked it) — throws
 * `UIApplicationInvalidInterfaceOrientation` and kills the app. The app itself
 * rotates freely (`orientation: "default"`), so modals follow it; UIKit still
 * intersects this with the scene's current mask, which keeps the reader's
 * portrait lock intact.
 */
export const MOBILE_MODAL_SUPPORTED_ORIENTATIONS: NonNullable<
  ModalProps["supportedOrientations"]
> = ["portrait", "portrait-upside-down", "landscape-left", "landscape-right"];
