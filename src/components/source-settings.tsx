/**
 * Source settings - displays and edits source-specific settings
 *
 * Schema is populated when source is created (on first use).
 * reloadSource is called when source selector changes.
 */
import { useState, useMemo, useCallback, useRef, useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { parseSourceKey } from "@/data/keys";
import { useStores } from "@/data/context";
import { SettingsDialogWithPages } from "@/components/ui/settings-dialog";
import { submitSourceBasicLogin, submitSourceWebLogin } from "@/components/source-settings-auth";
import {
  ResponsiveDialogNested,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowReloadHorizontalIcon } from "@hugeicons/core-free-icons";
import type { Setting, PageSetting, ButtonSetting, LinkSetting, LoginSetting, SettingsRendererProps } from "@/lib/settings";
import { extractDefaults, SettingsRenderer } from "@/lib/settings";
import { getSourceSettingsStore } from "@/stores/source-settings";
import { SOURCE_SELECTION_KEY } from "@/lib/sources/tachiyomi/adapter";
import type { MangaSource } from "@/lib/sources/types";
import { hasAuthenticationHandlers } from "@/lib/sources/types";
import { proxyUrl } from "@/config";
import { agentFetch, hasAgent } from "@/lib/agent";

const LOGIN_USERNAME_SUFFIX = ".username";
const LOGIN_PASSWORD_SUFFIX = ".password";
const LOGIN_COOKIE_KEYS_SUFFIX = ".keys";
const LOGIN_COOKIE_VALUES_SUFFIX = ".values";
const LOGIN_LOCAL_STORAGE_PREFIX = ".ls.";
const LOGIN_CODE_VERIFIER_SUFFIX = ".codeVerifier";
const SETTING_EFFECT_DEBOUNCE_MS = 500;

interface SourceSettingsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceKey: string;
  sourceName: string;
  sourceIcon?: string;
  sourceVersion?: number;
  /** Called when source needs to be reloaded (e.g., source selector change) */
  reloadSource?: () => Promise<void>;
}

interface PageStackItem {
  title: string;
  content: ReactNode;
}

interface BasicLoginState {
  setting: LoginSetting;
  username: string;
  password: string;
  submitting: boolean;
  error: string | null;
}

interface WebLoginState {
  setting: LoginSetting;
  cookiesText: string;
  localStorageText: string;
  submitting: boolean;
  error: string | null;
}

interface OAuthLoginState {
  setting: LoginSetting;
  callbackValue: string;
  submitting: boolean;
  error: string | null;
}

