import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  isMobileSourceSettingsConfirmation,
  resolveMobileFirstQueuedSheetHandoff,
  resolveMobileSourceSettingsPostDismissAction,
  shouldReopenMobileSourceSettingsAfterConfirmation,
} from "./mobileSettingsSheetHandoff";

describe("Settings native-sheet handoff", () => {
  test("queues source-owned confirmations until the owner fully dismisses", () => {
    expect(isMobileSourceSettingsConfirmation({ type: "source-logout" })).toBe(
      true,
    );
    expect(isMobileSourceSettingsConfirmation({ type: "source-button" })).toBe(
      true,
    );
    expect(isMobileSourceSettingsConfirmation({ type: "clear-cache" })).toBe(
      false,
    );
    expect(resolveMobileSourceSettingsPostDismissAction(true)).toBe(
      "present-confirmation",
    );
    expect(resolveMobileSourceSettingsPostDismissAction(false)).toBe(
      "clear-source",
    );
  });

  test("keeps the first action when two taps arrive before the next render", () => {
    const logout = { type: "source-logout", key: "logout" } as const;
    const remove = { type: "source-button", key: "remove" } as const;
    type QueuedAction = typeof logout | typeof remove;
    const first = resolveMobileFirstQueuedSheetHandoff<QueuedAction>({
      current: null,
      next: logout,
    });
    const second = resolveMobileFirstQueuedSheetHandoff<QueuedAction>({
      current: first.queued,
      next: remove,
    });

    expect(first).toEqual({ accepted: true, queued: logout });
    expect(second).toEqual({ accepted: false, queued: logout });
  });

  test("returns to an available source after cancel or successful completion", () => {
    for (const type of ["source-logout", "source-button"] as const) {
      expect(
        shouldReopenMobileSourceSettingsAfterConfirmation({
          activeSection: "sources",
          confirmation: { type },
          sourceAvailable: true,
        }),
      ).toBe(true);
    }
    expect(
      shouldReopenMobileSourceSettingsAfterConfirmation({
        activeSection: "sources",
        confirmation: { type: "source-logout" },
        sourceAvailable: false,
      }),
    ).toBe(false);
    expect(
      shouldReopenMobileSourceSettingsAfterConfirmation({
        activeSection: "reader",
        confirmation: { type: "source-logout" },
        sourceAvailable: true,
      }),
    ).toBe(false);
  });

  test("wires both native hosts through post-dismiss callbacks", () => {
    const settings = readFileSync(
      path.join(import.meta.dir, "../screens/SettingsScreen.tsx"),
      "utf8",
    );
    const confirmation = readFileSync(
      path.join(import.meta.dir, "../components/MobileConfirmationSheet.tsx"),
      "utf8",
    );

    expect(settings).toContain(
      "queuedSourceConfirmationRef.current = queued.queued;",
    );
    expect(settings).toContain("if (!queued.accepted) return false;");
    expect(
      settings.match(
        /if \(\s*!queueSourceSettingsConfirmation\(\{/g,
      ),
    ).toHaveLength(2);
    expect(settings).toContain("onDismiss={handleSourceSettingsDismiss}");
    expect(settings).toContain("onDismiss={handleConfirmationDismiss}");
    expect(settings).toContain("queueSourceSettingsConfirmation({");
    expect(settings).toContain("if (!confirmationVisibleRef.current) return;");
    expect(settings).toContain(
      "onClose={() => setSourceSettingsSheetVisible(false)}",
    );
    expect(settings).not.toContain(
      'setConfirmation({ type: "source-logout", setting })',
    );
    expect(confirmation).toContain("onDismiss={onDismiss}");
    expect(confirmation).toContain("if (!visible) return;");
  });
});
