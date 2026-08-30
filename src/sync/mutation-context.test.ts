import { describe, expect, test } from "bun:test";
import {
  isSyncAccountOperationIdentityCurrent,
  isSyncMutationIdentityCurrent,
} from "./mutation-context";

const currentIdentity = {
  authenticated: true,
  subscriptionStopped: false,
  sessionUserId: "account-a",
  effectiveProfileId: "user:account-a",
  localProfileId: "user:account-a",
  generation: 3,
};

describe("web sync mutation identity", () => {
  test("allows only the local store owned by the current authenticated account", () => {
    expect(isSyncMutationIdentityCurrent(currentIdentity)).toBe(true);
  });

  test("rejects a stale store after switching to another account", () => {
    expect(
      isSyncMutationIdentityCurrent({
        ...currentIdentity,
        sessionUserId: "account-b",
        effectiveProfileId: "user:account-b",
      }),
    ).toBe(false);
  });

  test("rejects anonymous/debug profiles and destructive-action windows", () => {
    expect(
      isSyncMutationIdentityCurrent({
        ...currentIdentity,
        localProfileId: "",
      }),
    ).toBe(false);
    expect(
      isSyncMutationIdentityCurrent({
        ...currentIdentity,
        subscriptionStopped: true,
      }),
    ).toBe(false);
  });

  test("rejects missing generation or partially updated auth identity", () => {
    expect(
      isSyncMutationIdentityCurrent({
        ...currentIdentity,
        generation: null,
      }),
    ).toBe(false);
    expect(
      isSyncMutationIdentityCurrent({
        ...currentIdentity,
        effectiveProfileId: "user:account-b",
      }),
    ).toBe(false);
  });
});

describe("web destructive sync operation identity", () => {
  const clientA = {};
  const expected = {
    authenticated: true,
    sessionUserId: "account-a",
    effectiveProfileId: "user:account-a",
    localProfileId: "user:account-a",
    client: clientA,
  };

  test("allows the exact account and client captured by the operation", () => {
    expect(isSyncAccountOperationIdentityCurrent(expected, expected)).toBe(true);
  });

  test("rejects an account or Convex-client switch before the destructive mutation", () => {
    expect(
      isSyncAccountOperationIdentityCurrent(expected, {
        ...expected,
        sessionUserId: "account-b",
        effectiveProfileId: "user:account-b",
      }),
    ).toBe(false);
    expect(
      isSyncAccountOperationIdentityCurrent(expected, {
        ...expected,
        client: {},
      }),
    ).toBe(false);
  });
});
