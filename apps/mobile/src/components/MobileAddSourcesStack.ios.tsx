import { useEffect, useState } from "react";
import { useAssets } from "expo-asset";
import {
  Button as SwiftButton,
  Group as SwiftGroup,
  HStack as SwiftHStack,
  Image as SwiftImage,
  NavigationDestination as SwiftNavigationDestination,
  NavigationLink as SwiftNavigationLink,
  NavigationStack as SwiftNavigationStack,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel as swiftAccessibilityLabel,
  font,
  foregroundStyle,
  frame,
  ignoreSafeArea,
  labelStyle,
  lineLimit,
  resizable,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  ADD_DIRECTORY_PAGE,
  SERVER_PICKER_PAGE,
  mobileAddSourcesEnteredPages,
  mobileServerFormPage,
} from "@/lib/mobileAddSourcesPages";
import { useMobileAdaptiveLayout } from "@/lib/MobileWindowLayoutContext";
import { getMobileStrings } from "@/lib/mobileI18n";
import { selfHostedKindName } from "@/lib/selfHosted/messages";
import { SELF_HOSTED_SETUP_KINDS, type SelfHostedKind } from "@/lib/selfHosted/policy";
import { inlineToolbarTitle, pinnedSearch, sheetCenteredTitle } from "../../modules/nemu-window-layout/src/presentationColorScheme";
import { MobileAddSourcesDirectoryPage } from "./MobileAddSourceDirectorySheet";
import type { MobileAddSourcesStackProps } from "./MobileAddSourcesStack.types";
import { MobilePushedFormPage } from "./MobilePushedFormPage.ios";
import { MobileServerSourceSections } from "./MobileServerSourceSections.ios";
import { SERVER_ICONS } from "./mobileServerIcons";
import { useServerSourceForm } from "./useServerSourceForm";

/**
 * Add Sources' list under the stack's own bar, the same bar its pushed pages
 * have (one hidden on the root made the push resize the page under it). The
 * list stays inside the horizontal safe area, beside the Duo outer display's
 * vertical bar and whatever a Live Activity shows there, and runs under the bar
 * and its search field, and through the home indicator's inset to the sheet's
 * bottom edge. It is the bar's observed scroll view (`ContentScrollMarker`) and
 * insets itself: UIKit's soft edge forms where it meets the bar.
 */
const STACK_ROOT_MODIFIERS = [
  inlineToolbarTitle(),
  frame({ maxWidth: Infinity }),
  ignoreSafeArea({ regions: "container", edges: "vertical" }),
];

const SERVER_ICON_SIZE = 44;
// Metro's asset ids, whatever the image typings say of a required PNG.
const SERVER_ICON_MODULES = SELF_HOSTED_SETUP_KINDS.map((kind) => SERVER_ICONS[kind]) as unknown as number[];

/** Add Sources pushes its pages natively (`MobileAddSourcesStack`). */
export const mobileAddSourcesPushesPagesNatively = true;

/** Connect Server: a row for each kind, each pushing that server's form. */
function ServerPickerPage() {
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  // A SwiftUI image reads a local file; these are bundled, or fetched from Metro in development.
  const [icons] = useAssets(SERVER_ICON_MODULES);

  return (
    <MobilePushedFormPage title={strings.selfHosted.connectServer}>
      <SwiftSection>
        {SELF_HOSTED_SETUP_KINDS.map((kind, index) => {
          const icon = icons?.[index]?.localUri;
          return (
            <SwiftNavigationLink key={kind} value={mobileServerFormPage(kind)}>
              <SwiftHStack spacing={12}>
                {icon ? (
                  <SwiftImage
                    uiImage={icon}
                    modifiers={[resizable(), frame({ width: SERVER_ICON_SIZE, height: SERVER_ICON_SIZE })]}
                  />
                ) : (
                  <SwiftSpacer modifiers={[frame({ width: SERVER_ICON_SIZE, height: SERVER_ICON_SIZE })]} />
                )}
                <SwiftVStack alignment="leading" spacing={2}>
                  <SwiftText modifiers={[lineLimit(1)]}>{selfHostedKindName(kind)}</SwiftText>
                  <SwiftText
                    modifiers={[
                      font({ textStyle: "subheadline" }),
                      foregroundStyle({ type: "hierarchical", style: "secondary" }),
                      lineLimit(1),
                    ]}
                  >
                    {strings.selfHosted.rowSubtitle}
                  </SwiftText>
                </SwiftVStack>
              </SwiftHStack>
            </SwiftNavigationLink>
          );
        })}
      </SwiftSection>
    </MobilePushedFormPage>
  );
}

