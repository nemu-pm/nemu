import type { AppLanguage } from "@/data/schema";
import type { MobileSourceOAuthErrorCode } from "./mobileSourceOAuthLogic";
import { normalizeAppLanguage } from "./mobileLanguageSettings";

export type MobileStrings = {
  about: {
    appIconLabel: string;
    close: string;
    description: string;
    openSourceCode: string;
    sourceCode: string;
    tagline: string;
  };
  common: {
    add: string;
    back: string;
    cancel: string;
    clear: string;
    collapse: string;
    create: string;
    done: string;
    dragHandle: string;
    externalLinkFailed: string;
    externalLinkFailedDetail: string;
    expand: string;
    goHome: string;
    install: string;
    merge: string;
    moreTags: string;
    new: string;
    openSettings: string;
    pageNotFound: string;
    pageNotFoundDescription: string;
    remove: string;
    retry: string;
    save: string;
    sourceCloudflareBlocked: string;
    sourceCloudflareBlockedDescription: string;
    sourceError: string;
    sourceNetworkError: string;
    sourceNetworkErrorDescription: string;
    sourceRuntimeUnavailable: string;
    sourceRuntimeUnavailableDescription: string;
    uninstall: string;
    agentVerify: string;
    agentSheetOpening: string;
    agentSheetWaiting: string;
    agentSheetCaptcha: string;
    agentSheetSuccess: string;
    agentSheetFailed: string;
    agentSheetUnavailable: string;
  };
  errorBoundary: {
    copied: string;
    copyFailed: string;
    copyLog: string;
    description: string;
    detailsLabel: string;
    messageLabel: string;
    retry: string;
    retrying: string;
    title: string;
  };
  chapter: {
    chapterX: string;
    chX: string;
    untitled: string;
    volumeX: string;
    volX: string;
  };
  browse: {
    adult: string;
    adultSourcesSwitch: string;
    addSource: string;
    addSourcesDescription: string;
    addSources: string;
    allLanguages: string;
    chooseLanguages: string;
    installAnyway: string;
    installingSource: string;
    installingSourceDescription: string;
    installingSourceDescriptionGeneric: string;
    installSourceNamed: string;
    installed: string;
    languageFilter: string;
    languageFilterOption: string;
    languagesSelected: string;
    noSources: string;
    noSourcesDescription: string;
    noSourceResults: string;
    otherLanguages: string;
    refreshSources: string;
    refreshSourcesHint: string;
    removeSourceNamed: string;
    searchRegistries: string;
    sourcesUnavailable: string;
    warningAuthentication: string;
    warningCloudflare: string;
    warningTitle: string;
  };
  nav: {
    library: string;
    browse: string;
    search: string;
    settings: string;
  };
  welcome: {
    confirmSkip: string;
    description: string;
    doneDescription: string;
    doneTitle: string;
    getStarted: string;
    installAndContinue: string;
    installing: string;
    intro: string;
    languageDescription: string;
    languageTitle: string;
    loadingSources: string;
    next: string;
    noRecommendedSources: string;
    selectRecommendedSource: string;
    skip: string;
    sourceAlreadyInstalled: string;
    sourceInstallFailed: string;
    sourceInstallFailedDetail: string;
    sourcesDescription: string;
    sourcesHint: string;
    sourcesTitle: string;
    startReading: string;
    syncHint: string;
    title: string;
    titlePrefix: string;
  };
  library: {
    addCompatibleSource: string;
    addBooksAction: string;
    addBooksDescription: string;
    addBooksEmpty: string;
    addBooksHint: string;
    addBooksTitle: string;
    addSource: string;
    all: string;
    closeAddBooks: string;
    collectionEmpty: string;
    collectionChipAccessibility: string;
    collectionMangaAccessibility: string;
    collectionName: string;
    collectionNotFoundDescription: string;
    collectionNotFoundTitle: string;
    collectionActionFailed: string;
    collectionActionFailedDetail: string;
    createCollection: string;
    createCollectionHint: string;
    manageCollection: string;
    manageCollectionHint: string;
    manageCollections: string;
    manageCollectionsHint: string;
    loading: string;
    mangaSourceCountOne: string;
    mangaSourceCountOther: string;
    new: string;
    newCollection: string;
    newCollectionDescription: string;
    noSources: string;
    noSourcesDescription: string;
    emptyDescription: string;
    empty: string;
    progressCaughtUp: string;
    progressUnread: string;
    removeCollection: string;
    removeCollectionConfirm: string;
    removeCollectionNamed: string;
    renameCollection: string;
    renameCollectionAccessibility: string;
    renameDescription: string;
    startSearching: string;
    updated: string;
    updateMembershipDescription: string;
    unavailable: string;
  };
  collectionMembership: {
    bookCountOne: string;
    bookCountOther: string;
    close: string;
    collectionName: string;
    collectionRowAccessibility: string;
    createCollection: string;
    loading: string;
    newCollection: string;
    newCollectionDescription: string;
    noCollections: string;
    saving: string;
    saveWithCount: string;
    subtitle: string;
    subtitleForTitle: string;
    title: string;
  };
  metadataEditor: {
    applyMatch: string;
    applyMatchField: string;
    authors: string;
    authorsPlaceholder: string;
    close: string;
    cover: string;
    coverDescription: string;
    coverPermissionDenied: string;
    coverPickFailed: string;
    coverPreview: string;
    coverSelected: string;
    coverTitle: string;
    coverUploadFailed: string;
    coverUploadUnavailable: string;
    coverUrl: string;
    coverUrlPlaceholder: string;
    chooseCoverImage: string;
    description: string;
    matchFailed: string;
    matchSearchPlaceholder: string;
    matchSubtitle: string;
    matchTitle: string;
    noMatches: string;
    reset: string;
    resetField: string;
    saving: string;
    searchMatches: string;
    selectStatus: string;
    sourceFetchAccessibility: string;
    sourceFetchFailed: string;
    sourceFetchSubtitle: string;
    sourceFetchTitle: string;
    status: string;
    statusCancelled: string;
    statusCompleted: string;
    statusHiatus: string;
    statusOngoing: string;
    statusUnknown: string;
    subtitle: string;
    tags: string;
    tagsPlaceholder: string;
    title: string;
    titleField: string;
    uploadingCover: string;
  };
  mangaDetail: {
    actionFailed: string;
    actionFailedDetail: string;
    backToLibrary: string;
    chapterCountLiveOne: string;
    chapterCountLiveOther: string;
    chapterCountLocalOne: string;
    chapterCountLocalOther: string;
    chapters: string;
    completeCount: string;
    continueChapter: string;
    editMetadata: string;
    fullRefreshNotStarted: string;
    loadingManga: string;
    manga: string;
    mangaNotFound: string;
    mangaUnavailable: string;
    missingSourceLinksDescription: string;
    missingSourceLinksTitle: string;
    manageCollections: string;
    manageCollectionsHint: string;
    manageSources: string;
    manageSourcesHint: string;
    nativeRuntimeRequired: string;
    noChapters: string;
    noChapterYet: string;
    openChapter: string;
    readActionHint: string;
    refreshChapterCountOne: string;
    refreshChapterCountOther: string;
    refreshingSource: string;
    removeDescription: string;
    removeFromLibrary: string;
    removeFromLibraryHint: string;
    removeTitle: string;
    selectSource: string;
    selectSourceRefresh: string;
    sourceCountOne: string;
    sourceCountOther: string;
    sourcePackageUnavailable: string;
    sources: string;
    startReading: string;
    titleNotAvailable: string;
    updated: string;
  };
  sourceManga: {
    actionFailed: string;
    actionFailedDetail: string;
    addAndStartReading: string;
    addAndStartReadingHint: string;
    addOptionsDescription: string;
    addOptionsTitle: string;
    addToLibrary: string;
    addToLibraryHint: string;
    backToSource: string;
    chapterLoadedOne: string;
    chapterLoadedOther: string;
    chapters: string;
    completeCount: string;
    continueChapter: string;
    detailsNotLoaded: string;
    inLibrary: string;
    installSourceBeforeDetails: string;
    libraryOptionsDescription: string;
    libraryOptionsTitle: string;
    loadingDetails: string;
    manageCollections: string;
    manageCollectionsHint: string;
    noChapterYet: string;
    noChapters: string;
    openChapter: string;
    readActionHint: string;
    removeDescription: string;
    removeFromLibrary: string;
    removeFromLibraryHint: string;
    removeTitle: string;
    sourceDetailsUnavailable: string;
    startReading: string;
    updated: string;
  };
  sourceBrowse: {
    activeFilterCountOne: string;
    activeFilterCountOther: string;
    allFilters: string;
    applyFilters: string;
    anyFilter: string;
    availableFilterCountOne: string;
    availableFilterCountOther: string;
    baseUrl: string;
    browseSources: string;
    bytesPending: string;
    bytesReadable: string;
    checkingExecutor: string;
    clearSourceSearch: string;
    closeFilters: string;
    customFilter: string;
    defaultFilter: string;
    executorCheckFailed: string;
    executorPending: string;
    executorReady: string;
    excludeFilter: string;
    filterCountOne: string;
    filterCountOther: string;
    includeFilter: string;
    installBeforeExecutor: string;
    installBeforeOpening: string;
    libraryFromSource: string;
    listingCountOne: string;
    listingCountOther: string;
    listingLoadFailed: string;
    localPackageAvailable: string;
    loadFiltersFailed: string;
    loadHomeFailed: string;
    loadMore: string;
    loadingFilters: string;
    loadingHome: string;
    loadingListing: string;
    loadingMoreListing: string;
    loadingMoreSourceResults: string;
    mangaCountOne: string;
    mangaCountOther: string;
    metadataStatus: string;
    multiLanguage: string;
    nativeExecutor: string;
    noLibraryMangaUsesSource: string;
    noLinkedMangaMatches: string;
    noLiveMatches: string;
    noLocalPackage: string;
    noMangaLoadedFromListing: string;
    noPackageListings: string;
    noSourceHome: string;
    notFilter: string;
    sourceOperationTimedOut: string;
    openAllFilters: string;
    openHomeFilter: string;
    openLink: string;
    openLinkFailed: string;
    openLinkFailedDetail: string;
    openListing: string;
    openManga: string;
    selectFeaturedManga: string;
    operationAixPackageCached: string;
    operationAixPackageCachedMetadata: string;
    operationAixPackageMissing: string;
    operationAixPackageTitle: string;
    operationBrowseListingsDetail: string;
    operationBrowseListingsTitle: string;
    operationChaptersDetail: string;
    operationChaptersTitle: string;
    operationHomeSectionsDetail: string;
    operationHomeSectionsTitle: string;
    operationImageRequestsDetail: string;
    operationImageRequestsTitle: string;
    operationInstallPackageDetail: string;
    operationLiveSearchDetail: string;
    operationLiveSearchTitle: string;
    operationMangaDetailsDetail: string;
    operationMangaDetailsTitle: string;
    operationMetadataExecutableMissing: string;
    operationNativeCompatibleDetail: string;
    operationNoStaticMetadata: string;
    operationPageListDetail: string;
    operationPageListTitle: string;
    operationSearchFiltersDetail: string;
    operationSearchFiltersTitle: string;
    operationSettingsSchemaDetail: string;
    operationSettingsSchemaTitle: string;
    packageCached: string;
    packageCapabilities: string;
    packageMissing: string;
    packageReady: string;
    packageStatus: string;
    readablePackageBytes: string;
    refreshSource: string;
    refreshSourceHint: string;
    resetFilters: string;
    runtime: string;
    runtimeBridge: string;
    runtimeOperations: string;
    searchOrChooseFilters: string;
    searchLinkedManga: string;
    searchSource: string;
    searchSourceHint: string;
    searchSourcePlaceholder: string;
    searchThisSource: string;
    selectListingToBrowse: string;
    selectedFilterCount: string;
    settingCountOne: string;
    settingCountOther: string;
    sortAscending: string;
    sortDescending: string;
    source: string;
    sourceFilterCycleHint: string;
    sourceFilterExcludeHint: string;
    sourceFilterOption: string;
    sourceFilterTextInput: string;
    sourceFilters: string;
    sourceFiltersIdle: string;
    sourceHome: string;
    sourceHomeIdle: string;
    sourceListings: string;
    sourceNotInstalled: string;
    sourceSearchFailed: string;
    sourceUnavailable: string;
    unsupportedStatus: string;
    validatingExecutor: string;
    waitingForSettings: string;
    wasmReady: string;
    wasmUnknown: string;
    webExecutor: string;
    webExecutorReady: string;
    nativeExecutorReady: string;
  };
  reader: {
    bookPairing: string;
    chapterAccessibility: string;
    closePlugin: string;
    currentChapter: string;
    description: string;
    disabled: string;
    dualReadTargetAccessibility: string;
    dualReadOverlayUnavailableTitle: string;
    dualReadOverlayUnavailableHint: string;
    dualReadDialogTitle: string;
    dualReadDialogDescription: string;
    dualReadDialogNoLinkedSources: string;
    dualReadDialogSecondarySource: string;
    dualReadDialogPrimaryChapter: string;
    dualReadDialogSecondaryChapter: string;
    dualReadDialogLoadingChapters: string;
    dualReadDialogChooseChapter: string;
    dualReadDialogEnable: string;
    dualReadDialogDisable: string;
    dualReadDialogCancel: string;
    dualReadFabLabel: string;
    dualReadPopoverNoLinkedSources: string;
    dualReadPopoverLinkSecondary: string;
    dualReadPopoverSecondaryLabel: string;
    dualReadPopoverChapterPair: string;
    dualReadPopoverUnpaired: string;
    dualReadPopoverLoadingPairing: string;
    enabled: string;
    hideControls: string;
    loadingChapterState: string;
    loadingPages: string;
    rtl: string;
    ltr: string;
    lockedChapter: string;
    mangaPairing: string;
    markComplete: string;
    markedComplete: string;
    matchingChapter: string;
    narrowPageWidth: string;
    nextChapter: string;
    nextPage: string;
    nextSpread: string;
    noChapter: string;
    noNextChapter: string;
    noPreviousChapter: string;
    openPlugin: string;
    pageCountOne: string;
    pageCountOther: string;
    pageFallback: string;
    pageImageFailed: string;
    pageImageLoading: string;
    processPageImages: string;
    processPageImagesDescription: string;
    pageLoadedOne: string;
    pageLoadedOther: string;
    pageLoadingUnavailable: string;
    pageTitle: string;
    pageValue: string;
    pageWidth: string;
    pageWidthValue: string;
    pluginAllLanguages: string;
    pluginAutoDetect: string;
    pluginConfidence: string;
    pluginDualReadDebug: string;
    pluginDualReadDebugOverlay: string;
    pluginDualReadDebugOverlayDescription: string;
    pluginDualReadDescription: string;
    pluginDualReadName: string;
    pluginJapaneseLearningAllLanguages: string;
    pluginJapaneseLearningAllLanguagesDescription: string;
    pluginJapaneseLearningAlternativeReadings: string;
    pluginJapaneseLearningAskSentence: string;
    pluginJapaneseLearningAskWords: string;
    pluginJapaneseLearningAutoDetectText: string;
    pluginJapaneseLearningAutoDetectTextDescription: string;
    pluginJapaneseLearningAskWord: string;
    pluginJapaneseLearningBaseForm: string;
    pluginJapaneseLearningCopied: string;
    pluginJapaneseLearningCopyFailed: string;
    pluginJapaneseLearningCopySentence: string;
    pluginJapaneseLearningCopySelection: string;
    pluginJapaneseLearningCopyWord: string;
    pluginJapaneseLearningDescription: string;
    pluginJapaneseLearningDetectText: string;
    pluginJapaneseLearningDetectingText: string;
    pluginJapaneseLearningDetection: string;
    pluginJapaneseLearningDragWordsHint: string;
    pluginJapaneseLearningAnalyzingSentence: string;
    pluginJapaneseLearningGrammar: string;
    pluginJapaneseLearningGrammarFailed: string;
    pluginJapaneseLearningGrammarHint: string;
    pluginJapaneseLearningListen: string;
    pluginJapaneseLearningNoText: string;
    pluginJapaneseLearningNoImage: string;
    pluginJapaneseLearningNoMeanings: string;
    pluginJapaneseLearningNormalizingSentence: string;
    pluginJapaneseLearningMinimumConfidence: string;
    pluginJapaneseLearningMinimumConfidenceDescription: string;
    pluginJapaneseLearningName: string;
    pluginJapaneseLearningChatFailed: string;
    pluginJapaneseLearningChatEmptyTitle: string;
    pluginJapaneseLearningChatEmptyDescription: string;
    pluginJapaneseLearningChatHint: string;
    pluginJapaneseLearningChatInputPlaceholder: string;
    pluginJapaneseLearningChatRead: string;
    pluginJapaneseLearningChatResponse: string;
    pluginJapaneseLearningChatSend: string;
    pluginJapaneseLearningChatThinking: string;
    pluginJapaneseLearningChatToday: string;
    pluginJapaneseLearningLineAccessibility: string;
    pluginJapaneseLearningNemuChat: string;
    pluginJapaneseLearningOcrFailed: string;
    pluginJapaneseLearningResponseLanguage: string;
    pluginJapaneseLearningResponseLanguageDescription: string;
    pluginJapaneseLearningSelectedText: string;
    pluginJapaneseLearningSignInRequired: string;
    pluginJapaneseLearningSourceText: string;
    pluginJapaneseLearningStopListening: string;
    pluginJapaneseLearningStructure: string;
    pluginJapaneseLearningTapTokenHint: string;
    pluginJapaneseLearningTokenAccessibility: string;
    pluginJapaneseLearningTranscript: string;
    pluginJapaneseLearningTranscriptHint: string;
    pluginJapaneseLearningTranscriptTooLong: string;
    pluginJapaneseLearningTtsFailed: string;
    pluginJapaneseLearningTtsLoading: string;
    pluginResponse: string;
    pluginValueAppLanguage: string;
    pluginValueDefault: string;
    pluginValueOff: string;
    pluginValueOn: string;
    pluginValueSimpleJapanese: string;
    previousChapter: string;
    previousPage: string;
    previousSpread: string;
    progressNotCompleted: string;
    readerPagesIdle: string;
    savingProgress: string;
    scroll: string;
    showControls: string;
    sourcePackageUnavailable: string;
    spread: string;
    stageAccessibility: string;
    title: string;
    twoPageView: string;
    widenPageWidth: string;
  };
  search: {
    addCompatibleSource: string;
    addSource: string;
    all: string;
    allSources: string;
    allSourcesSelectionHint: string;
    browseSources: string;
    enterQuery: string;
    enterSearchTerm: string;
    liveSearchCachedStatus: string;
    liveSearchFailed: string;
    liveSearchNeedsCache: string;
    liveSourceResults: string;
    liveSourceSearch: string;
    noLiveMatches: string;
    noSavedMatches: string;
    noSavedMatchesForQuery: string;
    noSources: string;
    noSourcesDescription: string;
    noSourcesInstalled: string;
    noSourcesSelected: string;
    noSourcesSelectedDescription: string;
    openItem: string;
    preferencesFailed: string;
    preferencesLoadFailedDetail: string;
    preferencesSaveFailedDetail: string;
    searchInstalledSources: string;
    searchForManga: string;
    searchUnavailable: string;
    searching: string;
    searchingSelectedSources: string;
    selectedOfSources: string;
    sourceAccessibility: string;
    sourceSelectionHint: string;
    updated: string;
  };
  settings: {
    aboutNemuBeforeBrand: string;
    aboutNemuAfterBrand: string;
    aboutNemuLabel: string;
    addSource: string;
    appearance: string;
    appearanceDescription: string;
    agent: string;
    agentBuiltInEnabled: string;
    agentConnected: string;
    agentDescription: string;
    agentNotRunning: string;
    agentProtectedCompatibility: string;
    agentReady: string;
    agentRefresh: string;
    agentRefreshStatus: string;
    agentVersion: string;
    browseSource: string;
    builtIn: string;
    clearAllData: string;
    clearAllDataConfirm: string;
    clearAllDataDescription: string;
    clearAllLocalData: string;
    clearCache: string;
    clearCacheConfirm: string;
    clearCacheDescription: string;
    clearCloudData: string;
    clearCloudDataDescription: string;
    cloudSync: string;
    cloudSyncCheckingSession: string;
    cloudSyncContinueWith: string;
    cloudSyncDescription: string;
    cloudSyncEraseAcknowledgement: string;
    cloudSyncEraseConfirm: string;
    cloudSyncEraseDescription: string;
    cloudSyncEraseFailed: string;
    cloudSyncEraseTitle: string;
    cloudSyncKeepData: string;
    cloudSyncKeepDataDescription: string;
    cloudSyncRemoveData: string;
    cloudSyncRemoveDataDescription: string;
    cloudSyncRecovery: string;
    cloudSyncRetry: string;
    cloudSyncRetryFailed: string;
    cloudSyncStillTooLarge: string;
    cloudSyncPaused: string;
    cloudSyncPausedDetail: string;
    cloudSyncStorageUnavailable: string;
    cloudSyncStorageUnavailableDetail: string;
    cloudSyncSignInFailed: string;
    cloudSyncSignInPrompt: string;
    cloudSyncSignedIn: string;
    cloudSyncSignOut: string;
    cloudSyncSignOutFailed: string;
    cloudSyncSignOutLabel: string;
    cloudSyncSignOutMessage: string;
    cloudSyncSignOutTitle: string;
    cloudSyncUnavailable: string;
    cloudSyncUnavailableDetail: string;
    dataManagement: string;
    dataManagementDescription: string;
    editReaderPluginSettings: string;
    editSourceSettings: string;
    importSource: string;
    importingSource: string;
    installedSources: string;
    installedSourcesDescription: string;
    language: string;
    languageDescription: string;
    languageEnglish: string;
    languageChinese: string;
    languageJapanese: string;
    loading: string;
    loadingReaderPlugins: string;
    metadataAutoFollows: string;
    metadataFixedDescription: string;
    metadataLanguage: string;
    metadataLanguageAuto: string;
    metadataLanguageDescription: string;
    noPluginSettings: string;
    noSourceManagement: string;
    plugins: string;
    pluginsDescription: string;
    pluginSettings: string;
    readerPluginSwitch: string;
    refreshSources: string;
    refreshSourcesHint: string;
    selectSettingOption: string;
    settingCountOne: string;
    settingCountOther: string;
    sourceSettingsDecrease: string;
    sourceSettingsDefaultTitle: string;
    sourceSettingsDefaultValue: string;
    sourceSettingsEmpty: string;
    sourceSettingsIncrease: string;
    sourceSettingsLoadingValues: string;
    sourceSettingsNone: string;
    sourceSettingsOff: string;
    sourceSettingsOn: string;
    sourceSettingsSelectOption: string;
    sourceSettingsReset: string;
    sourceSettingsResetLabel: string;
    sourceSettingsSavedOnDevice: string;
    sourceSettingsTitle: string;
    sourceSettingsToggleOption: string;
    sourceSettingsBack: string;
    sourceSettingsOpenPage: string;
    sourceSettingsLogin: string;
    sourceSettingsLoginUnavailable: string;
    sourceSettingsLoginUnsupported: string;
    sourceSettingsLogout: string;
    sourceSettingsLoginInProgress: string;
    sourceSettingsLoggedIn: string;
    sourceSettingsLoggedOut: string;
    sourceSettingsLoginFailed: string;
    sourceSettingsUsername: string;
    sourceSettingsEmail: string;
    sourceSettingsPassword: string;
    sourceSettingsCookies: string;
    sourceSettingsCookiesPlaceholder: string;
    sourceSettingsLocalStorage: string;
    sourceSettingsLocalStoragePlaceholder: string;
    sourceSettingsLocalStorageKeys: string;
    sourceSettingsBasicLoginInstructions: string;
    sourceSettingsWebLoginInstructions: string;
    sourceSettingsSubmitLogin: string;
    sourceSettingsInvalidLoginForm: string;
    sourceSettingsCredentialsRejected: string;
    sourceSettingsRuntimeUnavailable: string;
    sourceSettingsInvalidLink: string;
    sourceSettingsOpenLink: string;
    sourceSettingsRunAction: string;
    sourceSettingsActionFailed: string;
    sourceSettingsActionConfirm: string;
    sourceSettingsLogoutConfirm: string;
    sourceOAuthErrors: Record<MobileSourceOAuthErrorCode, string>;
    sourceUpdated: string;
    sourcesUpdated: string;
    settingsActionFailed: string;
    settingsActionFailedDetail: string;
    theme: string;
    themeDark: string;
    themeDescription: string;
    themeLight: string;
    themeSystem: string;
    uninstallSource: string;
    uninstallSourceConfirm: string;
    uninstallSourceNamed: string;
  };
  sourceManager: {
    active: string;
    added: string;
    addPanelIdle: string;
    addSourceResult: string;
    allInstalledLinked: string;
    backToSourceList: string;
    close: string;
    everyTitleNeedsSource: string;
    librarySearchPlaceholder: string;
    likelyMatch: string;
    loadingLibraryTitles: string;
    manageSources: string;
    matchingTitles: string;
    mergeLibraryTitle: string;
    mergeLibraryTitleConfirm: string;
    mergeWithTitle: string;
    modeMerge: string;
    modeSearch: string;
    moveDown: string;
    moveUp: string;
    noLibraryMatches: string;
    noSourceResults: string;
    position: string;
    previousResults: string;
    removeSource: string;
    removeSourceConfirm: string;
    nextResults: string;
    sourceActionFailed: string;
    sourceActionFailedDetail: string;
    searchSourceCountOne: string;
    searchSourceCountOther: string;
    searchSources: string;
    selectSource: string;
    sourceCountOne: string;
    sourceCountOther: string;
    sourceSearchPlaceholder: string;
    subtitle: string;
    dragToReorder: string;
  };
};