export function SourceSettings({
  open,
  onOpenChange,
  sourceKey,
  sourceName,
  sourceIcon,
  sourceVersion,
  reloadSource,
}: SourceSettingsProps) {
  const { t } = useTranslation();
  const { useSettingsStore } = useStores();
  const getSource = useSettingsStore((s) => s.getSource);
  const store = getSourceSettingsStore();

  const parsedSourceKey = useMemo(
    () => (sourceKey ? parseSourceKey(sourceKey) : { registryId: "", sourceId: "" }),
    [sourceKey]
  );

  const schema = store((s) => s.schemas.get(sourceKey) ?? null);
  const userValues = store((s) => s.values.get(sourceKey));
  const setSetting = store((s) => s.setSetting);
  const deleteSetting = store((s) => s.deleteSetting);
  const resetSettings = store((s) => s.resetSettings);

  const values = useMemo(() => {
    const defaults = schema ? extractDefaults(schema) : {};
    return { ...defaults, ...userValues };
  }, [schema, userValues]);

  const [pageStack, setPageStack] = useState<PageStackItem[]>([]);
  const [basicLogin, setBasicLogin] = useState<BasicLoginState | null>(null);
  const [webLogin, setWebLogin] = useState<WebLoginState | null>(null);
  const [oauthLogin, setOAuthLogin] = useState<OAuthLoginState | null>(null);

  const sourceRef = useRef<MangaSource | null>(null);
  const settingEffectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reloadingRef = useRef(false);

  useEffect(() => {
    sourceRef.current = null;
  }, [sourceKey]);

  useEffect(() => {
    return () => {
      clearPendingSettingEffects();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clearPendingSettingEffects = useCallback(() => {
    for (const timer of settingEffectTimersRef.current.values()) {
      clearTimeout(timer);
    }
    settingEffectTimersRef.current.clear();
  }, []);

  const getLoadedSource = useCallback(async (): Promise<MangaSource | null> => {
    if (!parsedSourceKey.registryId || !parsedSourceKey.sourceId) return null;
    if (sourceRef.current) return sourceRef.current;
    const source = await getSource(parsedSourceKey.registryId, parsedSourceKey.sourceId);
    sourceRef.current = source;
    return source;
  }, [getSource, parsedSourceKey.registryId, parsedSourceKey.sourceId]);

  const scheduleSettingEffects = useCallback(async (setting: Setting, value: unknown) => {
    if (!("key" in setting) || !setting.key) return;
    const settingKey = setting.key;

    const existingTimer = settingEffectTimersRef.current.get(settingKey);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(async () => {
      settingEffectTimersRef.current.delete(settingKey);

      try {
        if ("notification" in setting && setting.notification) {
          const source = await getLoadedSource();
          if (source && hasAuthenticationHandlers(source)) {
            await source.handleNotification(setting.notification);
          }
        }
      } catch (error) {
        console.error("[source-settings] Failed to handle setting notification:", error);
        toast.error(t("sourceSettings.notificationFailed"));
      }

      const notificationName = ("notification" in setting && setting.notification) || ("key" in setting ? setting.key : null);
      if (notificationName) {
        window.dispatchEvent(
          new CustomEvent(notificationName, {
            detail: value,
          })
        );
      }

      if ("refreshes" in setting && setting.refreshes?.length) {
        window.dispatchEvent(
          new CustomEvent("nemu:source-settings-refresh", {
            detail: {
              sourceKey,
              key: settingKey,
              refreshes: setting.refreshes,
              value,
            },
          })
        );
      }
    }, SETTING_EFFECT_DEBOUNCE_MS);

    settingEffectTimersRef.current.set(settingKey, timer);
  }, [getLoadedSource, sourceKey, t]);

  const setPrimarySettingValue = useCallback((setting: Setting, value: unknown) => {
    if (!("key" in setting) || !setting.key) return;
    setSetting(sourceKey, setting.key, value);
    void scheduleSettingEffects(setting, value);
  }, [scheduleSettingEffects, setSetting, sourceKey]);

  const deletePrimarySettingValue = useCallback((setting: Setting) => {
    if (!("key" in setting) || !setting.key) return;
    deleteSetting(sourceKey, setting.key);
    void scheduleSettingEffects(setting, undefined);
  }, [deleteSetting, scheduleSettingEffects, sourceKey]);

  const pushPage = useCallback((page: PageSetting) => {
    setPageStack((prev) => [...prev, {
      title: page.title,
      content: (
        <SettingsRenderer
          schema={page.items}
          values={values}
          onChange={(key, value) => void updateSetting(key, value)}
          onPushPage={pushPage}
          renderCustomSetting={renderCustomSetting}
        />
      ),
    }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  const popPage = useCallback(() => {
    setPageStack((prev) => prev.slice(0, -1));
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) {
      clearPendingSettingEffects();
      setPageStack([]);
      setBasicLogin(null);
      setWebLogin(null);
      setOAuthLogin(null);
    }
    onOpenChange(nextOpen);
  }, [clearPendingSettingEffects, onOpenChange]);

  const handleReset = useCallback(() => {
    clearPendingSettingEffects();
    resetSettings(sourceKey);
    setPageStack([]);
    setBasicLogin(null);
    setWebLogin(null);
    setOAuthLogin(null);
  }, [clearPendingSettingEffects, resetSettings, sourceKey]);

  const reloadWithToast = useCallback(async () => {
    if (!reloadSource || reloadingRef.current) return;
    reloadingRef.current = true;
    const promise = reloadSource().finally(() => {
      reloadingRef.current = false;
      sourceRef.current = null;
    });
    toast.promise(promise, {
      loading: t("sourceSettings.reloadingSource"),
      success: t("sourceSettings.sourceReloaded"),
      error: t("sourceSettings.reloadFailed"),
    });
    await promise;
  }, [reloadSource, t]);

  const updateSetting = useCallback(async (key: string, value: unknown) => {
    setSetting(sourceKey, key, value);

    const setting = schema ? findSettingByKey(schema, key) : null;
    if (setting && setting.type !== "button" && setting.type !== "link" && setting.type !== "login") {
      await scheduleSettingEffects(setting, value);
    }

    if (key === SOURCE_SELECTION_KEY) {
      await reloadWithToast();
    }
  }, [reloadWithToast, scheduleSettingEffects, schema, setSetting, sourceKey]);

  const handleButtonSetting = useCallback(async (setting: ButtonSetting) => {
    const confirmText = [setting.confirmTitle, setting.confirmMessage].filter(Boolean).join("\n\n");
    if (confirmText && !window.confirm(confirmText)) {
      return;
    }
    await scheduleSettingEffects(setting, undefined);
  }, [scheduleSettingEffects]);

  const handleLinkSetting = useCallback((setting: LinkSetting, currentValues: Record<string, unknown>) => {
    const url = resolveActionUrl(setting, currentValues);
    if (!url) {
      toast.error(t("sourceSettings.invalidLink"));
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }, [t]);

  const handleLogout = useCallback((setting: LoginSetting) => {
    if (!window.confirm(t("sourceSettings.logoutConfirm"))) {
      return;
    }

    const baseKey = setting.key;
    deleteSetting(sourceKey, `${baseKey}${LOGIN_USERNAME_SUFFIX}`);
    deleteSetting(sourceKey, `${baseKey}${LOGIN_PASSWORD_SUFFIX}`);
    deleteSetting(sourceKey, `${baseKey}${LOGIN_COOKIE_KEYS_SUFFIX}`);
    deleteSetting(sourceKey, `${baseKey}${LOGIN_COOKIE_VALUES_SUFFIX}`);
    deleteSetting(sourceKey, `${baseKey}${LOGIN_CODE_VERIFIER_SUFFIX}`);

    for (const storageKey of setting.localStorageKeys ?? []) {
      deleteSetting(sourceKey, `${baseKey}${LOGIN_LOCAL_STORAGE_PREFIX}${storageKey}`);
    }

    deletePrimarySettingValue(setting);
  }, [deletePrimarySettingValue, deleteSetting, sourceKey, t]);

  const openBasicLogin = useCallback((setting: LoginSetting) => {
    setBasicLogin({
      setting,
      username: String(values[`${setting.key}${LOGIN_USERNAME_SUFFIX}`] ?? ""),
      password: String(values[`${setting.key}${LOGIN_PASSWORD_SUFFIX}`] ?? ""),
      submitting: false,
      error: null,
    });
  }, [values]);

  const openWebLogin = useCallback((setting: LoginSetting) => {
    setWebLogin({
      setting,
      cookiesText: serializeStoredCookies(values, setting.key),
      localStorageText: serializeStoredLocalStorage(values, setting),
      submitting: false,
      error: null,
    });
  }, [values]);

  const openOAuthLogin = useCallback((setting: LoginSetting) => {
    setOAuthLogin({
      setting,
      callbackValue: "",
      submitting: false,
      error: null,
    });
  }, []);

  const handleLoginSetting = useCallback((setting: LoginSetting, currentValues: Record<string, unknown>) => {
    if (isLoggedIn(setting, currentValues)) {
      handleLogout(setting);
      return;
    }

    switch (setting.method ?? "basic") {
      case "web":
        openWebLogin(setting);
        break;
      case "oauth":
        openOAuthLogin(setting);
        break;
      case "basic":
      default:
        openBasicLogin(setting);
        break;
    }
  }, [handleLogout, openBasicLogin, openOAuthLogin, openWebLogin]);

  const submitBasicLogin = useCallback(async () => {
    if (!basicLogin) return;

    const username = basicLogin.username.trim();
    const password = basicLogin.password;
    if (!username || !password) {
      setBasicLogin((prev) => prev ? { ...prev, error: t("sourceSettings.missingCredentials") } : prev);
      return;
    }

    setBasicLogin((prev) => prev ? { ...prev, submitting: true, error: null } : prev);

    try {
      const source = await getLoadedSource();
      await submitSourceBasicLogin(
        source,
        basicLogin.setting.key,
        username,
        password,
        t("sourceSettings.loginFailed")
      );

      setSetting(sourceKey, `${basicLogin.setting.key}${LOGIN_USERNAME_SUFFIX}`, username);
      setSetting(sourceKey, `${basicLogin.setting.key}${LOGIN_PASSWORD_SUFFIX}`, password);
      setPrimarySettingValue(basicLogin.setting, "logged_in");
      setBasicLogin(null);
    } catch (error) {
      setBasicLogin((prev) => prev ? { ...prev, error: getErrorMessage(error, t("sourceSettings.loginFailed")) } : prev);
    } finally {
      setBasicLogin((prev) => prev ? { ...prev, submitting: false } : prev);
    }
  }, [basicLogin, getLoadedSource, setPrimarySettingValue, setSetting, sourceKey, t]);

  const submitWebLogin = useCallback(async () => {
    if (!webLogin) return;

    setWebLogin((prev) => prev ? { ...prev, submitting: true, error: null } : prev);

    try {
      const cookies = parseCookieInput(webLogin.cookiesText);
      const localStorageValues = parseLocalStorageInput(webLogin.localStorageText, webLogin.setting.localStorageKeys ?? []);
      const hasCookies = Object.keys(cookies).length > 0;
      const hasLocalStorage = Object.keys(localStorageValues).length > 0;

      if (!hasCookies && !hasLocalStorage) {
        throw new Error(t("sourceSettings.invalidSessionData"));
      }

      const source = await getLoadedSource();
      await submitSourceWebLogin(
        source,
        webLogin.setting.key,
        cookies,
        t("sourceSettings.loginFailed")
      );

      const cookieKeys = Object.keys(cookies);
      const cookieValues = cookieKeys.map((key) => cookies[key] ?? "");

      setSetting(sourceKey, `${webLogin.setting.key}${LOGIN_COOKIE_KEYS_SUFFIX}`, cookieKeys);
      setSetting(sourceKey, `${webLogin.setting.key}${LOGIN_COOKIE_VALUES_SUFFIX}`, cookieValues);

      for (const storageKey of webLogin.setting.localStorageKeys ?? []) {
        const namespacedKey = `${webLogin.setting.key}${LOGIN_LOCAL_STORAGE_PREFIX}${storageKey}`;
        const value = localStorageValues[storageKey];
        if (value === undefined || value === "") {
          deleteSetting(sourceKey, namespacedKey);
        } else {
          setSetting(sourceKey, namespacedKey, value);
        }
      }

      setPrimarySettingValue(webLogin.setting, "logged_in");
      setWebLogin(null);
    } catch (error) {
      setWebLogin((prev) => prev ? { ...prev, error: getErrorMessage(error, t("sourceSettings.loginFailed")) } : prev);
    } finally {
      setWebLogin((prev) => prev ? { ...prev, submitting: false } : prev);
    }
  }, [deleteSetting, getLoadedSource, setPrimarySettingValue, setSetting, sourceKey, t, webLogin]);

  const openLoginUrl = useCallback(async (setting: LoginSetting) => {
    const rawUrl = resolveActionUrl(setting, values);
    if (!rawUrl) {
      throw new Error(t("sourceSettings.invalidLoginUrl"));
    }

    let nextUrl = rawUrl;
    if ((setting.method ?? "basic") === "oauth" && setting.pkce) {
      const { url, codeVerifier } = await withPkce(rawUrl);
      setSetting(sourceKey, `${setting.key}${LOGIN_CODE_VERIFIER_SUFFIX}`, codeVerifier);
      nextUrl = url;
    }

    const popup = window.open(nextUrl, "_blank", "noopener,noreferrer");
    if (!popup) {
      throw new Error(t("sourceSettings.popupBlocked"));
    }
  }, [setSetting, sourceKey, t, values]);

  const submitOAuthLogin = useCallback(async () => {
    if (!oauthLogin) return;

    const submittedValue = oauthLogin.callbackValue.trim();
    if (!submittedValue) {
      setOAuthLogin((prev) => prev ? { ...prev, error: t("sourceSettings.missingCallback") } : prev);
      return;
    }

    setOAuthLogin((prev) => prev ? { ...prev, submitting: true, error: null } : prev);

    try {
      let storedValue: string | null = null;

      if (oauthLogin.setting.pkce && oauthLogin.setting.tokenUrl) {
        if (hasOAuthTokenPayload(submittedValue)) {
          storedValue = submittedValue;
          setPrimarySettingValue(oauthLogin.setting, storedValue);
          setOAuthLogin(null);
          return;
        }

        const authUrl = resolveActionUrl(oauthLogin.setting, values);
        if (!authUrl) {
          throw new Error(t("sourceSettings.invalidLoginUrl"));
        }

        const liveSettings = getSourceSettingsStore().getState().values.get(sourceKey) ?? {};
        const codeVerifier = String(liveSettings[`${oauthLogin.setting.key}${LOGIN_CODE_VERIFIER_SUFFIX}`] ?? "");
        if (!codeVerifier) {
          throw new Error(t("sourceSettings.openLoginFirst"));
        }

        const code = extractAuthorizationCode(submittedValue);
        if (!code) {
          throw new Error(t("sourceSettings.invalidCallback"));
        }

        const authUrlObject = new URL(authUrl);
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: codeVerifier,
        });

        const redirectUri = authUrlObject.searchParams.get("redirect_uri");
        const clientId = authUrlObject.searchParams.get("client_id");
        if (redirectUri) body.set("redirect_uri", redirectUri);
        if (clientId) body.set("client_id", clientId);

        const useAgentForTokenExchange = await hasAgent();
        const requestInit: RequestInit = {
          method: "POST",
          headers: useAgentForTokenExchange
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept-Encoding": "identity",
              }
            : {
                "Content-Type": "application/x-www-form-urlencoded",
                "x-proxy-accept-encoding": "identity",
              },
          body,
        };

        const tryReadTokenResponse = async (response: Response): Promise<string> => {
          const responseBuffer = await response.arrayBuffer();
          const responseText = await decodeTokenExchangeResponse(responseBuffer);
          if (!response.ok) {
            throw new Error(responseText || t("sourceSettings.tokenExchangeFailed"));
          }
          if (!hasOAuthTokenPayload(responseText)) {
            throw new Error(t("sourceSettings.tokenExchangeFailed"));
          }
          return responseText;
        };

        const response = await (
          useAgentForTokenExchange
            ? agentFetch(oauthLogin.setting.tokenUrl, requestInit)
            : fetch(proxyUrl(oauthLogin.setting.tokenUrl), requestInit)
        );
        storedValue = await tryReadTokenResponse(response);
      } else if (!isLikelyOAuthCallbackValue(submittedValue)) {
        throw new Error(t("sourceSettings.invalidCallback"));
      } else {
        storedValue = submittedValue;
      }

      if (!storedValue) {
        throw new Error(t("sourceSettings.tokenExchangeFailed"));
      }

      setPrimarySettingValue(oauthLogin.setting, storedValue);
      setOAuthLogin(null);
    } catch (error) {
      setOAuthLogin((prev) => prev ? { ...prev, error: getErrorMessage(error, t("sourceSettings.loginFailed")) } : prev);
    } finally {
      setOAuthLogin((prev) => prev ? { ...prev, submitting: false } : prev);
    }
  }, [oauthLogin, setPrimarySettingValue, sourceKey, t, values]);

  const renderCustomSetting = useCallback<NonNullable<SettingsRendererProps["renderCustomSetting"]>>((setting, context) => {
    switch (setting.type) {
      case "button":
        return (
          <SettingActionRow
            title={setting.title}
            subtitle={setting.subtitle}
            destructive={setting.destructive}
            onClick={() => void handleButtonSetting(setting)}
          />
        );
      case "link":
        return (
          <SettingActionRow
            title={setting.title}
            subtitle={setting.subtitle}
            actionLabel={t("sourceSettings.open")}
            onClick={() => handleLinkSetting(setting, context.values)}
          />
        );
      case "login":
        return (
          <SettingActionRow
            title={setting.title}
            subtitle={setting.subtitle}
            actionLabel={isLoggedIn(setting, context.values)
              ? (setting.logoutTitle ?? t("sourceSettings.logout"))
              : t("sourceSettings.login")}
            onClick={() => handleLoginSetting(setting, context.values)}
          />
        );
      default:
        return null;
    }
  }, [handleButtonSetting, handleLinkSetting, handleLoginSetting, t]);

  const isEmpty = !schema || schema.length === 0;

  return (
    <>
      <SettingsDialogWithPages
        open={open}
        onOpenChange={handleOpenChange}
        icon={sourceIcon}
        title={sourceName}
        subtitle={parsedSourceKey.registryId}
        version={sourceVersion}
        pageStack={pageStack}
        onPushPage={(page) => setPageStack((prev) => [...prev, page])}
        onPopPage={popPage}
        empty={isEmpty}
        emptyMessage={t("sourceSettings.noSettings")}
        headerAction={
          <Button variant="secondary" size="sm" onClick={handleReset} className="h-8 gap-1.5 shrink-0">
            <HugeiconsIcon icon={ArrowReloadHorizontalIcon} className="size-4" />
            {t("common.reset")}
          </Button>
        }
      >
        <SettingsRenderer
          schema={schema ?? []}
          values={values}
          onChange={(key, value) => void updateSetting(key, value)}
          onPushPage={pushPage}
          renderCustomSetting={renderCustomSetting}
        />
      </SettingsDialogWithPages>

      <ResponsiveDialogNested open={!!basicLogin} onOpenChange={(nextOpen) => !nextOpen && setBasicLogin(null)}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{basicLogin?.setting.title ?? t("sourceSettings.login")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("sourceSettings.basicLoginDescription")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="source-login-username">
                {basicLogin?.setting.useEmail ? t("sourceSettings.email") : t("sourceSettings.username")}
              </Label>
              <Input
                id="source-login-username"
                value={basicLogin?.username ?? ""}
                onChange={(event) => setBasicLogin((prev) => prev ? { ...prev, username: event.target.value } : prev)}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="source-login-password">{t("sourceSettings.password")}</Label>
              <Input
                id="source-login-password"
                type="password"
                value={basicLogin?.password ?? ""}
                onChange={(event) => setBasicLogin((prev) => prev ? { ...prev, password: event.target.value } : prev)}
              />
            </div>

            {basicLogin?.error && (
              <p className="text-sm text-destructive">{basicLogin.error}</p>
            )}
          </div>

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setBasicLogin(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitBasicLogin()} disabled={basicLogin?.submitting}>
              {basicLogin?.submitting ? <Spinner className="size-4" /> : t("sourceSettings.login")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>

      <ResponsiveDialogNested open={!!webLogin} onOpenChange={(nextOpen) => !nextOpen && setWebLogin(null)}>
        <ResponsiveDialogContent className="sm:max-w-lg">
            <ResponsiveDialogHeader>
              <ResponsiveDialogTitle>{webLogin?.setting.title ?? t("sourceSettings.login")}</ResponsiveDialogTitle>
              <ResponsiveDialogDescription>{t("sourceSettings.webLoginDescription")}</ResponsiveDialogDescription>
            </ResponsiveDialogHeader>

          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => webLogin && void openLoginUrl(webLogin.setting).catch((error) => {
                setWebLogin((prev) => prev ? { ...prev, error: getErrorMessage(error, t("sourceSettings.invalidLoginUrl")) } : prev);
              })}
            >
              {t("sourceSettings.openLoginPage")}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="source-login-cookies">{t("sourceSettings.cookies")}</Label>
              <Textarea
                id="source-login-cookies"
                value={webLogin?.cookiesText ?? ""}
                onChange={(event) => setWebLogin((prev) => prev ? { ...prev, cookiesText: event.target.value } : prev)}
                rows={6}
                placeholder='{"session": "value"}'
              />
            </div>

            {(webLogin?.setting.localStorageKeys?.length ?? 0) > 0 && (
              <div className="space-y-2">
                <Label htmlFor="source-login-local-storage">{t("sourceSettings.localStorage")}</Label>
                <Textarea
                  id="source-login-local-storage"
                  value={webLogin?.localStorageText ?? ""}
                  onChange={(event) => setWebLogin((prev) => prev ? { ...prev, localStorageText: event.target.value } : prev)}
                  rows={4}
                  placeholder='{"auth": "value"}'
                />
              </div>
            )}

            {webLogin?.error && (
              <p className="text-sm text-destructive">{webLogin.error}</p>
            )}
          </div>

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setWebLogin(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitWebLogin()} disabled={webLogin?.submitting}>
              {webLogin?.submitting ? <Spinner className="size-4" /> : t("sourceSettings.saveSession")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>

      <ResponsiveDialogNested open={!!oauthLogin} onOpenChange={(nextOpen) => !nextOpen && setOAuthLogin(null)}>
        <ResponsiveDialogContent className="sm:max-w-lg">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>{oauthLogin?.setting.title ?? t("sourceSettings.login")}</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>{t("sourceSettings.oauthLoginDescription")}</ResponsiveDialogDescription>
          </ResponsiveDialogHeader>

          <div className="space-y-4">
            <Button
              variant="outline"
              onClick={() => oauthLogin && void openLoginUrl(oauthLogin.setting).catch((error) => {
                setOAuthLogin((prev) => prev ? { ...prev, error: getErrorMessage(error, t("sourceSettings.invalidLoginUrl")) } : prev);
              })}
            >
              {t("sourceSettings.openLoginPage")}
            </Button>

            <div className="space-y-2">
              <Label htmlFor="source-login-oauth">{t("sourceSettings.callbackOrToken")}</Label>
              <Textarea
                id="source-login-oauth"
                value={oauthLogin?.callbackValue ?? ""}
                onChange={(event) => setOAuthLogin((prev) => prev ? { ...prev, callbackValue: event.target.value } : prev)}
                rows={5}
                placeholder="aidoku://callback?code=... or #access_token=..."
              />
            </div>

            {oauthLogin?.error && (
              <p className="text-sm text-destructive">{oauthLogin.error}</p>
            )}
          </div>

          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setOAuthLogin(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void submitOAuthLogin()} disabled={oauthLogin?.submitting}>
              {oauthLogin?.submitting ? <Spinner className="size-4" /> : t("sourceSettings.saveSession")}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialogNested>
    </>
  );
}

function SettingActionRow({
  title,
  subtitle,
  actionLabel,
  destructive,
  onClick,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  destructive?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
    >
      <div className="space-y-0.5">
        <p className={`text-sm ${destructive ? "text-destructive" : ""}`}>{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <span className={`shrink-0 text-xs ${destructive ? "text-destructive" : "text-muted-foreground"}`}>
        {actionLabel ?? "›"}
      </span>
    </button>
  );
}

function findSettingByKey(settings: Setting[], key: string): Setting | null {
  for (const setting of settings) {
    if ("key" in setting && setting.key === key) {
      return setting;
    }
    if ("items" in setting && setting.items) {
      const found = findSettingByKey(setting.items, key);
      if (found) return found;
    }
  }
  return null;
}

function resolveActionUrl(setting: LinkSetting | LoginSetting, values: Record<string, unknown>): string | null {
  if (setting.url) return setting.url;
  if (setting.urlKey) {
    const value = values[setting.urlKey];
    return typeof value === "string" && value ? value : null;
  }
  return null;
}

function isLoggedIn(setting: LoginSetting, values: Record<string, unknown>): boolean {
  const value = values[setting.key];
  if (typeof value === "string") return value.length > 0;
  return Boolean(value);
}

function serializeStoredCookies(values: Record<string, unknown>, key: string): string {
  const keys = values[`${key}${LOGIN_COOKIE_KEYS_SUFFIX}`];
  const rawValues = values[`${key}${LOGIN_COOKIE_VALUES_SUFFIX}`];
  if (!Array.isArray(keys) || !Array.isArray(rawValues)) return "";

  const cookies: Record<string, string> = {};
  keys.forEach((cookieKey, index) => {
    if (typeof cookieKey === "string") {
      cookies[cookieKey] = String(rawValues[index] ?? "");
    }
  });

  return Object.keys(cookies).length > 0
    ? JSON.stringify(cookies, null, 2)
    : "";
}

function serializeStoredLocalStorage(values: Record<string, unknown>, setting: LoginSetting): string {
  const storage: Record<string, string> = {};
  for (const storageKey of setting.localStorageKeys ?? []) {
    const value = values[`${setting.key}${LOGIN_LOCAL_STORAGE_PREFIX}${storageKey}`];
    if (typeof value === "string" && value) {
      storage[storageKey] = value;
    }
  }
  return Object.keys(storage).length > 0
    ? JSON.stringify(storage, null, 2)
    : "";
}

function parseCookieInput(input: string): Record<string, string> {
  const trimmed = input.trim();
  if (!trimmed) return {};

  if (trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).map(([key, value]) => [key, String(value ?? "")])
    );
  }

  const pairs = trimmed
    .split(/[\n;]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const cookies: Record<string, string> = {};
  for (const pair of pairs) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    if (key) cookies[key] = value;
  }
  return cookies;
}

function parseLocalStorageInput(
  input: string,
  allowedKeys: string[]
): Record<string, string> {
  const trimmed = input.trim();
  if (!trimmed) return {};
  if (!allowedKeys.length) return {};

  const parsed = JSON.parse(trimmed) as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const key of allowedKeys) {
    const value = parsed[key];
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }

  return result;
}

function hasOAuthTokenPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      return ["access_token", "refresh_token", "id_token", "token_type"].some((key) => {
        const tokenValue = parsed[key];
        return typeof tokenValue === "string" && tokenValue.length > 0;
      });
    } catch {
      return false;
    }
  }

  return /(?:^|[?#&])(access_token|refresh_token|id_token|token_type)=/i.test(trimmed);
}

async function decodeTokenExchangeResponse(buffer: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buffer);
  const plainText = new TextDecoder().decode(bytes);
  if (looksLikeTokenExchangeText(plainText)) {
    return plainText;
  }

  for (const format of detectCompressionFormats(bytes)) {
    try {
      const decompressed = await decompressBytes(bytes, format);
      if (looksLikeTokenExchangeText(decompressed)) {
        return decompressed;
      }
    } catch {
      // Ignore and continue trying other formats.
    }
  }

  return plainText;
}

function looksLikeTokenExchangeText(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasOAuthTokenPayload(trimmed)) return true;
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return true;
  if (/"error_description"\s*:|"error"\s*:/i.test(trimmed)) return true;
  return false;
}

function detectCompressionFormats(bytes: Uint8Array): CompressionFormat[] {
  if (bytes.length >= 2) {
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      return ["gzip"];
    }

    const compressionMethod = bytes[0] & 0x0f;
    const header = (bytes[0] << 8) | bytes[1];
    if (compressionMethod === 8 && header % 31 === 0) {
      return ["deflate"];
    }
  }

  return ["gzip", "deflate"];
}

