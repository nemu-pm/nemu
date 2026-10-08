import type { AppLanguage } from "@/data/schema";
import { getMobileDesignExploreActive } from "./mobileDesignExploreSwitch";
import { withMobileDesignExploreCopy } from "./mobileI18nExploreCopy";
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
    /** Joins every pair but the last in a localized inline list. */
    listSeparator: string;
    /** Joins the final pair in a localized inline list. */
    listLastSeparator: string;
    merge: string;
    moreTags: string;
    /** Title of the sheet that lists every tag of a title; `{{count}}`. */
    tagsSheetTitle: string;
    tagsSheetHint: string;
    closeTagsSheet: string;
    moveDown: string;
    moveUp: string;
    new: string;
    openSettings: string;
    pageNotFound: string;
    pageNotFoundDescription: string;
    remove: string;
    retry: string;
    save: string;
    sourceCloudflareBlocked: string;
    sourceCloudflareBlockedDescription: string;
    sourceDisabled: string;
    sourceDisabledAction: string;
    sourceDisabledDescription: string;
    sourceError: string;
    sourceErrorDescription: string;
    sourceIncompatible: string;
    sourceIncompatibleDescription: string;
    sourceNetworkError: string;
    sourceNetworkErrorDescription: string;
    sourceRuntimeUnavailable: string;
    sourceRuntimeUnavailableDescription: string;
    sourceUnsupported: string;
    sourceUnsupportedBadge: string;
    sourceUnsupportedTachiyomiDescription: string;
    uninstall: string;
    agentVerify: string;
    agentSheetOpening: string;
    agentSheetWaiting: string;
    agentSheetCaptcha: string;
    agentSheetSuccess: string;
    agentSheetFailed: string;
    agentSheetUnavailable: string;
    agentSheetVerifying: string;
    agentSheetBrowserHint: string;
    agentSheetFailedCancelled: string;
    agentSheetFailedTimeout: string;
    agentSheetFailedBlocked: string;
    agentSheetFailedUnsolicitedHost: string;
    agentSheetFailedNotChallenged: string;
    agentSheetFailedSetup: string;
    agentSheetProtectedSite: string;
    agentSheetProtectedSource: string;
    agentStepOpen: string;
    agentStepCheck: string;
    agentStepConfirm: string;
    agentStepResume: string;
    agentStepNotNeeded: string;
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
    adultSourcesDescription: string;
    adultSourcesSwitch: string;
    addSource: string;
    addSourcesDescription: string;
    addSources: string;
    manageSources: string;
    openSourceHomepage: string;
    updateSourceToVersion: string;
    allLanguages: string;
    chooseLanguages: string;
    installAnyway: string;
    installingSource: string;
    installingSourceDescription: string;
    installingSourceDescriptionGeneric: string;
    installSourceNamed: string;
    installedSource: string;
    uninstalledSource: string;
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
    continueWithoutInstalling: string;
    description: string;
    doneDescription: string;
    doneTitle: string;
    getStarted: string;
    installAndContinue: string;
    installing: string;
    /**
     * Pre-split display lines for the welcome copy. Each locale controls its
     * own line breaks so CJK copy is not sliced on an English marker.
     * Every locale must keep the same number of lines (i18n parity test).
     */
    introLines: [string, string, string];
    languageDescription: string;
    languageTitle: string;
    loadingSources: string;
    next: string;
    noRecommendedSources: string;
    selectRecommendedSource: string;
    signIn: string;
    skip: string;
    sourceAlreadyInstalled: string;
    sourceInstallFailed: string;
    sourceInstallFailedDetail: string;
    sourcesDescription: string;
    sourcesHint: string;
    sourcesTitle: string;
    startReading: string;
    syncHint: string;
    /** Brand-aware title template. `{{brand}}` is rendered as styled "nemu". */
    title: string;
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
    progressInProgress: string;
    progressUnread: string;
    refreshLibrary: string;
    removeCollection: string;
    removeCollectionConfirm: string;
    removeCollectionNamed: string;
    renameCollection: string;
    renameCollectionAccessibility: string;
    renameDescription: string;
    startSearching: string;
    titleMenuEditCollection: string;
    titleMenuHint: string;
    titleMenuManageCollections: string;
    titleMenuNewCollection: string;
    updated: string;
    updateMembershipDescription: string;
    editCollectionTitle: string;
    collectionBooksSection: string;
    collectionBooksSelectedOne: string;
    collectionBooksSelectedOther: string;
    collectionBooksNoMatches: string;
    collectionNameSection: string;
    searchLibraryBooks: string;
    clearLibrarySearch: string;
    unavailable: string;
  };
  collectionMembership: {
    bookCountOne: string;
    bookCountOther: string;
    close: string;
    collectionName: string;
    collectionRowAccessibility: string;
    createCollection: string;
    discardConfirm: string;
    discardDescription: string;
    discardKeepEditing: string;
    discardTitle: string;
    draftFieldNewCollection: string;
    draftFieldRename: string;
    loading: string;
    newCollection: string;
    newCollectionDescription: string;
    noCollections: string;
    saving: string;
    saveWithCount: string;
    subtitle: string;
    subtitleForTitle: string;
    title: string;
    /** First row of the native sheet; opens the name alert. */
    newCollectionAction: string;
    /** Footer under the collection rows: how to rename / delete one. */
    manageRowsFooter: string;
    /** Empty list when the create action sits above it. */
    noCollectionsYet: string;
    /** Short swipe / context-menu action on a collection row. */
    renameAction: string;
  };
  metadataEditor: {
    applyMatch: string;
    applyMatchField: string;
    authors: string;
    authorsPlaceholder: string;
    close: string;
    cover: string;
    coverDescription: string;
    coverFileMissing: string;
    coverPickFailed: string;
    coverPreview: string;
    coverSelected: string;
    coverSizeUnavailable: string;
    coverTitle: string;
    coverUploadFailed: string;
    coverUploadUnavailable: string;
    coverUrl: string;
    coverUrlPlaceholder: string;
    chooseCoverImage: string;
    description: string;
    detailsTitle: string;
    resetAll: string;
    discardConfirm: string;
    discardDescription: string;
    discardKeepEditing: string;
    discardTitle: string;
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
    continueReading: string;
    editMetadata: string;
    fullRefreshNotStarted: string;
    loadingChapters: string;
    refreshFailedTitle: string;
    showingSavedChapters: string;
    sourceSlowToRespond: string;
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
    continueReading: string;
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
    filterSelectedCountOther: string;
    includeFilter: string;
    installBeforeExecutor: string;
    installBeforeOpening: string;
    installingSource: string;
    installingSourceDescription: string;
    loadSourceFailed: string;
    sourceInstallFailed: string;
    sourceInstallFailedDescription: string;
    sourceNotInRegistry: string;
    sourceNotInRegistryDescription: string;
    libraryFromSource: string;
    listingCountOne: string;
    listingCountOther: string;
    listingLoadFailed: string;
    localPackageAvailable: string;
    loadFiltersFailed: string;
    loadHomeFailed: string;
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
    noMangaInListing: string;
    noMangaLoadedFromListing: string;
    noPackageListings: string;
    noSourceHome: string;
    homeUnavailable: string;
    homeSectionEmpty: string;
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
    sourceFilterChipHint: string;
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
    unreadOnly: string;
    unsupportedStatus: string;
    validatingExecutor: string;
    waitingForSettings: string;
    wasmReady: string;
    wasmUnknown: string;
    webExecutor: string;
    webExecutorReady: string;
    nativeExecutorReady: string;
  };
  /** Web `plugin.japaneseLearning.pos` / `.conjugation`: grammar labels → localized names. */
  japaneseLearningGrammar: {
    posNames: Record<string, string>;
    conjugationNames: Record<string, string>;
  };
  reader: {
    bookPairing: string;
    /** Segmented label for book pairing: page 1 shares a spread with page 2. */
    pairingCoverPaired: string;
    /** Segmented label for manga pairing: page 1 (the cover) stands alone. */
    pairingCoverAlone: string;
    chapterAccessibility: string;
    closeSettings: string;
    closePlugin: string;
    /** Accessibility label of the vertical control rail / notebook reading console. */
    readerControls: string;
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
    dualReadDialogNoChapters: string;
    dualReadDialogChapterLoadFailed: string;
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
    fetchingPages: string;
    readingDirection: string;
    rtl: string;
    ltr: string;
    lockedChapter: string;
    chapterLockedTitle: string;
    chapterLockedDetail: string;
    mangaPairing: string;
    markComplete: string;
    markedComplete: string;
    /** Reader ⋯ menu (phone chrome, top trailing). */
    moreActions: string;
    moreActionsHint: string;
    reloadChapter: string;
    readerSettingsMenu: string;
    readerPluginsMenu: string;
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
    pageSlider: string;
    pageWidth: string;
    /** Reader settings: the secondary section below the layout controls. */
    moreSettings: string;
    pageWidthValue: string;
    longStripProgress: string;
    scrollProgress: string;
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
    pluginJapaneseLearningConjugationPath: string;
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
    pluginJapaneseLearningRecognitionEngine: string;
    pluginJapaneseLearningRecognitionEngineDescription: string;
    pluginJapaneseLearningOnlineOcrAssist: string;
    pluginJapaneseLearningOnlineOcrAssistDescription: string;
    pluginValueEngineAutomatic: string;
    pluginValueEngineOnDevice: string;
    pluginValueEngineCloud: string;
    pluginJapaneseLearningName: string;
    pluginJapaneseLearningChatFailed: string;
    pluginJapaneseLearningChatEmptyTitle: string;
    pluginJapaneseLearningChatEmptyDescription: string;
    pluginJapaneseLearningChatHint: string;
    pluginJapaneseLearningChatInputPlaceholder: string;
    pluginJapaneseLearningChatRead: string;
    pluginJapaneseLearningChatResponse: string;
    pluginJapaneseLearningChatSend: string;
    /** Composer mic (shown while the draft is empty); starts dictation. */
    pluginJapaneseLearningChatVoiceInput: string;
    /** Same mic while listening; stops dictation. */
    pluginJapaneseLearningChatStopVoiceInput: string;
    pluginJapaneseLearningChatThinking: string;
    pluginJapaneseLearningChatToday: string;
    pluginJapaneseLearningLineAccessibility: string;
    pluginJapaneseLearningNemuChat: string;
    pluginJapaneseLearningOcrFailed: string;
    pluginJapaneseLearningOcrFailedDescription: string;
    pluginJapaneseLearningOcrFailedTitle: string;
    pluginJapaneseLearningOcrUnavailableDescription: string;
    pluginJapaneseLearningOcrUnavailableTitle: string;
    pluginJapaneseLearningResponseLanguage: string;
    pluginJapaneseLearningResponseLanguageDescription: string;
    pluginJapaneseLearningSelectedText: string;
    pluginJapaneseLearningSignInRequired: string;
    pluginJapaneseLearningSignInRequiredTitle: string;
    pluginJapaneseLearningSignInRequiredDescription: string;
    pluginJapaneseLearningSignInToUse: string;
    pluginJapaneseLearningSourceText: string;
    pluginJapaneseLearningStopListening: string;
    pluginJapaneseLearningStructure: string;
    pluginJapaneseLearningTapTokenHint: string;
    pluginJapaneseLearningTokenAccessibility: string;
    pluginJapaneseLearningTokenExtendAccessibility: string;
    pluginJapaneseLearningTranscript: string;
    pluginJapaneseLearningTranscriptHint: string;
    pluginJapaneseLearningTranscriptTooLong: string;
    pluginJapaneseLearningTtsFailed: string;
    pluginJapaneseLearningTtsLoading: string;
    pluginJapaneseLearningAskAboutThisSentence: string;
    pluginJapaneseLearningAskAboutTheseWords: string;
    pluginJapaneseLearningTapAnyWordHint: string;
    pluginJapaneseLearningDragOnWordsHint: string;
    pluginJapaneseLearningExtractingText: string;
    pluginJapaneseLearningAnalyzingSentenceProgress: string;
    pluginJapaneseLearningTranscriptNoText: string;
    pluginJapaneseLearningTryAnotherRegion: string;
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
    spreadValue: string;
    stageAccessibility: string;
    title: string;
    twoPageView: string;
    widenPageWidth: string;
    // Added with the reading-loop / dismiss-trap fixes.
    endOfChapterTitle: string;
    endOfChapterNextLabel: string;
    endOfChapterNextAction: string;
    endOfChapterCaughtUpTitle: string;
    endOfChapterCaughtUpDetail: string;
    endOfChapterKeepReading: string;
    endOfChapterDismiss: string;
    errorDetailWithReason: string;
    pageImageRetry: string;
    noPagesTitle: string;
    openSourceSettings: string;
    sourceBlockedHint: string;
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
    /** Regular-width sidebar: heading of the installed-source list. */
    sidebarSources: string;
    /** Sidebar row hint: a tap searches only this source. */
    sidebarSourceHint: string;
    sidebarAllSourcesHint: string;
    /** Sidebar row status, e.g. "12 results". */
    sidebarResultCount: string;
    sidebarSearchFailed: string;
    recentSearches: string;
    clearRecentSearches: string;
    recentSearchAccessibility: string;
    /** Trailing action on a source's result section that has more results. */
    seeAll: string;
    /** One quiet line for every source that found nothing; `{{sources}}`. */
    noResultsInSources: string;
    /** Inline spinner line while sources are still searching; `{{sources}}`. */
    searchingSources: string;
    /** Last item of a collapsed source list ("A, B and 3 more"); `{{count}}`. */
    moreSourcesCount: string;
    /** Retry action on a source that could not be searched; `{{source}}`. */
    retrySourceAccessibility: string;
  };
  settings: {
    aboutNemuBeforeBrand: string;
    aboutNemuAfterBrand: string;
    aboutNemuLabel: string;
    addSource: string;
    appearance: string;
    appearanceDescription: string;
    feedbackSection: string;
    feedbackSectionDescription: string;
    readerDescriptionWithFeedback: string;
    agent: string;
    agentBuiltInEnabled: string;
    agentConnected: string;
    agentDescription: string;
    agentNotRunning: string;
    agentProtectedCompatibility: string;
    agentReady: string;
    agentVerificationUnavailable: string;
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
    storageTotal: string;
    storageCovers: string;
    storagePages: string;
    storageSourcePackages: string;
    storagePageLists: string;
    storageUnitBytes: string;
    storageUnitKilobytes: string;
    storageUnitMegabytes: string;
    storageRowCovers: string;
    storageRowPages: string;
    storageTotalLabel: string;
    storageCountImages: string;
    storageCountPages: string;
    storageCountPackages: string;
    storageCountPageLists: string;
    storageFootnote: string;
    clearCoverCache: string;
    clearPageCache: string;
    clearCoverCacheWithSize: string;
    clearPageCacheWithSize: string;
    clearAllCaches: string;
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
    cloudSyncTransportStalled: string;
    cloudSyncTransportStalledDetail: string;
    syncProgressTitle: string;
    syncProgressLibraryCountOne: string;
    syncProgressLibraryCountOther: string;
    syncProgressSourceCountOne: string;
    syncProgressSourceCountOther: string;
    syncProgressCompleted: string;
    syncProgressCompletedLibraryOnly: string;
    cloudSyncStorageUnavailable: string;
    cloudSyncStorageUnavailableDetail: string;
    cloudSyncAuthenticationNetworkUnavailable: string;
    cloudSyncAuthenticationStorageUnavailable: string;
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
    localDataCleanupTitle: string;
    localDataCleanupDescription: string;
    dataManagement: string;
    dataManagementDescription: string;
    editReaderPluginSettings: string;
    importSource: string;
    importingSource: string;
    importSourceCardTitle: string;
    importSourceCardDescription: string;
    importSourceChooseFile: string;
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
    designPreview: string;
    designPreviewHint: string;
    designPreviewFooter: string;
    experimentalDesign: string;
    designPreviewRestart: string;
    metadataLanguageDescription: string;
    noPluginSettings: string;
    noSourceManagement: string;
    plugins: string;
    pluginsDescription: string;
    pluginSettings: string;
    readerPluginSwitch: string;
    readerPluginOffFooter: string;
    readerPluginSettingEditElsewhere: string;
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
    sourceSettingsItemListOne: string;
    sourceSettingsItemListOther: string;
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
    sourcesUpdatedTitle: string;
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
    sourceDisabledBadge: string;
    toggleSourceEnabled: string;
    sourceActions: string;
    sourceDisabledToast: string;
    sourceEnabledToast: string;
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
  feedback: {
    dismiss: string;
    undo: string;
    removedFromLibrary: string;
    removedFromLibraryHint: string;
    markedAllRead: string;
    quickMenuMarkAllRead: string;
    quickMenuOpenInSource: string;
    quickMenuAddToCollection: string;
    libraryRefreshFailedTitle: string;
    libraryRefreshUnavailableSuffix: string;
    technicalDetails: string;
    catalogUnavailableTitle: string;
    catalogUnavailableDetail: string;
    hapticsFeedback: string;
    hapticsFeedbackHint: string;
    chapterCompleteFeedback: string;
    chapterCompleteFeedbackHint: string;
    loadingPageN: string;
    noMoreResults: string;
    noMoreResultsTotal: string;
    loadFailed: string;
    readerOfflineTitle: string;
    readerOfflineDetail: string;
    readerSlowSource: string;
    readerWaitingForNetwork: string;
    displayKeepAwake: string;
    displayLockPortrait: string;
    viewAllInSource: string;
  };
  /** iPhone Duo / foldable signature features (bilingual book, spine, display handoff). */
  duo: {
    bilingualLayoutLabel: string;
    bilingualSpread: string;
    bilingualSideBySide: string;
    bilingualSecondaryPageAccessibility: string;
    bilingualLoadingSecondary: string;
    bilingualNoMatchingPage: string;
    handoffOuterDisplay: string;
    handoffInnerDisplay: string;
    handoffWithPage: string;
    notebookPane: string;
    notebookPaneAutomatic: string;
    notebookPaneTrackpad: string;
    notebookPaneFilmstrip: string;
    notebookTrackpad: string;
    notebookShowFilmstrip: string;
    notebookHideFilmstrip: string;
    notebookFilmstrip: string;
    filmstripUnreadPage: string;
  };
  /** On-device Japanese dictionary pack (reader analysis + settings). */
  japaneseLearningDictionary: {
    title: string;
    checking: string;
    notDownloaded: string;
    downloaded: string;
    downloadingProgress: string;
    installing: string;
    failed: string;
    failedUsingCloud: string;
    removing: string;
    downloadNow: string;
    remove: string;
    retry: string;
    progressAccessibility: string;
    analysisDownloadFailed: string;
  };
  /** Design-explore prototypes (EXPO_PUBLIC_NEMU_DESIGN_EXPLORE). */
  designExplore: {
    continueReadingTitle: string;
    resumeHint: string;
    openDetailsHint: string;
    moreActions: string;
    shelfSectionTitle: string;
    layoutShelf: string;
    layoutGrid: string;
    layoutPickerLabel: string;
    nowReading: string;
    nowReadingHint: string;
    chapterFinished: string;
    continueAction: string;
    lastReadJustNow: string;
    lastReadMinutes: string;
    lastReadHours: string;
    lastReadDays: string;
    newChapterCount: string;
    percentRead: string;
    collectionsTitle: string;
    collectionCount: string;
    collectionCountOne: string;
    openCollectionHint: string;
    addToLibrary: string;
    inLibrary: string;
    latestChapterLine: string;
    descriptionMore: string;
    /** Detail facts row: small labels over the values. */
    factSource: string;
    factChapters: string;
    factLatest: string;
    factStatus: string;
    /** Chapter list (design-explore): the chapter to read next, its menu and its volume headers. */
    chapterUpNext: string;
    chapterContinue: string;
    chapterRead: string;
    chapterReadFromStart: string;
    chapterRowHint: string;
    chapterVolume: string;
    chapterNoVolume: string;
    chapterAfterVolume: string;
    chapterRange: string;
    chapterJumpUpNext: string;
    /** First launch, empty library (design-explore): points at Browse. */
    libraryEmptyTitle: string;
    libraryEmptyDescription: string;
    libraryEmptyBrowse: string;
    libraryEmptySearch: string;
    /** Caption above a chapter list whose chapters (nearly) all come from one group or category. */
    chapterListGroup: string;
    /** Search idle page: heading over recent searches. */
    searchRecent: string;
    /** Search idle page: clears the recent searches. */
    searchClearRecent: string;
    /** Search idle page: VoiceOver label of a recent search. */
    searchRecentItem: string;
    /** Search idle page: heading over library titles with new chapters. */
    searchNewChapters: string;
    /** Browse: heading over the sources the library's titles come from. */
    browseInLibrary: string;
    /** Browse: how many library titles a source holds (more than one). */
    browseLibraryTitles: string;
    /** Browse: a source holding one library title. */
    browseLibraryTitlesOne: string;
  };
  /** Settings → About nemu → Open-source licenses. */
  openSourceLicenses: {
    title: string;
    rowSubtitle: string;
    intro: string;
    sectionJapaneseAnalysis: string;
    sectionFonts: string;
    sectionSoftware: string;
    showLicense: string;
    hideLicense: string;
    openLinkAccessibility: string;
  };
};

