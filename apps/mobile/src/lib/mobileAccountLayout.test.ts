import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { resolveMobileAccountFormSideMargin as margin } from "./mobileAccountLayout";

describe("account form width", () => {
  test("a wide single column centres the sections at 600pt", () => {
    expect(margin({ presentation: "page", width: 1000 })).toBe(200);
    expect(margin({ presentation: "page", width: 801 })).toBe(100);
  });

  test("phones and narrow windows keep the system margins", () => {
    expect(margin({ presentation: "page", width: 430 })).toBeNull();
    expect(margin({ presentation: "page", width: 640 })).toBeNull();
  });

  test("the split's detail column is filled", () => {
    expect(margin({ presentation: "detail-pane", width: 1200 })).toBeNull();
  });
});

describe("account in the settings split (wiring)", () => {
  const read = (file: string) => readFileSync(path.join(import.meta.dir, "..", file), "utf8");

  test("the account route renders through SettingsScreen, so collapse / expand keep it", () => {
    const route = readFileSync(path.join(import.meta.dir, "../../app/(tabs)/settings/account.tsx"), "utf8");
    expect(route).toContain('<SettingsScreen section="account" />');
    const layout = readFileSync(path.join(import.meta.dir, "../../app/(tabs)/settings/_layout.tsx"), "utf8");
    expect(layout).toContain("name={MOBILE_SETTINGS_ACCOUNT_ROUTE}");
  });

  test("the detail column shows the Account Form and the card row selects it", () => {
    const settings = read("screens/SettingsScreen.tsx");
    expect(settings).toContain('detailShown === "account"');
    expect(settings).toContain('presentation={split ? "detail-pane" : "page"}');
    expect(settings).toContain("onLeft={leaveAccountSelection}");
    expect(settings).toContain('accountSelected={inSplit ? selectedSection === "account" : null}');
    expect(settings).toContain('onOpenAccount={() => openSection("account")}');
    expect(settings).toContain('case "account":\n      return strings.account.title;');
  });

  test("only the page sets the stack options; the pane leaves them to the list", () => {
    for (const file of ["screens/AccountScreen.ios.tsx", "screens/AccountScreen.tsx"]) {
      const page = read(file);
      expect(page).toContain('presentation === "page" ? (');
      expect(page).toContain("headerBackVisible: true");
    }
  });
});
