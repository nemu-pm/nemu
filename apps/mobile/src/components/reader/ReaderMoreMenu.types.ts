import type {
  MobileReaderMoreMenuActionId,
  MobileReaderMoreMenuSection,
} from "@/lib/mobileReaderMoreMenu";

export type ReaderMoreMenuProps = {
  sections: MobileReaderMoreMenuSection[];
  /** VoiceOver / TalkBack name of the ⋯ button. */
  accessibilityLabel: string;
  accessibilityHint: string;
  /** Glyph colour: the chrome's icon colour. */
  color: string;
  onAction: (id: MobileReaderMoreMenuActionId) => void;
  /** Work behind one of its rows is running: the glyph gives way to a spinner. */
  busy?: boolean;
  /** What VoiceOver / TalkBack adds to the button's name while busy. */
  busyLabel?: string;
  /**
   * A touch reached the button (the menu is opening). The system menu has no
   * open callback on iOS, so the reader uses this to keep the chrome from
   * auto-hiding underneath it.
   */
  onInteract?: () => void;
};
