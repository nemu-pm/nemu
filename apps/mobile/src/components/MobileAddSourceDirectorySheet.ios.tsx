import { useEffect, useState } from "react";
import {
  Button as SwiftButton,
  Form as SwiftForm,
  Group as SwiftGroup,
  HStack as SwiftHStack,
  Label as SwiftLabel,
  NavigationDestination as SwiftNavigationDestination,
  NavigationStack as SwiftNavigationStack,
  ProgressView as SwiftProgressView,
  Section as SwiftSection,
  Spacer as SwiftSpacer,
  Text as SwiftText,
  TextField as SwiftTextField,
  Toolbar as SwiftToolbar,
  ToolbarItem as SwiftToolbarItem,
  useNativeState,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  autocorrectionDisabled,
  disabled,
  font,
  foregroundStyle,
  frame,
  ignoreSafeArea,
  keyboardType,
  lineLimit,
  listSectionMargins,
  onSubmit,
  scrollEdgeEffectStyle,
  submitLabel,
  textInputAutocapitalization,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import { useNemuTheme } from "@/design-system";
import { MOBILE_GROUPED_FORM_TOP_MARGIN } from "@/lib/mobileLibrarySheetLayout";
import {
  inlineToolbarTitle,
  navigationBarHidden,
  zeroTopScrollContentMargin,
} from "../../modules/nemu-window-layout/src/presentationColorScheme";
import { MobileNativeFormSheet, ToolbarActionButton } from "./MobileNativeFormSheet.ios";
import type {
  MobileAddSourceDirectorySheetProps,
  MobileAddSourcesDirectoryPageProps,
  MobileAddSourcesDirectoryStackProps,
} from "./MobileAddSourceDirectorySheet.types";
import {
  useAddSourceDirectoryForm,
  useAddSourceDirectorySheetForm,
  type AddSourceDirectoryForm,
} from "./useAddSourceDirectoryForm";

/** The page's value on the Add Sources sheet's stack. */
const ADD_DIRECTORY_PAGE = "add-directory";

/**
 * Add Sources' list keeps its own header: the bar belongs to the pushed page.
 * The stack applies the safe area again inside the sheet's root, which ignores
 * it, so the list ignores it here too and still reaches the edges under the
 * Duo outer display's vertical bar column.
 */
const STACK_ROOT_MODIFIERS = [
  navigationBarHidden(),
  frame({ maxWidth: Infinity }),
  ignoreSafeArea({ regions: "container", edges: "horizontal" }),
];

/** Add Sources pushes the page natively (`MobileAddSourcesDirectoryStack`). */
export const mobileAddSourcesPushesDirectoryNatively = true;

/** Only Android draws the page in the sheet's own body. */
export function MobileAddSourcesDirectoryPage(_props: MobileAddSourcesDirectoryPageProps) {
  return null;
}

/**
 * Add Source Directory's two groups, in a native grouped Form. An
 * Aidoku-compatible list's address or add link, typed or pasted here; then how
 * add links on a directory's own website open nemu directly (with nemu.pm's
 * help on directories, when set). It lists no directory.
 */
function DirectorySections({ form }: { form: AddSourceDirectoryForm }) {
  const { tokens } = useNemuTheme();
  const { strings } = form;
  const s = strings.settings;
  const address = useNativeState(form.address);

  return (
    <>
      <SwiftSection
        header={<SwiftText>{s.sourceDirectoryAidokuHeader}</SwiftText>}
        footer={<SwiftText>{`${s.sourceDirectoryAidokuFooter}\n\n${s.sourceDirectoryDisclaimer}`}</SwiftText>}
      >
        <SwiftTextField
          text={address}
          autoFocus
          placeholder={s.sourceDirectoryUrlPlaceholder}
          onTextChange={form.setAddress}
          modifiers={[
            accessibilityLabel(s.sourceDirectoryAddress),
            textInputAutocapitalization("never"),
            autocorrectionDisabled(true),
            keyboardType("url"),
            submitLabel("go"),
            onSubmit(() => void form.submit()),
            ...(form.checking ? [disabled(true)] : []),
          ]}
        />
        {form.canPaste ? (
          <SwiftButton
            label={s.pasteSourceDirectoryAddress}
            systemImage="doc.on.clipboard"
            onPress={() => {
              void form.paste().then((pasted) => {
                if (pasted) address.set(pasted);
              });
            }}
          />
        ) : null}
      </SwiftSection>
      {form.checking ? (
        <SwiftSection>
          <SwiftHStack spacing={10}>
            <SwiftText modifiers={[foregroundStyle({ type: "hierarchical", style: "secondary" })]}>
              {s.checkingSourceDirectory}
            </SwiftText>
            <SwiftSpacer />
            <SwiftProgressView />
          </SwiftHStack>
        </SwiftSection>
      ) : null}
      {form.error ? (
        <SwiftSection>
          <SwiftLabel
            title={form.error}
            systemImage="exclamationmark.triangle"
            color={tokens.danger}
            modifiers={[foregroundStyle(tokens.danger)]}
          />
        </SwiftSection>
      ) : null}
      <SwiftSection
        header={<SwiftText>{s.sourceDirectoryLinksHeader}</SwiftText>}
        footer={<SwiftText>{s.sourceDirectoryLinksFooter}</SwiftText>}
      >
        {form.helpUrl ? (
          <SwiftButton label={s.sourceDirectoryHelp} systemImage="questionmark.circle" onPress={form.openHelp} />
        ) : null}
      </SwiftSection>
    </>
  );
}

/**
 * From Settings: a form sheet with Cancel and Add in its bar; centred on a
 * regular-width iPad. Added, it comes down and a toast offers the sources.
 */
export function MobileAddSourceDirectorySheet(props: MobileAddSourceDirectorySheetProps) {
  const { form, close, handleDismiss } = useAddSourceDirectorySheetForm(props);
  const { strings } = form;

  return (
    <MobileNativeFormSheet
      visible={props.visible}
      onClose={close}
      onDismiss={handleDismiss}
      title={strings.browse.addSourceDirectory}
      detents={[{ fraction: 0.75 }, "large"]}
      tightTop
      padSizing="form"
      interactiveDismissDisabled={form.blocksDismiss}
      cancel={{ label: strings.common.cancel, onPress: close }}
      confirm={{ label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() }}
      testID="AddSourceDirectorySheet"
    >
      <DirectorySections form={form} />
    </MobileNativeFormSheet>
  );
}

function AddDirectoryPage({ open, onAdded, onDismissBlockedChange }: MobileAddSourcesDirectoryPageProps) {
  const { tokens } = useNemuTheme();
  const form = useAddSourceDirectoryForm({ onAdded: (added) => onAdded(added.id) });
  const { strings, cancel, blocksDismiss } = form;

  // Back while a check runs walks away from it.
  useEffect(() => {
    if (!open) cancel();
  }, [cancel, open]);
  useEffect(() => {
    onDismissBlockedChange(blocksDismiss);
  }, [blocksDismiss, onDismissBlockedChange]);

  return (
    <SwiftToolbar>
      <SwiftForm
        modifiers={[
          tint(tokens.primary),
          scrollEdgeEffectStyle("soft", "vertical"),
          inlineToolbarTitle(),
          zeroTopScrollContentMargin(),
          listSectionMargins({ edges: "top", length: MOBILE_GROUPED_FORM_TOP_MARGIN }),
        ]}
      >
        <DirectorySections form={form} />
      </SwiftForm>
      <SwiftToolbar.Content>
        <SwiftToolbarItem placement="principal">
          <SwiftText modifiers={[font({ textStyle: "headline" }), lineLimit(1)]}>
            {strings.browse.addSourceDirectory}
          </SwiftText>
        </SwiftToolbarItem>
        <SwiftToolbarItem placement="confirmationAction">
          <ToolbarActionButton
            action={{ label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() }}
            accent={tokens.primary}
          />
        </SwiftToolbarItem>
      </SwiftToolbar.Content>
    </SwiftToolbar>
  );
}

/**
 * From Add Sources: the sheet's own navigation, around its list. The page is
 * pushed in place with the system back (chevron, edge swipe), and popped on an
 * add. Each push starts a fresh page; the one before stays mounted while it
 * slides out.
 */
export function MobileAddSourcesDirectoryStack({
  open,
  onPop,
  onAdded,
  onDismissBlockedChange,
  children,
}: MobileAddSourcesDirectoryStackProps) {
  const [session, setSession] = useState(0);
  const [openSeen, setOpenSeen] = useState(false);
  if (open !== openSeen) {
    setOpenSeen(open);
    if (open) setSession(session + 1);
  }
  // One commit behind `open`, so the page's content is mounted before the stack slides it in.
  const [path, setPath] = useState<string[]>([]);
  useEffect(() => {
    setPath(open ? [ADD_DIRECTORY_PAGE] : []);
  }, [open]);

  return (
    <SwiftNavigationStack
      path={path}
      onPathChange={(next) => {
        setPath(next);
        if (next.length === 0 && open) onPop();
      }}
    >
      <SwiftGroup modifiers={STACK_ROOT_MODIFIERS}>{children}</SwiftGroup>
      <SwiftNavigationDestination value={ADD_DIRECTORY_PAGE}>
        {session > 0 ? (
          <AddDirectoryPage
            key={session}
            open={open}
            onAdded={onAdded}
            onDismissBlockedChange={onDismissBlockedChange}
          />
        ) : null}
      </SwiftNavigationDestination>
    </SwiftNavigationStack>
  );
}
