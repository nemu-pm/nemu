import { describe, expect, test } from "bun:test";
import { getMobileCollectionMembershipRequestCloseAction } from "./mobileCollectionMembershipBackBehavior";

describe("mobile collection membership back behavior", () => {
  test("keeps the sheet open while collection changes are in flight", () => {
    expect(
      getMobileCollectionMembershipRequestCloseAction({ busy: true }),
    ).toBe("ignore");
  });

  test("closes the sheet when no collection operation is running", () => {
    expect(
      getMobileCollectionMembershipRequestCloseAction({ busy: false }),
    ).toBe("close-sheet");
  });
});