type MobileLocaleCatalogs = Record<AppLanguage, MobileStrings>;

const loadedLocaleCatalogs: Partial<MobileLocaleCatalogs> = {};

/**
 * Locale catalogs are ~930 keys each and live in sibling modules. They are
 * pulled in with an inline `require` (Metro keeps them in the bundle graph but
 * only evaluates a module the first time it is required), so a cold start —
 * and every Reanimated worklet runtime, which never renders copy — pays for at
 * most the one locale that is actually displayed.
 */
function loadMobileLocaleCatalog(language: AppLanguage): MobileStrings {
  const cached = loadedLocaleCatalogs[language];
  if (cached) return cached;
  let catalog: MobileStrings;
  switch (language) {
    case "zh":
      catalog = (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./mobileI18n.zh") as { mobileStringsZh: MobileStrings }
      ).mobileStringsZh;
      break;
    case "ja":
      catalog = (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./mobileI18n.ja") as { mobileStringsJa: MobileStrings }
      ).mobileStringsJa;
      break;
    default:
      catalog = (
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        require("./mobileI18n.en") as { mobileStringsEn: MobileStrings }
      ).mobileStringsEn;
      break;
  }
  // Design-explore bundles (iOS): a few words mean something else there.
  if (getMobileDesignExploreActive()) {
    catalog = withMobileDesignExploreCopy(catalog, language);
  }
  loadedLocaleCatalogs[language] = catalog;
  return catalog;
}

