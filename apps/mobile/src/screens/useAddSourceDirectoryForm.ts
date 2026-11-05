import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Linking } from "react-native";
import * as Clipboard from "expo-clipboard";
import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useMobileToast } from "@/components/MobileToastContext";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  addMobileSourceDirectory,
  MobileSourceDirectoryError,
  previewMobileSourceDirectory,
} from "@/data/mobileSourceDirectories";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import {
  hasPendingMobileAddSourceSheetRequest,
  requestMobileAddSourceSheet,
} from "@/lib/mobileAddSourceSheetRequest";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { SOURCE_DIRECTORY_ERROR_KEYS } from "@/lib/mobileSourceDirectoryErrors";
import {
  NEMU_SOURCE_DIRECTORIES_HELP_URL,
  mobileSourceDirectoryAddressFromClipboard,
  parseMobileAddSourceDirectoryOrigin,
} from "@/lib/mobileSourceDirectoryGuide";

export type AddSourceDirectoryFormParams = {
  /** `browse`: pushed from Add Sources, which reopens when this page closes. */
  from?: string;
};

function openInAppBrowser(url: string) {
  void WebBrowser.openBrowserAsync(url).catch(() => Linking.openURL(url).catch(() => undefined));
}

/**
 * State and actions of the Add Source Directory page, shared by the native
 * iOS form and the plain one. Adding checks the list first (HTTPS, not a
 * duplicate, readable, not empty); a failure stays on the page with the
 * address kept, so it can be corrected instead of retyped.
 *
 * Where it returns: from Add Sources, closing the page (Back, swipe, or a
 * successful add) reopens that sheet, after an add on the new directory's
 * sources. From Settings, the directory list shows the new row and a toast
 * offers its sources.
 */
export function useAddSourceDirectoryForm(params: AddSourceDirectoryFormParams) {
  const origin = parseMobileAddSourceDirectoryOrigin(params.from);
  const router = useRouter();
  const store = useMobileDataStore();
  const toast = useMobileToast();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [address, setAddressValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboardHasText, setClipboardHasText] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const addedDirectoryIdRef = useRef<string | null>(null);
  // What the field holds, for `submit`: the bar button and the keyboard's Go
  // can keep a handler from an earlier render, so it must not read `address`
  // from its closure.
  const addressRef = useRef("");

  // Reading whether the clipboard has text does not ask for paste permission;
  // only the Paste button's read does, and only when tapped.
  useEffect(() => {
    let active = true;
    const check = () => {
      void Clipboard.hasStringAsync()
        .then((has) => {
          if (active) setClipboardHasText(has);
        })
        .catch(() => undefined);
    };
    check();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") check();
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  // Leaving the page: once it is gone (after the pop, so the sheet does not
  // present mid-transition) Add Sources comes back when it was the origin.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (origin !== "browse") return;
      const directoryId = addedDirectoryIdRef.current;
      // A nemu:// link confirmed while this page was open has already asked
      // for the sheet on its directory; a plain reopen must not replace that.
      if (!directoryId && hasPendingMobileAddSourceSheetRequest()) return;
      requestMobileAddSourceSheet(directoryId ? { directoryId } : {});
    },
    [origin],
  );

  const setAddress = useCallback((value: string) => {
    addressRef.current = value;
    setAddressValue(value);
    setError(null);
  }, []);

  const canSubmit = address.trim().length > 0 && !checking;

  const submit = useCallback(async () => {
    const input = addressRef.current.trim();
    if (!input || abortRef.current) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setChecking(true);
    setError(null);
    try {
      const preview = await previewMobileSourceDirectory(
        store,
        { url: input },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const directory = await addMobileSourceDirectory(store, { url: input }, { preview });
      emitMobileDataChanged("registries");
      addedDirectoryIdRef.current = directory.id;
      void hapticConfirm();
      const count = preview.index.sources.length;
      const title = formatMobileString(strings.settings.sourceDirectoryAddedNamed, { name: directory.name });
      const detail = formatMobileString(
        count === 1
          ? strings.settings.sourceDirectorySourceCountOne
          : strings.settings.sourceDirectorySourceCountOther,
        { count },
      );
      AccessibilityInfo.announceForAccessibility(`${title}. ${detail}`);
      if (origin === "settings") {
        toast.show({
          id: "source-directory-added",
          tone: "success",
          title,
          detail,
          // Time to reach the action after the page closes.
          duration: "long",
          action: {
            label: strings.settings.showSourceDirectorySources,
            onPress: () => {
              requestMobileAddSourceSheet({ directoryId: directory.id });
              router.push("/browse");
            },
          },
        });
      }
      router.back();
    } catch (failure) {
      if (controller.signal.aborted) return;
      void hapticError();
      setError(
        strings.settings[
          failure instanceof MobileSourceDirectoryError
            ? SOURCE_DIRECTORY_ERROR_KEYS[failure.code]
            : "sourceDirectoryErrorUnreachable"
        ],
      );
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      setChecking(false);
    }
  }, [origin, router, store, strings, toast]);

  /** Fills the field from the clipboard; returns the address for a native field to show. */
  const paste = useCallback(async (): Promise<string | null> => {
    const text = await Clipboard.getStringAsync().catch(() => "");
    // Nothing read (paste declined in the system prompt, or no text after
    // all): not the user's address, so no "not a valid address" for it.
    if (!text.trim()) return null;
    const next = mobileSourceDirectoryAddressFromClipboard(text);
    if (!next) {
      void hapticError();
      setError(strings.settings.sourceDirectoryErrorInvalid);
      return null;
    }
    setAddress(next);
    return next;
  }, [setAddress, strings]);

  return {
    strings,
    origin,
    address,
    setAddress,
    checking,
    error,
    canSubmit,
    canPaste: clipboardHasText && !checking,
    submit,
    paste,
    helpUrl: NEMU_SOURCE_DIRECTORIES_HELP_URL,
    openHelp: () => {
      if (NEMU_SOURCE_DIRECTORIES_HELP_URL) openInAppBrowser(NEMU_SOURCE_DIRECTORIES_HELP_URL);
    },
  };
}
