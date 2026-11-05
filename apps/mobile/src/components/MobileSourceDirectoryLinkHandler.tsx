import { useEffect, useRef } from "react";
import { AccessibilityInfo, Alert } from "react-native";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  addMobileSourceDirectory,
  MobileSourceDirectoryError,
  previewMobileSourceDirectory,
} from "@/data/mobileSourceDirectories";
import { hapticConfirm } from "@/lib/haptics";
import { requestMobileAddSourceSheet } from "@/lib/mobileAddSourceSheetRequest";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { navigateToMobileRootTab } from "@/lib/mobileRootTabNavigation";
import { subscribeMobileSourceDirectoryLinks } from "@/lib/mobileSourceDirectoryLinkInbox";
import { SOURCE_DIRECTORY_ERROR_KEYS } from "@/lib/mobileSourceDirectoryErrors";
import { useMobileToast } from "./MobileToastContext";

/**
 * `nemu://addSourceList?url=` / `aidoku://addSourceList?url=`: checks the
 * directory first (a toast says so while it loads), then asks in a system
 * alert (name, address, and that nemu does not host or review it). Nothing is
 * added silently. Once added, Browse opens Add Sources on its sources.
 *
 * A link tapped in the in-app browser closes that browser first, so the toast,
 * the alert and Add Sources are not left underneath it.
 */
export function MobileSourceDirectoryLinkHandler() {
  const store = useMobileDataStore();
  const toast = useMobileToast();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage).settings;
  const latest = useRef({ store, toast, strings });
  latest.current = { store, toast, strings };
  const busy = useRef(false);

  useEffect(
    () =>
      subscribeMobileSourceDirectoryLinks((url) => {
        if (busy.current) return;
        busy.current = true;
        const { store, toast, strings } = latest.current;
        const fail = (error: unknown) =>
          toast.show({
            id: "source-directory-error",
            tone: "danger",
            title:
              strings[
                error instanceof MobileSourceDirectoryError
                  ? SOURCE_DIRECTORY_ERROR_KEYS[error.code]
                  : "sourceDirectoryErrorUnreachable"
              ],
          });
        void (async () => {
          try {
            // Rejects when no in-app browser is open; absent on Android.
            await WebBrowser.dismissBrowser()?.catch(() => undefined);
            // Fetching the list can take a moment before the alert appears.
            toast.show({
              id: "source-directory-link",
              tone: "info",
              loading: true,
              duration: "sticky",
              title: strings.checkingSourceDirectory,
            });
            const preview = await previewMobileSourceDirectory(store, { url }).finally(() =>
              toast.dismiss("source-directory-link"),
            );
            Alert.alert(
              strings.addSourceDirectoryLinkTitle,
              formatMobileString(strings.addSourceDirectoryLinkMessage, {
                name: preview.name,
                url: preview.indexUrl,
              }),
              [
                { text: getMobileStrings(appLanguage).common.cancel, style: "cancel" },
                {
                  text: getMobileStrings(appLanguage).common.add,
                  onPress: () => {
                    void addMobileSourceDirectory(store, { url }, { preview })
                      .then((directory) => {
                        emitMobileDataChanged("registries");
                        void hapticConfirm();
                        const count = preview.index.sources.length;
                        const title = formatMobileString(strings.sourceDirectoryAddedNamed, { name: directory.name });
                        const detail = formatMobileString(
                          count === 1 ? strings.sourceDirectorySourceCountOne : strings.sourceDirectorySourceCountOther,
                          { count },
                        );
                        AccessibilityInfo.announceForAccessibility(`${title}. ${detail}`);
                        toast.show({ id: "source-directory-added", tone: "success", title, detail });
                        // Straight to what the link was for: Add Sources,
                        // opened on the new directory's sources.
                        requestMobileAddSourceSheet({ directoryId: directory.id });
                        if (!navigateToMobileRootTab("/browse", { popToRoot: true, router })) {
                          router.navigate("/browse");
                        }
                      })
                      .catch(fail);
                  },
                },
              ],
            );
          } catch (error) {
            fail(error);
          } finally {
            busy.current = false;
          }
        })();
      }),
    [appLanguage],
  );
  return null;
}
