import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import { router } from "expo-router";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  addMobileSourceDirectory,
  MobileSourceDirectoryError,
  previewMobileSourceDirectory,
} from "@/data/mobileSourceDirectories";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { subscribeMobileSourceDirectoryLinks } from "@/lib/mobileSourceDirectoryLinkInbox";
import { SOURCE_DIRECTORY_ERROR_KEYS } from "@/lib/mobileSourceDirectoryErrors";
import { useMobileToast } from "./MobileToastContext";

/**
 * `nemu://addSourceList?url=` / `aidoku://addSourceList?url=`: checks the
 * directory first, then asks in a system alert. Nothing is added silently.
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
            const preview = await previewMobileSourceDirectory(store, { url });
            Alert.alert(
              strings.addSourceDirectoryLinkTitle,
              formatMobileString(strings.addSourceDirectoryLinkMessage, {
                name: preview.name,
                host: preview.host,
              }),
              [
                { text: getMobileStrings(appLanguage).common.cancel, style: "cancel" },
                {
                  text: getMobileStrings(appLanguage).common.add,
                  onPress: () => {
                    void addMobileSourceDirectory(store, { url }, { preview })
                      .then(() => {
                        emitMobileDataChanged("registries");
                        toast.show({ id: "source-directory-added", tone: "success", title: strings.sourceDirectoryAdded });
                        router.push({
                          pathname: "/(tabs)/settings/[section]",
                          params: { section: "directories" },
                        });
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
