import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { getMobileStrings } from "@/lib/mobileI18n";

const read = (file: string) => readFileSync(path.join(import.meta.dir, "../screens", file), "utf8");

describe("account page: sign out vs delete", () => {
  const page = read("AccountScreen.ios.tsx");

  test("Sign Out is a tinted door-and-arrow row with its footer, before Delete", () => {
    const signOut = page.indexOf('systemImage="rectangle.portrait.and.arrow.right"');
    const del = page.lastIndexOf("<SwiftSection");
    expect(signOut).toBeGreaterThan(0);
    expect(page).toMatch(/tint\(tokens\.primary\),\s+foregroundStyle\(tokens\.primary\),/);
    expect(page).toContain("strings.account.signOutFooter");
    // Delete Account is the last section of the Form.
    expect(page.slice(del)).toContain("strings.account.deleteFooter");
    expect(page.slice(del)).not.toContain("cloudSyncSignOut");
    expect(page.indexOf("strings.account.signOutFooter")).toBeLessThan(page.indexOf("strings.account.deleteFooter"));
  });

  test("Delete Account is a destructive trash row", () => {
    expect(page).toMatch(/label=\{strings\.account\.deleteAccount\}\s+systemImage="trash"\s+role="destructive"/);
  });

  test("no red anywhere in the sign-out sheet", () => {
    const sheet = read("../components/MobileCloudSignOut.tsx");
    expect(sheet).not.toMatch(/tokens\.danger|variant="destructive"|\bdestructive\b/);
    expect(sheet).toContain('<Ionicons name="log-out-outline" size={22} color={tokens.primary} />');
    expect(sheet).toContain("active && !mutedIcon ? activeColor : tokens.mutedForeground");
  });

  test("copy in every language", () => {
    const expected = {
      en: {
        deleteConfirm: "Delete Account",
        signOutFooter: "Your account and cloud data are kept. Sign back in anytime.",
        message: "Choose what happens to your data on this device.",
        keep: "Keep data on this device",
        keepDescription: "You can sign back in anytime to sync again.",
        remove: "Remove data from this device",
        removeDescription: "Your cloud data will stay safe.",
        signOut: "Sign Out",
      },
      zh: {
        deleteConfirm: "删除账号",
        signOutFooter: "账号和云端数据都会保留，可随时重新登录。",
        message: "选择如何处理此设备上的数据。",
        keep: "保留此设备上的数据",
        keepDescription: "你可以随时重新登录以继续同步。",
        remove: "从此设备移除数据",
        removeDescription: "你的云端数据将保持安全。",
        signOut: "登出",
      },
      ja: {
        deleteConfirm: "アカウントを削除",
        signOutFooter: "アカウントとクラウドのデータは残ります。いつでもサインインし直せます。",
        message: "このデバイスのデータをどうするか選択してください。",
        keep: "このデバイスにデータを保持",
        keepDescription: "いつでも再度サインインして同期できます。",
        remove: "このデバイスからデータを削除",
        removeDescription: "クラウドデータは安全に保持されます。",
        signOut: "サインアウト",
      },
    } as const;
    for (const language of ["en", "zh", "ja"] as const) {
      const strings = getMobileStrings(language);
      const want = expected[language];
      expect(strings.account.deleteConfirm).toBe(want.deleteConfirm);
      expect(strings.account.signOutFooter).toBe(want.signOutFooter);
      expect(strings.settings.cloudSyncSignOutMessage).toBe(want.message);
      expect(strings.settings.cloudSyncKeepData).toBe(want.keep);
      expect(strings.settings.cloudSyncKeepDataDescription).toBe(want.keepDescription);
      expect(strings.settings.cloudSyncRemoveData).toBe(want.remove);
      expect(strings.settings.cloudSyncRemoveDataDescription).toBe(want.removeDescription);
      expect(strings.settings.cloudSyncSignOut).toBe(want.signOut);
    }
  });
});