/**
 * Every catalog at once, for parity/lint audits. Only tests call this — app
 * code goes through `getMobileStrings` so it never materializes locales it
 * will not render.
 */
export function getMobileStringsForAudit(): Readonly<MobileLocaleCatalogs> {
  return {
    en: loadMobileLocaleCatalog("en"),
    zh: loadMobileLocaleCatalog("zh"),
    ja: loadMobileLocaleCatalog("ja"),
  };
}

export function getMobileStrings(language: unknown): MobileStrings {
  return loadMobileLocaleCatalog(normalizeAppLanguage(language));
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

/**
 * Joins a short inline list ("title and description", "标题和简介") with the
 * locale's own separators, so discard copy can name the fields it is about to
 * throw away without hardcoding punctuation.
 */
export function formatMobileList(
  items: readonly string[],
  strings: Pick<MobileStrings, "common">,
): string {
  if (items.length <= 1) return items[0] ?? "";
  const head = items.slice(0, -1).join(strings.common.listSeparator);
  return `${head}${strings.common.listLastSeparator}${items[items.length - 1]}`;
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

/**
 * Sync-completion toast copy. English needs real singular/plural for both
 * counts ("Synced 1 title and 1 source."), so the sentence is assembled from
 * per-noun count fragments the way the other mobile counters are.
 */
export function formatMobileSyncProgressCompleted(
  libraryCount: number,
  sourceCount: number,
  strings: MobileStrings,
): string {
  const library = formatMobileString(
    libraryCount === 1
      ? strings.settings.syncProgressLibraryCountOne
      : strings.settings.syncProgressLibraryCountOther,
    { count: libraryCount },
  );
  if (sourceCount <= 0) {
    return formatMobileString(
      strings.settings.syncProgressCompletedLibraryOnly,
      { library },
    );
  }
  const sources = formatMobileString(
    sourceCount === 1
      ? strings.settings.syncProgressSourceCountOne
      : strings.settings.syncProgressSourceCountOther,
    { count: sourceCount },
  );
  return formatMobileString(strings.settings.syncProgressCompleted, {
    library,
    sources,
  });
}

/** Summary line for a source string-list row ("3 entries" style). */
export function formatMobileSourceItemListCount(
  count: number,
  strings: MobileStrings,
): string {
  const template =
    count === 1
      ? strings.settings.sourceSettingsItemListOne
      : strings.settings.sourceSettingsItemListOther;
  return formatMobileString(template, { count });
}