async function decompressBytes(bytes: Uint8Array, format: CompressionFormat): Promise<string> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  ) as ArrayBuffer;
  const stream = new Response(buffer).body;
  if (!stream) {
    throw new Error("Missing response body");
  }
  const decompressedStream = stream.pipeThrough(new DecompressionStream(format));
  return new Response(decompressedStream).text();
}

function isLikelyOAuthCallbackValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasOAuthTokenPayload(trimmed)) return true;
  if (/(?:^|[?#&])code=/i.test(trimmed)) return true;

  try {
    const url = new URL(trimmed);
    return Boolean(url.search || url.hash);
  } catch {
    return false;
  }
}

async function withPkce(rawUrl: string): Promise<{ url: string; codeVerifier: string }> {
  const url = new URL(rawUrl);
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("response_type", "code");
  return {
    url: url.toString(),
    codeVerifier,
  };
}

function generateCodeVerifier(): string {
  const characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~";
  const bytes = crypto.getRandomValues(new Uint8Array(64));
  return Array.from(bytes, (byte) => characters[byte % characters.length]).join("");
}

async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoded = new TextEncoder().encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function extractAuthorizationCode(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed);
    return url.searchParams.get("code");
  } catch {
    const codeMatch = trimmed.match(/(?:^|[?#&])code=([^&#]+)/i);
    if (codeMatch?.[1]) {
      return decodeURIComponent(codeMatch[1]);
    }

    if (!/[=?&#]/.test(trimmed)) {
      return trimmed;
    }

    return null;
  }
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
