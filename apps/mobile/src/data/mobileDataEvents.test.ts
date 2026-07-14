import { describe, expect, test } from "bun:test";
import {
  emitMobileLibraryDataChanged,
  emitMobileSettingsDataChanged,
  subscribeMobileDataChanges,
  type MobileDataChangeScope,
} from "./mobileDataEvents";

describe("mobile data events", () => {
  test("emits only the library scope for ordinary library changes", () => {
    const scopes: MobileDataChangeScope[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) => {
      scopes.push(scope);
    });

    try {
      emitMobileLibraryDataChanged();
    } finally {
      unsubscribe();
    }

    expect(scopes).toEqual(["library"]);
  });

  test("emits collection scope when a library item removal prunes memberships", () => {
    const scopes: MobileDataChangeScope[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) => {
      scopes.push(scope);
    });

    try {
      emitMobileLibraryDataChanged({ collectionsChanged: true });
    } finally {
      unsubscribe();
    }

    expect(scopes).toEqual(["library", "collections"]);
  });

  test("emits only the settings scope for ordinary settings changes", () => {
    const scopes: MobileDataChangeScope[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) => {
      scopes.push(scope);
    });

    try {
      emitMobileSettingsDataChanged();
    } finally {
      unsubscribe();
    }

    expect(scopes).toEqual(["settings"]);
  });

  test("emits source settings scope when settings changes clear source config", () => {
    const scopes: MobileDataChangeScope[] = [];
    const unsubscribe = subscribeMobileDataChanges((scope) => {
      scopes.push(scope);
    });

    try {
      emitMobileSettingsDataChanged({ sourceSettingsChanged: true });
    } finally {
      unsubscribe();
    }

    expect(scopes).toEqual(["settings", "sourceSettings"]);
  });
});
