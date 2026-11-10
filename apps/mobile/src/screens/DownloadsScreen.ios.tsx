import { View, useWindowDimensions } from "react-native";
import { Stack } from "expo-router";
import {
  Button as SwiftButton,
  ContentUnavailableView as SwiftContentUnavailableView,
  Form as SwiftForm,
  HStack as SwiftHStack,
  Host as SwiftHost,
  LabeledContent as SwiftLabeledContent,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  SwipeActions as SwiftSwipeActions,
  Text as SwiftText,
  Toggle as SwiftToggle,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  disabled as swiftDisabled,
  font,
  foregroundStyle,
  lineLimit,
  listSectionMargins,
  monospacedDigit,
  onTapGesture,
  scrollContentBackground,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { nemuSoftScrollEdge, useNemuTheme } from "@/design-system";
import { resolveMobileAccountFormSideMargin } from "@/lib/mobileAccountLayout";
import { useMobileDownloadsPage } from "@/lib/downloads/useMobileDownloadsPage";

const secondary = foregroundStyle({ type: "hierarchical", style: "secondary" });

/**
 * Settings > Downloads: a native grouped list. What the downloads take up and
 * the Wi-Fi-only switch; the queue (swipe to pause or cancel, a bar for the
 * chapter downloading); the downloaded titles (tap to open, swipe to delete);
 * and Delete All Downloads, last and red.
 */
export function DownloadsScreen() {
  const { scheme, tokens } = useNemuTheme();
  const page = useMobileDownloadsPage();
  const { strings } = page;
  const { width } = useWindowDimensions();
  const sideMargin = resolveMobileAccountFormSideMargin({ presentation: "page", width });

  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen
        options={{ title: strings.downloads.title, headerBackVisible: true, gestureEnabled: true, headerTitle: undefined }}
      />
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        <SwiftForm
          modifiers={[
            scrollContentBackground("hidden"),
            nemuSoftScrollEdge(),
            ...(sideMargin !== null ? [listSectionMargins({ edges: "horizontal", length: sideMargin })] : []),
          ]}
        >
          <SwiftSection footer={<SwiftText>{strings.downloads.wifiOnlyFooter}</SwiftText>}>
            <SwiftLabeledContent label={strings.downloads.storageUsed}>
              <SwiftText modifiers={[monospacedDigit()]}>{page.totalLabel}</SwiftText>
            </SwiftLabeledContent>
            <SwiftToggle
              label={strings.downloads.wifiOnly}
              isOn={page.wifiOnly}
              onIsOnChange={page.setWifiOnly}
              modifiers={[tint(tokens.primary)]}
            />
          </SwiftSection>

          {page.empty ? (
            <SwiftSection>
              <SwiftContentUnavailableView
                title={strings.downloads.emptyTitle}
                systemImage="arrow.down.circle"
                description={strings.downloads.emptyDescription}
              />
            </SwiftSection>
          ) : null}

          {page.queue.length > 0 ? (
            <SwiftSection
              title={strings.downloads.queueSection}
              footer={page.waiting ? <SwiftText>{page.waiting}</SwiftText> : undefined}
            >
              {page.queue.map((row) => (
                <SwiftSwipeActions key={row.key}>
                  <SwiftVStack alignment="leading" spacing={4}>
                    <SwiftText modifiers={[lineLimit(1)]}>{row.title}</SwiftText>
                    <SwiftText
                      modifiers={[
                        lineLimit(1),
                        font({ textStyle: "footnote" }),
                        row.status === "failed" ? foregroundStyle(tokens.danger) : secondary,
                      ]}
                    >
                      {row.detail}
                    </SwiftText>
                    {row.progress !== null ? (
                      <SwiftProgressView value={row.progress} modifiers={[tint(tokens.primary)]} />
                    ) : null}
                  </SwiftVStack>
                  <SwiftSwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
                    <SwiftButton
                      label={strings.common.cancel}
                      systemImage="xmark"
                      role="destructive"
                      onPress={() => page.cancelJob(row.key)}
                    />
                    <SwiftButton
                      label={row.status === "queued" || row.status === "downloading" ? strings.downloads.pause : strings.downloads.resume}
                      systemImage={row.status === "queued" || row.status === "downloading" ? "pause" : "arrow.clockwise"}
                      onPress={() => page.toggleJob(row)}
                      modifiers={[tint(tokens.mutedForeground)]}
                    />
                  </SwiftSwipeActions.Actions>
                </SwiftSwipeActions>
              ))}
              {page.hasRunnable ? (
                <SwiftButton label={strings.downloads.pauseAll} systemImage="pause.circle" onPress={page.pauseAll} />
              ) : null}
              {page.hasPaused ? (
                <SwiftButton label={strings.downloads.resumeAll} systemImage="arrow.clockwise.circle" onPress={page.resumeAll} />
              ) : null}
              <SwiftButton
                label={strings.downloads.cancelAll}
                systemImage="xmark.circle"
                role="destructive"
                onPress={page.cancelAll}
              />
            </SwiftSection>
          ) : null}

          {page.manga.length > 0 ? (
            <SwiftSection title={strings.downloads.downloadedSection}>
              {page.manga.map((item) => (
                <SwiftSwipeActions key={item.key}>
                  <SwiftHStack spacing={12} modifiers={[onTapGesture(() => page.openManga(item))]}>
                    <SwiftVStack alignment="leading" spacing={2}>
                      <SwiftText modifiers={[lineLimit(1)]}>{item.title}</SwiftText>
                      <SwiftText modifiers={[font({ textStyle: "footnote" }), secondary]}>
                        {page.formatChapterCount(item.chapterCount)}
                      </SwiftText>
                    </SwiftVStack>
                    <SwiftSpacer />
                    <SwiftText modifiers={[monospacedDigit(), secondary]}>{page.formatBytes(item.bytes)}</SwiftText>
                  </SwiftHStack>
                  <SwiftSwipeActions.Actions edge="trailing" allowsFullSwipe>
                    <SwiftButton
                      label={strings.downloads.delete}
                      systemImage="trash"
                      role="destructive"
                      onPress={() => page.deleteManga(item)}
                    />
                  </SwiftSwipeActions.Actions>
                </SwiftSwipeActions>
              ))}
            </SwiftSection>
          ) : null}

          <SwiftSection footer={<SwiftText>{strings.downloads.localOnlyFooter}</SwiftText>}>
            <SwiftButton
              label={strings.downloads.deleteAll}
              systemImage="trash"
              role="destructive"
              onPress={page.confirmDeleteAll}
              modifiers={page.empty ? [swiftDisabled(true)] : []}
            />
          </SwiftSection>
        </SwiftForm>
      </SwiftHost>
    </View>
  );
}
