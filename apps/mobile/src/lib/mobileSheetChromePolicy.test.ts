import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

function readMobileSource(relativePath: string): string {
  return readFileSync(path.join(import.meta.dir, "..", relativePath), "utf8");
}

describe("mobile sheet and text-field chrome policy", () => {
  test("wires shared body metrics and guarded native dismissal into the scaffold", () => {
    const source = readMobileSource(
      "design-system/components/MobileNativeSheetScaffold.tsx",
    );

    expect(source).toContain("canDismissMobileNativeSheetFromPan({");
    expect(source).toContain(
      "enablePanDownToClose={effectiveEnablePanDownToClose}",
    );
    expect(source).toContain(
      "paddingHorizontal: headerMetrics.bodyHorizontalPadding",
    );
    expect(source).toContain("paddingTop: headerMetrics.bodyTopPadding");
    expect(source).toContain("bodyDescriptionNumberOfLines ?? undefined");
    expect(source.match(/\{bodyDescription\}/g)).toHaveLength(2);
    expect(source).toContain("accessibilityState={{ disabled: dismissDisabled }}");
    expect(source).toContain("disabled={dismissDisabled}");
    expect(source).toContain("accessibilityLabel={resolvedDismissLabel}");
    expect(source).toContain("headerMetrics.showActionLabels ? (");
    expect(source).toContain('name="close-outline"');
    expect(source).toContain('hapticFeedback="none"');
    expect(source).toContain("index={sheetPresented ? 0 : -1}");
    expect(source).toContain("closeRequestedRef.current = true;");
    expect(source).toContain("setCloseInteractionLocked(true);");
    expect(source).toContain(
      'pointerEvents={interactionLocked ? "none" : "auto"}',
    );
    expect(source).toContain(
      'interactionLocked ? "no-hide-descendants" : "auto"',
    );
    expect(source).toContain("reopenAfterCloseRef.current && visibleRef.current");
    expect(source).toContain("setSheetPresented(false);");
    expect(source).toContain("onHardwareBackPress?.()");
    expect(source).not.toContain("PROGRAMMATIC_SHEET_CLOSE_DELAY_MS");
    expect(source).not.toContain("programmaticCloseTimerRef");
  });

  test("preserves header semantics and lets localized Android titles wrap", () => {
    const source = readMobileSource(
      "design-system/components/MobileSheetHeader.tsx",
    );

    expect(source).toContain('accessibilityRole="header"');
    expect(source).toContain("numberOfLines={metrics.titleNumberOfLines}");
    expect(source).toContain("maxFontSizeMultiplier={1.5}");
    expect(source).not.toContain("subtitle");
  });

  test("keeps the text clear action native-looking and free of duplicate feedback", () => {
    const source = readMobileSource(
      "design-system/components/NemuTextFieldClearAction.tsx",
    );

    expect(source).toContain('name="close-circle"');
    expect(source).toContain('hapticFeedback="none"');
    expect(source).toContain("pressAnimationEnabled={false}");
    expect(source).toContain("pressedScale={1}");
    expect(source).toContain("pressed ? 0.62 : 1");
    expect(source).toContain("if (disabled) setPressed(false)");
    expect(source).toContain('backgroundColor: "transparent"');
    expect(source).toContain("Keep this shared clone on iOS");
    expect(source).toContain("custom field shells coordinate the same trailing slot");
    expect(source).toMatch(/hitTarget:\s*\{[\s\S]*?width:\s*44,[\s\S]*?height:\s*44,/);
    expect(source).toMatch(
      /androidHitTarget:\s*\{[\s\S]*?width:\s*48,[\s\S]*?height:\s*48,/,
    );
    expect(source).toContain("trailingInset?: number");
    expect(source).toContain(
      "getMobileTextFieldTrailingAccessoryMargin(trailingInset)",
    );
    expect(source).toContain("{ marginEnd: trailingMargin }");
    expect(source).not.toMatch(/buttonDepth|boxShadow|elevation/);
    expect(source).not.toContain("pressedScale={0.9}");
  });

  test("routes every custom search and text-filter clear entrance through the shared action", () => {
    const browse = readMobileSource("screens/BrowseScreen.tsx");
    const search = readMobileSource("screens/SearchScreen.tsx");
    const metadata = readMobileSource(
      "components/MobileMetadataEditorSheet.tsx",
    );
    const sourceManager = readMobileSource(
      "components/MobileSourceManagerSheet.tsx",
    );
    const sourceBrowse = readMobileSource("screens/SourceBrowseScreen.tsx");

    expect(browse).toContain('testID="AddSourceSearchClearAction"');
    expect(search).toContain('testID="InstalledSourceSearchClearAction"');
    expect(metadata).toContain('testID="MetadataMatchSearchClearAction"');
    expect(sourceManager).toContain(
      'testID="SourceManagerSearchClearAction"',
    );
    expect(sourceBrowse).toContain("SourceTextFilterClearAction:");
    expect(sourceBrowse).toMatch(
      /contentContainerStyle=\{styles\.filterPanelScrollContent\}[\s\S]*?keyboardShouldPersistTaps="handled"/,
    );

    for (const source of [browse, search, metadata, sourceManager, sourceBrowse]) {
      expect(source).toContain("<NemuTextFieldClearAction");
      expect(source).toMatch(/trailingInset=\{(?:11|12|14)\}/);
      expect(source).not.toContain("clearButtonMode=");
    }

    for (const nativeSearch of [search, sourceBrowse]) {
      expect(nativeSearch).toContain("<Stack.SearchBar");
      expect(nativeSearch).toContain("onCancelButtonPress=");
      expect(nativeSearch).toContain("onClose=");
    }
  });

  test("keeps potentially long iOS header actions icon-only", () => {
    const sourceManager = readMobileSource(
      "components/MobileSourceManagerSheet.tsx",
    );
    const collections = readMobileSource("screens/LibraryScreen.tsx");
    const transcript = readMobileSource(
      "components/reader/japaneseLearning/JapaneseLearningTranscriptSheet.tsx",
    );

    for (const source of [sourceManager, collections, transcript]) {
      expect(source).toContain("headerMetrics.showActionLabels");
    }
  });

  test("keeps equal native-sheet detents referentially stable across renders", () => {
    const nativeScaffold = readMobileSource(
      "design-system/components/MobileNativeSheetScaffold.tsx",
    );
    const sheetScaffold = readMobileSource(
      "design-system/components/MobileSheetScaffold.tsx",
    );
    const welcome = readMobileSource("components/MobileWelcomeWizard.tsx");
    const sheetPolicy = readMobileSource("lib/mobileNativeSheet.ts");

    expect(nativeScaffold).toContain("effectiveSnapPointsSignature");
    expect(nativeScaffold).toContain("const effectiveSnapPoints = useMemo(");
    expect(sheetScaffold).toContain("const snapPoints = useMemo(");
    expect(welcome).toContain("const welcomeSheetPresentation = useMemo(");
    expect(sheetPolicy).toContain("MOBILE_NATIVE_ANDROID_SNAP_POINTS");
    expect(sheetPolicy).toContain("return MOBILE_NATIVE_ANDROID_SNAP_POINTS;");
  });

  test("lets multi-detent sheet bodies grow with the active native detent", () => {
    const nativeScaffold = readMobileSource(
      "design-system/components/MobileNativeSheetScaffold.tsx",
    );

    expect(nativeScaffold).toContain(
      "const hasMultipleSnapPoints = (effectiveSnapPoints?.length ?? 0) > 1;",
    );
    expect(nativeScaffold).toMatch(
      /fillContent && hasMultipleSnapPoints[\s\S]*?styles\.filledContent/,
    );
    expect(nativeScaffold).not.toMatch(
      /fillContent && boundedContentHeight[\s\S]*?hasMultipleSnapPoints/,
    );
  });

  test("hands Source Manga sheets off only after native dismissal completes", () => {
    const source = readMobileSource("screens/SourceMangaScreen.tsx");

    expect(source).toContain("libraryOptionsNextSheetRef.current = nextSheet;");
    expect(source).toContain('const claimedTransition = afterClose ?? "close-only";');
    expect(source).toContain(
      "if (libraryOptionsNextSheetRef.current) return false;",
    );
    expect(source).toContain("if (libraryOptionsNextSheetRef.current) return;");
    expect(source).toContain("onDismiss={handleLibraryOptionsClosed}");
    expect(source).toContain('closeLibraryOptionsTo("collections")');
    expect(source).toContain('closeLibraryOptionsTo("remove-confirm")');
    expect(source).toContain('if (nextSheet === "collections")');
    expect(source).toContain('nextSheet === "remove-confirm"');
    expect(source).toContain('{ kind: "reader", chapter: continueChapter }');
    expect(source).toContain(
      'typeof nextSheet === "object" &&\n      nextSheet.kind === "reader"',
    );
    const addAndRead = source.slice(
      source.indexOf("const addToLibraryAndRead"),
      source.indexOf("const removeFromLibrary"),
    );
    expect(addAndRead).not.toContain("openReader(continueChapter);");
    const addSuccess = source.slice(
      source.indexOf("setRemoveConfirmOpen(false);"),
      source.indexOf(
        "return true;",
        source.indexOf("setRemoveConfirmOpen(false);"),
      ),
    );
    expect(addSuccess.indexOf("addingRef.current = false;")).toBeLessThan(
      addSuccess.indexOf("setLibraryOptionsOpen(false);"),
    );
    expect(source).not.toContain("collectionSheetOpenTimerRef");
    expect(source).not.toContain("}, 250);");
  });

  test("serializes Browse child sheets and installs behind native dismissal", () => {
    const browse = readMobileSource("screens/BrowseScreen.tsx");
    const confirmation = readMobileSource(
      "components/MobileConfirmationSheet.tsx",
    );
    const install = readMobileSource("components/MobileSourceInstallSheet.tsx");

    expect(browse).toContain("addSourceDismissActionRef.current = next;");
    expect(browse).toContain("if (addSourceDismissActionRef.current) return;");
    expect(browse).toContain("if (confirmationDismissActionRef.current) return;");
    expect(browse).toContain(
      "confirmationDismissActionRef.current = null;",
    );
    expect(browse).toContain("confirmationDismissActionRef.current = {");
    expect(browse).toContain("onDismiss={handleAddSourceSheetDismissed}");
    expect(browse).toContain("onDismiss={handleLanguageSheetDismissed}");
    expect(browse).toContain("onDismiss={handleInstallConfirmationDismissed}");
    expect(browse).toContain("onDismiss={handleInstallSheetDismissed}");
    expect(browse).toContain("installSheetDismissedRef.current = true;");
    expect(browse).not.toContain("setAddSourceSheetKey");

    for (const source of [confirmation, install]) {
      expect(source).toContain("onDismiss?: () => void;");
      expect(source).toContain("onDismiss={onDismiss}");
    }
    expect(confirmation).toContain("if (!visible) return;");
    expect(install).toContain("if (visible) onCancel?.();");
  });

  test("serializes Library sheet swaps without remounting the closing host", () => {
    const source = readMobileSource("screens/LibraryScreen.tsx");

    expect(source).toContain("pendingSheetTransitionRef");
    expect(source).toContain("queueAfterSheetDismiss");
    expect(source).toContain("completeSheetDismiss");
    expect(source).toContain(
      'onDismiss={() => completeSheetDismiss("title-menu")}',
    );
    expect(source).toContain(
      'onDismiss={() => completeSheetDismiss("collections-manager")}',
    );
    expect(source).toContain(
      'onDismiss={() => completeSheetDismiss("create-collection")}',
    );
    expect(source).toContain("manageCollectionPresentation");
    expect(source).toContain("Boolean(manageCollectionPresentation)");
    expect(source).toContain("setManageCollectionPresentation(null);");
    expect(source).not.toContain('key={showCreatePanel ? "create-open"');
    expect(source).not.toContain("key={renameTarget?.collectionId");
    expect(source).toContain("if (visible && !wasVisibleRef.current)");
  });

  test("keeps collection membership on one host and deduplicates close intent", () => {
    const source = readMobileSource(
      "components/MobileCollectionMembershipSheet.tsx",
    );

    expect(source.match(/<MobileNativeSheetScaffold/g)?.length).toBe(1);
    expect(source).not.toContain("LoadingCollectionMembershipSheet");
    expect(source).toContain("collections.loading ? (");
    expect(source).toContain("closeRequestedRef.current = true;");
    expect(source).toContain("if (closeRequestedRef.current) return;");
    const saveSuccess = source.slice(
      source.indexOf("const saveMembership"),
      source.indexOf("return (", source.indexOf("const saveMembership")),
    );
    expect(saveSuccess.indexOf("closeRequestedRef.current = true;")).toBeLessThan(
      saveSuccess.indexOf("onClose();"),
    );
  });

  test("keeps nested sheet workflows on one native host", () => {
    const manager = readMobileSource(
      "components/MobileSourceManagerSheet.tsx",
    );
    const settingsCard = readMobileSource(
      "components/MobileSourceSettingsCard.tsx",
    );
    const settingsScreen = readMobileSource("screens/SettingsScreen.tsx");
    const sourceBrowse = readMobileSource("screens/SourceBrowseScreen.tsx");

    expect(manager).not.toContain("<MobileConfirmationSheet");
    expect(manager).toContain("styles.confirmationPanel");
    expect(manager).toContain("onHardwareBackPress={() => {");
    expect(settingsCard).toContain("<MobileSourceLoginSheet");
    expect(settingsCard).toContain("embedded");
    expect(settingsCard).toContain("onEmbeddedBackHandlerChange?.(");
    expect(settingsScreen).toContain("embeddedBackHandlerRef.current");
    expect(settingsScreen).toContain("onHardwareBackPress={() => {");
    expect(sourceBrowse).toContain("sourceFilterPresentation");
    expect(sourceBrowse).toContain("filters={sourceFilterPresentation.filters}");
    expect(sourceBrowse).toContain("setSourceFilterPresentation(null);");
  });

  test("retains Manga Detail native presentations through dismissal", () => {
    const source = readMobileSource("screens/MangaDetailScreen.tsx");

    expect(source).toContain("metadataEditorPresentation");
    expect(source).toContain("sourceManagerPresentation");
    expect(source).toContain("collectionSheetPresentation");
    expect(source).toContain("onDismiss={handleRemoveConfirmationDismissed}");
    expect(source).toContain("removeRouteAfterDismissRef.current = true;");
    const removeAction = source.slice(
      source.indexOf("const removeFromLibrary = async"),
      source.indexOf("const cancelRemoveFromLibrary"),
    );
    expect(removeAction).not.toContain('router.replace("/library")');
    expect(source).toMatch(
      /const handleRemoveConfirmationDismissed[\s\S]*?router\.replace\("\/library"\)/,
    );
  });

  test("does not repeat metadata close feedback after controlled dismissal", () => {
    const source = readMobileSource(
      "components/MobileMetadataEditorSheet.tsx",
    );
    const requestClose = source.slice(
      source.indexOf("const requestClose = () =>"),
      source.indexOf("useEffect(() =>", source.indexOf("const requestClose = () =>")),
    );

    expect(requestClose).toContain("if (!visible) return;");
    expect(requestClose.indexOf("if (!visible) return;")).toBeLessThan(
      requestClose.indexOf("void hapticPress();"),
    );
  });

  test("freezes Source Manga option content until the host is dismissed", () => {
    const source = readMobileSource("screens/SourceMangaScreen.tsx");

    expect(source).toContain("libraryOptionsPresentationMode");
    expect(source).toContain(
      'setLibraryOptionsPresentationMode(inLibrary ? "in-library" : "add")',
    );
    expect(source).toContain("setLibraryOptionsPresentationMode(null);");
    expect(source).toContain(
      'libraryOptionsPresentationMode === "in-library"',
    );
  });

  test("keeps direct depth shadows unclipped with native-size targets", () => {
    const pressable = readMobileSource(
      "design-system/components/NemuPressable.tsx",
    );
    expect(pressable).toContain("getNemuButtonMinimumTargetSize(Platform.OS)");
    expect(pressable).toContain("minHeight: depthMinimumTarget");
    expect(pressable).toContain("minWidth: depthMinimumTarget");

    const targets = [
      [readMobileSource("design-system/components/NemuToolbarAction.tsx"), "action"],
      [readMobileSource("screens/BrowseScreen.tsx"), "adultToggle"],
      [readMobileSource("screens/BrowseScreen.tsx"), "languageFallbackButton"],
      [readMobileSource("components/MobileMangaDetailSurface.tsx"), "primaryAction"],
      [readMobileSource("components/MobileMangaDetailSurface.tsx"), "iconAction"],
      [readMobileSource("components/MobileSourceSettingsCard.tsx"), "backButton"],
      [readMobileSource("components/MobileSourceSettingsCard.tsx"), "resetButton"],
      [readMobileSource("components/MobileSourceSettingsCard.tsx"), "editableListAddButton"],
      [readMobileSource("components/MobileSourceSettingsCard.tsx"), "stepperButton"],
    ] as const;

    for (const [source, styleName] of targets) {
      const styleStart = source.indexOf(`  ${styleName}: {`);
      const styleEnd = source.indexOf("\n  },", styleStart);
      expect(styleStart).toBeGreaterThanOrEqual(0);
      expect(source.slice(styleStart, styleEnd)).not.toContain(
        'overflow: "hidden"',
      );
    }
  });
});
