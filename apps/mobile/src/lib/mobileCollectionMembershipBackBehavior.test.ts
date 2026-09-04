import { describe, expect, test } from "bun:test";
import {
  getMobileCollectionMembershipDraftFields,
  getMobileCollectionMembershipRequestCloseAction,
} from "./mobileCollectionMembershipBackBehavior";

describe("mobile collection membership back behavior", () => {
  test("keeps the sheet open while collection changes are in flight", () => {
    expect(
      getMobileCollectionMembershipRequestCloseAction({
        busy: true,
        dirty: false,
      }),
    ).toBe("ignore");
    // In-flight work outranks the draft: the running mutation still lands.
    expect(
      getMobileCollectionMembershipRequestCloseAction({
        busy: true,
        dirty: true,
      }),
    ).toBe("ignore");
  });

  test("closes the sheet when no collection operation is running", () => {
    expect(
      getMobileCollectionMembershipRequestCloseAction({
        busy: false,
        dirty: false,
      }),
    ).toBe("close-sheet");
  });

  test("confirms before an idle sheet throws away a typed draft", () => {
    expect(
      getMobileCollectionMembershipRequestCloseAction({
        busy: false,
        dirty: true,
      }),
    ).toBe("confirm-discard");
  });

  test("ignores blank and unchanged drafts", () => {
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "   ",
        renameDraft: "",
        renameTargetName: null,
      }),
    ).toEqual([]);
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "",
        renameDraft: " Shonen ",
        renameTargetName: "Shonen",
      }),
    ).toEqual([]);
  });

  test("reports the new-collection and rename drafts that would be lost", () => {
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "Seinen",
        renameDraft: "",
        renameTargetName: null,
      }),
    ).toEqual(["newCollection"]);
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "",
        renameDraft: "Classics",
        renameTargetName: "Shonen",
      }),
    ).toEqual(["rename"]);
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "Seinen",
        renameDraft: "Classics",
        renameTargetName: "Shonen",
      }),
    ).toEqual(["newCollection", "rename"]);
  });

  test("does not treat a rename draft as dirty without an open rename target", () => {
    expect(
      getMobileCollectionMembershipDraftFields({
        newCollectionName: "",
        renameDraft: "Classics",
        renameTargetName: null,
      }),
    ).toEqual([]);
  });
});
