import { useEffect, useState } from "react";
import { useAssets } from "expo-asset";
import {
  Group as SwiftGroup,
  HStack as SwiftHStack,
  Image as SwiftImage,
  NavigationDestination as SwiftNavigationDestination,
  NavigationLink as SwiftNavigationLink,
  NavigationStack as SwiftNavigationStack,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  VStack as SwiftVStack,
} from "@expo/ui/swift-ui";
import {
  font,
  foregroundStyle,
  frame,
  ignoreSafeArea,
  lineLimit,
  resizable,
} from "@expo/ui/swift-ui/modifiers";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  ADD_DIRECTORY_PAGE,
  SERVER_PICKER_PAGE,
  mobileAddSourcesEnteredPages,
  mobileServerFormPage,
} from "@/lib/mobileAddSourcesPages";
import { getMobileStrings } from "@/lib/mobileI18n";
import { selfHostedKindName } from "@/lib/selfHosted/messages";
import { SELF_HOSTED_SETUP_KINDS, type SelfHostedKind } from "@/lib/selfHosted/policy";
import { navigationBarHidden } from "../../modules/nemu-window-layout/src/presentationColorScheme";
import { MobileAddSourcesDirectoryPage } from "./MobileAddSourceDirectorySheet";
import type { MobileAddSourcesStackProps } from "./MobileAddSourcesStack.types";
import { MobilePushedFormPage } from "./MobilePushedFormPage.ios";
import { MobileServerSourceSections } from "./MobileServerSourceSections.ios";
import { SERVER_ICONS } from "./mobileServerIcons";
import { useServerSourceForm } from "./useServerSourceForm";

/**
 * Add Sources' list keeps its own header: the bar belongs to the pushed page.
 * The stack applies the safe area again inside the sheet's root, which ignores
 * it, so the list ignores it here too: it still reaches the edges under the
 * Duo outer display's vertical bar column, and runs through the home
 * indicator's inset to the sheet's bottom edge (its soft bottom edge; at the
 * full-height detent the list stopped in a hard line above it).
 */
const STACK_ROOT_MODIFIERS = [
  navigationBarHidden(),
  frame({ maxWidth: Infinity }),
  ignoreSafeArea({ regions: "container", edges: "horizontal" }),
  ignoreSafeArea({ regions: "container", edges: "bottom" }),
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
  children,
}: MobileAddSourcesStackProps) {
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

  return (
    <SwiftNavigationStack
      path={path}
      onPathChange={(next) => {
        // A pop is already on screen; a row's push waits for its page above.
        if (next.length < path.length) setPath(next);
        onPathChange(next);
      }}
    >
      <SwiftGroup modifiers={STACK_ROOT_MODIFIERS}>{children}</SwiftGroup>
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
