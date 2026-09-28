import { useMemo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { NemuNativeSheetHeaderAction } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import type { MobileReaderStudyDeskTab } from "@/lib/mobileReaderNotebookPane";
import { ReaderCapsule } from "../ReaderCapsule";
import { ReaderDarkThemeScope } from "../ReaderDarkThemeScope";
import { ReaderSegmentedControl } from "../ReaderSegmentedControl";
import {
  DOCKED_PANEL_BASE,
  DOCKED_PANEL_BORDER,
  DOCKED_PANEL_GLASS_TINT,
  DOCKED_PANEL_TOKEN_OVERRIDES,
  DOCKED_PANEL_RADIUS,
  JapaneseLearningEmbeddedHostContext,
  type JapaneseLearningEmbeddedHost,
} from "./japaneseLearningEmbeddedHost";

type StudyDeskProps = {
  tab: MobileReaderStudyDeskTab;
  strings: MobileStrings;
  /** The transcript is a source-text list for text sources (web parity). */
  transcriptLabel: string;
  onSelectTab: (tab: MobileReaderStudyDeskTab) => void;
  /** Folds the desk away (back to the trackpad). */
  onClose: () => void;
  /**
   * The three existing docked surfaces (transcript, sentence analysis, nemu
   * chat) — exactly one visible. Each renders its own body and hands its
   * header action to the desk's row.
   */
  children: ReactNode;
};

/**
 * Study desk (学習台): the notebook posture's bottom pane hosting the
 * existing Japanese Learning surfaces one at a time — the transcript, the
 * sentence analysis (tap a word, ask, copy, listen) and nemu chat, whose
 * input lives here in the keyboard half. A segmented switch moves between
 * them; boxes tapped on the page above drive the sentence view. Nothing here
 * is new UI: the desk is only the card, the switch and the close button.
 */
export function JapaneseLearningStudyDesk({
  tab,
  strings,
  transcriptLabel,
  onSelectTab,
  onClose,
  children,
}: StudyDeskProps) {
  const options = useMemo(
    () => [
      { value: "transcript" as const, label: transcriptLabel },
      { value: "sentence" as const, label: strings.duo.studyDeskSentence },
      { value: "chat" as const, label: "nemu", accessibilityLabel: strings.reader.pluginJapaneseLearningNemuChat },
    ],
    [strings, transcriptLabel],
  );
  const host = useMemo<JapaneseLearningEmbeddedHost>(
    () => ({
      renderHeader: ({ action }) => (
        <View style={styles.header}>
          <ReaderSegmentedControl
            accessibilityLabel={strings.duo.studyDeskViews}
            options={options}
            value={tab}
            onChange={onSelectTab}
            style={styles.switch}
          />
          <View style={styles.headerActions}>
            {action}
            <NemuNativeSheetHeaderAction
              accessibilityLabel={strings.reader.closeLearningPanel}
              androidIcon="close-outline"
              iosSystemImage="xmark"
              onPress={onClose}
            />
          </View>
        </View>
      ),
    }),
    [onClose, onSelectTab, options, strings, tab],
  );

  return (
    <ReaderDarkThemeScope overrides={DOCKED_PANEL_TOKEN_OVERRIDES}>
      <View accessibilityLabel={strings.duo.studyDeskTitle} style={styles.panel}>
        {/* The docked panels' dark Liquid Glass card, concentric with the capsule row. */}
        <ReaderCapsule
          cornerRadius={DOCKED_PANEL_RADIUS}
          interactive={false}
          tintColor={DOCKED_PANEL_GLASS_TINT}
          pointerEvents="box-none"
          style={styles.glass}
        >
          <JapaneseLearningEmbeddedHostContext.Provider value={host}>
            {children}
          </JapaneseLearningEmbeddedHostContext.Provider>
        </ReaderCapsule>
      </View>
    </ReaderDarkThemeScope>
  );
}

const styles = StyleSheet.create({
  panel: {
    ...StyleSheet.absoluteFill,
  },
  glass: {
    flex: 1,
    borderRadius: DOCKED_PANEL_RADIUS,
    backgroundColor: DOCKED_PANEL_BASE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: DOCKED_PANEL_BORDER,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 14,
    paddingRight: 8,
    paddingTop: 10,
    paddingBottom: 4,
    minHeight: 58,
  },
  switch: {
    flex: 1,
    minWidth: 0,
    maxWidth: 360,
  },
  headerActions: {
    marginLeft: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
});
