import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { useMobileDataStore } from "@/data/mobileDataContext";
import { emitMobileDataChanged } from "@/data/mobileDataEvents";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import { hapticConfirm, hapticError } from "@/lib/haptics";
import { formatMobileString, getMobileStrings } from "@/lib/mobileI18n";
import { testSelfHostedConnection } from "@/lib/selfHosted/connectionTest";
import { selfHostedCookieScope } from "@/lib/selfHosted/executorSource";
import {
  selfHostedErrorDiagnostic,
  selfHostedErrorMessage,
  selfHostedKindName,
  serverUrlErrorMessage,
} from "@/lib/selfHosted/messages";
import {
  SELF_HOSTED_DEFAULT_PORTS,
  isSelfHostedKind,
  normalizeServerUrl,
  readSelfHostedCredentials,
  selfHostedSourceKey,
  type SelfHostedKind,
} from "@/lib/selfHosted/policy";
import { saveSelfHostedSource } from "@/lib/selfHosted/store";
import { defaultMobileSourceSessionCache } from "@/sources/mobileSourceExecutorCache";
import { clearMobileSourceImageRequestCache } from "@/sources/mobileSourceImages";
import { clearMobileSourceNativeCookies } from "@/sources/mobileSourceProfileNative";
import NemuAidokuModule from "../../modules/nemu-aidoku/src/NemuAidokuModule";

export type ServerSourceFormParams = {
  kind?: string;
  sourceId?: string;
};

/**
 * State and actions of the server setup form (Komga, Kavita), shared by the
 * native iOS form and the plain one. Saving connects first: an address or login
 * that does not work is reported and nothing is stored.
 */
export function useServerSourceForm(params: ServerSourceFormParams) {
  const router = useRouter();
  const store = useMobileDataStore();
  const { appLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const editingId = params.sourceId || undefined;
  const [kind, setKind] = useState<SelfHostedKind | null>(isSelfHostedKind(params.kind) ? params.kind : null);
  const [server, setServer] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(!editingId);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  /** Set by the native form: empties its secure fields before the screen closes. */
  const clearSecretsRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!editingId) return;
    let cancelled = false;
    void (async () => {
      const key = selfHostedSourceKey(editingId);
      const [source, settings] = await Promise.all([store.getInstalledSource(key), store.getSourceSettings(key)]);
      if (cancelled || !source?.selfHosted) return;
      const credentials = readSelfHostedCredentials(settings?.values);
      setKind(source.selfHosted.kind);
      setServer(source.selfHosted.server);
      setName(source.name ?? "");
      setUsername(credentials.username ?? "");
      setPassword(credentials.password ?? "");
      setApiKey(credentials.apiKey ?? "");
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [editingId, store]);

  const canSave = loaded && kind !== null && server.trim().length > 0 && !saving;

  const save = useCallback(async () => {
    if (!kind || savingRef.current) return;
    const address = normalizeServerUrl(server);
    if (!address.ok) {
      void hapticError();
      Alert.alert(strings.selfHosted.connectFailedTitle, serverUrlErrorMessage(address.reason, strings));
      return;
    }
    // A key replaces a username and password; typing both would be ambiguous.
    const credentials = apiKey.trim()
      ? { apiKey: apiKey.trim() }
      : username.trim() || password
        ? { username: username.trim(), password }
        : {};
    savingRef.current = true;
    setSaving(true);
    try {
      const config = { kind, server: address.url };
      await testSelfHostedConnection(
        { config, credentials },
        {
          language: appLanguage,
          setGrant: (scope, urls) => {
            NemuAidokuModule.setLocalNetworkAllowance?.(scope, urls);
          },
        },
      );
      const saved = await saveSelfHostedSource(store, {
        kind,
        name: name.trim() || selfHostedKindName(kind),
        server: address.url,
        credentials,
        sourceId: editingId,
      });
      // The address or login may have changed under a live session and its
      // cached image requests, and the old login's cookies must not linger.
      const sourceKey = saved.id;
      defaultMobileSourceSessionCache.remove(sourceKey);
      clearMobileSourceImageRequestCache();
      await clearMobileSourceNativeCookies(selfHostedCookieScope(saved.sourceId ?? "")).catch(() => undefined);
      emitMobileDataChanged("sources");
      emitMobileDataChanged("sourceSettings");
      void hapticConfirm();
      // iOS offers to save a password still sitting in a secure field when its
      // screen goes away; a reader app's server login must not be offered.
      clearSecretsRef.current?.();
      await new Promise((resolve) => setTimeout(resolve, 250));
      router.back();
    } catch (failure) {
      void hapticError();
      const diagnostic = selfHostedErrorDiagnostic(failure);
      Alert.alert(
        strings.selfHosted.connectFailedTitle,
        [selfHostedErrorMessage(failure, strings, kind), diagnostic].filter(Boolean).join("\n\n"),
      );
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [apiKey, appLanguage, editingId, kind, name, password, router, server, store, strings, username]);

  return {
    strings,
    kind,
    kindName: kind ? selfHostedKindName(kind) : "",
    serverPlaceholder: formatMobileString(strings.selfHosted.serverAddressPlaceholder, {
      port: SELF_HOSTED_DEFAULT_PORTS[kind ?? "komga"],
    }),
    editing: Boolean(editingId),
    loaded,
    saving,
    canSave,
    fields: { server, name, username, password, apiKey },
    setServer,
    setName,
    setUsername,
    setPassword,
    setApiKey,
    save,
    clearSecretsRef,
  };
}