const mobileStrings: Record<AppLanguage, MobileStrings> = {
  en: {
    about: {
      appIconLabel: "nemu app icon",
      close: "Close about nemu",
      description:
        "nemu is a manga reader that lets you discover and read from your favorite online sources.",
      openSourceCode: "Open Nemu source code on GitHub",
      sourceCode: "Source Code",
      tagline: "A magical manga reader",
    },
    common: {
      add: "Add",
      back: "Back",
      cancel: "Cancel",
      clear: "Clear",
      collapse: "Collapse",
      create: "Create",
      done: "Done",
      dragHandle: "Drag handle",
      externalLinkFailed: "Could not open link",
      externalLinkFailedDetail: "This link could not be opened on this device.",
      expand: "Expand",
      goHome: "Go to Library",
      install: "Install",
      merge: "Merge",
      moreTags: "{{count}} more tags",
      new: "New",
      openSettings: "Open Settings",
      pageNotFound: "Page not found",
      pageNotFoundDescription: "This link doesn't match any screen in Nemu.",
      remove: "Remove",
      retry: "Retry",
      save: "Save",
      sourceCloudflareBlocked: "Cloudflare protection detected",
      sourceCloudflareBlockedDescription:
        "This source requires Cloudflare verification, which is not securely available in this mobile build.",
      sourceError: "Source error",
      sourceNetworkError: "Network error",
      sourceNetworkErrorDescription:
        "Nemu could not reach this source. Check your connection and try again.",
      sourceRuntimeUnavailable: "Source runtime unavailable",
      sourceRuntimeUnavailableDescription:
        "This build cannot run installed source packages yet. The current React Native JavaScript engine does not provide the complete WebAssembly runtime they require.",
      uninstall: "Uninstall",
      agentVerify: "Verify",
      agentSheetOpening: "Starting Nemu Agent…",
      agentSheetWaiting: "Waiting for Cloudflare…",
      agentSheetCaptcha: "Complete the verification prompt to continue.",
      agentSheetSuccess: "Challenge solved. Resuming…",
      agentSheetFailed:
        "Couldn't solve the challenge automatically. Try again, or open Settings to check Nemu Agent.",
      agentSheetUnavailable:
        "Secure Cloudflare verification is unavailable on mobile. This source cannot be opened until it offers a direct endpoint.",
    },
    errorBoundary: {
      copied: "Error log copied.",
      copyFailed: "Could not copy error log.",
      copyLog: "Copy Log",
      description:
        "Nemu hit an unexpected mobile runtime error. Retry the screen or copy the log for debugging.",
      detailsLabel: "Details",
      messageLabel: "Message",
      retry: "Retry",
      retrying: "Retrying...",
      title: "Something went wrong",
    },
    chapter: {
      chapterX: "Chapter {{n}}",
      chX: "Ch.{{n}}",
      untitled: "Untitled",
      volumeX: "Volume {{n}}",
      volX: "Vol.{{n}}",
    },
    browse: {
      adult: "Adult",
      adultSourcesSwitch: "Adult sources",
      addSource: "Add Source",
      addSourcesDescription: "Select a source from available registries",
      addSources: "Add Sources",
      allLanguages: "All",
      chooseLanguages: "Choose Languages...",
      installAnyway: "Install Anyway",
      installingSource: "Installing Source",
      installingSourceDescription: "Installing {{name}}...",
      installingSourceDescriptionGeneric:
        "Please wait while the source is being installed.",
      installSourceNamed: "Install {{name}}",
      installed: "Installed",
      languageFilter: "Source language",
      languageFilterOption: "Show {{language}} sources",
      languagesSelected: "{{count}} languages",
      noSources: "No sources installed",
      noSourcesDescription: "Add a source to start browsing manga",
      noSourceResults: "No sources match these filters.",
      otherLanguages: "Other",
      refreshSources: "Refresh sources",
      refreshSourcesHint: "Reloads source registries and install status.",
      removeSourceNamed: "Remove {{name}}",
      searchRegistries: "Search registries",
      sourcesUnavailable: "Sources unavailable",
      warningAuthentication:
        "This source requires login or authentication. It may not work correctly in the current version of Nemu.",
      warningCloudflare:
        "This source has Cloudflare protection. Nemu uses built-in native networking and may show a verification window when needed.",
      warningTitle: "Notice",
    },
    nav: {
      library: "Library",
      browse: "Browse",
      search: "Search",
      settings: "Settings",
    },
    welcome: {
      confirmSkip: "Are you sure?",
      description: "Your manga reading companion",
      doneDescription: "Start exploring manga from your installed sources.",
      doneTitle: "You're all set!",
      getStarted: "Get Started",
      installAndContinue: "Install & Continue",
      installing: "Installing...",
      intro:
        "A cross-platform manga reader that lets you discover and read manga from various Internet sources.\nLet's get you set up!",
      languageDescription: "Select your preferred app language",
      languageTitle: "Choose Language",
      loadingSources: "Loading sources...",
      next: "Next",
      noRecommendedSources:
        "Recommended sources are not available right now. You can add sources from Browse later.",
      selectRecommendedSource: "Select {{name}}",
      skip: "Skip",
      sourceAlreadyInstalled: "Installed",
      sourceInstallFailed: "Source install failed",
      sourceInstallFailedDetail:
        "The selected sources could not be installed on this device.",
      sourcesDescription: "Choose recommended manga sources to install",
      sourcesHint: "You can add more sources anytime in Settings.",
      sourcesTitle: "Add Sources",
      startReading: "Start Reading",
      syncHint:
        "Sign in to sync your library and reading progress across all your devices.",
      title: "Welcome to nemu",
      titlePrefix: "Welcome to ",
    },
    library: {
      addCompatibleSource:
        "Add a compatible source to start building your Nemu library.",
      addBooksAction: "Add books",
      addBooksDescription: "Choose which library books belong in {{name}}.",
      addBooksEmpty:
        "Your library is empty. Add manga before filling this collection.",
      addBooksHint: "Opens book selection for this collection.",
      addBooksTitle: "Add Books",
      addSource: "Add Source",
      all: "All",
      closeAddBooks: "Close add books",
      collectionEmpty:
        "This collection is empty. Add books to fill this shelf.",
      collectionChipAccessibility: "{{name}}, {{countLabel}}",
      collectionMangaAccessibility: "{{title}}, {{sourceCountLabel}}",
      collectionName: "Collection name",
      collectionNotFoundDescription: "This collection may have been deleted.",
      collectionNotFoundTitle: "Collection not found",
      collectionActionFailed: "Collection action failed",
      collectionActionFailedDetail:
        "The collection change could not be saved on this device.",
      createCollection: "Create collection",
      createCollectionHint: "Opens the new collection form.",
      manageCollection: "Manage collection",
      manageCollectionHint:
        "Opens rename, membership, and removal controls for this collection.",
      manageCollections: "Manage collections",
      manageCollectionsHint: "Opens management controls for your collections.",
      loading: "Loading library",
      mangaSourceCountOne: "{{count}} source",
      mangaSourceCountOther: "{{count}} sources",
      new: "New",
      newCollection: "New collection",
      newCollectionDescription: "Create a shelf for a focused reading list.",
      noSources: "No sources installed",
      noSourcesDescription:
        "Add a source to start discovering and reading manga",
      empty: "Your library is empty",
      emptyDescription: "Search for manga and add them to your library",
      progressCaughtUp: "Caught up",
      progressUnread: "Unread",
      removeCollection: "Remove collection",
      removeCollectionConfirm:
        "Remove this collection? Library manga stays saved.",
      removeCollectionNamed: "Remove {{name}}",
      renameCollection: "Rename collection",
      renameCollectionAccessibility: "Rename {{name}}",
      renameDescription: "Update this shelf across your library.",
      startSearching: "Start Searching",
      updated: "Updated",
      updateMembershipDescription: "Tap books to add or remove them.",
      unavailable: "Library unavailable",
    },
    collectionMembership: {
      bookCountOne: "{{count}} book",
      bookCountOther: "{{count}} books",
      close: "Close collections",
      collectionName: "Collection name",
      collectionRowAccessibility: "{{name}}, {{countLabel}}",
      createCollection: "Create collection",
      loading: "Loading collections",
      newCollection: "New collection",
      newCollectionDescription: "Create a shelf and select it for this title.",
      noCollections: "No collections yet. Create one below.",
      saving: "Saving",
      saveWithCount: "Save {{count}}",
      subtitle: "Choose shelves for this title",
      subtitleForTitle: "Choose shelves for {{title}}",
      title: "Collections",
    },
    metadataEditor: {
      applyMatch: "Apply {{provider}} metadata match",
      applyMatchField: "Apply {{field}} from {{provider}}",
      authors: "Authors",
      authorsPlaceholder: "Author A, Author B",
      close: "Close metadata editor",
      cover: "Cover",
      coverDescription:
        "Paste an image URL to replace the source cover on this device.",
      coverPermissionDenied:
        "Photo library access is required to choose a cover.",
      coverPickFailed: "Could not choose that image.",
      coverPreview: "Cover preview",
      coverSelected: "Selected image uploads on save.",
      coverTitle: "Cover override",
      coverUploadFailed: "Cover upload failed.",
      coverUploadUnavailable:
        "Cloud sync must be configured before uploading covers.",
      coverUrl: "Cover URL",
      coverUrlPlaceholder: "https://...",
      chooseCoverImage: "Choose image",
      description: "Description",
      matchFailed: "Metadata match failed.",
      matchSearchPlaceholder: "Search title",
      matchSubtitle: "AniList / MAL / MangaUpdates",
      matchTitle: "Metadata Match",
      noMatches: "No metadata matches found.",
      reset: "Reset",
      resetField: "Reset {{field}}",
      saving: "Saving",
      searchMatches: "Search metadata matches",
      selectStatus: "Set status to {{status}}",
      sourceFetchAccessibility: "Fetch metadata from {{source}}",
      sourceFetchFailed: "Source metadata fetch failed.",
      sourceFetchSubtitle:
        "Refresh draft fields from a linked source before saving.",
      sourceFetchTitle: "From Source",
      status: "Status",
      statusCancelled: "Cancelled",
      statusCompleted: "Completed",
      statusHiatus: "Hiatus",
      statusOngoing: "Ongoing",
      statusUnknown: "Unknown",
      subtitle: "Local overrides for this title",
      tags: "Tags",
      tagsPlaceholder: "Action, Drama",
      title: "Edit Metadata",
      titleField: "Title",
      uploadingCover: "Uploading",
    },
    mangaDetail: {
      actionFailed: "Manga action failed",
      actionFailedDetail: "The manga change could not be saved on this device.",
      backToLibrary: "Back to library",
      chapterCountLiveOne: "{{count}} live chapter",
      chapterCountLiveOther: "{{count}} live chapters",
      chapterCountLocalOne: "{{count}} local chapter",
      chapterCountLocalOther: "{{count}} local chapters",
      chapters: "Chapters",
      completeCount: "{{count}} complete",
      continueChapter: "Continue {{chapter}}",
      editMetadata: "Edit metadata",
      fullRefreshNotStarted: "Full chapter refresh has not started.",
      loadingManga: "Loading manga",
      manga: "Manga",
      mangaNotFound: "Manga not found",
      mangaUnavailable: "Manga unavailable",
      missingSourceLinksDescription:
        "This library entry has no linked sources. Remove it from this device and add it again from a source.",
      missingSourceLinksTitle: "Missing source links",
      manageCollections: "Manage collections",
      manageCollectionsHint: "Opens collection membership for this manga.",
      manageSources: "Manage sources",
      manageSourcesHint: "Opens linked source management for this manga.",
      nativeRuntimeRequired:
        "Native runtime execution is required to fetch this source's full chapter list.",
      noChapters: "No chapters",
      noChapterYet: "No chapter yet",
      openChapter: "Open {{chapter}}",
      readActionHint: "Opens the reader at the selected chapter.",
      refreshChapterCountOne: "1 chapter refreshed.",
      refreshChapterCountOther: "{{count}} chapters refreshed.",
      refreshingSource:
        "Refreshing manga details and chapters from the source.",
      removeDescription:
        "Reading progress from linked sources stays on device.",
      removeFromLibrary: "Remove from library",
      removeFromLibraryHint: "Shows a confirmation before removing this manga.",
      removeTitle: "Remove from library?",
      selectSource: "Select {{source}}",
      selectSourceRefresh: "Select a source to refresh chapters.",
      sourceCountOne: "{{count}} source",
      sourceCountOther: "{{count}} sources",
      sourcePackageUnavailable:
        "The installed source package for this manga is unavailable.",
      sources: "Sources",
      startReading: "Start reading",
      titleNotAvailable:
        "This title is not available in the local mobile library.",
      updated: "Updated",
    },
    sourceManga: {
      actionFailed: "Source manga action failed",
      actionFailedDetail:
        "The source manga change could not be saved on this device.",
      addAndStartReading: "Add and Start Reading",
      addAndStartReadingHint:
        "Save this manga to your library and open the first available chapter.",
      addOptionsDescription:
        "Choose how this manga should be saved on this device.",
      addOptionsTitle: "Add to Library",
      addToLibrary: "Add to Library",
      addToLibraryHint: "Adds this source manga to your mobile library.",
      backToSource: "Back to source",
      chapterLoadedOne: "1 chapter loaded.",
      chapterLoadedOther: "{{count}} chapters loaded.",
      chapters: "Chapters",
      completeCount: "{{count}} complete",
      continueChapter: "Continue {{chapter}}",
      detailsNotLoaded: "Source manga details have not loaded yet.",
      inLibrary: "In library",
      installSourceBeforeDetails:
        "Install this source before opening manga details.",
      libraryOptionsDescription:
        "Manage how this manga is saved on this device.",
      libraryOptionsTitle: "Library",
      loadingDetails: "Loading manga details and chapters from the source.",
      manageCollections: "Manage collections",
      manageCollectionsHint: "Opens collection membership for this manga.",
      noChapterYet: "No chapter yet",
      noChapters: "No chapters are available from this source yet.",
      openChapter: "Open {{chapter}}",
      readActionHint: "Opens the reader at the selected chapter.",
      removeDescription:
        'Are you sure you want to remove "{{name}}" from your library?',
      removeFromLibrary: "Remove from library",
      removeFromLibraryHint: "Shows a confirmation before removing this manga.",
      removeTitle: "Remove from library?",
      sourceDetailsUnavailable: "Source details unavailable",
      startReading: "Start reading",
      updated: "Updated",
    },
    sourceBrowse: {
      activeFilterCountOne: "1 active filter",
      activeFilterCountOther: "{{count}} active filters",
      allFilters: "All {{count}} filters",
      applyFilters: "Apply",
      anyFilter: "Any",
      availableFilterCountOne: "1 available filter",
      availableFilterCountOther: "{{count}} available filters",
      baseUrl: "Base URL: {{url}}",
      browseSources: "Browse sources",
      bytesPending: "Bytes pending",
      bytesReadable: "Bytes readable",
      checkingExecutor: "Checking executor",
      clearSourceSearch: "Clear source search",
      closeFilters: "Close source filters",
      customFilter: "Custom",
      defaultFilter: "Default",
      executorCheckFailed: "The executor check failed.",
      executorPending: "Executor pending",
      executorReady: "Executor ready",
      excludeFilter: "Exclude",
      filterCountOne: "1 filter",
      filterCountOther: "{{count}} filters",
      includeFilter: "Include",
      installBeforeExecutor: "Install the source before checking the executor.",
      installBeforeOpening:
        "Install this source from Browse before opening it.",
      libraryFromSource: "Library From Source",
      listingCountOne: "1 listing",
      listingCountOther: "{{count}} listings",
      listingLoadFailed: "Could not load this listing.",
      localPackageAvailable: "Local AIX package is available.",
      loadFiltersFailed: "Could not load source filters.",
      loadHomeFailed: "Could not load source home.",
      loadMore: "Load more",
      loadingFilters: "Loading source filters.",
      loadingHome: "Loading source home sections.",
      loadingListing: "Loading manga from this listing.",
      loadingMoreListing: "Loading more manga from this listing.",
      loadingMoreSourceResults: "Loading more source results.",
      mangaCountOne: "1 manga",
      mangaCountOther: "{{count}} manga",
      metadataStatus: "Metadata",
      multiLanguage: "Multi-Language",
      nativeExecutor: "Native executor",
      noLibraryMangaUsesSource: "No library manga uses this source yet.",
      noLinkedMangaMatches: "No linked manga matches this search.",
      noLiveMatches: "No live matches from this source.",
      noLocalPackage: "No local AIX package",
      noMangaLoadedFromListing: "No manga loaded from this listing yet.",
      noPackageListings: "This source does not expose package listings.",
      noSourceHome: "No source home sections are available.",
      notFilter: "Not {{option}}",
      sourceOperationTimedOut: "The source took too long to respond.",
      openAllFilters: "Open all source filters",
      openHomeFilter: "Apply {{title}} filter",
      openLink: "Open {{title}}",
      openLinkFailed: "Could not open link",
      openLinkFailedDetail: "This source link could not be opened.",
      openListing: "Open {{title}} listing",
      openManga: "Open {{title}}",
      selectFeaturedManga: "Show featured manga {{title}}",
      operationAixPackageCached:
        "Cached locally. Manifest metadata will be extracted on reinstall.",
      operationAixPackageCachedMetadata:
        "Cached locally with manifest metadata extracted.",
      operationAixPackageMissing:
        "Package bytes are not cached on this device.",
      operationAixPackageTitle: "AIX Package",
      operationBrowseListingsDetail:
        "Static listing tabs are ready; fetching listing results still needs the native runtime.",
      operationBrowseListingsTitle: "Browse Listings",
      operationChaptersDetail:
        "Calls getChapterList and maps source chapters into the local reader model.",
      operationChaptersTitle: "Chapters",
      operationHomeSectionsDetail:
        "Home layouts are dynamic Aidoku exports and need the native Aidoku runtime.",
      operationHomeSectionsTitle: "Home Sections",
      operationImageRequestsDetail:
        "Calls modifyImageRequest and optional page image processing before rendering pages.",
      operationImageRequestsTitle: "Image Requests",
      operationInstallPackageDetail:
        "Install and cache the source package before this can be used.",
      operationLiveSearchDetail:
        "Calls getSearchMangaList with query, page, and filter state.",
      operationLiveSearchTitle: "Live Search",
      operationMangaDetailsDetail:
        "Calls getMangaDetails before importing or refreshing a title.",
      operationMangaDetailsTitle: "Manga Details",
      operationMetadataExecutableMissing:
        "Package metadata is available, but executable source code is missing.",
      operationNativeCompatibleDetail:
        "Source executor is ready for this operation.",
      operationNoStaticMetadata:
        "No static metadata was found. The native runtime must ask the source directly.",
      operationPageListDetail:
        "Calls getPageList for a selected manga and chapter.",
      operationPageListTitle: "Page List",
      operationSearchFiltersDetail:
        "Static filters are ready; applying them to source search still needs the native runtime.",
      operationSearchFiltersTitle: "Search Filters",
      operationSettingsSchemaDetail:
        "Static source settings can be rendered before the native runtime is executable.",
      operationSettingsSchemaTitle: "Settings Schema",
      packageCached: "Package cached",
      packageCapabilities: "Package Capabilities",
      packageMissing: "Package missing",
      packageReady: "Package ready",
      packageStatus: "Package",
      readablePackageBytes:
        "Readable AIX bytes are ready for a native runtime session.",
      refreshSource: "Refresh source",
      refreshSourceHint: "Reloads this source's home, listings, and metadata.",
      resetFilters: "Reset",
      runtime: "Runtime",
      runtimeBridge: "Runtime bridge",
      runtimeOperations: "Runtime Operations",
      searchOrChooseFilters: "Search this source or choose filters.",
      searchLinkedManga: "Search linked manga",
      searchSource: "Search Source",
      searchSourceHint: "Opens search within this source.",
      searchSourcePlaceholder: "Search this source",
      searchThisSource: "Searching this source.",
      selectListingToBrowse: "Select a listing to browse this source.",
      selectedFilterCount: "{{count}} selected",
      settingCountOne: "1 setting",
      settingCountOther: "{{count}} settings",
      sortAscending: "ascending",
      sortDescending: "descending",
      source: "Source",
      sourceFilterCycleHint:
        "Press to cycle between include, exclude, and any.",
      sourceFilterExcludeHint: "Long press to exclude this option.",
      sourceFilterOption: "{{filter}}: {{option}}",
      sourceFilterTextInput: "{{filter}} text filter",
      sourceFilters: "Source filters",
      sourceFiltersIdle: "Source filters have not loaded yet.",
      sourceHome: "Home",
      sourceHomeIdle: "Source home has not loaded yet.",
      sourceListings: "Source Listings",
      sourceNotInstalled: "Source not installed",
      sourceSearchFailed: "Source search failed.",
      sourceUnavailable: "Source unavailable",
      unsupportedStatus: "Unsupported",
      validatingExecutor:
        "Validating cached package bytes and loading the source executor.",
      waitingForSettings:
        "Waiting for saved source settings before checking the executor.",
      wasmReady: "WASM ready",
      wasmUnknown: "WASM unknown",
      webExecutor: "Web executor",
      webExecutorReady: "AIX bytes loaded through the Expo web Aidoku runtime.",
      nativeExecutorReady:
        "Package bytes loaded through the native source executor bridge.",
    },
    reader: {
      bookPairing: "Book-style pairing",
      chapterAccessibility: "{{direction}} chapter: {{chapter}}",
      closePlugin: "Close reader plugin",
      currentChapter: "Current",
      description: "Reading direction, scrolling, and page layout",
      disabled: "Disabled",
      dualReadTargetAccessibility: "Dual-read {{source}}: {{detail}}",
      dualReadOverlayUnavailableTitle: "Unavailable for this chapter.",
      dualReadOverlayUnavailableHint: "Open Dual Read... to realign chapters.",
      dualReadDialogTitle: "Dual Read",
      dualReadDialogDescription: "Choose a paired source and chapter pairing.",
      dualReadDialogNoLinkedSources: "No linked sources found for this manga.",
      dualReadDialogSecondarySource: "Paired source",
      dualReadDialogPrimaryChapter: "Current chapter",
      dualReadDialogSecondaryChapter: "Paired chapter",
      dualReadDialogLoadingChapters: "Loading chapters...",
      dualReadDialogChooseChapter: "Choose a chapter",
      dualReadDialogEnable: "Enable Dual Read",
      dualReadDialogDisable: "Disable Dual Read",
      dualReadDialogCancel: "Cancel",
      dualReadFabLabel: "Dual Read",
      dualReadPopoverNoLinkedSources: "No linked sources found.",
      dualReadPopoverLinkSecondary: "Link another source to enable Dual Read.",
      dualReadPopoverSecondaryLabel: "Paired",
      dualReadPopoverChapterPair: "Chapter: {{primary}} <-> {{secondary}}",
      dualReadPopoverUnpaired: "Unpaired for this chapter",
      dualReadPopoverLoadingPairing: "Loading chapter pairing...",
      enabled: "Enabled",
      hideControls: "Hide reader controls",
      loadingChapterState: "Loading chapter state.",
      loadingPages: "Loading pages from the source package.",
      rtl: "RTL",
      ltr: "LTR",
      lockedChapter: "Locked chapter",
      mangaPairing: "Manga-style pairing",
      markComplete: "Mark complete",
      markedComplete: "Marked complete",
      matchingChapter: "Matching chapters.",
      narrowPageWidth: "Narrow page width",
      nextChapter: "Next chapter",
      nextPage: "Next page",
      nextSpread: "Next spread",
      noChapter: "No chapter",
      noNextChapter: "No next chapter",
      noPreviousChapter: "No previous chapter",
      openPlugin: "Open {{name}} reader plugin",
      pageCountOne: "1 page",
      pageCountOther: "{{count}} pages",
      pageFallback: "Page {{page}}",
      pageImageFailed: "Image failed to load",
      pageImageLoading: "Loading image",
      processPageImages: "Process source images",
      processPageImagesDescription:
        "Run source image processors for descrambled pages when available.",
      pageLoadedOne: "1 page loaded.",
      pageLoadedOther: "{{count}} pages loaded.",
      pageLoadingUnavailable: "Page loading unavailable",
      pageTitle: "Page {{page}}",
      pageValue: "Page {{page}} of {{total}}",
      pageWidth: "Page width",
      pageWidthValue: "{{percent}}% page width",
      pluginAllLanguages: "All Languages",
      pluginAutoDetect: "Auto Detect",
      pluginConfidence: "Confidence",
      pluginDualReadDebug: "Debug",
      pluginDualReadDebugOverlay: "Debug overlay",
      pluginDualReadDebugOverlayDescription: "Show the debug overlay.",
      pluginDualReadDescription:
        "Read the same manga from two sources with quick switching.",
      pluginDualReadName: "Dual Read",
      pluginJapaneseLearningAllLanguages: "Enable For All Languages",
      pluginJapaneseLearningAllLanguagesDescription:
        "Show text detection for non-Japanese manga too",
      pluginJapaneseLearningAlternativeReadings: "Alternative readings",
      pluginJapaneseLearningAskSentence: "Ask about sentence",
      pluginJapaneseLearningAskWords: "Ask about words",
      pluginJapaneseLearningAutoDetectText: "Auto Detect Text",
      pluginJapaneseLearningAutoDetectTextDescription:
        "Automatically detect text on visible pages",
      pluginJapaneseLearningAskWord: "Ask",
      pluginJapaneseLearningBaseForm: "Base form",
      pluginJapaneseLearningCopied: "Copied.",
      pluginJapaneseLearningCopyFailed: "Copy failed.",
      pluginJapaneseLearningCopySentence: "Copy sentence",
      pluginJapaneseLearningCopySelection: "Copy",
      pluginJapaneseLearningCopyWord: "Copy",
      pluginJapaneseLearningDescription:
        "Detect sentences in manga pages and learn Japanese with Nemu.",
      pluginJapaneseLearningDetectText: "Detect text",
      pluginJapaneseLearningDetectingText: "Detecting text",
      pluginJapaneseLearningDetection: "Detection",
      pluginJapaneseLearningDragWordsHint:
        "Drag across words to select a phrase.",
      pluginJapaneseLearningAnalyzingSentence: "Analyzing sentence",
      pluginJapaneseLearningGrammar: "Grammar",
      pluginJapaneseLearningGrammarFailed: "Grammar parsing failed.",
      pluginJapaneseLearningGrammarHint:
        "Select a detected line to parse words, readings, and grammar.",
      pluginJapaneseLearningListen: "Listen",
      pluginJapaneseLearningNoText: "No text was detected on this page.",
      pluginJapaneseLearningNoImage: "The current page has no image to scan.",
      pluginJapaneseLearningNoMeanings: "No dictionary meanings found.",
      pluginJapaneseLearningNormalizingSentence: "Normalizing sentence",
      pluginJapaneseLearningMinimumConfidence: "Minimum Confidence",
      pluginJapaneseLearningMinimumConfidenceDescription:
        "Only show detections with confidence above this threshold",
      pluginJapaneseLearningName: "Japanese Learning",
      pluginJapaneseLearningChatFailed: "Nemu Chat failed.",
      pluginJapaneseLearningChatEmptyTitle: "Hi! I'm Nemu",
      pluginJapaneseLearningChatEmptyDescription:
        "Tap any speech bubble and ask me about words, grammar, or meaning!",
      pluginJapaneseLearningChatHint:
        "Ask Nemu to explain the current page after text is detected.",
      pluginJapaneseLearningChatInputPlaceholder: "Enter message",
      pluginJapaneseLearningChatRead: "Read",
      pluginJapaneseLearningChatResponse: "Nemu Chat",
      pluginJapaneseLearningChatSend: "Send",
      pluginJapaneseLearningChatThinking: "Nemu is thinking",
      pluginJapaneseLearningChatToday: "Today",
      pluginJapaneseLearningLineAccessibility: "Select detected line: {{text}}",
      pluginJapaneseLearningNemuChat: "Nemu Chat",
      pluginJapaneseLearningOcrFailed: "Text detection failed.",
      pluginJapaneseLearningResponseLanguage: "Response Language",
      pluginJapaneseLearningResponseLanguageDescription:
        "Choose preferred language for Nemu's responses",
      pluginJapaneseLearningSelectedText: "Selected text",
      pluginJapaneseLearningSignInRequired: "Sign in to use Nemu Chat.",
      pluginJapaneseLearningSourceText: "Source text",
      pluginJapaneseLearningStopListening: "Stop",
      pluginJapaneseLearningStructure: "Structure",
      pluginJapaneseLearningTapTokenHint: "Tap a word to see details.",
      pluginJapaneseLearningTokenAccessibility: "Select word: {{word}}",
      pluginJapaneseLearningTranscript: "Transcript",
      pluginJapaneseLearningTranscriptHint:
        "Run text detection on the current page to show a transcript.",
      pluginJapaneseLearningTranscriptTooLong:
        "This page is too long for full-page audio. Use sentence listening instead.",
      pluginJapaneseLearningTtsFailed: "Couldn't generate audio.",
      pluginJapaneseLearningTtsLoading: "Generating audio",
      pluginResponse: "Response",
      pluginValueAppLanguage: "App language",
      pluginValueDefault: "Default",
      pluginValueOff: "Off",
      pluginValueOn: "On",
      pluginValueSimpleJapanese: "Simple Japanese",
      previousChapter: "Previous chapter",
      previousPage: "Previous page",
      previousSpread: "Previous spread",
      progressNotCompleted: "Progress not completed",
      readerPagesIdle: "Reader pages have not loaded yet.",
      savingProgress: "Saving progress",
      scroll: "Scroll",
      showControls: "Show reader controls",
      sourcePackageUnavailable:
        "The installed source package for this chapter is unavailable.",
      spread: "Spread",
      stageAccessibility: "{{page}}. {{action}}",
      title: "Reader",
      twoPageView: "Two-page view",
      widenPageWidth: "Widen page width",
    },
    search: {
      addCompatibleSource: "Add a compatible source before searching.",
      addSource: "Add Source",
      all: "All",
      allSources: "All sources",
      allSourcesSelectionHint: "Toggles selection for all sources.",
      browseSources: "Browse sources",
      enterQuery: "Enter a title, author, tag, or source manga id.",
      enterSearchTerm: "Enter a search term to find manga in selected sources",
      liveSearchCachedStatus:
        "{{cached}} of {{installed}} selected packages are cached and ready for live source search.",
      liveSearchFailed: "Live source search failed.",
      liveSearchNeedsCache:
        "Select or install a source with a cached package before live source search can run.",
      liveSourceResults: "Live Source Results",
      liveSourceSearch: "Live source search",
      noLiveMatches: "No live matches from this source.",
      noSavedMatches: "No saved matches from this source.",
      noSavedMatchesForQuery: 'No saved manga matched "{{query}}".',
      noSources: "No sources",
      noSourcesDescription: "Add a source to start searching for manga",
      noSourcesInstalled: "No sources installed",
      noSourcesSelected: "No sources selected",
      noSourcesSelectedDescription: "Select at least one source to search.",
      openItem: "Open {{title}}",
      preferencesFailed: "Search preferences failed",
      preferencesLoadFailedDetail:
        "Search source selection could not be loaded on this device.",
      preferencesSaveFailedDetail:
        "Search source selection could not be saved on this device.",
      searchInstalledSources: "Search installed sources",
      searchForManga: "Search for manga",
      searchUnavailable: "Search unavailable",
      searching: "Searching...",
      searchingSelectedSources: "Searching selected source packages.",
      selectedOfSources: "{{selected}} of {{total}} sources",
      sourceAccessibility: "{{name}} source",
      sourceSelectionHint:
        "Toggles this source. Double press or long press to search only this source.",
      updated: "Updated",
    },
    settings: {
      aboutNemuBeforeBrand: "About ",
      aboutNemuAfterBrand: "",
      aboutNemuLabel: "About nemu",
      addSource: "Add Source",
      appearance: "Appearance",
      appearanceDescription: "Language, theme, and metadata preferences",
      agent: "Nemu Agent",
      agentBuiltInEnabled: "Built-in Nemu Agent Enabled",
      agentConnected: "Connected",
      agentDescription:
        "Built-in native networking is unavailable in this build",
      agentNotRunning: "Unavailable",
      agentProtectedCompatibility: "Protected-site compatibility",
      agentReady: "Native networking is ready for protected sources",
      agentRefresh: "Refresh",
      agentRefreshStatus: "Refresh Nemu Agent status",
      agentVersion: "v{{version}}",
      browseSource: "Browse {{name}}",
      builtIn: "Built-in",
      clearAllData: "Clear All Data",
      clearAllDataConfirm:
        "Remove local settings, installed sources, library entries, progress, and cached packages from this device?",
      clearAllDataDescription:
        "Reset local settings, sources, library, progress, and cache",
      clearAllLocalData: "Clear All",
      clearCache: "Clear Cache",
      clearCacheConfirm:
        "Remove cached source packages from this device? Installed sources and library entries remain.",
      clearCacheDescription:
        "Remove cached source packages without changing your library",
      clearCloudData: "Also delete cloud data",
      clearCloudDataDescription:
        "Remove synced library, collections, and progress from your Nemu account.",
      cloudSync: "Cloud Sync",
      cloudSyncCheckingSession: "Checking cloud session",
      cloudSyncContinueWith: "Continue with {{provider}}",
      cloudSyncDescription: "Account and local library data",
      cloudSyncEraseAcknowledgement:
        "I understand this permanently deletes synced data from this account and this device.",
      cloudSyncEraseConfirm: "Erase Synced Data",
      cloudSyncEraseDescription:
        "This permanently deletes the synced library, collections, reading progress, and installed-source list from every device using this account. Local-only registries and source preferences remain.",
      cloudSyncEraseFailed: "Synced data could not be erased.",
      cloudSyncEraseTitle: "Erase synced data everywhere?",
      cloudSyncKeepData: "Keep Data",
      cloudSyncKeepDataDescription:
        "Keep your local library and reading progress on this device.",
      cloudSyncRemoveData: "Remove Data",
      cloudSyncRemoveDataDescription:
        "Remove account library data from this device after signing out.",
      cloudSyncRecovery: "Recovery Options",
      cloudSyncRetry: "Retry Sync",
      cloudSyncRetryFailed: "Cloud sync retry failed.",
      cloudSyncStillTooLarge:
        "The account snapshot is still above this version's safe limit.",
      cloudSyncPaused: "Cloud sync paused",
      cloudSyncPausedDetail:
        "This account exceeds Nemu's safe snapshot limit. The incomplete snapshot was not applied; local and cloud data were not deleted.",
      cloudSyncStorageUnavailable: "Cloud sync storage unavailable",
      cloudSyncStorageUnavailableDetail:
        "Cloud sync is paused because Nemu could not read this account's local storage. No cloud snapshot was applied.",
      cloudSyncSignInFailed: "Sign in failed.",
      cloudSyncSignInPrompt:
        "Sign in to sync your library and reading progress across devices.",
      cloudSyncSignedIn: "Signed in",
      cloudSyncSignOut: "Sign Out",
      cloudSyncSignOutFailed: "Sign out failed.",
      cloudSyncSignOutLabel: "Sign out of cloud sync",
      cloudSyncSignOutMessage: "Choose what should stay on this device.",
      cloudSyncSignOutTitle: "Sign Out",
      cloudSyncUnavailable: "Unavailable",
      cloudSyncUnavailableDetail: "Cloud sync is unavailable in this build.",
      dataManagement: "Data Management",
      dataManagementDescription: "Cache and local device storage",
      editReaderPluginSettings: "Edit settings for {{name}}",
      editSourceSettings: "Edit settings for {{name}}",
      importSource: "Import AIX",
      importingSource: "Importing...",
      installedSources: "Installed Sources",
      installedSourcesDescription:
        "Source packages, runtime settings, and local uninstall",
      language: "Language",
      languageDescription: "Prioritize sources for your app language",
      languageEnglish: "English",
      languageChinese: "中文",
      languageJapanese: "日本語",
      loading: "Loading settings",
      loadingReaderPlugins: "Loading reader plugins",
      metadataAutoFollows: "Auto follows Language ({{language}})",
      metadataFixedDescription: "Choose a fixed metadata locale",
      metadataLanguage: "Metadata Language",
      metadataLanguageAuto: "Auto",
      metadataLanguageDescription:
        "Language for titles, authors, descriptions, and tags when using Smart Match",
      noPluginSettings: "This plugin has no configurable settings.",
      noSourceManagement: "Install a source from Browse to manage it here.",
      plugins: "Plugins",
      pluginsDescription: "Reader tools and learning extensions",
      pluginSettings: "Plugin Settings",
      readerPluginSwitch: "Enable {{name}}",
      refreshSources: "Refresh sources",
      refreshSourcesHint:
        "Reloads installed sources and available source metadata.",
      selectSettingOption: "{{title}}: {{option}}",
      settingCountOne: "{{count}} setting",
      settingCountOther: "{{count}} settings",
      sourceSettingsDecrease: "Decrease {{name}}",
      sourceSettingsDefaultTitle: "Source Settings",
      sourceSettingsDefaultValue: "Default",
      sourceSettingsEmpty: "No settings are available for this source.",
      sourceSettingsIncrease: "Increase {{name}}",
      sourceSettingsLoadingValues: "Loading values",
      sourceSettingsNone: "None",
      sourceSettingsOff: "Off",
      sourceSettingsOn: "On",
      sourceSettingsSelectOption: "Set {{name}} to {{option}}",
      sourceSettingsReset: "Reset",
      sourceSettingsResetLabel: "Reset settings",
      sourceSettingsSavedOnDevice: "Saved on this device",
      sourceSettingsTitle: "{{name}} Settings",
      sourceSettingsToggleOption: "Toggle {{option}} for {{name}}",
      sourceSettingsBack: "Back to source settings",
      sourceSettingsOpenPage: "Open {{name}}",
      sourceSettingsLogin: "Log in",
      sourceSettingsLoginUnavailable: "Unavailable",
      sourceSettingsLoginUnsupported:
        "This login method is not available in the mobile app yet.",
      sourceSettingsLogout: "Log out",
      sourceSettingsLoginInProgress: "Logging in…",
      sourceSettingsLoggedIn: "Logged in",
      sourceSettingsLoggedOut: "Not signed in",
      sourceSettingsLoginFailed: "Login failed",
      sourceSettingsUsername: "Username",
      sourceSettingsEmail: "Email",
      sourceSettingsPassword: "Password",
      sourceSettingsCookies: "Cookies",
      sourceSettingsCookiesPlaceholder: "session=abc; locale=en",
      sourceSettingsLocalStorage: "Local storage",
      sourceSettingsLocalStoragePlaceholder: '{"token":"value"}',
      sourceSettingsLocalStorageKeys: "Allowed keys: {{keys}}",
      sourceSettingsBasicLoginInstructions:
        "Enter the credentials for this source. They are saved only after the source accepts them.",
      sourceSettingsWebLoginInstructions:
        "Paste cookies and, when requested, declared local-storage values as JSON.",
      sourceSettingsSubmitLogin: "Continue",
      sourceSettingsInvalidLoginForm: "Enter valid login information.",
      sourceSettingsCredentialsRejected: "The source rejected these credentials.",
      sourceSettingsRuntimeUnavailable:
        "This source action is unavailable in the current mobile runtime.",
      sourceSettingsInvalidLink: "This source provided an unsafe or invalid link.",
      sourceSettingsOpenLink: "Open",
      sourceSettingsRunAction: "Run",
      sourceSettingsActionFailed: "The source action could not be completed.",
      sourceSettingsActionConfirm: "Continue with this source action?",
      sourceSettingsLogoutConfirm:
        "Remove the saved credentials for this source from this device?",
      sourceOAuthErrors: {
        "missing-login-url": "This source does not provide a login URL.",
        "invalid-login-url": "This source provided an unsafe login URL.",
        "browser-open-failed": "The login page could not be opened.",
        "unsupported-platform": "Source login is unavailable on this platform.",
        cancelled: "Login was cancelled.",
        "oversized-callback": "The source returned too much login data.",
        "state-mismatch": "The login response did not match this attempt.",
        "invalid-callback":
          "The login response did not contain a valid token or code.",
        "missing-token-endpoint":
          "This source does not provide a token endpoint.",
        "token-request-failed": "The token request could not be completed.",
        "token-exchange-failed": "The source rejected the token exchange.",
        "oversized-token": "The source returned too much token data.",
      },
      sourceUpdated: "Updated source: {{name}}",
      sourcesUpdated: "Updated {{count}} sources: {{names}}",
      settingsActionFailed: "Settings action failed",
      settingsActionFailedDetail:
        "The settings change could not be saved on this device.",
      theme: "Theme",
      themeDark: "Dark",
      themeDescription: "Follow system or choose a fixed Nemu theme",
      themeLight: "Light",
      themeSystem: "System",
      uninstallSource: "Uninstall Source",
      uninstallSourceConfirm:
        "Remove {{name}} from this device? Library entries remain, but live source browsing requires installing it again.",
      uninstallSourceNamed: "Uninstall {{name}}",
    },
    sourceManager: {
      active: "Active",
      added: "Added",
      addPanelIdle: "Search unlinked installed sources for this title.",
      addSourceResult: "Add {{title}} from {{source}}",
      allInstalledLinked:
        "Every installed source is already linked to this title.",
      backToSourceList: "Back to source list",
      close: "Close source manager",
      everyTitleNeedsSource:
        "At least one source must stay linked to keep this title readable.",
      librarySearchPlaceholder: "Search library title",
      likelyMatch: "likely match",
      loadingLibraryTitles: "Loading library titles.",
      manageSources: "Manage Sources",
      matchingTitles: "Matching title aliases.",
      mergeLibraryTitle: "Merge Library Title",
      mergeLibraryTitleConfirm:
        "Move sources from {{sourceTitle}} into {{targetTitle}}? The merged title will be removed from the library.",
      mergeWithTitle: "Merge with {{title}}",
      modeMerge: "Merge",
      modeSearch: "Search",
      moveDown: "Move {{name}} down",
      moveUp: "Move {{name}} up",
      noLibraryMatches: "No other library titles match this search.",
      noSourceResults: 'No source results for "{{query}}".',
      position: "Position {{position}} of {{total}}",
      previousResults: "Previous results",
      removeSource: "Remove Source",
      removeSourceConfirm:
        "Unlink {{name}} from this title? Reading progress for this source stays on device.",
      nextResults: "Next results",
      sourceActionFailed: "Source action failed",
      sourceActionFailedDetail:
        "The source change could not be saved on this device.",
      searchSourceCountOne: "Searching 1 source.",
      searchSourceCountOther: "Searching {{count}} sources.",
      searchSources: "Search sources",
      selectSource: "Select {{name}}, {{positionLabel}}",
      sourceCountOne: "{{count}} source",
      sourceCountOther: "{{count}} sources",
      sourceSearchPlaceholder: "Search source title",
      subtitle: "Reorder or unlink sources for this title",
      dragToReorder: "Drag to reorder",
    },
  },
  zh: {
    about: {
      appIconLabel: "nemu 应用图标",
      close: "关闭关于 nemu",
      description:
        "nemu 是一款跨平台漫画阅读器，让您能够从各种来源发现和阅读漫画。",
      openSourceCode: "在 GitHub 打开 Nemu 源代码",
      sourceCode: "源代码",
      tagline: "魔法の漫画リーダー",
    },
    common: {
      add: "添加",
      back: "返回",
      cancel: "取消",
      clear: "清除",
      collapse: "收起",
      create: "创建",
      done: "完成",
      dragHandle: "拖动手柄",
      externalLinkFailed: "无法打开链接",
      externalLinkFailedDetail: "无法在此设备上打开此链接。",
      expand: "展开",
      goHome: "前往书库",
      install: "安装",
      merge: "合并",
      moreTags: "还有 {{count}} 个标签",
      new: "新",
      openSettings: "打开设置",
      pageNotFound: "页面不存在",
      pageNotFoundDescription: "此链接没有对应的 Nemu 页面。",
      remove: "移除",
      retry: "重试",
      save: "保存",
      sourceCloudflareBlocked: "检测到 Cloudflare 保护",
      sourceCloudflareBlockedDescription:
        "此源需要 Cloudflare 验证，但当前移动端构建无法安全提供该验证。",
      sourceError: "源错误",
      sourceNetworkError: "网络错误",
      sourceNetworkErrorDescription:
        "Nemu 无法连接到此源。请检查网络连接后重试。",
      sourceRuntimeUnavailable: "源运行时不可用",
      sourceRuntimeUnavailableDescription:
        "当前构建还不能运行已安装的源包。当前 React Native JavaScript 引擎未提供这些源所需的完整 WebAssembly 运行时。",
      uninstall: "卸载",
      agentVerify: "验证",
      agentSheetOpening: "正在启动 Nemu Agent…",
      agentSheetWaiting: "正在等待 Cloudflare…",
      agentSheetCaptcha: "请在弹出的验证提示中完成验证以继续。",
      agentSheetSuccess: "挑战已解决，正在继续…",
      agentSheetFailed: "无法自动解决挑战。请重试，或在设置中查看 Nemu Agent。",
      agentSheetUnavailable:
        "移动端目前无法安全提供 Cloudflare 验证。该源在提供直连端点前无法打开。",
    },
    errorBoundary: {
      copied: "错误日志已复制。",
      copyFailed: "无法复制错误日志。",
      copyLog: "复制日志",
      description:
        "Nemu 遇到了意外的移动端运行时错误。请重试此页面，或复制日志用于调试。",
      detailsLabel: "详情",
      messageLabel: "消息",
      retry: "重试",
      retrying: "正在重试...",
      title: "出现了一些问题",
    },
    chapter: {
      chapterX: "第{{n}}章",
      chX: "第{{n}}章",
      untitled: "无标题",
      volumeX: "第{{n}}卷",
      volX: "第{{n}}卷",
    },
    browse: {
      adult: "成人",
      adultSourcesSwitch: "成人源",
      addSource: "添加源",
      addSourcesDescription: "从可用源仓库中选择一个源",
      addSources: "添加源",
      allLanguages: "全部",
      chooseLanguages: "选择语言...",
      installAnyway: "仍然安装",
      installingSource: "正在安装源",
      installingSourceDescription: "正在安装 {{name}}...",
      installingSourceDescriptionGeneric: "请稍候，源正在安装中。",
      installSourceNamed: "安装 {{name}}",
      installed: "已安装",
      languageFilter: "源语言",
      languageFilterOption: "显示{{language}}源",
      languagesSelected: "已选 {{count}} 种语言",
      noSources: "未安装源",
      noSourcesDescription: "添加源以开始浏览漫画",
      noSourceResults: "没有源符合这些筛选条件。",
      otherLanguages: "其他",
      refreshSources: "刷新源",
      refreshSourcesHint: "重新加载源仓库和安装状态。",
      removeSourceNamed: "移除 {{name}}",
      searchRegistries: "搜索源仓库",
      sourcesUnavailable: "源不可用",
      warningAuthentication:
        "此源需要登录或身份验证。在当前版本的 Nemu 中可能无法正常使用。",
      warningCloudflare:
        "此源有 Cloudflare 保护。Nemu 会使用内置原生网络能力，并在需要时显示验证窗口。",
      warningTitle: "提示",
    },
    nav: {
      library: "书架",
      browse: "浏览",
      search: "搜索",
      settings: "设置",
    },
    welcome: {
      confirmSkip: "确定跳过？",
      description: "你的漫画阅读伴侣",
      doneDescription: "开始探索已安装源中的漫画吧。",
      doneTitle: "设置完成！",
      getStarted: "开始使用",
      installAndContinue: "安装并继续",
      installing: "安装中...",
      intro:
        "跨平台漫画阅读器，让你可以发现和阅读互联网上各种来源的漫画。\n让我们来完成初始设置吧！",
      languageDescription: "选择你偏好的应用语言",
      languageTitle: "选择语言",
      loadingSources: "正在加载源...",
      next: "下一步",
      noRecommendedSources: "当前无法加载推荐源。你之后可以在浏览中添加源。",
      selectRecommendedSource: "选择 {{name}}",
      skip: "跳过",
      sourceAlreadyInstalled: "已安装",
      sourceInstallFailed: "源安装失败",
      sourceInstallFailedDetail: "无法在此设备上安装所选源。",
      sourcesDescription: "选择要安装的推荐漫画源",
      sourcesHint: "你可以随时在设置中添加更多源。",
      sourcesTitle: "添加源",
      startReading: "开始阅读",
      syncHint: "登录以在所有设备间同步你的书架和阅读进度。",
      title: "欢迎使用 nemu",
      titlePrefix: "欢迎使用 ",
    },
    library: {
      addCompatibleSource: "添加兼容源后即可开始构建您的 Nemu 书架。",
      addBooksAction: "添加书籍",
      addBooksDescription: "选择哪些书架作品属于 {{name}}。",
      addBooksEmpty: "书架还是空的。先添加漫画，再填充这个收藏。",
      addBooksHint: "打开此收藏的书籍选择。",
      addBooksTitle: "添加书籍",
      addSource: "添加源",
      all: "全部",
      closeAddBooks: "关闭添加书籍",
      collectionEmpty: "此收藏为空。添加书籍来填充这个书架。",
      collectionChipAccessibility: "{{name}}，{{countLabel}}",
      collectionMangaAccessibility: "{{title}}，{{sourceCountLabel}}",
      collectionName: "收藏名称",
      collectionNotFoundDescription: "这个收藏可能已经被删除。",
      collectionNotFoundTitle: "未找到收藏",
      collectionActionFailed: "收藏操作失败",
      collectionActionFailedDetail: "无法在此设备上保存此收藏更改。",
      createCollection: "创建收藏",
      createCollectionHint: "打开新建收藏表单。",
      manageCollection: "管理收藏",
      manageCollectionHint: "打开此收藏的重命名、成员和移除控件。",
      manageCollections: "管理收藏",
      manageCollectionsHint: "打开收藏管理控件。",
      loading: "正在加载书架",
      mangaSourceCountOne: "{{count}} 个源",
      mangaSourceCountOther: "{{count}} 个源",
      new: "新建",
      newCollection: "新建收藏",
      newCollectionDescription: "为专注的阅读列表创建一个书架。",
      noSources: "未安装源",
      noSourcesDescription: "添加源以开始发现和阅读漫画",
      empty: "书架是空的",
      emptyDescription: "搜索漫画并添加到书架",
      progressCaughtUp: "已读到最新",
      progressUnread: "未读",
      removeCollection: "移除收藏",
      removeCollectionConfirm: "要移除此收藏吗？书架中的漫画会保留。",
      removeCollectionNamed: "移除 {{name}}",
      renameCollection: "重命名收藏",
      renameCollectionAccessibility: "重命名 {{name}}",
      renameDescription: "在整个书架中更新此收藏。",
      startSearching: "开始搜索",
      updated: "已更新",
      updateMembershipDescription: "点按书籍以添加或移除。",
      unavailable: "书架不可用",
    },
    collectionMembership: {
      bookCountOne: "{{count}} 本书",
      bookCountOther: "{{count}} 本书",
      close: "关闭收藏",
      collectionName: "收藏名称",
      collectionRowAccessibility: "{{name}}，{{countLabel}}",
      createCollection: "创建收藏",
      loading: "正在加载收藏",
      newCollection: "新建收藏",
      newCollectionDescription: "创建一个书架，并为此标题选中它。",
      noCollections: "还没有收藏。请在下方创建一个。",
      saving: "正在保存",
      saveWithCount: "保存 {{count}} 项",
      subtitle: "为此标题选择书架",
      subtitleForTitle: "为 {{title}} 选择书架",
      title: "收藏",
    },
    metadataEditor: {
      applyMatch: "应用 {{provider}} 元数据匹配",
      applyMatchField: "应用来自 {{provider}} 的{{field}}",
      authors: "作者",
      authorsPlaceholder: "作者 A, 作者 B",
      close: "关闭元数据编辑器",
      cover: "封面",
      coverDescription: "粘贴图片 URL，以在此设备上替换源封面。",
      coverPermissionDenied: "需要照片图库权限才能选择封面。",
      coverPickFailed: "无法选择该图片。",
      coverPreview: "封面预览",
      coverSelected: "所选图片会在保存时上传。",
      coverTitle: "封面覆盖",
      coverUploadFailed: "封面上传失败。",
      coverUploadUnavailable: "上传封面前需要先配置云同步。",
      coverUrl: "封面 URL",
      coverUrlPlaceholder: "https://...",
      chooseCoverImage: "选择图片",
      description: "简介",
      matchFailed: "元数据匹配失败。",
      matchSearchPlaceholder: "搜索标题",
      matchSubtitle: "AniList / MAL / MangaUpdates",
      matchTitle: "元数据匹配",
      noMatches: "未找到元数据匹配。",
      reset: "重置",
      resetField: "重置{{field}}",
      saving: "正在保存",
      searchMatches: "搜索元数据匹配",
      selectStatus: "将状态设为{{status}}",
      sourceFetchAccessibility: "从 {{source}} 获取元数据",
      sourceFetchFailed: "获取源元数据失败。",
      sourceFetchSubtitle: "保存前，从已链接源刷新草稿字段。",
      sourceFetchTitle: "从源获取",
      status: "状态",
      statusCancelled: "已取消",
      statusCompleted: "已完结",
      statusHiatus: "休刊",
      statusOngoing: "连载中",
      statusUnknown: "未知",
      subtitle: "此标题的本地覆盖信息",
      tags: "标签",
      tagsPlaceholder: "动作, 剧情",
      title: "编辑元数据",
      titleField: "标题",
      uploadingCover: "正在上传",
    },
    mangaDetail: {
      actionFailed: "漫画操作失败",
      actionFailedDetail: "无法在此设备上保存此漫画更改。",
      backToLibrary: "返回书架",
      chapterCountLiveOne: "{{count}} 个实时章节",
      chapterCountLiveOther: "{{count}} 个实时章节",
      chapterCountLocalOne: "{{count}} 个本地章节",
      chapterCountLocalOther: "{{count}} 个本地章节",
      chapters: "章节",
      completeCount: "{{count}} 个已完成",
      continueChapter: "继续 {{chapter}}",
      editMetadata: "编辑元数据",
      fullRefreshNotStarted: "尚未开始完整章节刷新。",
      loadingManga: "正在加载漫画",
      manga: "漫画",
      mangaNotFound: "未找到漫画",
      mangaUnavailable: "漫画不可用",
      missingSourceLinksDescription:
        "此书架条目没有已链接源。请从此设备移除后，再从源重新添加。",
      missingSourceLinksTitle: "缺少源链接",
      manageCollections: "管理收藏",
      manageCollectionsHint: "打开此漫画的收藏归属管理。",
      manageSources: "管理源",
      manageSourcesHint: "打开此漫画的已链接源管理。",
      nativeRuntimeRequired: "需要原生运行时执行，才能获取此源的完整章节列表。",
      noChapters: "暂无章节",
      noChapterYet: "暂无章节",
      openChapter: "打开 {{chapter}}",
      readActionHint: "在选中的章节打开阅读器。",
      refreshChapterCountOne: "已刷新 1 个章节。",
      refreshChapterCountOther: "已刷新 {{count}} 个章节。",
      refreshingSource: "正在从源刷新漫画详情和章节。",
      removeDescription: "已链接源的阅读进度会保留在设备上。",
      removeFromLibrary: "从书架移除",
      removeFromLibraryHint: "移除此漫画前显示确认。",
      removeTitle: "要从书架移除吗？",
      selectSource: "选择 {{source}}",
      selectSourceRefresh: "选择一个源以刷新章节。",
      sourceCountOne: "{{count}} 个源",
      sourceCountOther: "{{count}} 个源",
      sourcePackageUnavailable: "此漫画的已安装源包不可用。",
      sources: "源",
      startReading: "开始阅读",
      titleNotAvailable: "此标题不在本地移动书架中。",
      updated: "已更新",
    },
    sourceManga: {
      actionFailed: "源漫画操作失败",
      actionFailedDetail: "无法在此设备上保存此源漫画更改。",
      addAndStartReading: "加入并开始阅读",
      addAndStartReadingHint: "保存到书架并打开第一个可用章节。",
      addOptionsDescription: "选择如何在此设备上保存这部漫画。",
      addOptionsTitle: "加入书架",
      addToLibrary: "加入书架",
      addToLibraryHint: "将此源漫画添加到移动书架。",
      backToSource: "返回源",
      chapterLoadedOne: "已加载 1 个章节。",
      chapterLoadedOther: "已加载 {{count}} 个章节。",
      chapters: "章节",
      completeCount: "{{count}} 个已完成",
      continueChapter: "继续 {{chapter}}",
      detailsNotLoaded: "尚未加载源漫画详情。",
      inLibrary: "已在书架",
      installSourceBeforeDetails: "请先安装此源，再打开漫画详情。",
      libraryOptionsDescription: "管理这部漫画在此设备上的保存方式。",
      libraryOptionsTitle: "书架",
      loadingDetails: "正在从源加载漫画详情和章节。",
      manageCollections: "管理收藏",
      manageCollectionsHint: "打开此漫画的收藏归属管理。",
      noChapterYet: "暂无章节",
      noChapters: "此源暂时没有可用章节。",
      openChapter: "打开 {{chapter}}",
      readActionHint: "在选中的章节打开阅读器。",
      removeDescription: "确定要从书架移除「{{name}}」吗？",
      removeFromLibrary: "从书架移除",
      removeFromLibraryHint: "移除此漫画前显示确认。",
      removeTitle: "要从书架移除吗？",
      sourceDetailsUnavailable: "源详情不可用",
      startReading: "开始阅读",
      updated: "已更新",
    },
    sourceBrowse: {
      activeFilterCountOne: "1 个筛选已启用",
      activeFilterCountOther: "{{count}} 个筛选已启用",
      allFilters: "全部 {{count}} 个筛选",
      applyFilters: "应用",
      anyFilter: "任意",
      availableFilterCountOne: "1 个可用筛选",
      availableFilterCountOther: "{{count}} 个可用筛选",
      baseUrl: "基础 URL：{{url}}",
      browseSources: "浏览源",
      bytesPending: "字节待就绪",
      bytesReadable: "字节可读",
      checkingExecutor: "正在检查执行器",
      clearSourceSearch: "清除源搜索",
      closeFilters: "关闭源筛选",
      customFilter: "自定义",
      defaultFilter: "默认",
      executorCheckFailed: "执行器检查失败。",
      executorPending: "执行器待就绪",
      executorReady: "执行器已就绪",
      excludeFilter: "排除",
      filterCountOne: "1 个筛选",
      filterCountOther: "{{count}} 个筛选",
      includeFilter: "包含",
      installBeforeExecutor: "请先安装源，再检查执行器。",
      installBeforeOpening: "请先从浏览页安装此源，再打开它。",
      libraryFromSource: "来自此源的书架",
      listingCountOne: "1 个列表",
      listingCountOther: "{{count}} 个列表",
      listingLoadFailed: "无法加载此列表。",
      localPackageAvailable: "本地 AIX 包可用。",
      loadFiltersFailed: "无法加载源筛选。",
      loadHomeFailed: "无法加载源首页。",
      loadMore: "加载更多",
      loadingFilters: "正在加载源筛选。",
      loadingHome: "正在加载源首页区块。",
      loadingListing: "正在从此列表加载漫画。",
      loadingMoreListing: "正在从此列表加载更多漫画。",
      loadingMoreSourceResults: "正在加载更多源结果。",
      mangaCountOne: "1 部漫画",
      mangaCountOther: "{{count}} 部漫画",
      metadataStatus: "元数据",
      multiLanguage: "多语言",
      nativeExecutor: "原生执行器",
      noLibraryMangaUsesSource: "书架中还没有漫画使用此源。",
      noLinkedMangaMatches: "没有已链接漫画匹配此搜索。",
      noLiveMatches: "此源没有实时匹配结果。",
      noLocalPackage: "没有本地 AIX 包",
      noMangaLoadedFromListing: "此列表尚未加载漫画。",
      noPackageListings: "此源未公开包列表。",
      noSourceHome: "没有可用的源首页区块。",
      notFilter: "不含 {{option}}",
      sourceOperationTimedOut: "此源响应超时。",
      openAllFilters: "打开全部源筛选",
      openHomeFilter: "应用 {{title}} 筛选",
      openLink: "打开 {{title}}",
      openLinkFailed: "无法打开链接",
      openLinkFailedDetail: "无法打开此源链接。",
      openListing: "打开 {{title}} 列表",
      openManga: "打开 {{title}}",
      selectFeaturedManga: "显示精选漫画 {{title}}",
      operationAixPackageCached: "已在本地缓存。重新安装时会提取清单元数据。",
      operationAixPackageCachedMetadata: "已在本地缓存，并已提取清单元数据。",
      operationAixPackageMissing: "包字节未缓存在此设备上。",
      operationAixPackageTitle: "AIX 包",
      operationBrowseListingsDetail:
        "静态列表标签页已就绪；获取列表结果仍需要原生运行时。",
      operationBrowseListingsTitle: "浏览列表",
      operationChaptersDetail:
        "调用 getChapterList，并将源章节映射到本地阅读器模型。",
      operationChaptersTitle: "章节",
      operationHomeSectionsDetail:
        "首页布局是动态 Aidoku 导出，需要原生 Aidoku 运行时。",
      operationHomeSectionsTitle: "首页区块",
      operationImageRequestsDetail:
        "渲染页面前调用 modifyImageRequest 和可选页面图片处理。",
      operationImageRequestsTitle: "图片请求",
      operationInstallPackageDetail: "使用前请先安装并缓存源包。",
      operationLiveSearchDetail:
        "调用 getSearchMangaList，并传入查询、页码和筛选状态。",
      operationLiveSearchTitle: "实时搜索",
      operationMangaDetailsDetail: "导入或刷新标题前调用 getMangaDetails。",
      operationMangaDetailsTitle: "漫画详情",
      operationMetadataExecutableMissing: "包元数据可用，但缺少可执行源代码。",
      operationNativeCompatibleDetail: "源执行器已准备好执行此操作。",
      operationNoStaticMetadata: "未找到静态元数据。原生运行时必须直接询问源。",
      operationPageListDetail: "为所选漫画和章节调用 getPageList。",
      operationPageListTitle: "页面列表",
      operationSearchFiltersDetail:
        "静态筛选已就绪；将它们应用到源搜索仍需要原生运行时。",
      operationSearchFiltersTitle: "搜索筛选",
      operationSettingsSchemaDetail: "静态源设置可在原生运行时可执行前渲染。",
      operationSettingsSchemaTitle: "设置架构",
      packageCached: "包已缓存",
      packageCapabilities: "包能力",
      packageMissing: "包缺失",
      packageReady: "包已就绪",
      packageStatus: "包",
      readablePackageBytes: "可读 AIX 字节已准备好用于原生运行时会话。",
      refreshSource: "刷新源",
      refreshSourceHint: "重新加载此源的首页、列表和元数据。",
      resetFilters: "重置",
      runtime: "运行时",
      runtimeBridge: "运行时桥接",
      runtimeOperations: "运行时操作",
      searchOrChooseFilters: "搜索此源或选择筛选。",
      searchLinkedManga: "搜索已链接漫画",
      searchSource: "搜索源",
      searchSourceHint: "打开此源内搜索。",
      searchSourcePlaceholder: "搜索此源",
      searchThisSource: "正在搜索此源。",
      selectListingToBrowse: "选择列表以浏览此源。",
      selectedFilterCount: "已选择 {{count}} 项",
      settingCountOne: "1 项设置",
      settingCountOther: "{{count}} 项设置",
      sortAscending: "升序",
      sortDescending: "降序",
      source: "源",
      sourceFilterCycleHint: "按下可在包含、排除和任意之间切换。",
      sourceFilterExcludeHint: "长按以排除此选项。",
      sourceFilterOption: "{{filter}}：{{option}}",
      sourceFilterTextInput: "{{filter}} 文本筛选",
      sourceFilters: "源筛选",
      sourceFiltersIdle: "源筛选尚未加载。",
      sourceHome: "首页",
      sourceHomeIdle: "源首页尚未加载。",
      sourceListings: "源列表",
      sourceNotInstalled: "未安装源",
      sourceSearchFailed: "源搜索失败。",
      sourceUnavailable: "源不可用",
      unsupportedStatus: "不支持",
      validatingExecutor: "正在验证缓存的包字节并加载源执行器。",
      waitingForSettings: "正在等待已保存源设置，然后检查执行器。",
      wasmReady: "WASM 已就绪",
      wasmUnknown: "WASM 未知",
      webExecutor: "Web 执行器",
      webExecutorReady: "AIX 字节已通过 Expo Web Aidoku 运行时加载。",
      nativeExecutorReady: "包字节已通过原生源执行器桥接加载。",
    },
    reader: {
      bookPairing: "书籍式配对",
      chapterAccessibility: "{{direction}}：{{chapter}}",
      closePlugin: "关闭阅读器插件",
      currentChapter: "当前",
      description: "阅读方向、滚动和页面布局",
      disabled: "已停用",
      dualReadTargetAccessibility: "双语阅读 {{source}}：{{detail}}",
      dualReadOverlayUnavailableTitle: "此章节不可用。",
      dualReadOverlayUnavailableHint: "打开双语阅读… 重新对齐章节。",
      dualReadDialogTitle: "双语阅读",
      dualReadDialogDescription: "选择配对的源与章节配对。",
      dualReadDialogNoLinkedSources: "未找到此漫画的关联源。",
      dualReadDialogSecondarySource: "配对源",
      dualReadDialogPrimaryChapter: "当前章节",
      dualReadDialogSecondaryChapter: "配对章节",
      dualReadDialogLoadingChapters: "正在加载章节…",
      dualReadDialogChooseChapter: "选择一个章节",
      dualReadDialogEnable: "启用双语阅读",
      dualReadDialogDisable: "关闭双语阅读",
      dualReadDialogCancel: "取消",
      dualReadFabLabel: "双语阅读",
      dualReadPopoverNoLinkedSources: "未找到关联源。",
      dualReadPopoverLinkSecondary: "关联另一个源以启用双语阅读。",
      dualReadPopoverSecondaryLabel: "已配对",
      dualReadPopoverChapterPair: "章节：{{primary}} <-> {{secondary}}",
      dualReadPopoverUnpaired: "此章节未配对",
      dualReadPopoverLoadingPairing: "正在加载章节配对…",
      enabled: "已启用",
      hideControls: "隐藏阅读器控制",
      loadingChapterState: "正在加载章节状态。",
      loadingPages: "正在从源包加载页面。",
      rtl: "右至左",
      ltr: "左至右",
      lockedChapter: "已锁定章节",
      mangaPairing: "漫画式配对",
      markComplete: "标记完成",
      markedComplete: "已标记完成",
      matchingChapter: "正在匹配章节。",
      narrowPageWidth: "缩小页面宽度",
      nextChapter: "下一章",
      nextPage: "下一页",
      nextSpread: "下一组双页",
      noChapter: "没有章节",
      noNextChapter: "没有下一章",
      noPreviousChapter: "没有上一章",
      openPlugin: "打开 {{name}} 阅读器插件",
      pageCountOne: "1 页",
      pageCountOther: "{{count}} 页",
      pageFallback: "第 {{page}} 页",
      pageImageFailed: "图片加载失败",
      pageImageLoading: "正在加载图片",
      processPageImages: "处理源图片",
      processPageImagesDescription: "可用时使用源图片处理器还原打乱的页面。",
      pageLoadedOne: "已加载 1 页。",
      pageLoadedOther: "已加载 {{count}} 页。",
      pageLoadingUnavailable: "页面加载不可用",
      pageTitle: "第 {{page}} 页",
      pageValue: "第 {{page}} 页，共 {{total}} 页",
      pageWidth: "页面宽度",
      pageWidthValue: "{{percent}}% 页面宽度",
      pluginAllLanguages: "所有语言",
      pluginAutoDetect: "自动检测",
      pluginConfidence: "置信度",
      pluginDualReadDebug: "调试",
      pluginDualReadDebugOverlay: "调试浮层",
      pluginDualReadDebugOverlayDescription: "显示调试浮层。",
      pluginDualReadDescription: "在两个源之间快速切换阅读同一漫画。",
      pluginDualReadName: "双语阅读",
      pluginJapaneseLearningAllLanguages: "对所有语言启用",
      pluginJapaneseLearningAllLanguagesDescription:
        "也为非日语漫画显示文字检测",
      pluginJapaneseLearningAlternativeReadings: "其他读法",
      pluginJapaneseLearningAskSentence: "提问这个句子",
      pluginJapaneseLearningAskWords: "提问这些词语",
      pluginJapaneseLearningAutoDetectText: "自动检测文字",
      pluginJapaneseLearningAutoDetectTextDescription:
        "自动检测可见页面上的文字",
      pluginJapaneseLearningAskWord: "提问",
      pluginJapaneseLearningBaseForm: "基本形",
      pluginJapaneseLearningCopied: "已复制。",
      pluginJapaneseLearningCopyFailed: "复制失败。",
      pluginJapaneseLearningCopySentence: "复制句子",
      pluginJapaneseLearningCopySelection: "复制",
      pluginJapaneseLearningCopyWord: "复制",
      pluginJapaneseLearningDescription:
        "检测漫画页面中的句子，并与 Nemu 一起学习日语。",
      pluginJapaneseLearningDetectText: "检测文字",
      pluginJapaneseLearningDetectingText: "正在检测文字",
      pluginJapaneseLearningDetection: "检测",
      pluginJapaneseLearningDragWordsHint: "拖过多个词语可选择短语。",
      pluginJapaneseLearningAnalyzingSentence: "正在分析句子",
      pluginJapaneseLearningGrammar: "语法",
      pluginJapaneseLearningGrammarFailed: "语法解析失败。",
      pluginJapaneseLearningGrammarHint:
        "选择检测到的文本行，解析词语、读音和语法。",
      pluginJapaneseLearningListen: "朗读",
      pluginJapaneseLearningNoText: "此页面未检测到文字。",
      pluginJapaneseLearningNoImage: "当前页面没有可扫描的图片。",
      pluginJapaneseLearningNoMeanings: "未找到词典释义。",
      pluginJapaneseLearningNormalizingSentence: "正在规范化句子",
      pluginJapaneseLearningMinimumConfidence: "最低置信度",
      pluginJapaneseLearningMinimumConfidenceDescription:
        "仅显示置信度高于此阈值的检测结果",
      pluginJapaneseLearningName: "日语学习",
      pluginJapaneseLearningChatFailed: "Nemu Chat 失败。",
      pluginJapaneseLearningChatEmptyTitle: "嗨！我是 Nemu",
      pluginJapaneseLearningChatEmptyDescription:
        "点击漫画对话框，问我关于词汇、语法或意思的问题吧！",
      pluginJapaneseLearningChatHint: "检测文字后，让 Nemu 解释当前页面。",
      pluginJapaneseLearningChatInputPlaceholder: "输入消息",
      pluginJapaneseLearningChatRead: "已读",
      pluginJapaneseLearningChatResponse: "Nemu Chat",
      pluginJapaneseLearningChatSend: "发送",
      pluginJapaneseLearningChatThinking: "Nemu 正在思考",
      pluginJapaneseLearningChatToday: "今天",
      pluginJapaneseLearningLineAccessibility: "选择检测到的文本行：{{text}}",
      pluginJapaneseLearningNemuChat: "Nemu Chat",
      pluginJapaneseLearningOcrFailed: "文字检测失败。",
      pluginJapaneseLearningResponseLanguage: "回复语言",
      pluginJapaneseLearningResponseLanguageDescription:
        "选择 Nemu 回复时使用的首选语言",
      pluginJapaneseLearningSelectedText: "已选文本",
      pluginJapaneseLearningSignInRequired: "登录后可使用 Nemu Chat。",
      pluginJapaneseLearningSourceText: "源文字",
      pluginJapaneseLearningStopListening: "停止",
      pluginJapaneseLearningStructure: "结构",
      pluginJapaneseLearningTapTokenHint: "点按词语查看详情。",
      pluginJapaneseLearningTokenAccessibility: "选择词语：{{word}}",
      pluginJapaneseLearningTranscript: "转写文本",
      pluginJapaneseLearningTranscriptHint:
        "对当前页面运行文字检测以显示转写文本。",
      pluginJapaneseLearningTranscriptTooLong:
        "此页面过长，无法生成整页音频。请改用句子朗读。",
      pluginJapaneseLearningTtsFailed: "无法生成音频。",
      pluginJapaneseLearningTtsLoading: "正在生成音频",
      pluginResponse: "回复",
      pluginValueAppLanguage: "应用语言",
      pluginValueDefault: "默认",
      pluginValueOff: "关闭",
      pluginValueOn: "开启",
      pluginValueSimpleJapanese: "简明日语",
      previousChapter: "上一章",
      previousPage: "上一页",
      previousSpread: "上一组双页",
      progressNotCompleted: "进度未完成",
      readerPagesIdle: "阅读器页面尚未加载。",
      savingProgress: "正在保存进度",
      scroll: "滚动",
      showControls: "显示阅读器控制",
      sourcePackageUnavailable: "此章节的已安装源包不可用。",
      spread: "双页",
      stageAccessibility: "{{page}}。{{action}}",
      title: "阅读器",
      twoPageView: "双页视图",
      widenPageWidth: "扩大页面宽度",
    },
    search: {
      addCompatibleSource: "请先添加兼容源再搜索。",
      addSource: "添加源",
      all: "全部",
      allSources: "所有源",
      allSourcesSelectionHint: "切换所有源的选择。",
      browseSources: "浏览源",
      enterQuery: "输入标题、作者、标签或源漫画 ID。",
      enterSearchTerm: "输入搜索词以在所选源中查找漫画",
      liveSearchCachedStatus:
        "已缓存 {{cached}} / {{installed}} 个已选源包，可用于实时源搜索。",
      liveSearchFailed: "实时源搜索失败。",
      liveSearchNeedsCache: "请先选择或安装带缓存包的源，才能运行实时源搜索。",
      liveSourceResults: "实时源结果",
      liveSourceSearch: "实时源搜索",
      noLiveMatches: "此源没有实时匹配结果。",
      noSavedMatches: "此源没有已保存的匹配结果。",
      noSavedMatchesForQuery: "没有已保存漫画匹配“{{query}}”。",
      noSources: "无源",
      noSourcesDescription: "添加源以开始搜索漫画",
      noSourcesInstalled: "未安装源",
      noSourcesSelected: "未选择源",
      noSourcesSelectedDescription: "至少选择一个源进行搜索。",
      openItem: "打开 {{title}}",
      preferencesFailed: "搜索偏好设置失败",
      preferencesLoadFailedDetail: "无法在此设备上加载搜索源选择。",
      preferencesSaveFailedDetail: "无法在此设备上保存搜索源选择。",
      searchInstalledSources: "搜索已安装源",
      searchForManga: "搜索漫画",
      searchUnavailable: "搜索不可用",
      searching: "搜索中...",
      searchingSelectedSources: "正在搜索选中的源包。",
      selectedOfSources: "已选择 {{total}} 个源中的 {{selected}} 个",
      sourceAccessibility: "{{name}} 源",
      sourceSelectionHint: "切换此源。双击或长按仅搜索此源。",
      updated: "更新",
    },
    settings: {
      aboutNemuBeforeBrand: "关于 ",
      aboutNemuAfterBrand: "",
      aboutNemuLabel: "关于 nemu",
      addSource: "添加源",
      appearance: "外观",
      appearanceDescription: "语言、主题和元数据偏好",
      agent: "Nemu Agent",
      agentBuiltInEnabled: "内置 Nemu Agent 已启用",
      agentConnected: "已连接",
      agentDescription: "当前构建无法使用内置原生网络能力",
      agentNotRunning: "不可用",
      agentProtectedCompatibility: "受保护网站兼容性",
      agentReady: "原生网络已可用于受保护的源",
      agentRefresh: "刷新",
      agentRefreshStatus: "刷新 Nemu Agent 状态",
      agentVersion: "v{{version}}",
      browseSource: "浏览 {{name}}",
      builtIn: "内置",
      clearAllData: "清除所有数据",
      clearAllDataConfirm:
        "要从此设备删除本地设置、已安装源、书架条目、阅读进度和缓存包吗？",
      clearAllDataDescription: "重置本地设置、源、书架、进度和缓存",
      clearAllLocalData: "全部清除",
      clearCache: "清除缓存",
      clearCacheConfirm:
        "要从此设备移除缓存的源包吗？已安装源和书架条目会保留。",
      clearCacheDescription: "移除缓存的源包，不更改您的书架",
      clearCloudData: "同时删除云端数据",
      clearCloudDataDescription:
        "从您的 Nemu 账号移除已同步的书架、收藏和阅读进度。",
      cloudSync: "云同步",
      cloudSyncCheckingSession: "正在检查云会话",
      cloudSyncContinueWith: "通过 {{provider}} 继续",
      cloudSyncDescription: "账号和本地书架数据",
      cloudSyncEraseAcknowledgement:
        "我明白此操作会永久删除该账号云端及本机的同步数据。",
      cloudSyncEraseConfirm: "删除同步数据",
      cloudSyncEraseDescription:
        "此操作会永久删除该账号在所有设备上的同步书架、收藏、阅读进度和已安装源列表。本地源仓库和源偏好会保留。",
      cloudSyncEraseFailed: "无法删除同步数据。",
      cloudSyncEraseTitle: "要在所有设备上删除同步数据吗？",
      cloudSyncKeepData: "保留数据",
      cloudSyncKeepDataDescription: "在此设备上保留本地书架和阅读进度。",
      cloudSyncRemoveData: "移除数据",
      cloudSyncRemoveDataDescription: "退出登录后从此设备移除账号书架数据。",
      cloudSyncRecovery: "恢复选项",
      cloudSyncRetry: "重试同步",
      cloudSyncRetryFailed: "云同步重试失败。",
      cloudSyncStillTooLarge: "账号快照仍超过此版本的安全上限。",
      cloudSyncPaused: "云同步已暂停",
      cloudSyncPausedDetail:
        "该账号已超过 Nemu 的安全快照上限。未完整的快照没有被应用；本机和云端数据均未删除。",
      cloudSyncStorageUnavailable: "云同步存储不可用",
      cloudSyncStorageUnavailableDetail:
        "Nemu 无法读取该账号的本地存储，因此云同步已暂停。没有应用任何云端快照。",
      cloudSyncSignInFailed: "登录失败。",
      cloudSyncSignInPrompt: "登录后可在设备间同步书架和阅读进度。",
      cloudSyncSignedIn: "已登录",
      cloudSyncSignOut: "退出登录",
      cloudSyncSignOutFailed: "退出登录失败。",
      cloudSyncSignOutLabel: "退出云同步登录",
      cloudSyncSignOutMessage: "选择此设备上应保留的内容。",
      cloudSyncSignOutTitle: "退出登录",
      cloudSyncUnavailable: "不可用",
      cloudSyncUnavailableDetail: "此构建不支持云同步。",
      dataManagement: "数据管理",
      dataManagementDescription: "缓存和本机设备存储",
      editReaderPluginSettings: "编辑 {{name}} 的设置",
      editSourceSettings: "编辑 {{name}} 的设置",
      importSource: "导入 AIX",
      importingSource: "正在导入…",
      installedSources: "已安装源",
      installedSourcesDescription: "源包、运行时设置和本地卸载",
      language: "语言",
      languageDescription: "按应用语言优先排列源",
      languageEnglish: "English",
      languageChinese: "中文",
      languageJapanese: "日本語",
      loading: "正在加载设置",
      loadingReaderPlugins: "正在加载阅读器插件",
      metadataAutoFollows: "自动跟随语言（{{language}}）",
      metadataFixedDescription: "选择固定的元数据语言",
      metadataLanguage: "元数据语言",
      metadataLanguageAuto: "自动",
      metadataLanguageDescription: "智能匹配时标题、作者、简介和标签的语言",
      noPluginSettings: "此插件没有可配置的设置。",
      noSourceManagement: "从浏览中安装源后可在此管理。",
      plugins: "插件",
      pluginsDescription: "阅读工具和学习扩展",
      pluginSettings: "插件设置",
      readerPluginSwitch: "启用 {{name}}",
      refreshSources: "刷新源",
      refreshSourcesHint: "重新加载已安装源和可用源元数据。",
      selectSettingOption: "{{title}}：{{option}}",
      settingCountOne: "{{count}} 项设置",
      settingCountOther: "{{count}} 项设置",
      sourceSettingsDecrease: "减少 {{name}}",
      sourceSettingsDefaultTitle: "源设置",
      sourceSettingsDefaultValue: "默认",
      sourceSettingsEmpty: "此源没有可用设置。",
      sourceSettingsIncrease: "增加 {{name}}",
      sourceSettingsLoadingValues: "正在加载值",
      sourceSettingsNone: "无",
      sourceSettingsOff: "关闭",
      sourceSettingsOn: "开启",
      sourceSettingsSelectOption: "将 {{name}} 设为 {{option}}",
      sourceSettingsReset: "重置",
      sourceSettingsResetLabel: "重置设置",
      sourceSettingsSavedOnDevice: "已保存到此设备",
      sourceSettingsTitle: "{{name}} 设置",
      sourceSettingsToggleOption: "切换 {{name}} 的 {{option}}",
      sourceSettingsBack: "返回源设置",
      sourceSettingsOpenPage: "打开 {{name}}",
      sourceSettingsLogin: "登录",
      sourceSettingsLoginUnavailable: "不可用",
      sourceSettingsLoginUnsupported: "此登录方式尚未在移动端可用。",
      sourceSettingsLogout: "退出登录",
      sourceSettingsLoginInProgress: "登录中…",
      sourceSettingsLoggedIn: "已登录",
      sourceSettingsLoggedOut: "未登录",
      sourceSettingsLoginFailed: "登录失败",
      sourceSettingsUsername: "用户名",
      sourceSettingsEmail: "电子邮箱",
      sourceSettingsPassword: "密码",
      sourceSettingsCookies: "Cookie",
      sourceSettingsCookiesPlaceholder: "session=abc; locale=zh",
      sourceSettingsLocalStorage: "本地存储",
      sourceSettingsLocalStoragePlaceholder: '{"token":"值"}',
      sourceSettingsLocalStorageKeys: "允许的键：{{keys}}",
      sourceSettingsBasicLoginInstructions:
        "请输入此源的登录信息。仅在源接受后才会保存到设备。",
      sourceSettingsWebLoginInstructions:
        "请粘贴 Cookie；如源有要求，请以 JSON 填写声明的本地存储值。",
      sourceSettingsSubmitLogin: "继续",
      sourceSettingsInvalidLoginForm: "请输入有效的登录信息。",
      sourceSettingsCredentialsRejected: "此源拒绝了这些登录信息。",
      sourceSettingsRuntimeUnavailable: "当前移动端运行时无法执行此源操作。",
      sourceSettingsInvalidLink: "此源提供了不安全或无效的链接。",
      sourceSettingsOpenLink: "打开",
      sourceSettingsRunAction: "运行",
      sourceSettingsActionFailed: "无法完成此源操作。",
      sourceSettingsActionConfirm: "继续执行此源操作？",
      sourceSettingsLogoutConfirm: "从此设备移除此源已保存的登录信息？",
      sourceOAuthErrors: {
        "missing-login-url": "此源未提供登录 URL。",
        "invalid-login-url": "此源提供的登录 URL 不安全。",
        "browser-open-failed": "无法打开登录页面。",
        "unsupported-platform": "此平台无法使用源登录。",
        cancelled: "登录已取消。",
        "oversized-callback": "源返回的登录数据过大。",
        "state-mismatch": "登录响应与本次尝试不匹配。",
        "invalid-callback": "登录响应中没有有效的令牌或代码。",
        "missing-token-endpoint": "此源未提供令牌端点。",
        "token-request-failed": "无法完成令牌请求。",
        "token-exchange-failed": "源拒绝了令牌交换。",
        "oversized-token": "源返回的令牌数据过大。",
      },
      sourceUpdated: "已更新源：{{name}}",
      sourcesUpdated: "已更新 {{count}} 个源：{{names}}",
      settingsActionFailed: "设置操作失败",
      settingsActionFailedDetail: "无法在此设备上保存此设置更改。",
      theme: "主题",
      themeDark: "深色",
      themeDescription: "跟随系统或选择固定的 Nemu 主题",
      themeLight: "浅色",
      themeSystem: "跟随系统",
      uninstallSource: "卸载源",
      uninstallSourceConfirm:
        "要从此设备移除 {{name}} 吗？书架条目会保留，但实时浏览需要重新安装该源。",
      uninstallSourceNamed: "卸载 {{name}}",
    },
    sourceManager: {
      active: "当前",
      added: "已添加",
      addPanelIdle: "搜索尚未链接到此标题的已安装源。",
      addSourceResult: "从 {{source}} 添加 {{title}}",
      allInstalledLinked: "所有已安装源都已链接到此标题。",
      backToSourceList: "返回源列表",
      close: "关闭源管理",
      everyTitleNeedsSource: "至少需要保留一个源，才能继续阅读此标题。",
      librarySearchPlaceholder: "搜索书架标题",
      likelyMatch: "可能匹配",
      loadingLibraryTitles: "正在加载书架标题。",
      manageSources: "管理源",
      matchingTitles: "正在匹配标题别名。",
      mergeLibraryTitle: "合并书架标题",
      mergeLibraryTitleConfirm:
        "要将 {{sourceTitle}} 的源移动到 {{targetTitle}} 吗？合并后的标题将从书架中移除。",
      mergeWithTitle: "与 {{title}} 合并",
      modeMerge: "合并",
      modeSearch: "搜索",
      moveDown: "下移 {{name}}",
      moveUp: "上移 {{name}}",
      noLibraryMatches: "没有其他书架标题匹配此搜索。",
      noSourceResults: "没有“{{query}}”的源结果。",
      position: "第 {{position}} 个，共 {{total}} 个",
      previousResults: "上一页结果",
      removeSource: "移除源",
      removeSourceConfirm:
        "要取消链接 {{name}} 吗？此源的阅读进度会保留在设备上。",
      nextResults: "下一页结果",
      sourceActionFailed: "源操作失败",
      sourceActionFailedDetail: "无法在此设备上保存此源更改。",
      searchSourceCountOne: "正在搜索 1 个源。",
      searchSourceCountOther: "正在搜索 {{count}} 个源。",
      searchSources: "搜索源",
      selectSource: "选择 {{name}}，{{positionLabel}}",
      sourceCountOne: "{{count}} 个源",
      sourceCountOther: "{{count}} 个源",
      sourceSearchPlaceholder: "搜索源标题",
      subtitle: "重新排序或取消链接此标题的源",
      dragToReorder: "拖动以重新排序",
    },
  },
  ja: {
    about: {
      appIconLabel: "nemu アプリアイコン",
      close: "nemu についてを閉じる",
      description:
        "nemuはクロスプラットフォーム対応の漫画リーダーです。さまざまなソースから漫画を発見して読むことができます。",
      openSourceCode: "GitHub で Nemu のソースコードを開く",
      sourceCode: "ソースコード",
      tagline: "魔法の漫画リーダー",
    },
    common: {
      add: "追加",
      back: "戻る",
      cancel: "キャンセル",
      clear: "クリア",
      collapse: "折りたたむ",
      create: "作成",
      done: "完了",
      dragHandle: "ドラッグハンドル",
      externalLinkFailed: "リンクを開けませんでした",
      externalLinkFailedDetail: "このデバイスでリンクを開けませんでした。",
      expand: "展開",
      goHome: "ライブラリへ",
      install: "インストール",
      merge: "統合",
      moreTags: "他 {{count}} 件のタグ",
      new: "新規",
      openSettings: "設定を開く",
      pageNotFound: "ページが見つかりません",
      pageNotFoundDescription: "このリンクに対応する画面が Nemu にありません。",
      remove: "削除",
      retry: "再試行",
      save: "保存",
      sourceCloudflareBlocked: "Cloudflare 保護を検出",
      sourceCloudflareBlockedDescription:
        "このソースには Cloudflare 認証が必要ですが、現在のモバイルビルドでは安全に利用できません。",
      sourceError: "ソースエラー",
      sourceNetworkError: "ネットワークエラー",
      sourceNetworkErrorDescription:
        "Nemu はこのソースに接続できませんでした。接続を確認してからもう一度お試しください。",
      sourceRuntimeUnavailable: "ソースランタイムを利用できません",
      sourceRuntimeUnavailableDescription:
        "このビルドではインストール済みソースパッケージをまだ実行できません。現在の React Native JavaScript エンジンには、これらのソースが必要とする完全な WebAssembly ランタイムがありません。",
      uninstall: "アンインストール",
      agentVerify: "認証",
      agentSheetOpening: "Nemu Agent を起動しています…",
      agentSheetWaiting: "Cloudflare を待っています…",
      agentSheetCaptcha: "表示された認証プロンプトを完了して続行してください。",
      agentSheetSuccess: "チャレンジを解決しました。再開しています…",
      agentSheetFailed:
        "チャレンジを自動で解決できませんでした。再試行するか、設定で Nemu Agent を確認してください。",
      agentSheetUnavailable:
        "安全な Cloudflare 認証はモバイルでは利用できません。直接接続できるエンドポイントが提供されるまで、このソースは開けません。",
    },
    errorBoundary: {
      copied: "エラーログをコピーしました。",
      copyFailed: "エラーログをコピーできませんでした。",
      copyLog: "ログをコピー",
      description:
        "Nemu で予期しないモバイル実行時エラーが発生しました。この画面を再試行するか、ログをコピーしてデバッグしてください。",
      detailsLabel: "詳細",
      messageLabel: "メッセージ",
      retry: "再試行",
      retrying: "再試行中...",
      title: "問題が発生しました",
    },
    chapter: {
      chapterX: "第{{n}}話",
      chX: "{{n}}話",
      untitled: "無題",
      volumeX: "第{{n}}巻",
      volX: "{{n}}巻",
    },
    browse: {
      adult: "成人向け",
      adultSourcesSwitch: "成人向けソース",
      addSource: "ソースを追加",
      addSourcesDescription: "利用可能なレジストリからソースを選択",
      addSources: "ソースを追加",
      allLanguages: "すべて",
      chooseLanguages: "言語を選択...",
      installAnyway: "それでもインストール",
      installingSource: "ソースをインストール中",
      installingSourceDescription: "{{name}}をインストール中...",
      installingSourceDescriptionGeneric:
        "ソースをインストール中です。しばらくお待ちください。",
      installSourceNamed: "{{name}} をインストール",
      installed: "インストール済み",
      languageFilter: "ソース言語",
      languageFilterOption: "{{language}} のソースを表示",
      languagesSelected: "{{count}} 言語を選択中",
      noSources: "ソースがインストールされていません",
      noSourcesDescription: "ソースを追加して漫画の閲覧を始めましょう",
      noSourceResults: "この条件に一致するソースはありません。",
      otherLanguages: "その他",
      refreshSources: "ソースを更新",
      refreshSourcesHint:
        "ソースレジストリとインストール状態を再読み込みします。",
      removeSourceNamed: "{{name}} を削除",
      searchRegistries: "ソースレジストリを検索",
      sourcesUnavailable: "ソースを利用できません",
      warningAuthentication:
        "このソースはログインまたは認証が必要です。現在のバージョンの Nemu では正しく動作しない可能性があります。",
      warningCloudflare:
        "このソースには Cloudflare 保護があります。Nemu は内蔵ネイティブ通信を使用し、必要に応じて検証ウィンドウを表示します。",
      warningTitle: "注意",
    },
    nav: {
      library: "ライブラリ",
      browse: "探す",
      search: "検索",
      settings: "設定",
    },
    welcome: {
      confirmSkip: "本当にスキップしますか？",
      description: "あなたの漫画リーディングコンパニオン",
      doneDescription: "インストールしたソースから漫画を探索しましょう。",
      doneTitle: "準備完了！",
      getStarted: "始める",
      installAndContinue: "インストールして続ける",
      installing: "インストール中...",
      intro:
        "様々なインターネットソースから漫画を発見して読むことができるクロスプラットフォーム漫画リーダーです。\nセットアップを始めましょう！",
      languageDescription: "お好みのアプリ言語を選択してください",
      languageTitle: "言語を選択",
      loadingSources: "ソースを読み込み中...",
      next: "次へ",
      noRecommendedSources:
        "おすすめソースを現在読み込めません。あとで「探す」から追加できます。",
      selectRecommendedSource: "{{name}} を選択",
      skip: "スキップ",
      sourceAlreadyInstalled: "インストール済み",
      sourceInstallFailed: "ソースのインストールに失敗しました",
      sourceInstallFailedDetail:
        "選択したソースをこのデバイスにインストールできませんでした。",
      sourcesDescription: "インストールする推奨漫画ソースを選択してください",
      sourcesHint: "ソースは設定からいつでも追加できます。",
      sourcesTitle: "ソースを追加",
      startReading: "読み始める",
      syncHint:
        "サインインして、すべてのデバイスでライブラリと読書進捗を同期しましょう。",
      title: "nemuへようこそ",
      titlePrefix: "ようこそ ",
    },
    library: {
      addCompatibleSource:
        "互換ソースを追加して Nemu ライブラリを作り始めましょう。",
      addBooksAction: "本を追加",
      addBooksDescription:
        "{{name}} に含めるライブラリの本を選択してください。",
      addBooksEmpty:
        "ライブラリが空です。このコレクションに追加する前に漫画を保存してください。",
      addBooksHint: "このコレクションの本の選択を開きます。",
      addBooksTitle: "本を追加",
      addSource: "ソースを追加",
      all: "すべて",
      closeAddBooks: "本の追加を閉じる",
      collectionEmpty:
        "このコレクションは空です。本を追加して棚を埋めましょう。",
      collectionChipAccessibility: "{{name}}、{{countLabel}}",
      collectionMangaAccessibility: "{{title}}、{{sourceCountLabel}}",
      collectionName: "コレクション名",
      collectionNotFoundDescription:
        "このコレクションは削除された可能性があります。",
      collectionNotFoundTitle: "コレクションが見つかりません",
      collectionActionFailed: "コレクション操作に失敗しました",
      collectionActionFailedDetail:
        "このデバイスにコレクションの変更を保存できませんでした。",
      createCollection: "コレクションを作成",
      createCollectionHint: "新規コレクションフォームを開きます。",
      manageCollection: "コレクションを管理",
      manageCollectionHint:
        "このコレクションの名前変更、メンバー、削除コントロールを開きます。",
      manageCollections: "コレクションを管理",
      manageCollectionsHint: "コレクション管理コントロールを開きます。",
      loading: "ライブラリを読み込み中",
      mangaSourceCountOne: "{{count}} 件のソース",
      mangaSourceCountOther: "{{count}} 件のソース",
      new: "新規",
      newCollection: "新規コレクション",
      newCollectionDescription: "集中して読むリスト用の棚を作成します。",
      noSources: "ソースがインストールされていません",
      noSourcesDescription: "ソースを追加して漫画の発見と閲覧を始めましょう",
      empty: "ライブラリは空です",
      emptyDescription: "漫画を検索してライブラリに追加しましょう",
      progressCaughtUp: "最新まで読了",
      progressUnread: "未読",
      removeCollection: "コレクションを削除",
      removeCollectionConfirm:
        "このコレクションを削除しますか？ライブラリの漫画は保存されたままです。",
      removeCollectionNamed: "{{name}} を削除",
      renameCollection: "コレクション名を変更",
      renameCollectionAccessibility: "{{name}} の名前を変更",
      renameDescription: "この棚をライブラリ全体で更新します。",
      startSearching: "検索を開始",
      updated: "更新あり",
      updateMembershipDescription: "本をタップして追加または削除します。",
      unavailable: "ライブラリを利用できません",
    },
    collectionMembership: {
      bookCountOne: "{{count}} 冊",
      bookCountOther: "{{count}} 冊",
      close: "コレクションを閉じる",
      collectionName: "コレクション名",
      collectionRowAccessibility: "{{name}}、{{countLabel}}",
      createCollection: "コレクションを作成",
      loading: "コレクションを読み込み中",
      newCollection: "新規コレクション",
      newCollectionDescription: "棚を作成し、このタイトルに選択します。",
      noCollections: "コレクションはまだありません。下で作成できます。",
      saving: "保存中",
      saveWithCount: "{{count}} 件を保存",
      subtitle: "このタイトルの棚を選択",
      subtitleForTitle: "{{title}} の棚を選択",
      title: "コレクション",
    },
    metadataEditor: {
      applyMatch: "{{provider}} のメタデータ一致を適用",
      applyMatchField: "{{provider}} の{{field}}を適用",
      authors: "作者",
      authorsPlaceholder: "作者 A, 作者 B",
      close: "メタデータエディタを閉じる",
      cover: "表紙",
      coverDescription:
        "画像 URL を貼り付けると、このデバイスのソース表紙を置き換えます。",
      coverPermissionDenied:
        "表紙を選ぶには写真ライブラリへのアクセスが必要です。",
      coverPickFailed: "この画像を選択できませんでした。",
      coverPreview: "表紙プレビュー",
      coverSelected: "選択した画像は保存時にアップロードされます。",
      coverTitle: "表紙の上書き",
      coverUploadFailed: "表紙のアップロードに失敗しました。",
      coverUploadUnavailable:
        "表紙をアップロードするにはクラウド同期の設定が必要です。",
      coverUrl: "表紙 URL",
      coverUrlPlaceholder: "https://...",
      chooseCoverImage: "画像を選択",
      description: "説明",
      matchFailed: "メタデータ一致に失敗しました。",
      matchSearchPlaceholder: "タイトルを検索",
      matchSubtitle: "AniList / MAL / MangaUpdates",
      matchTitle: "メタデータ一致",
      noMatches: "メタデータ一致が見つかりませんでした。",
      reset: "リセット",
      resetField: "{{field}}をリセット",
      saving: "保存中",
      searchMatches: "メタデータ一致を検索",
      selectStatus: "状態を {{status}} に設定",
      sourceFetchAccessibility: "{{source}} からメタデータを取得",
      sourceFetchFailed: "ソースのメタデータ取得に失敗しました。",
      sourceFetchSubtitle:
        "保存前に、リンク済みソースから下書き項目を更新します。",
      sourceFetchTitle: "ソースから",
      status: "状態",
      statusCancelled: "キャンセル済み",
      statusCompleted: "完結",
      statusHiatus: "休止中",
      statusOngoing: "連載中",
      statusUnknown: "不明",
      subtitle: "このタイトルのローカル上書き",
      tags: "タグ",
      tagsPlaceholder: "アクション, ドラマ",
      title: "メタデータを編集",
      titleField: "タイトル",
      uploadingCover: "アップロード中",
    },
    mangaDetail: {
      actionFailed: "漫画の操作に失敗しました",
      actionFailedDetail: "このデバイスに漫画の変更を保存できませんでした。",
      backToLibrary: "ライブラリに戻る",
      chapterCountLiveOne: "{{count}} 件のライブチャプター",
      chapterCountLiveOther: "{{count}} 件のライブチャプター",
      chapterCountLocalOne: "{{count}} 件のローカルチャプター",
      chapterCountLocalOther: "{{count}} 件のローカルチャプター",
      chapters: "チャプター",
      completeCount: "{{count}} 件完了",
      continueChapter: "{{chapter}} から続ける",
      editMetadata: "メタデータを編集",
      fullRefreshNotStarted: "完全なチャプター更新はまだ開始されていません。",
      loadingManga: "漫画を読み込み中",
      manga: "漫画",
      mangaNotFound: "漫画が見つかりません",
      mangaUnavailable: "漫画を利用できません",
      missingSourceLinksDescription:
        "このライブラリ項目にはリンク済みソースがありません。この端末から削除して、ソースから追加し直してください。",
      missingSourceLinksTitle: "ソースリンクがありません",
      manageCollections: "コレクションを管理",
      manageCollectionsHint: "この漫画のコレクション所属を開きます。",
      manageSources: "ソースを管理",
      manageSourcesHint: "この漫画にリンクされたソース管理を開きます。",
      nativeRuntimeRequired:
        "このソースの完全なチャプター一覧を取得するには、ネイティブランタイム実行が必要です。",
      noChapters: "話なし",
      noChapterYet: "まだチャプターがありません",
      openChapter: "{{chapter}} を開く",
      readActionHint: "選択したチャプターをリーダーで開きます。",
      refreshChapterCountOne: "1 件のチャプターを更新しました。",
      refreshChapterCountOther: "{{count}} 件のチャプターを更新しました。",
      refreshingSource: "ソースから漫画詳細とチャプターを更新しています。",
      removeDescription: "リンク済みソースの読書進捗はデバイスに残ります。",
      removeFromLibrary: "ライブラリから削除",
      removeFromLibraryHint: "この漫画を削除する前に確認を表示します。",
      removeTitle: "ライブラリから削除しますか？",
      selectSource: "{{source}} を選択",
      selectSourceRefresh: "チャプターを更新するソースを選択してください。",
      sourceCountOne: "{{count}} 件のソース",
      sourceCountOther: "{{count}} 件のソース",
      sourcePackageUnavailable:
        "この漫画のインストール済みソースパッケージを利用できません。",
      sources: "ソース",
      startReading: "読み始める",
      titleNotAvailable:
        "このタイトルはローカルのモバイルライブラリにありません。",
      updated: "更新あり",
    },
    sourceManga: {
      actionFailed: "ソース漫画の操作に失敗しました",
      actionFailedDetail:
        "このデバイスにソース漫画の変更を保存できませんでした。",
      addAndStartReading: "追加して読み始める",
      addAndStartReadingHint:
        "この漫画をライブラリに保存して、最初に読めるチャプターを開きます。",
      addOptionsDescription: "このデバイスでの保存方法を選択します。",
      addOptionsTitle: "ライブラリに追加",
      addToLibrary: "ライブラリに追加",
      addToLibraryHint: "このソース漫画をモバイルライブラリに追加します。",
      backToSource: "ソースに戻る",
      chapterLoadedOne: "1 件のチャプターを読み込みました。",
      chapterLoadedOther: "{{count}} 件のチャプターを読み込みました。",
      chapters: "チャプター",
      completeCount: "{{count}} 件完了",
      continueChapter: "{{chapter}} から続ける",
      detailsNotLoaded: "ソース漫画の詳細はまだ読み込まれていません。",
      inLibrary: "ライブラリ内",
      installSourceBeforeDetails:
        "漫画詳細を開く前に、このソースをインストールしてください。",
      libraryOptionsDescription:
        "この漫画のデバイス上での保存方法を管理します。",
      libraryOptionsTitle: "ライブラリ",
      loadingDetails: "ソースから漫画詳細とチャプターを読み込んでいます。",
      manageCollections: "コレクションを管理",
      manageCollectionsHint: "この漫画のコレクション所属を開きます。",
      noChapterYet: "まだチャプターがありません",
      noChapters: "このソースにはまだ利用可能なチャプターがありません。",
      openChapter: "{{chapter}} を開く",
      readActionHint: "選択したチャプターをリーダーで開きます。",
      removeDescription:
        "「{{name}}」をライブラリから削除してもよろしいですか？",
      removeFromLibrary: "ライブラリから削除",
      removeFromLibraryHint: "この漫画を削除する前に確認を表示します。",
      removeTitle: "ライブラリから削除しますか？",
      sourceDetailsUnavailable: "ソース詳細を利用できません",
      startReading: "読み始める",
      updated: "更新あり",
    },
    sourceBrowse: {
      activeFilterCountOne: "1 件のフィルターが有効",
      activeFilterCountOther: "{{count}} 件のフィルターが有効",
      allFilters: "{{count}} 件すべてのフィルター",
      applyFilters: "適用",
      anyFilter: "指定なし",
      availableFilterCountOne: "1 件のフィルター",
      availableFilterCountOther: "{{count}} 件のフィルター",
      baseUrl: "ベース URL: {{url}}",
      browseSources: "ソースを探す",
      bytesPending: "バイト待機中",
      bytesReadable: "バイトを読み取り可能",
      checkingExecutor: "実行環境を確認中",
      clearSourceSearch: "ソース検索をクリア",
      closeFilters: "ソースフィルターを閉じる",
      customFilter: "カスタム",
      defaultFilter: "デフォルト",
      executorCheckFailed: "実行環境の確認に失敗しました。",
      executorPending: "実行環境待機中",
      executorReady: "実行環境準備完了",
      excludeFilter: "除外",
      filterCountOne: "1 件のフィルター",
      filterCountOther: "{{count}} 件のフィルター",
      includeFilter: "含める",
      installBeforeExecutor:
        "実行環境を確認する前にソースをインストールしてください。",
      installBeforeOpening:
        "開く前に、探す画面からこのソースをインストールしてください。",
      libraryFromSource: "このソースのライブラリ",
      listingCountOne: "1 件のリスト",
      listingCountOther: "{{count}} 件のリスト",
      listingLoadFailed: "このリストを読み込めませんでした。",
      localPackageAvailable: "ローカル AIX パッケージを利用できます。",
      loadFiltersFailed: "ソースフィルターを読み込めませんでした。",
      loadHomeFailed: "ソースホームを読み込めませんでした。",
      loadMore: "さらに読み込む",
      loadingFilters: "ソースフィルターを読み込み中です。",
      loadingHome: "ソースホームのセクションを読み込み中です。",
      loadingListing: "このリストから漫画を読み込み中です。",
      loadingMoreListing: "このリストからさらに漫画を読み込み中です。",
      loadingMoreSourceResults: "ソース結果をさらに読み込み中です。",
      mangaCountOne: "1 件の漫画",
      mangaCountOther: "{{count}} 件の漫画",
      metadataStatus: "メタデータ",
      multiLanguage: "複数言語",
      nativeExecutor: "ネイティブ実行環境",
      noLibraryMangaUsesSource:
        "このソースを使うライブラリ漫画はまだありません。",
      noLinkedMangaMatches: "この検索に一致するリンク済み漫画はありません。",
      noLiveMatches: "このソースにライブ一致はありません。",
      noLocalPackage: "ローカル AIX パッケージがありません",
      noMangaLoadedFromListing:
        "このリストからはまだ漫画を読み込んでいません。",
      noPackageListings: "このソースはパッケージリストを公開していません。",
      noSourceHome: "利用可能なソースホームセクションはありません。",
      notFilter: "{{option}} を除外",
      sourceOperationTimedOut: "ソースの応答がタイムアウトしました。",
      openAllFilters: "すべてのソースフィルターを開く",
      openHomeFilter: "{{title}} フィルターを適用",
      openLink: "{{title}} を開く",
      openLinkFailed: "リンクを開けませんでした",
      openLinkFailedDetail: "このソースリンクを開けませんでした。",
      openListing: "{{title}} のリストを開く",
      openManga: "{{title}} を開く",
      selectFeaturedManga: "注目漫画 {{title}} を表示",
      operationAixPackageCached:
        "ローカルにキャッシュ済みです。再インストール時にマニフェストメタデータを抽出します。",
      operationAixPackageCachedMetadata:
        "マニフェストメタデータを抽出済みでローカルにキャッシュされています。",
      operationAixPackageMissing:
        "パッケージバイトはこのデバイスにキャッシュされていません。",
      operationAixPackageTitle: "AIX パッケージ",
      operationBrowseListingsDetail:
        "静的リストタブは準備済みです。リスト結果の取得にはまだネイティブランタイムが必要です。",
      operationBrowseListingsTitle: "ブラウズリスト",
      operationChaptersDetail:
        "getChapterList を呼び出し、ソースチャプターをローカルリーダーモデルにマッピングします。",
      operationChaptersTitle: "チャプター",
      operationHomeSectionsDetail:
        "ホームレイアウトは動的な Aidoku エクスポートで、ネイティブ Aidoku ランタイムが必要です。",
      operationHomeSectionsTitle: "ホームセクション",
      operationImageRequestsDetail:
        "ページ表示前に modifyImageRequest と任意のページ画像処理を呼び出します。",
      operationImageRequestsTitle: "画像リクエスト",
      operationInstallPackageDetail:
        "使用する前にソースパッケージをインストールしてキャッシュしてください。",
      operationLiveSearchDetail:
        "クエリ、ページ、フィルター状態を指定して getSearchMangaList を呼び出します。",
      operationLiveSearchTitle: "ライブ検索",
      operationMangaDetailsDetail:
        "インポートまたは更新の前に getMangaDetails を呼び出します。",
      operationMangaDetailsTitle: "漫画詳細",
      operationMetadataExecutableMissing:
        "パッケージメタデータは利用できますが、実行可能なソースコードがありません。",
      operationNativeCompatibleDetail:
        "ソース実行環境はこの操作を実行できます。",
      operationNoStaticMetadata:
        "静的メタデータが見つかりません。ネイティブランタイムがソースに直接問い合わせる必要があります。",
      operationPageListDetail:
        "選択した漫画とチャプターに対して getPageList を呼び出します。",
      operationPageListTitle: "ページリスト",
      operationSearchFiltersDetail:
        "静的フィルターは準備済みです。ソース検索への適用にはまだネイティブランタイムが必要です。",
      operationSearchFiltersTitle: "検索フィルター",
      operationSettingsSchemaDetail:
        "静的ソース設定は、ネイティブランタイムが実行可能になる前に表示できます。",
      operationSettingsSchemaTitle: "設定スキーマ",
      packageCached: "パッケージはキャッシュ済み",
      packageCapabilities: "パッケージ機能",
      packageMissing: "パッケージなし",
      packageReady: "パッケージ準備完了",
      packageStatus: "パッケージ",
      readablePackageBytes:
        "読み取り可能な AIX バイトはネイティブランタイムセッションで使用できます。",
      refreshSource: "ソースを更新",
      refreshSourceHint:
        "このソースのホーム、リスト、メタデータを再読み込みします。",
      resetFilters: "リセット",
      runtime: "ランタイム",
      runtimeBridge: "ランタイムブリッジ",
      runtimeOperations: "ランタイム操作",
      searchOrChooseFilters:
        "このソースを検索するか、フィルターを選択してください。",
      searchLinkedManga: "リンク済み漫画を検索",
      searchSource: "ソースを検索",
      searchSourceHint: "このソース内の検索を開きます。",
      searchSourcePlaceholder: "このソースを検索",
      searchThisSource: "このソースを検索しています。",
      selectListingToBrowse: "このソースを探すリストを選択してください。",
      selectedFilterCount: "{{count}} 件を選択中",
      settingCountOne: "1 件の設定",
      settingCountOther: "{{count}} 件の設定",
      sortAscending: "昇順",
      sortDescending: "降順",
      source: "ソース",
      sourceFilterCycleHint: "押すと、含める、除外、任意の順に切り替わります。",
      sourceFilterExcludeHint: "長押しするとこの項目を除外します。",
      sourceFilterOption: "{{filter}}: {{option}}",
      sourceFilterTextInput: "{{filter}} テキストフィルター",
      sourceFilters: "ソースフィルター",
      sourceFiltersIdle: "ソースフィルターはまだ読み込まれていません。",
      sourceHome: "ホーム",
      sourceHomeIdle: "ソースホームはまだ読み込まれていません。",
      sourceListings: "ソースリスト",
      sourceNotInstalled: "ソースがインストールされていません",
      sourceSearchFailed: "ソース検索に失敗しました。",
      sourceUnavailable: "ソースを利用できません",
      unsupportedStatus: "非対応",
      validatingExecutor:
        "キャッシュ済みパッケージのバイトを検証し、ソース実行環境を読み込んでいます。",
      waitingForSettings:
        "保存済みソース設定を待ってから実行環境を確認します。",
      wasmReady: "WASM 準備完了",
      wasmUnknown: "WASM 不明",
      webExecutor: "Web 実行環境",
      webExecutorReady:
        "AIX バイトは Expo Web Aidoku ランタイムで読み込まれました。",
      nativeExecutorReady:
        "パッケージバイトはネイティブソース実行ブリッジで読み込まれました。",
    },
    reader: {
      bookPairing: "ブック形式のペアリング",
      chapterAccessibility: "{{direction}}: {{chapter}}",
      closePlugin: "リーダープラグインを閉じる",
      currentChapter: "現在",
      description: "読書方向、スクロール、ページレイアウト",
      disabled: "無効",
      dualReadTargetAccessibility: "デュアル読み {{source}}: {{detail}}",
      dualReadOverlayUnavailableTitle: "この章では利用できません。",
      dualReadOverlayUnavailableHint:
        "バイリンガルモード… を開いて章を再調整してください。",
      dualReadDialogTitle: "バイリンガルモード",
      dualReadDialogDescription: "ペアリングするソースと章を選択してください。",
      dualReadDialogNoLinkedSources:
        "この漫画のリンク済みソースが見つかりません。",
      dualReadDialogSecondarySource: "ペアソース",
      dualReadDialogPrimaryChapter: "現在の章",
      dualReadDialogSecondaryChapter: "ペア章",
      dualReadDialogLoadingChapters: "章を読み込み中…",
      dualReadDialogChooseChapter: "章を選択",
      dualReadDialogEnable: "バイリンガルモードを有効化",
      dualReadDialogDisable: "バイリンガルモードを無効化",
      dualReadDialogCancel: "キャンセル",
      dualReadFabLabel: "バイリンガルモード",
      dualReadPopoverNoLinkedSources: "リンク済みソースが見つかりません。",
      dualReadPopoverLinkSecondary:
        "別のソースをリンクしてバイリンガルモードを有効化してください。",
      dualReadPopoverSecondaryLabel: "ペア済み",
      dualReadPopoverChapterPair: "章: {{primary}} <-> {{secondary}}",
      dualReadPopoverUnpaired: "この章はペア未設定",
      dualReadPopoverLoadingPairing: "章のペアリングを読み込み中…",
      enabled: "有効",
      hideControls: "リーダー操作を隠す",
      loadingChapterState: "チャプター状態を読み込み中です。",
      loadingPages: "ソースパッケージからページを読み込んでいます。",
      rtl: "右から左",
      ltr: "左から右",
      lockedChapter: "ロックされたチャプター",
      mangaPairing: "漫画形式のペアリング",
      markComplete: "完了にする",
      markedComplete: "完了済み",
      matchingChapter: "チャプターを照合中です。",
      narrowPageWidth: "ページ幅を狭くする",
      nextChapter: "次のチャプター",
      nextPage: "次のページ",
      nextSpread: "次の見開き",
      noChapter: "チャプターなし",
      noNextChapter: "次のチャプターはありません",
      noPreviousChapter: "前のチャプターはありません",
      openPlugin: "{{name}} リーダープラグインを開く",
      pageCountOne: "1 ページ",
      pageCountOther: "{{count}} ページ",
      pageFallback: "{{page}} ページ",
      pageImageFailed: "画像を読み込めませんでした",
      pageImageLoading: "画像を読み込み中",
      processPageImages: "ソース画像を処理",
      processPageImagesDescription:
        "利用可能な場合、ソースの画像処理でスクランブルページを補正します。",
      pageLoadedOne: "1 ページを読み込みました。",
      pageLoadedOther: "{{count}} ページを読み込みました。",
      pageLoadingUnavailable: "ページ読み込みを利用できません",
      pageTitle: "{{page}} ページ",
      pageValue: "{{total}} ページ中 {{page}} ページ",
      pageWidth: "ページ幅",
      pageWidthValue: "ページ幅 {{percent}}%",
      pluginAllLanguages: "すべての言語",
      pluginAutoDetect: "自動検出",
      pluginConfidence: "信頼度",
      pluginDualReadDebug: "デバッグ",
      pluginDualReadDebugOverlay: "デバッグオーバーレイ",
      pluginDualReadDebugOverlayDescription:
        "デバッグオーバーレイを表示します。",
      pluginDualReadDescription:
        "2つのソースを素早く切り替えて同じマンガを読めます。",
      pluginDualReadName: "バイリンガルモード",
      pluginJapaneseLearningAllLanguages: "すべての言語で有効",
      pluginJapaneseLearningAllLanguagesDescription:
        "日本語以外の漫画でもテキスト検出を表示します",
      pluginJapaneseLearningAlternativeReadings: "別の読み",
      pluginJapaneseLearningAskSentence: "この文を質問",
      pluginJapaneseLearningAskWords: "複数の単語を質問",
      pluginJapaneseLearningAutoDetectText: "テキスト自動検出",
      pluginJapaneseLearningAutoDetectTextDescription:
        "表示中のページでテキストを自動検出します",
      pluginJapaneseLearningAskWord: "質問",
      pluginJapaneseLearningBaseForm: "基本形",
      pluginJapaneseLearningCopied: "コピーしました。",
      pluginJapaneseLearningCopyFailed: "コピーできませんでした。",
      pluginJapaneseLearningCopySentence: "文をコピー",
      pluginJapaneseLearningCopySelection: "コピー",
      pluginJapaneseLearningCopyWord: "コピー",
      pluginJapaneseLearningDescription:
        "漫画ページの文を検出して、Nemu と一緒に日本語を学びましょう。",
      pluginJapaneseLearningDetectText: "テキストを検出",
      pluginJapaneseLearningDetectingText: "テキストを検出中",
      pluginJapaneseLearningDetection: "検出",
      pluginJapaneseLearningDragWordsHint:
        "単語をなぞるとフレーズを選択できます。",
      pluginJapaneseLearningAnalyzingSentence: "文を解析中",
      pluginJapaneseLearningGrammar: "文法",
      pluginJapaneseLearningGrammarFailed: "文法解析に失敗しました。",
      pluginJapaneseLearningGrammarHint:
        "検出された行を選択すると、単語・読み・文法を解析します。",
      pluginJapaneseLearningListen: "読み上げ",
      pluginJapaneseLearningNoText:
        "このページではテキストが検出されませんでした。",
      pluginJapaneseLearningNoImage:
        "現在のページにはスキャンできる画像がありません。",
      pluginJapaneseLearningNoMeanings: "辞書の意味が見つかりませんでした。",
      pluginJapaneseLearningNormalizingSentence: "文を整えています",
      pluginJapaneseLearningMinimumConfidence: "最小信頼度",
      pluginJapaneseLearningMinimumConfidenceDescription:
        "この閾値以上の信頼度の検出のみを表示します",
      pluginJapaneseLearningName: "日本語学習",
      pluginJapaneseLearningChatFailed: "Nemu Chat に失敗しました。",
      pluginJapaneseLearningChatEmptyTitle: "こんにちは！ネムだよ",
      pluginJapaneseLearningChatEmptyDescription:
        "吹き出しをタップして、単語や文法、意味について聞いてね！",
      pluginJapaneseLearningChatHint:
        "テキスト検出後、現在のページの説明を Nemu に聞けます。",
      pluginJapaneseLearningChatInputPlaceholder: "メッセージを入力",
      pluginJapaneseLearningChatRead: "既読",
      pluginJapaneseLearningChatResponse: "Nemu Chat",
      pluginJapaneseLearningChatSend: "送信",
      pluginJapaneseLearningChatThinking: "Nemu が考えています",
      pluginJapaneseLearningChatToday: "今日",
      pluginJapaneseLearningLineAccessibility: "検出された行を選択: {{text}}",
      pluginJapaneseLearningNemuChat: "Nemu Chat",
      pluginJapaneseLearningOcrFailed: "テキスト検出に失敗しました。",
      pluginJapaneseLearningResponseLanguage: "応答言語",
      pluginJapaneseLearningResponseLanguageDescription:
        "Nemu の応答に使う優先言語を選択",
      pluginJapaneseLearningSelectedText: "選択したテキスト",
      pluginJapaneseLearningSignInRequired:
        "Nemu Chat を使うにはサインインしてください。",
      pluginJapaneseLearningSourceText: "ソーステキスト",
      pluginJapaneseLearningStopListening: "停止",
      pluginJapaneseLearningStructure: "構造",
      pluginJapaneseLearningTapTokenHint:
        "単語をタップすると詳細を表示します。",
      pluginJapaneseLearningTokenAccessibility: "単語を選択: {{word}}",
      pluginJapaneseLearningTranscript: "文字起こし",
      pluginJapaneseLearningTranscriptHint:
        "現在のページでテキスト検出を実行すると文字起こしを表示します。",
      pluginJapaneseLearningTranscriptTooLong:
        "このページは全文音声には長すぎます。文ごとの再生を使ってください。",
      pluginJapaneseLearningTtsFailed: "音声を生成できませんでした。",
      pluginJapaneseLearningTtsLoading: "音声を生成中",
      pluginResponse: "応答",
      pluginValueAppLanguage: "アプリ言語",
      pluginValueDefault: "デフォルト",
      pluginValueOff: "オフ",
      pluginValueOn: "オン",
      pluginValueSimpleJapanese: "やさしい日本語",
      previousChapter: "前のチャプター",
      previousPage: "前のページ",
      previousSpread: "前の見開き",
      progressNotCompleted: "進捗は未完了",
      readerPagesIdle: "リーダーページはまだ読み込まれていません。",
      savingProgress: "進捗を保存中",
      scroll: "スクロール",
      showControls: "リーダー操作を表示",
      sourcePackageUnavailable:
        "このチャプターのインストール済みソースパッケージを利用できません。",
      spread: "見開き",
      stageAccessibility: "{{page}}。{{action}}",
      title: "リーダー",
      twoPageView: "見開き表示",
      widenPageWidth: "ページ幅を広くする",
    },
    search: {
      addCompatibleSource: "検索する前に互換ソースを追加してください。",
      addSource: "ソースを追加",
      all: "すべて",
      allSources: "すべてのソース",
      allSourcesSelectionHint: "すべてのソースの選択を切り替えます。",
      browseSources: "ソースを探す",
      enterQuery:
        "タイトル、作者、タグ、またはソース漫画 ID を入力してください。",
      enterSearchTerm: "検索語を入力して選択したソースから漫画を探しましょう",
      liveSearchCachedStatus:
        "選択中のパッケージ {{installed}} 個中 {{cached}} 個がキャッシュ済みで、ライブソース検索に利用できます。",
      liveSearchFailed: "ライブソース検索に失敗しました。",
      liveSearchNeedsCache:
        "ライブソース検索を実行する前に、キャッシュ済みパッケージのあるソースを選択またはインストールしてください。",
      liveSourceResults: "ライブソース結果",
      liveSourceSearch: "ライブソース検索",
      noLiveMatches: "このソースにライブ一致はありません。",
      noSavedMatches: "このソースに保存済みの一致はありません。",
      noSavedMatchesForQuery:
        "「{{query}}」に一致する保存済み漫画はありません。",
      noSources: "ソースなし",
      noSourcesDescription: "ソースを追加して漫画の検索を始めましょう",
      noSourcesInstalled: "ソースがインストールされていません",
      noSourcesSelected: "ソースが選択されていません",
      noSourcesSelectedDescription:
        "検索するにはソースを1つ以上選択してください。",
      openItem: "{{title}} を開く",
      preferencesFailed: "検索設定に失敗しました",
      preferencesLoadFailedDetail:
        "このデバイスで検索ソースの選択を読み込めませんでした。",
      preferencesSaveFailedDetail:
        "このデバイスに検索ソースの選択を保存できませんでした。",
      searchInstalledSources: "インストール済みソースを検索",
      searchForManga: "漫画を検索",
      searchUnavailable: "検索を利用できません",
      searching: "検索中...",
      searchingSelectedSources: "選択したソースパッケージを検索しています。",
      selectedOfSources: "{{total}} 個中 {{selected}} 個のソース",
      sourceAccessibility: "{{name}} ソース",
      sourceSelectionHint:
        "このソースの選択を切り替えます。ダブルタップまたは長押しでこのソースのみ検索します。",
      updated: "更新済み",
    },
    settings: {
      aboutNemuBeforeBrand: "",
      aboutNemuAfterBrand: " について",
      aboutNemuLabel: "nemu について",
      addSource: "ソースを追加",
      appearance: "外観",
      appearanceDescription: "言語、テーマ、メタデータ設定",
      agent: "Nemu Agent",
      agentBuiltInEnabled: "内蔵 Nemu Agent が有効",
      agentConnected: "接続済み",
      agentDescription: "このビルドでは内蔵ネイティブ通信を利用できません",
      agentNotRunning: "利用不可",
      agentProtectedCompatibility: "保護サイト互換性",
      agentReady: "ネイティブ通信で保護されたソースに対応できます",
      agentRefresh: "更新",
      agentRefreshStatus: "Nemu Agent の状態を更新",
      agentVersion: "v{{version}}",
      browseSource: "{{name}} を探す",
      builtIn: "内蔵",
      clearAllData: "すべてのデータをクリア",
      clearAllDataConfirm:
        "このデバイスからローカル設定、インストール済みソース、ライブラリエントリ、進捗、キャッシュ済みパッケージを削除しますか？",
      clearAllDataDescription:
        "ローカル設定、ソース、ライブラリ、進捗、キャッシュをリセット",
      clearAllLocalData: "すべてクリア",
      clearCache: "キャッシュをクリア",
      clearCacheConfirm:
        "このデバイスからキャッシュ済みソースパッケージを削除しますか？インストール済みソースとライブラリエントリは保持されます。",
      clearCacheDescription:
        "ライブラリを変更せずキャッシュ済みソースパッケージを削除",
      clearCloudData: "クラウドデータも削除",
      clearCloudDataDescription:
        "Nemu アカウントから同期済みライブラリ、コレクション、進捗を削除します。",
      cloudSync: "クラウド同期",
      cloudSyncCheckingSession: "クラウドセッションを確認中",
      cloudSyncContinueWith: "{{provider}} で続ける",
      cloudSyncDescription: "アカウントとローカルライブラリデータ",
      cloudSyncEraseAcknowledgement:
        "この操作で、このアカウントとこのデバイスの同期データが完全に削除されることを理解しました。",
      cloudSyncEraseConfirm: "同期データを削除",
      cloudSyncEraseDescription:
        "このアカウントを使用するすべてのデバイスから、同期済みライブラリ、コレクション、読書進捗、インストール済みソース一覧を完全に削除します。ローカルのみのレジストリとソース設定は保持されます。",
      cloudSyncEraseFailed: "同期データを削除できませんでした。",
      cloudSyncEraseTitle: "すべてのデバイスから同期データを削除しますか？",
      cloudSyncKeepData: "データを保持",
      cloudSyncKeepDataDescription:
        "このデバイスにローカルライブラリと読書進捗を保持します。",
      cloudSyncRemoveData: "データを削除",
      cloudSyncRemoveDataDescription:
        "サインアウト後、このデバイスからアカウントのライブラリデータを削除します。",
      cloudSyncRecovery: "復旧オプション",
      cloudSyncRetry: "同期を再試行",
      cloudSyncRetryFailed: "クラウド同期の再試行に失敗しました。",
      cloudSyncStillTooLarge:
        "アカウントのスナップショットは、このバージョンの安全上限を超えたままです。",
      cloudSyncPaused: "クラウド同期は一時停止中",
      cloudSyncPausedDetail:
        "このアカウントは Nemu の安全なスナップショット上限を超えています。不完全なスナップショットは適用されず、ローカルとクラウドのデータも削除されていません。",
      cloudSyncStorageUnavailable: "クラウド同期ストレージを利用できません",
      cloudSyncStorageUnavailableDetail:
        "Nemu がこのアカウントのローカルストレージを読み取れないため、クラウド同期を一時停止しました。クラウドスナップショットは適用されていません。",
      cloudSyncSignInFailed: "サインインに失敗しました。",
      cloudSyncSignInPrompt:
        "サインインすると、ライブラリと読書進捗をデバイス間で同期できます。",
      cloudSyncSignedIn: "サインイン済み",
      cloudSyncSignOut: "サインアウト",
      cloudSyncSignOutFailed: "サインアウトに失敗しました。",
      cloudSyncSignOutLabel: "クラウド同期からサインアウト",
      cloudSyncSignOutMessage: "このデバイスに残す内容を選択してください。",
      cloudSyncSignOutTitle: "サインアウト",
      cloudSyncUnavailable: "利用不可",
      cloudSyncUnavailableDetail:
        "このビルドではクラウド同期を利用できません。",
      dataManagement: "データ管理",
      dataManagementDescription: "キャッシュとローカルデバイスストレージ",
      editReaderPluginSettings: "{{name}} の設定を編集",
      editSourceSettings: "{{name}} の設定を編集",
      importSource: "AIX をインポート",
      importingSource: "インポート中…",
      installedSources: "インストール済みソース",
      installedSourcesDescription:
        "ソースパッケージ、ランタイム設定、ローカルアンインストール",
      language: "言語",
      languageDescription: "アプリ言語に合わせてソースを優先表示",
      languageEnglish: "English",
      languageChinese: "中文",
      languageJapanese: "日本語",
      loading: "設定を読み込み中",
      loadingReaderPlugins: "リーダープラグインを読み込み中",
      metadataAutoFollows: "自動は言語設定（{{language}}）に従います",
      metadataFixedDescription: "固定のメタデータ言語を選択",
      metadataLanguage: "メタデータ言語",
      metadataLanguageAuto: "自動",
      metadataLanguageDescription:
        "スマートマッチ使用時のタイトル、作者、説明、タグの言語",
      noPluginSettings: "このプラグインには設定可能な項目がありません。",
      noSourceManagement:
        "探す画面からソースをインストールするとここで管理できます。",
      plugins: "プラグイン",
      pluginsDescription: "読書ツールと学習拡張",
      pluginSettings: "プラグイン設定",
      readerPluginSwitch: "{{name}} を有効化",
      refreshSources: "ソースを更新",
      refreshSourcesHint:
        "インストール済みソースと利用可能なソースメタデータを再読み込みします。",
      selectSettingOption: "{{title}}：{{option}}",
      settingCountOne: "{{count}} 個の設定",
      settingCountOther: "{{count}} 個の設定",
      sourceSettingsDecrease: "{{name}} を減らす",
      sourceSettingsDefaultTitle: "ソース設定",
      sourceSettingsDefaultValue: "デフォルト",
      sourceSettingsEmpty: "このソースには利用可能な設定がありません。",
      sourceSettingsIncrease: "{{name}} を増やす",
      sourceSettingsLoadingValues: "値を読み込み中",
      sourceSettingsNone: "なし",
      sourceSettingsOff: "オフ",
      sourceSettingsOn: "オン",
      sourceSettingsSelectOption: "{{name}} を {{option}} に設定",
      sourceSettingsReset: "リセット",
      sourceSettingsResetLabel: "設定をリセット",
      sourceSettingsSavedOnDevice: "このデバイスに保存済み",
      sourceSettingsTitle: "{{name}} の設定",
      sourceSettingsToggleOption: "{{name}} の {{option}} を切り替え",
      sourceSettingsBack: "ソース設定に戻る",
      sourceSettingsOpenPage: "{{name}} を開く",
      sourceSettingsLogin: "ログイン",
      sourceSettingsLoginUnavailable: "利用不可",
      sourceSettingsLoginUnsupported:
        "このログイン方式はモバイルアプリではまだ利用できません。",
      sourceSettingsLogout: "ログアウト",
      sourceSettingsLoginInProgress: "ログイン中…",
      sourceSettingsLoggedIn: "ログイン済み",
      sourceSettingsLoggedOut: "未ログイン",
      sourceSettingsLoginFailed: "ログイン失敗",
      sourceSettingsUsername: "ユーザー名",
      sourceSettingsEmail: "メールアドレス",
      sourceSettingsPassword: "パスワード",
      sourceSettingsCookies: "Cookie",
      sourceSettingsCookiesPlaceholder: "session=abc; locale=ja",
      sourceSettingsLocalStorage: "ローカルストレージ",
      sourceSettingsLocalStoragePlaceholder: '{"token":"value"}',
      sourceSettingsLocalStorageKeys: "許可されたキー：{{keys}}",
      sourceSettingsBasicLoginInstructions:
        "このソースの認証情報を入力してください。ソースが受け付けた後にのみ保存されます。",
      sourceSettingsWebLoginInstructions:
        "Cookie と、必要な場合は宣言済みローカルストレージ値を JSON で貼り付けてください。",
      sourceSettingsSubmitLogin: "続ける",
      sourceSettingsInvalidLoginForm: "有効なログイン情報を入力してください。",
      sourceSettingsCredentialsRejected: "ソースがこの認証情報を拒否しました。",
      sourceSettingsRuntimeUnavailable:
        "現在のモバイルランタイムではこのソース操作を実行できません。",
      sourceSettingsInvalidLink: "ソースが安全でない、または無効なリンクを返しました。",
      sourceSettingsOpenLink: "開く",
      sourceSettingsRunAction: "実行",
      sourceSettingsActionFailed: "ソース操作を完了できませんでした。",
      sourceSettingsActionConfirm: "このソース操作を続けますか？",
      sourceSettingsLogoutConfirm:
        "このデバイスから、このソースに保存された認証情報を削除しますか？",
      sourceOAuthErrors: {
        "missing-login-url": "このソースにはログイン URL がありません。",
        "invalid-login-url":
          "このソースが指定したログイン URL は安全ではありません。",
        "browser-open-failed": "ログインページを開けませんでした。",
        "unsupported-platform":
          "このプラットフォームではソースログインを利用できません。",
        cancelled: "ログインをキャンセルしました。",
        "oversized-callback":
          "ソースから返されたログインデータが大きすぎます。",
        "state-mismatch": "ログイン応答がこの試行と一致しません。",
        "invalid-callback":
          "ログイン応答に有効なトークンまたはコードがありません。",
        "missing-token-endpoint":
          "このソースにはトークンエンドポイントがありません。",
        "token-request-failed": "トークン要求を完了できませんでした。",
        "token-exchange-failed": "ソースがトークン交換を拒否しました。",
        "oversized-token":
          "ソースから返されたトークンデータが大きすぎます。",
      },
      sourceUpdated: "ソースを更新しました: {{name}}",
      sourcesUpdated: "{{count}}個のソースを更新しました: {{names}}",
      settingsActionFailed: "設定操作に失敗しました",
      settingsActionFailedDetail:
        "このデバイスに設定変更を保存できませんでした。",
      theme: "テーマ",
      themeDark: "ダーク",
      themeDescription: "システムに従うか固定の Nemu テーマを選択",
      themeLight: "ライト",
      themeSystem: "システム",
      uninstallSource: "ソースをアンインストール",
      uninstallSourceConfirm:
        "{{name}} をこのデバイスから削除しますか？ライブラリエントリは保持されますが、ライブブラウズには再インストールが必要です。",
      uninstallSourceNamed: "{{name}} をアンインストール",
    },
    sourceManager: {
      active: "使用中",
      added: "追加済み",
      addPanelIdle:
        "このタイトルに未リンクのインストール済みソースを検索します。",
      addSourceResult: "{{source}} から {{title}} を追加",
      allInstalledLinked:
        "すべてのインストール済みソースはこのタイトルにリンク済みです。",
      backToSourceList: "ソース一覧に戻る",
      close: "ソース管理を閉じる",
      everyTitleNeedsSource:
        "このタイトルを読める状態に保つには、少なくとも1つのソースが必要です。",
      librarySearchPlaceholder: "ライブラリタイトルを検索",
      likelyMatch: "一致候補",
      loadingLibraryTitles: "ライブラリタイトルを読み込み中です。",
      manageSources: "ソースを管理",
      matchingTitles: "タイトルの別名を照合しています。",
      mergeLibraryTitle: "ライブラリタイトルを統合",
      mergeLibraryTitleConfirm:
        "{{sourceTitle}} のソースを {{targetTitle}} に移動しますか？統合されたタイトルはライブラリから削除されます。",
      mergeWithTitle: "{{title}} と統合",
      modeMerge: "統合",
      modeSearch: "検索",
      moveDown: "{{name}} を下へ移動",
      moveUp: "{{name}} を上へ移動",
      noLibraryMatches:
        "この検索に一致する他のライブラリタイトルはありません。",
      noSourceResults: "「{{query}}」のソース結果はありません。",
      position: "{{total}} 件中 {{position}} 件目",
      previousResults: "前の結果",
      removeSource: "ソースを削除",
      removeSourceConfirm:
        "{{name}} とこのタイトルのリンクを解除しますか？このソースの読書進捗はデバイスに残ります。",
      nextResults: "次の結果",
      sourceActionFailed: "ソース操作に失敗しました",
      sourceActionFailedDetail:
        "このデバイスにソースの変更を保存できませんでした。",
      searchSourceCountOne: "1 件のソースを検索しています。",
      searchSourceCountOther: "{{count}} 件のソースを検索しています。",
      searchSources: "ソースを検索",
      selectSource: "{{name}}、{{positionLabel}} を選択",
      sourceCountOne: "{{count}} 件のソース",
      sourceCountOther: "{{count}} 件のソース",
      sourceSearchPlaceholder: "ソースタイトルを検索",
      subtitle: "このタイトルのソースを並べ替え、またはリンク解除します",
      dragToReorder: "ドラッグして並べ替え",
    },
  },
};

export function getMobileStringsForAudit(): Readonly<
  Record<AppLanguage, MobileStrings>
> {
  return mobileStrings;
}

export function getMobileStrings(language: unknown): MobileStrings {
  return mobileStrings[normalizeAppLanguage(language)];
}

export function formatMobileString(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key)
      ? String(values[key])
      : match,
  );
}

export function formatMobileSettingsCount(
  count: number,
  strings: MobileStrings,
): string {
  const template =
    count === 1
      ? strings.settings.settingCountOne
      : strings.settings.settingCountOther;
  return formatMobileString(template, { count });
}