function ServerFormPage({
  kind,
  open,
  onConnected,
  onDismissBlockedChange,
}: {
  kind: SelfHostedKind;
  open: boolean;
  onConnected: () => void;
  onDismissBlockedChange: (blocked: boolean) => void;
}) {
  const form = useServerSourceForm({ kind }, { onSaved: onConnected });
  const { strings, cancel, blocksDismiss, clearSecretsRef } = form;

  // Back while connecting walks away from it, and iOS must not offer to save
  // a password still in a secure field as its page goes.
  useEffect(() => {
    if (open) return;
    cancel();
    clearSecretsRef.current?.();
  }, [cancel, clearSecretsRef, open]);
  useEffect(() => {
    onDismissBlockedChange(open && blocksDismiss);
  }, [blocksDismiss, onDismissBlockedChange, open]);

  return (
    <MobilePushedFormPage
      title={form.kindName}
      confirm={{ label: strings.common.save, disabled: !form.canSave, onPress: () => void form.save() }}
    >
      <MobileServerSourceSections form={form} autoFocus />
    </MobilePushedFormPage>
  );
}

/**
 * From Add Sources: the sheet's own navigation, around its list. Its pages are
 * pushed in place with the system back (chevron, edge swipe). Each push starts
 * a fresh page; the one before stays mounted while it slides out.
 */
export function MobileAddSourcesStack({
  path: pages,
  onPathChange,
  onDirectoryAdded,
  onServerConnected,
  onDismissBlockedChange,
  title,
  closeAccessibilityLabel,
  onClose,
  search,
  filter,
  children,
}: MobileAddSourcesStackProps) {
  const { tokens } = useNemuTheme();
  const { regularWidth, verticalBarSide } = useMobileAdaptiveLayout();
  const [sessions, setSessions] = useState<Record<string, number>>({});
  const [pagesSeen, setPagesSeen] = useState(pages);
  if (pages !== pagesSeen) {
    setPagesSeen(pages);
    const entered = mobileAddSourcesEnteredPages(pagesSeen, pages);
    if (entered.length > 0) {
      setSessions(Object.fromEntries([
        ...Object.entries(sessions),
        ...entered.map((page) => [page, (sessions[page] ?? 0) + 1]),
      ]));
    }
  }
  // One commit behind `pages`, so a page's content is mounted before the stack slides it in.
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => {
    setPath(pages);
  }, [pages]);

  // A horizontal bar: the filter leading, ✕ trailing. A vertical bar (the Duo's
  // outer display; a sheet on regular widths keeps a horizontal one): ✕ at the
  // top of the axis, then the action (Apple's order for vertical controls: the
  // system stacks a trailing group from its last item down).
  const verticalBar = verticalBarSide !== null && !regularWidth;
  const filterItem = (
    <SwiftToolbarItem placement={verticalBar ? "topBarTrailing" : "topBarLeading"}>
      <SwiftButton
        label={filter.accessibilityLabel}
        systemImage={filter.active ? "line.3.horizontal.decrease.circle.fill" : "line.3.horizontal.decrease"}
        onPress={filter.onPress}
        modifiers={[labelStyle("iconOnly"), ...(filter.active ? [tint(tokens.primary)] : [])]}
      />
    </SwiftToolbarItem>
  );
  const closeItem = (
    <SwiftToolbarItem placement="topBarTrailing">
      <SwiftButton role="close" onPress={onClose} modifiers={[swiftAccessibilityLabel(closeAccessibilityLabel)]} />
    </SwiftToolbarItem>
  );

  return (
    <SwiftNavigationStack
      path={path}
      onPathChange={(next) => {
        // A pop is already on screen; a row's push waits for its page above.
        if (next.length < path.length) setPath(next);
        onPathChange(next);
      }}
    >
      <SwiftToolbar>
        <SwiftGroup
          modifiers={[
            ...STACK_ROOT_MODIFIERS,
            pinnedSearch(search.query, search.placeholder, search.onChangeQuery),
          ]}
        >
          {children}
        </SwiftGroup>
        <SwiftToolbar.Content>
          {filterItem}
          <SwiftToolbarItem placement="principal">
            <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1), sheetCenteredTitle()]}>{title}</SwiftText>
          </SwiftToolbarItem>
          {closeItem}
        </SwiftToolbar.Content>
      </SwiftToolbar>
      <SwiftNavigationDestination value={ADD_DIRECTORY_PAGE}>
        {sessions[ADD_DIRECTORY_PAGE] ? (
          <MobileAddSourcesDirectoryPage
            key={sessions[ADD_DIRECTORY_PAGE]}
            open={pages.includes(ADD_DIRECTORY_PAGE)}
            onAdded={onDirectoryAdded}
            onDismissBlockedChange={onDismissBlockedChange}
          />
        ) : null}
      </SwiftNavigationDestination>
      <SwiftNavigationDestination value={SERVER_PICKER_PAGE}>
        {sessions[SERVER_PICKER_PAGE] ? <ServerPickerPage /> : null}
      </SwiftNavigationDestination>
      {SELF_HOSTED_SETUP_KINDS.map((kind) => {
        const page = mobileServerFormPage(kind);
        return (
          <SwiftNavigationDestination key={kind} value={page}>
            {sessions[page] ? (
              <ServerFormPage
                key={sessions[page]}
                kind={kind}
                open={pages.includes(page)}
                onConnected={onServerConnected}
                onDismissBlockedChange={onDismissBlockedChange}
              />
            ) : null}
          </SwiftNavigationDestination>
        );
      })}
    </SwiftNavigationStack>
  );
}
