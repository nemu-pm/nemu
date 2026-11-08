import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState } from "react-native";
import * as Clipboard from "expo-clipboard";
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
import { registerMobileAddSourceDirectorySheet } from "@/lib/mobileAddSourceDirectorySheetPresence";
import { requestMobileAddSourceSheet } from "@/lib/mobileAddSourceSheetRequest";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { SOURCE_DIRECTORY_ERROR_KEYS } from "@/lib/mobileSourceDirectoryErrors";
import {
  mobileAddSourceDirectoryBlocksDismiss,
  mobileSourceDirectoryAddressFromClipboard,
} from "@/lib/mobileSourceDirectoryGuide";
import type { MobileAddSourceDirectorySheetProps } from "./MobileAddSourceDirectorySheet.types";

/** A directory just added, and how to announce it. */
export type AddedSourceDirectory = { id: string; title: string; detail: string };

export type AddSourceDirectoryForm = ReturnType<typeof useAddSourceDirectoryForm>;

/** A sheet that never reports its dismissal must not hold up a link. */
const SHEET_CLOSE_TIMEOUT_MS = 800;

/**
 * State and actions of Add Source Directory, shared by the native iOS form and
 * the plain one. Adding checks the list first (HTTPS, not a duplicate,
 * readable, not empty); a failure stays on the form with the address kept, so
 * it can be corrected instead of retyped. `onAdded` says where it goes next.
 */
export function useAddSourceDirectoryForm({ onAdded }: { onAdded: (added: AddedSourceDirectory) => void }) {
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const [address, setAddressValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clipboardHasText, setClipboardHasText] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
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

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);
  useEffect(() => cancel, [cancel]);

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
    let added = false;
    try {
      const preview = await previewMobileSourceDirectory(
        store,
        { url: input },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const directory = await addMobileSourceDirectory(store, { url: input }, { preview });
      emitMobileDataChanged("registries");
      added = true;
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
      onAdded({ id: directory.id, title, detail });
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
      // Added: the form is leaving as it is, and cannot submit again.
      if (!added) setChecking(false);
    }
  }, [onAdded, store, strings]);

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
    address,
    setAddress,
    checking,
    error,
    canSubmit,
    canPaste: clipboardHasText && !checking,
    blocksDismiss: mobileAddSourceDirectoryBlocksDismiss({ address, checking }),
    submit,
    cancel,
    paste,
  };
}

/**
 * Add Source Directory as its own sheet (Settings): added, it comes down and a
 * toast offers the sources; closing it for any reason stops a check in flight.
 * The toast waits until the sheet is down, as its host sits under the sheet.
 */
export function useAddSourceDirectorySheetForm({ visible, onClose, onDismiss }: MobileAddSourceDirectorySheetProps) {
  const router = useRouter();
  const toast = useMobileToast();
  const pendingToastRef = useRef<AddedSourceDirectory | null>(null);
  const dismissWaitersRef = useRef<(() => void)[]>([]);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const form = useAddSourceDirectoryForm({
    onAdded: (added) => {
      pendingToastRef.current = added;
      onClose();
    },
  });
  const { cancel, strings } = form;

  useEffect(() => {
    if (!visible) cancel();
  }, [cancel, visible]);

  // A directory link confirmed over this sheet: down first, Add Sources next.
  useEffect(
    () =>
      registerMobileAddSourceDirectorySheet(
        () =>
          new Promise((resolve) => {
            const timer = setTimeout(resolve, SHEET_CLOSE_TIMEOUT_MS);
            dismissWaitersRef.current.push(() => {
              clearTimeout(timer);
              resolve();
            });
            onCloseRef.current();
          }),
      ),
    [],
  );

  const handleDismiss = () => {
    for (const waiter of dismissWaitersRef.current.splice(0)) waiter();
    const added = pendingToastRef.current;
    pendingToastRef.current = null;
    if (added) {
      toast.show({
        id: "source-directory-added",
        tone: "success",
        title: added.title,
        detail: added.detail,
        duration: "long",
        action: {
          label: strings.settings.showSourceDirectorySources,
          onPress: () => {
            requestMobileAddSourceSheet({ directoryId: added.id });
            router.push("/browse");
          },
        },
      });
    }
    onDismiss();
  };

  return { form, close: onClose, handleDismiss };
}
