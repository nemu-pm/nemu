import { describe, expect, test } from "bun:test";
import {
  canRetryMobileSettingsLoadError,
  canRunMobileSettingsSelection,
  canStartMobileSettingsAction,
  getMobileSettingsMutationResultAction,
  isMobileSettingsActionBusy,
  shouldRenderMobileSettingsSkeletonForSection,
  shouldRenderMobileSourcesSectionLoading,
  shouldRenderMobileSettingsSkeleton,
} from "./mobileSettingsActions";

describe("mobile settings actions", () => {
  test("gates settings operations while any settings action is active", () => {
    const idle = {
      refreshingSources: false,
      removingSource: false,
      clearingData: false,
      changingSettings: false,
    };

    expect(isMobileSettingsActionBusy(idle)).toBe(false);
    expect(canStartMobileSettingsAction(idle)).toBe(true);
    expect(canStartMobileSettingsAction({ ...idle, refreshingSources: true })).toBe(
      false,
    );
    expect(canStartMobileSettingsAction({ ...idle, removingSource: true })).toBe(
      false,
    );
    expect(canStartMobileSettingsAction({ ...idle, clearingData: true })).toBe(
      false,
    );
    expect(canStartMobileSettingsAction({ ...idle, changingSettings: true })).toBe(
      false,
    );
  });

  test("gates selected settings targets as no-op selections", () => {
    expect(
      canRunMobileSettingsSelection({ selected: false, disabled: false }),
    ).toBe(true);
    expect(
      canRunMobileSettingsSelection({ selected: true, disabled: false }),
    ).toBe(false);
    expect(
      canRunMobileSettingsSelection({ selected: false, disabled: true }),
    ).toBe(false);
  });

  test("gates settings load-error retries while another action is busy", () => {
    expect(
      canRetryMobileSettingsLoadError({ hasError: true, disabled: false }),
    ).toBe(true);
    expect(
      canRetryMobileSettingsLoadError({ hasError: false, disabled: false }),
    ).toBe(false);
    expect(
      canRetryMobileSettingsLoadError({ hasError: true, disabled: true }),
    ).toBe(false);
  });

  test("keeps failed settings confirmations retryable from the sheet", () => {
    expect(getMobileSettingsMutationResultAction({ succeeded: true })).toBe(
      "close-confirmation",
    );
    expect(getMobileSettingsMutationResultAction({ succeeded: false })).toBe(
      "keep-confirmation-open",
    );
  });

  test("shows the settings skeleton only for unresolved initial data", () => {
    const loaded = {
      installedSourcesLoading: false,
      installedSourcesCount: 0,
      installedSourcesError: null,
      availableSourcesLoading: false,
      availableSourcesCount: 0,
      availableSourcesError: null,
      readerPluginsLoading: false,
      readerPluginsCount: 0,
      readerPluginsError: null,
    };

    expect(shouldRenderMobileSettingsSkeleton(loaded)).toBe(false);
    expect(
      shouldRenderMobileSettingsSkeleton({
        ...loaded,
        installedSourcesLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSettingsSkeleton({
        ...loaded,
        installedSourcesLoading: true,
        installedSourcesCount: 2,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSettingsSkeleton({
        ...loaded,
        availableSourcesLoading: true,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSettingsSkeleton({
        ...loaded,
        readerPluginsLoading: true,
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSettingsSkeleton({
        ...loaded,
        availableSourcesLoading: true,
        availableSourcesError: "Network unavailable",
      }),
    ).toBe(false);
  });

  test("keeps settings sections responsive while initial data loads", () => {
    const loading = {
      installedSourcesLoading: true,
      installedSourcesCount: 0,
      installedSourcesError: null,
      availableSourcesLoading: true,
      availableSourcesCount: 0,
      availableSourcesError: null,
      readerPluginsLoading: true,
      readerPluginsCount: 0,
      readerPluginsError: null,
    };

    expect(shouldRenderMobileSettingsSkeletonForSection(loading, null)).toBe(true);
    expect(
      shouldRenderMobileSettingsSkeletonForSection(loading, "reader"),
    ).toBe(false);
    expect(
      shouldRenderMobileSettingsSkeletonForSection(loading, "sources"),
    ).toBe(false);
    expect(
      shouldRenderMobileSettingsSkeletonForSection(loading, "appearance"),
    ).toBe(false);
    expect(shouldRenderMobileSettingsSkeletonForSection(loading, "data")).toBe(
      false,
    );
    expect(shouldRenderMobileSourcesSectionLoading(loading)).toBe(true);
    expect(
      shouldRenderMobileSourcesSectionLoading({
        ...loading,
        availableSourcesError: "Network unavailable",
      }),
    ).toBe(true);
    expect(
      shouldRenderMobileSourcesSectionLoading({
        ...loading,
        installedSourcesLoading: false,
        installedSourcesCount: 1,
      }),
    ).toBe(false);
    expect(
      shouldRenderMobileSourcesSectionLoading({
        ...loading,
        installedSourcesLoading: false,
        availableSourcesLoading: true,
      }),
    ).toBe(false);
  });
});
