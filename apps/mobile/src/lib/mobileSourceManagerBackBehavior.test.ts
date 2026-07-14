import { describe, expect, test } from "bun:test";
import {
  getMobileSourceManagerMutationResultAction,
  getMobileSourceManagerRequestCloseAction,
} from "./mobileSourceManagerBackBehavior";

describe("mobile source manager back behavior", () => {
  test("dismisses an open confirmation before the add panel", () => {
    expect(
      getMobileSourceManagerRequestCloseAction({
        addPanelOpen: true,
        confirmationLoading: false,
        confirmationOpen: true,
      }),
    ).toBe("close-confirmation");
  });

  test("keeps a loading confirmation open", () => {
    expect(
      getMobileSourceManagerRequestCloseAction({
        addPanelOpen: true,
        confirmationLoading: true,
        confirmationOpen: true,
      }),
    ).toBe("ignore");
  });

  test("collapses the add panel before closing the sheet", () => {
    expect(
      getMobileSourceManagerRequestCloseAction({
        addPanelOpen: true,
        confirmationLoading: false,
        confirmationOpen: false,
      }),
    ).toBe("close-add-panel");
  });

  test("closes the sheet when no nested source manager UI is open", () => {
    expect(
      getMobileSourceManagerRequestCloseAction({
        addPanelOpen: false,
        confirmationLoading: false,
        confirmationOpen: false,
      }),
    ).toBe("close-sheet");
  });

  test("keeps failed source mutations retryable from the confirmation sheet", () => {
    expect(
      getMobileSourceManagerMutationResultAction({ succeeded: true }),
    ).toBe("close-confirmation");
    expect(
      getMobileSourceManagerMutationResultAction({ succeeded: false }),
    ).toBe("keep-confirmation-open");
  });
});
