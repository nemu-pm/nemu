import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { MobileConfirmationSheet } from "@/components/MobileConfirmationSheet";
import { File as ExpoFile } from "expo-file-system";
import * as ImagePicker from "expo-image-picker";
import { LinearGradient } from "expo-linear-gradient";
import {
  MobileNativeSheetScaffold,
  MobileCachedImage,
  createNemuShadowStyle,
  radius,
  nemuFontWeight,
  useNemuTheme,
  NemuButton,
  GlassSurface,
  NemuTextFieldClearAction,
  NemuPressable,
  NemuText,
  nemuColorWithAlpha,
} from "@/design-system";
import type { InstalledSource, LibraryEntry, MangaMetadata } from "@/data/schema";
import {
  MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR,
  assertMobileCoverUploadByteLength,
  getMobileCoverContentType,
  uploadMobileCoverBytes,
  uploadMobileRemoteCover,
} from "@/lib/mobileCoverUpload";
import {
  MOBILE_MANGA_STATUS_OPTIONS,
  getMobileMetadataFieldOverrideState,
  canResetMobileMetadataEditorForm,
  listToMetadataInput,
  metadataInputToList,
  mobileMetadataFormFromBase,
  mobileMetadataFormFromEntry,
  resetMobileMetadataField,
  type MobileMetadataFieldKey,
  type MobileMetadataFormValues,
} from "@/lib/mobileMetadataOverrides";
import {
  canSaveMobileMetadataEditorForm,
  canSelectMobileMetadataStatusOption,
  canStartMobileMetadataEditorAction,
  getMobileMetadataEditorDirtyFields,
  getMobileMetadataEditorRequestCloseAction,
  isMobileMetadataEditorActionBusy,
  type MobileMetadataEditorActionState,
  type MobileMetadataEditorDirtyField,
} from "@/lib/mobileMetadataEditorBackBehavior";
import {
  MOBILE_METADATA_MATCH_FIELD_ORDER,
  applyMobileMetadataMatchToForm,
  applyMobileMetadataMatchToFormWithDescription,
  canRunMobileMetadataMatchSearch,
  getMobileMetadataMatchFieldAvailability,
  searchMobileMetadataSmartMatches,
  selectMobileMetadataMatchResultsForDisplay,
  type MobileMetadataMatchFieldKey,
  type MobileMetadataMatchResult,
} from "@/lib/mobileMetadataMatch";
import { hapticConfirm, hapticError, hapticPress } from "@/lib/haptics";
import { useMobileLanguageSettings } from "@/data/mobileHooks";
import {
  formatMobileList,
  formatMobileString,
  getMobileStrings,
  type MobileStrings,
} from "@/lib/mobileI18n";
import { resolveMobileMetadataEditorCoverSource } from "@/lib/mobileMetadataEditorCoverPreview";
import {
  describeMobileErrorDetail,
  getMobileSourceErrorPresentation,
  type MobileSourceErrorPresentation,
} from "@/lib/mobileSourceErrors";
import { useMobileSourceImageRequest } from "@/lib/useMobileSourceImageRequest";

type MobileMetadataEditorSheetProps = {
  visible: boolean;
  entry: LibraryEntry;
  saving?: boolean;
  coverSource?: InstalledSource | null;
  sourceChoices?: MobileMetadataSourceChoice[];
  onClose: () => void;
  /** Called after the native sheet has fully finished dismissing. */
  onDismiss?: () => void;
  onFetchFromSource?: (sourceId: string) => Promise<MangaMetadata>;
  onSave: (form: MobileMetadataFormValues) => Promise<void>;
};

export type MobileMetadataSourceChoice = {
  id: string;
  label: string;
  detail?: string;
  icon?: string;
  installedSource?: InstalledSource;
};

type IoniconName = ComponentProps<typeof Ionicons>["name"];

type SelectedCoverAsset = {
  uri: string;
  mimeType?: string | null;
};

type MetadataTextFieldProps = {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "url";
  autoCapitalize?: "none" | "sentences" | "words";
  isOverridden?: boolean;
  disabled?: boolean;
  resetAccessibilityLabel?: string;
  resetLabel?: string;
  onChangeText: (value: string) => void;
  onReset?: () => void;
};

// Sentinel messages for app-authored cover-save failures. They never reach
// the UI raw: the save catch maps them to localized metadataEditor copy (the
// error-copy contract forbids surfacing app-authored English literals).
const MOBILE_COVER_FILE_MISSING_ERROR = "mobile-cover-file-missing";
const MOBILE_COVER_SIZE_UNAVAILABLE_ERROR = "mobile-cover-size-unavailable";

function describeCoverSaveError(error: unknown, strings: MobileStrings): string {
  const rawMessage = error instanceof Error ? error.message : "";
  if (rawMessage === MOBILE_COVER_UPLOAD_UNAVAILABLE_ERROR)
    return strings.metadataEditor.coverUploadUnavailable;
  if (rawMessage === MOBILE_COVER_FILE_MISSING_ERROR)
    return strings.metadataEditor.coverFileMissing;
  if (rawMessage === MOBILE_COVER_SIZE_UNAVAILABLE_ERROR)
    return strings.metadataEditor.coverSizeUnavailable;
  return describeMobileErrorDetail(
    error,
    strings.metadataEditor.coverUploadFailed,
  );
}

function sameForm(a: MobileMetadataFormValues, b: MobileMetadataFormValues): boolean {
  return (
    a.title === b.title &&
    a.authorsText === b.authorsText &&
    a.description === b.description &&
    a.tagsText === b.tagsText &&
    a.coverUrl === b.coverUrl &&
    a.status === b.status &&
    a.externalIds?.mangaUpdates === b.externalIds?.mangaUpdates &&
    a.externalIds?.aniList === b.externalIds?.aniList &&
    a.externalIds?.mal === b.externalIds?.mal
  );
}

function matchSummary(result: MobileMetadataMatchResult): string {
  const authors = result.metadata.authors?.slice(0, 2).join(", ");
  const tags = result.metadata.tags?.slice(0, 2).join(", ");
  return [result.providerLabel, authors, tags].filter(Boolean).join(" / ");
}

function metadataStatusLabel(status: number, strings: MobileStrings): string {
  switch (status) {
    case 1:
      return strings.metadataEditor.statusOngoing;
    case 2:
      return strings.metadataEditor.statusCompleted;
    case 3:
      return strings.metadataEditor.statusCancelled;
    case 4:
      return strings.metadataEditor.statusHiatus;
    default:
      return strings.metadataEditor.statusUnknown;
  }
}

function applySourceMetadataToForm(
  form: MobileMetadataFormValues,
  metadata: MangaMetadata
): MobileMetadataFormValues {
  return {
    ...form,
    title: metadata.title || form.title,
    authorsText: metadata.authors
      ? listToMetadataInput(metadata.authors)
      : form.authorsText,
    description: metadata.description ?? form.description,
    tagsText: metadata.tags ? listToMetadataInput(metadata.tags) : form.tagsText,
    coverUrl: metadata.cover ?? form.coverUrl,
    status: metadata.status ?? form.status,
  };
}

function matchFieldLabel(field: MobileMetadataMatchFieldKey, strings: MobileStrings): string {
  switch (field) {
    case "title":
      return strings.metadataEditor.titleField;
    case "cover":
      return strings.metadataEditor.cover;
    case "authors":
      return strings.metadataEditor.authors;
    case "status":
      return strings.metadataEditor.status;
    case "tags":
      return strings.metadataEditor.tags;
    case "description":
      return strings.metadataEditor.description;
  }
}

function dirtyFieldLabel(
  field: MobileMetadataEditorDirtyField,
  strings: MobileStrings,
): string {
  switch (field) {
    case "title":
      return strings.metadataEditor.titleField;
    case "authors":
      return strings.metadataEditor.authors;
    case "description":
      return strings.metadataEditor.description;
    case "tags":
      return strings.metadataEditor.tags;
    case "cover":
      return strings.metadataEditor.cover;
    case "status":
      return strings.metadataEditor.status;
  }
}

function matchFieldIcon(field: MobileMetadataMatchFieldKey): IoniconName {
  switch (field) {
    case "title":
      return "text-outline";
    case "cover":
      return "image-outline";
    case "authors":
      return "people-outline";
    case "status":
      return "flag-outline";
    case "tags":
      return "pricetags-outline";
    case "description":
      return "document-text-outline";
  }
}

function MetadataTextField({
  label,
  value,
  placeholder,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  isOverridden = false,
  disabled = false,
  resetAccessibilityLabel,
  resetLabel,
  onChangeText,
  onReset,
}: MetadataTextFieldProps) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <NemuText
          density="compact"
          style={[styles.fieldLabel, { color: tokens.mutedForeground }]}
        >
          {label}
        </NemuText>
        {isOverridden && onReset && resetLabel ? (
          <NemuButton
            accessibilityLabel={resetAccessibilityLabel ?? resetLabel}
            accessibilityState={{ disabled }}
            disabled={disabled}
            icon="refresh-outline"
            label={resetLabel}
            onPress={onReset}
            size="xs"
            variant="secondary"
          />
        ) : null}
      </View>
      <GlassSurface
        style={[styles.inputShell, multiline && styles.textAreaShell]}
        contentStyle={styles.inputContent}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoCorrect={keyboardType !== "url"}
          keyboardType={keyboardType}
          editable={!disabled}
          multiline={multiline}
          onChangeText={onChangeText}
          placeholder={placeholder ?? label}
          placeholderTextColor={tokens.mutedForeground}
          selectionColor={tokens.primary}
          style={[
            styles.input,
            multiline && styles.textArea,
            { color: tokens.foreground, opacity: disabled ? 0.72 : 1 },
          ]}
          textAlignVertical={multiline ? "top" : "center"}
          value={value}
        />
      </GlassSurface>
    </View>
  );
}

export function MobileMetadataEditorSheet({
  visible,
  entry,
  saving = false,
  coverSource = null,
  sourceChoices = [],
  onClose,
  onDismiss,
  onFetchFromSource,
  onSave,
}: MobileMetadataEditorSheetProps) {
  const { tokens } = useNemuTheme();
  const { appLanguage, effectiveMetadataLanguage } = useMobileLanguageSettings();
  const strings = getMobileStrings(appLanguage);
  const nextInitialForm = useMemo(() => mobileMetadataFormFromEntry(entry), [entry]);
  const baseForm = useMemo(() => mobileMetadataFormFromBase(entry), [entry]);
  const [initialForm, setInitialForm] =
    useState<MobileMetadataFormValues>(() => nextInitialForm);
  const [form, setForm] = useState<MobileMetadataFormValues>(() => nextInitialForm);
  const [matchQuery, setMatchQuery] = useState(nextInitialForm.title);
  const [matchResults, setMatchResults] = useState<MobileMetadataMatchResult[]>([]);
  const [matchLoading, setMatchLoading] = useState(false);
  const matchLoadingRef = useRef(false);
  const [matchApplying, setMatchApplying] = useState(false);
  const matchApplyingRef = useRef(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [fetchingSourceId, setFetchingSourceId] = useState<string | null>(null);
  const fetchingSourceIdRef = useRef<string | null>(null);
  const [sourceError, setSourceError] =
    useState<MobileSourceErrorPresentation | null>(null);
  const [selectedCoverAsset, setSelectedCoverAsset] = useState<SelectedCoverAsset | null>(null);
  const [coverPreviewSourceId, setCoverPreviewSourceId] = useState<string | null>(null);
  const [coverError, setCoverError] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const uploadingCoverRef = useRef(false);
  const [pickingCover, setPickingCover] = useState(false);
  const pickingCoverRef = useRef(false);
  const [saveInFlight, setSaveInFlight] = useState(false);
  const saveInFlightRef = useRef(false);
  // Sheets are serialized on both platforms, so the discard prompt owns the
  // screen alone: the editor hides while it is up and comes back only after
  // the prompt has finished dismissing.
  const [discardConfirm, setDiscardConfirm] = useState<
    "hidden" | "asking" | "cancelling" | "closing"
  >("hidden");
  const suppressDismissRef = useRef(false);
  // `MobileNativeSheetScaffold` reports `onClose` and `onDismiss` in the same
  // synchronous tick, so a swipe-down on the prompt would run its `onDismiss`
  // before React committed the `"cancelling"` state and strand the editor
  // hidden. A ref settles the intent before that pairing can read it.
  const discardCancelRef = useRef(false);
  const formRef = useRef(form);
  const wasVisibleRef = useRef(false);
  const visibleLibraryItemIdRef = useRef<string | null>(null);

  const editorActionState: MobileMetadataEditorActionState = {
    saving: saving || saveInFlight,
    searchingMatches: matchLoading,
    applyingMatch: matchApplying,
    fetchingSource: fetchingSourceId !== null,
    pickingCover,
    uploadingCover,
  };
  const editorActionBusy = isMobileMetadataEditorActionBusy(editorActionState);
  const getGuardedEditorActionState = useCallback(
    (): MobileMetadataEditorActionState => ({
      saving: saving || saveInFlightRef.current || saveInFlight,
      searchingMatches: matchLoadingRef.current || matchLoading,
      applyingMatch: matchApplyingRef.current || matchApplying,
      fetchingSource:
        fetchingSourceIdRef.current !== null || fetchingSourceId !== null,
      pickingCover: pickingCoverRef.current || pickingCover,
      uploadingCover: uploadingCoverRef.current || uploadingCover,
    }),
    [
      fetchingSourceId,
      matchApplying,
      matchLoading,
      pickingCover,
      saveInFlight,
      saving,
      uploadingCover,
    ]
  );
  const dirty = selectedCoverAsset !== null || !sameForm(form, initialForm);
  const canSave = canSaveMobileMetadataEditorForm({
    dirty,
    title: form.title,
    state: editorActionState,
  });
  const coverPreview = selectedCoverAsset?.uri ?? form.coverUrl.trim();
  const coverPreviewSource = useMemo(() => {
    return resolveMobileMetadataEditorCoverSource({
      coverPreview,
      hasSelectedCoverAsset: selectedCoverAsset !== null,
      coverPreviewSourceId,
      sourceChoices,
      coverSource,
      initialCoverUrl: nextInitialForm.coverUrl,
      baseCoverUrl: baseForm.coverUrl,
    });
  }, [
    baseForm.coverUrl,
    coverPreview,
    coverPreviewSourceId,
    coverSource,
    nextInitialForm.coverUrl,
    selectedCoverAsset,
    sourceChoices,
  ]);
  const coverPreviewRequest = useMobileSourceImageRequest(coverPreviewSource, coverPreview);
  const coverPreviewImageSource = coverPreview
    ? {
        uri: coverPreviewRequest?.url ?? coverPreview,
        headers: coverPreviewRequest?.headers,
      }
    : null;
  const canFetchFromSource = Boolean(onFetchFromSource && sourceChoices.length);
  const fieldOverrides = useMemo(
    () => getMobileMetadataFieldOverrideState(form, baseForm),
    [baseForm, form]
  );
  const canResetForm = canResetMobileMetadataEditorForm({
    form,
    baseForm,
    hasSelectedCoverAsset: selectedCoverAsset !== null,
  });
  const coverUrlOverridden = fieldOverrides.coverUrl || selectedCoverAsset !== null;
  const closeBusy = editorActionBusy;
  const canSearchMatches = canRunMobileMetadataMatchSearch(
    matchQuery,
    form.title,
    editorActionBusy
  );
  const dirtyFields = useMemo(
    () =>
      getMobileMetadataEditorDirtyFields({
        form,
        initialForm,
        hasSelectedCoverAsset: selectedCoverAsset !== null,
      }),
    [form, initialForm, selectedCoverAsset],
  );
  const discardDescription = formatMobileString(
    strings.metadataEditor.discardDescription,
    {
      fields: formatMobileList(
        dirtyFields.map((field) => dirtyFieldLabel(field, strings)),
        strings,
      ),
    },
  );
  const requestClose = () => {
    if (!visible) return;
    const action = getMobileMetadataEditorRequestCloseAction({
      busy: closeBusy,
      dirty: dirtyFields.length > 0,
    });
    if (action === "ignore") return;
    if (action === "confirm-discard") {
      // The scaffold reports the close AFTER the native dismissal, and it
      // re-presents while `visible` stays true. Swallow the paired dismissal
      // so the owner does not tear the editor (and its draft) down.
      suppressDismissRef.current = true;
      setDiscardConfirm("asking");
      return;
    }
    void hapticPress();
    onClose();
  };
  const handleScaffoldDismiss = () => {
    if (suppressDismissRef.current) return;
    onDismiss?.();
  };
  const discardDraft = () => {
    setDiscardConfirm("closing");
    setForm(initialForm);
    setSelectedCoverAsset(null);
    setCoverPreviewSourceId(null);
    setCoverError(null);
    suppressDismissRef.current = false;
    discardCancelRef.current = false;
    void hapticPress();
    onClose();
    // The scaffold is already hidden, so it will never report this dismissal.
    onDismiss?.();
  };

  useEffect(() => {
    const itemChanged = visibleLibraryItemIdRef.current !== entry.item.libraryItemId;
    if (visible && (!wasVisibleRef.current || itemChanged)) {
      setInitialForm(nextInitialForm);
      setForm(nextInitialForm);
      setMatchQuery(nextInitialForm.title);
      setMatchResults([]);
      setMatchError(null);
      setMatchLoading(false);
      matchLoadingRef.current = false;
      setMatchApplying(false);
      matchApplyingRef.current = false;
      setFetchingSourceId(null);
      fetchingSourceIdRef.current = null;
      setSourceError(null);
      setSelectedCoverAsset(null);
      setCoverPreviewSourceId(null);
      setCoverError(null);
      setUploadingCover(false);
      uploadingCoverRef.current = false;
      setPickingCover(false);
      pickingCoverRef.current = false;
      setSaveInFlight(false);
      saveInFlightRef.current = false;
      setDiscardConfirm("hidden");
      suppressDismissRef.current = false;
      discardCancelRef.current = false;
    }
    wasVisibleRef.current = visible;
    visibleLibraryItemIdRef.current = visible ? entry.item.libraryItemId : null;
  }, [entry.item.libraryItemId, nextInitialForm, visible]);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const setField = <K extends keyof MobileMetadataFormValues>(
    key: K,
    value: MobileMetadataFormValues[K]
  ) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetField = useCallback(
    (field: MobileMetadataFieldKey) => {
      if (field === "coverUrl") {
        setSelectedCoverAsset(null);
        setCoverPreviewSourceId(null);
        setCoverError(null);
      }
      setForm((current) => resetMobileMetadataField(current, baseForm, field));
    },
    [baseForm]
  );

  const resetFieldAccessibilityLabel = useCallback(
    (fieldLabel: string) =>
      formatMobileString(strings.metadataEditor.resetField, { field: fieldLabel }),
    [strings]
  );

  const handleSearchMatches = useCallback(async () => {
    const query = (matchQuery.trim() || form.title.trim()).trim();
    if (
      !canRunMobileMetadataMatchSearch(
        query,
        form.title,
        isMobileMetadataEditorActionBusy(getGuardedEditorActionState())
      )
    ) {
      return;
    }

    setMatchQuery(query);
    matchLoadingRef.current = true;
    setMatchLoading(true);
    setMatchError(null);
    try {
      const search = await searchMobileMetadataSmartMatches(query, {
        authors: metadataInputToList(form.authorsText),
      });
      setMatchQuery(search.query || query);
      setMatchResults(selectMobileMetadataMatchResultsForDisplay(search.results));
      if (search.results.length) {
        await hapticConfirm();
      } else {
        setMatchError(strings.metadataEditor.noMatches);
        await hapticError();
      }
    } catch (error) {
      setMatchResults([]);
      setMatchError(describeMobileErrorDetail(error, strings.metadataEditor.matchFailed));
      await hapticError();
    } finally {
      matchLoadingRef.current = false;
      setMatchLoading(false);
    }
  }, [form.authorsText, form.title, getGuardedEditorActionState, matchQuery, strings]);

  const handleApplyMatch = useCallback(
    async (result: MobileMetadataMatchResult) => {
      if (!canStartMobileMetadataEditorAction(getGuardedEditorActionState())) return;

      matchApplyingRef.current = true;
      setMatchApplying(true);
      setSelectedCoverAsset(null);
      setCoverPreviewSourceId(null);
      setCoverError(null);
      setMatchError(null);
      try {
        const nextForm = await applyMobileMetadataMatchToFormWithDescription(
          formRef.current,
          result,
          undefined,
          { metadataLanguage: effectiveMetadataLanguage }
        );
        setForm(nextForm);
        await hapticConfirm();
      } catch (error) {
        setForm((current) =>
          applyMobileMetadataMatchToForm(current, result, undefined, {
            metadataLanguage: effectiveMetadataLanguage,
          })
        );
        setMatchError(describeMobileErrorDetail(error, strings.metadataEditor.matchFailed));
        await hapticError();
      } finally {
        matchApplyingRef.current = false;
        setMatchApplying(false);
      }
    },
    [effectiveMetadataLanguage, getGuardedEditorActionState, strings]
  );

  const handleApplyMatchField = useCallback(
    async (result: MobileMetadataMatchResult, field: MobileMetadataMatchFieldKey) => {
      if (!canStartMobileMetadataEditorAction(getGuardedEditorActionState())) return;

      matchApplyingRef.current = true;
      setMatchApplying(true);
      if (field === "cover") {
        setSelectedCoverAsset(null);
        setCoverPreviewSourceId(null);
        setCoverError(null);
      }
      setMatchError(null);
      try {
        const nextForm = await applyMobileMetadataMatchToFormWithDescription(
          formRef.current,
          result,
          [field],
          { metadataLanguage: effectiveMetadataLanguage }
        );
        setForm(nextForm);
        await hapticConfirm();
      } catch (error) {
        setForm((current) =>
          applyMobileMetadataMatchToForm(current, result, [field], {
            metadataLanguage: effectiveMetadataLanguage,
          })
        );
        setMatchError(describeMobileErrorDetail(error, strings.metadataEditor.matchFailed));
        await hapticError();
      } finally {
        matchApplyingRef.current = false;
        setMatchApplying(false);
      }
    },
    [effectiveMetadataLanguage, getGuardedEditorActionState, strings]
  );

  const handleFetchFromSource = useCallback(
    async (choice: MobileMetadataSourceChoice) => {
      if (
        !onFetchFromSource ||
        !canStartMobileMetadataEditorAction(getGuardedEditorActionState())
      ) {
        return;
      }

      fetchingSourceIdRef.current = choice.id;
      setFetchingSourceId(choice.id);
      setSourceError(null);
      try {
        const metadata = await onFetchFromSource(choice.id);
        setSelectedCoverAsset(null);
        setCoverPreviewSourceId(metadata.cover ? choice.id : null);
        setCoverError(null);
        setForm((current) => applySourceMetadataToForm(current, metadata));
        await hapticConfirm();
      } catch (error) {
        setSourceError(getMobileSourceErrorPresentation(error, strings));
        await hapticError();
      } finally {
        fetchingSourceIdRef.current = null;
        setFetchingSourceId(null);
      }
    },
    [getGuardedEditorActionState, onFetchFromSource, strings]
  );

  const handlePickCover = useCallback(async () => {
    if (!canStartMobileMetadataEditorAction(getGuardedEditorActionState())) return;

    pickingCoverRef.current = true;
    setPickingCover(true);
    setCoverError(null);
    try {
      // The system picker grants access only to the selected item. Requesting
      // broad media-library access first is unnecessary on supported Android
      // versions and for this image-only picker flow on iOS.
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        allowsMultipleSelection: false,
        aspect: [3, 4],
        quality: 0.85,
      });

      if (result.canceled) return;

      const asset = result.assets[0];
      if (!asset?.uri) {
        setCoverError(strings.metadataEditor.coverPickFailed);
        await hapticError();
        return;
      }

      setSelectedCoverAsset({
        uri: asset.uri,
        mimeType: asset.mimeType,
      });
      setCoverPreviewSourceId(null);
      await hapticConfirm();
    } catch (error) {
      setCoverError(
        describeMobileErrorDetail(error, strings.metadataEditor.coverPickFailed)
      );
      await hapticError();
    } finally {
      pickingCoverRef.current = false;
      setPickingCover(false);
    }
  }, [getGuardedEditorActionState, strings]);

  const handleSave = useCallback(async () => {
    if (
      !canSaveMobileMetadataEditorForm({
        dirty,
        title: form.title,
        state: getGuardedEditorActionState(),
      })
    ) {
      return;
    }

    saveInFlightRef.current = true;
    setSaveInFlight(true);
    let nextForm = form;
    if (selectedCoverAsset) {
      uploadingCoverRef.current = true;
      setUploadingCover(true);
      setCoverError(null);
      try {
        const file = new ExpoFile(selectedCoverAsset.uri);
        const fileInfo = file.info();
        if (!fileInfo.exists) {
          throw new Error(MOBILE_COVER_FILE_MISSING_ERROR);
        }
        if (typeof fileInfo.size !== "number") {
          throw new Error(MOBILE_COVER_SIZE_UNAVAILABLE_ERROR);
        }
        assertMobileCoverUploadByteLength(fileInfo.size);
        const coverBytes = await file.bytes();
        // Defend against replacement between metadata inspection and read.
        assertMobileCoverUploadByteLength(coverBytes.byteLength);
        const coverUrl = await uploadMobileCoverBytes({
          bytes: coverBytes,
          contentType: getMobileCoverContentType(selectedCoverAsset),
        });
        nextForm = { ...form, coverUrl };
        setForm(nextForm);
        setSelectedCoverAsset(null);
        setCoverPreviewSourceId(null);
      } catch (error) {
        setCoverError(describeCoverSaveError(error, strings));
        await hapticError();
        uploadingCoverRef.current = false;
        setUploadingCover(false);
        saveInFlightRef.current = false;
        setSaveInFlight(false);
        return;
      }
    } else if (
      fieldOverrides.coverUrl &&
      form.coverUrl.trim().length > 0
    ) {
      uploadingCoverRef.current = true;
      setUploadingCover(true);
      setCoverError(null);
      try {
        const coverUrl = await uploadMobileRemoteCover({
          url: coverPreviewRequest?.url ?? form.coverUrl.trim(),
          headers: coverPreviewRequest?.headers,
        });
        nextForm = { ...form, coverUrl };
        setForm(nextForm);
        setCoverPreviewSourceId(null);
      } catch {
        nextForm = form;
      }
    }

    try {
      await onSave(nextForm);
    } finally {
      uploadingCoverRef.current = false;
      setUploadingCover(false);
      saveInFlightRef.current = false;
      setSaveInFlight(false);
    }
  }, [
    coverPreviewRequest,
    dirty,
    fieldOverrides.coverUrl,
    form,
    getGuardedEditorActionState,
    onSave,
    selectedCoverAsset,
    strings,
  ]);

  return (
    <>
    <MobileNativeSheetScaffold
      visible={visible && discardConfirm === "hidden"}
      onClose={requestClose}
      onDismiss={handleScaffoldDismiss}
      title={strings.metadataEditor.title}
      subtitle={strings.metadataEditor.subtitle}
      dismissLabel={strings.metadataEditor.close}
      dismissDisabled={closeBusy}
      snapPoints={["92%"]}
      fillContent
      enablePanDownToClose={!closeBusy}
      contentStyle={styles.sheet}
    >
      <ScrollView
        style={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.coverRow}>
          <View
            accessibilityRole="image"
            accessibilityLabel={strings.metadataEditor.coverPreview}
            style={[
              styles.coverPreview,
              {
                backgroundColor: tokens.muted,
                borderColor: tokens.coverBorder,
                ...createNemuShadowStyle({
                  color: tokens.shadow,
                  offsetY: 5,
                  radius: 14,
                  elevation: 4,
                }),
              },
            ]}
          >
            {coverPreviewImageSource ? (
              selectedCoverAsset === null ? (
                <MobileCachedImage
                  fallback={
                    <LinearGradient
                      colors={[
                        nemuColorWithAlpha(tokens.primary, 0.33),
                        tokens.muted,
                      ]}
                      style={styles.coverPlaceholder}
                    />
                  }
                  uriOwnership="source"
                  source={coverPreviewImageSource}
                  style={styles.coverImage}
                />
              ) : (
                <Image source={coverPreviewImageSource} style={styles.coverImage} />
              )
            ) : (
              <LinearGradient
                colors={[
                  nemuColorWithAlpha(tokens.primary, 0.33),
                  tokens.muted,
                ]}
                style={styles.coverPlaceholder}
              />
            )}
          </View>
          <View style={styles.coverCopy}>
            <NemuText
              density="compact"
              style={[styles.coverTitle, { color: tokens.foreground }]}
            >
              {strings.metadataEditor.coverTitle}
            </NemuText>
            <NemuText
              density="compact"
              style={[styles.coverText, { color: tokens.mutedForeground }]}
            >
              {strings.metadataEditor.coverDescription}
            </NemuText>
            <View style={styles.coverActions}>
              <View style={styles.coverActionButtons}>
                <NemuButton
                  accessibilityLabel={strings.metadataEditor.chooseCoverImage}
                  accessibilityState={{
                    busy: pickingCover || undefined,
                    disabled: editorActionBusy,
                  }}
                  disabled={editorActionBusy}
                  icon="image-outline"
                  label={strings.metadataEditor.chooseCoverImage}
                  loading={pickingCover}
                  onPress={() => {
                    void handlePickCover();
                  }}
                  size="sm"
                  variant="secondary"
                />
                {coverUrlOverridden ? (
                  <NemuButton
                    accessibilityLabel={resetFieldAccessibilityLabel(
                      strings.metadataEditor.cover
                    )}
                    accessibilityState={{ disabled: editorActionBusy }}
                    disabled={editorActionBusy}
                    hapticFeedback="press"
                    icon="trash-outline"
                    label={strings.common.clear}
                    onPress={() => resetField("coverUrl")}
                    size="sm"
                    variant="secondary"
                  />
                ) : null}
              </View>
              {selectedCoverAsset ? (
                <NemuText
                  density="compact"
                  numberOfLines={1}
                  style={[styles.coverSelectedText, { color: tokens.mutedForeground }]}
                >
                  {strings.metadataEditor.coverSelected}
                </NemuText>
              ) : null}
            </View>
            {coverError ? (
              <NemuText
                density="compact"
                style={[styles.coverError, { color: tokens.danger }]}
              >
                {coverError}
              </NemuText>
            ) : null}
          </View>
        </View>

        {canFetchFromSource ? (
          <GlassSurface style={styles.sourcePanel} contentStyle={styles.sourcePanelContent}>
            <View style={styles.sourceHeader}>
              <View style={[styles.sourceHeaderIcon, { backgroundColor: tokens.primary }]}>
                <Ionicons
                  name="download-outline"
                  size={17}
                  color={tokens.primaryForeground}
                />
              </View>
              <View style={styles.sourceHeaderCopy}>
                <NemuText
                  density="compact"
                  style={[styles.sourceTitle, { color: tokens.foreground }]}
                >
                  {strings.metadataEditor.sourceFetchTitle}
                </NemuText>
                <NemuText
                  density="compact"
                  style={[styles.sourceSubtitle, { color: tokens.mutedForeground }]}
                >
                  {strings.metadataEditor.sourceFetchSubtitle}
                </NemuText>
              </View>
            </View>

            <View style={styles.sourceList}>
              {sourceChoices.map((choice) => {
                const loadingSource = fetchingSourceId === choice.id;
                return (
                  <NemuPressable
                    key={choice.id}
                    accessibilityRole="button"
                    accessibilityLabel={formatMobileString(
                      strings.metadataEditor.sourceFetchAccessibility,
                      { source: choice.label }
                    )}
                    accessibilityState={{
                      busy: loadingSource || undefined,
                      disabled: editorActionBusy,
                    }}
                    disabled={editorActionBusy}
                    onPress={() => {
                      void handleFetchFromSource(choice);
                    }}
                    pressedScale={0.985}
                    style={[
                      styles.sourceChoice,
                      {
                        backgroundColor: tokens.muted,
                        borderColor: tokens.border,
                        opacity: editorActionBusy && !loadingSource ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.sourceChoiceIcon,
                        {
                          backgroundColor: tokens.sourceIconGlass,
                          borderColor: tokens.coverBorder,
                        },
                      ]}
                    >
                      {choice.icon ? (
                        <MobileCachedImage
                          fallback={
                            <Ionicons
                              name="albums-outline"
                              size={17}
                              color={tokens.mutedForeground}
                            />
                          }
                          uriOwnership="source"
                          source={{ uri: choice.icon }}
                          style={styles.sourceChoiceImage}
                        />
                      ) : (
                        <Ionicons
                          name="albums-outline"
                          size={17}
                          color={tokens.mutedForeground}
                        />
                      )}
                    </View>
                    <View style={styles.sourceChoiceCopy}>
                      <NemuText
                        density="compact"
                        numberOfLines={1}
                        style={[styles.sourceChoiceTitle, { color: tokens.foreground }]}
                      >
                        {choice.label}
                      </NemuText>
                      {choice.detail ? (
                        <NemuText
                          density="compact"
                          numberOfLines={1}
                          style={[
                            styles.sourceChoiceDetail,
                            { color: tokens.mutedForeground },
                          ]}
                        >
                          {choice.detail}
                        </NemuText>
                      ) : null}
                    </View>
                    {loadingSource ? (
                      <ActivityIndicator color={tokens.mutedForeground} size="small" />
                    ) : (
                      <Ionicons
                        name="cloud-download-outline"
                        size={20}
                        color={tokens.primary}
                      />
                    )}
                  </NemuPressable>
                );
              })}
            </View>

            {sourceError ? (
              <View
                style={[
                  styles.sourceErrorNotice,
                  { backgroundColor: tokens.muted, borderColor: tokens.border },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={16}
                  color={tokens.danger}
                />
                <View style={styles.sourceErrorCopy}>
                  <NemuText
                    density="compact"
                    numberOfLines={1}
                    style={[styles.sourceErrorTitle, { color: tokens.foreground }]}
                  >
                    {sourceError.title}
                  </NemuText>
                  <NemuText
                    density="compact"
                    numberOfLines={2}
                    style={[
                      styles.sourceErrorDetail,
                      { color: tokens.mutedForeground },
                    ]}
                  >
                    {sourceError.detail}
                  </NemuText>
                </View>
              </View>
            ) : null}
          </GlassSurface>
        ) : null}

        <GlassSurface style={styles.matchPanel} contentStyle={styles.matchPanelContent}>
          <View style={styles.matchHeader}>
            <View style={[styles.matchIcon, { backgroundColor: tokens.primary }]}>
              <Ionicons name="sparkles-outline" size={17} color={tokens.primaryForeground} />
            </View>
            <View style={styles.matchHeaderCopy}>
              <NemuText
                density="compact"
                style={[styles.matchTitle, { color: tokens.foreground }]}
              >
                {strings.metadataEditor.matchTitle}
              </NemuText>
              <NemuText
                density="compact"
                style={[styles.matchSubtitle, { color: tokens.mutedForeground }]}
              >
                {strings.metadataEditor.matchSubtitle}
              </NemuText>
            </View>
          </View>

          <View style={styles.matchSearchRow}>
            <GlassSurface style={styles.matchInputShell} contentStyle={styles.matchInputContent}>
              <TextInput
                accessibilityLabel={strings.metadataEditor.matchSearchPlaceholder}
                accessibilityRole="search"
                autoCapitalize="words"
                autoCorrect={false}
                editable={!editorActionBusy}
                onChangeText={setMatchQuery}
                onSubmitEditing={() => {
                  if (!canSearchMatches) return;
                  void handleSearchMatches();
                }}
                placeholder={strings.metadataEditor.matchSearchPlaceholder}
                placeholderTextColor={tokens.mutedForeground}
                returnKeyType="search"
                selectionColor={tokens.primary}
                style={[
                  styles.matchInput,
                  {
                    color: tokens.foreground,
                    opacity: editorActionBusy ? 0.7 : 1,
                  },
                ]}
                value={matchQuery}
              />
              {matchQuery.length > 0 ? (
                <NemuTextFieldClearAction
                  accessibilityLabel={strings.common.clear}
                  disabled={editorActionBusy}
                  onPress={() => setMatchQuery("")}
                  testID="MetadataMatchSearchClearAction"
                  trailingInset={11}
                />
              ) : null}
            </GlassSurface>
            <NemuButton
              accessibilityLabel={strings.metadataEditor.searchMatches}
              accessibilityState={{
                busy: matchLoading || undefined,
                disabled: !canSearchMatches,
              }}
              containerStyle={styles.matchSearchButton}
              disabled={!canSearchMatches}
              icon="search-outline"
              loading={matchLoading}
              onPress={() => {
                void handleSearchMatches();
              }}
              size="icon-lg"
              variant="default"
            />
          </View>

          {matchError ? (
            <NemuText
              density="compact"
              style={[styles.matchError, { color: tokens.danger }]}
            >
              {matchError}
            </NemuText>
          ) : null}

          {matchResults.length ? (
            <View style={styles.matchResults}>
              {matchResults.map((result) => {
                const availability = getMobileMetadataMatchFieldAvailability(result);
                return (
                  <View key={`${result.provider}:${result.externalId}`} style={styles.matchResultGroup}>
                    <NemuPressable
                      accessibilityRole="button"
                      accessibilityLabel={formatMobileString(strings.metadataEditor.applyMatch, {
                        provider: result.providerLabel,
                      })}
                      accessibilityState={{
                        busy: matchApplying || undefined,
                        disabled: editorActionBusy,
                      }}
                      disabled={editorActionBusy}
                      onPress={() => {
                        void handleApplyMatch(result);
                      }}
                      pressedScale={0.985}
                      style={[
                        styles.matchResult,
                        {
                          backgroundColor: tokens.muted,
                          borderColor: tokens.border,
                          opacity: editorActionBusy ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.matchCover,
                          {
                            backgroundColor: tokens.sourceIconGlass,
                            borderColor: tokens.coverBorder,
                          },
                        ]}
                      >
                        {result.coverUrl ? (
                          <MobileCachedImage
                            fallback={
                              <Ionicons
                                name="image-outline"
                                size={17}
                                color={tokens.mutedForeground}
                              />
                            }
                            uriOwnership="source"
                            source={{ uri: result.coverUrl }}
                            style={styles.matchCoverImage}
                          />
                        ) : (
                          <Ionicons name="image-outline" size={17} color={tokens.mutedForeground} />
                        )}
                      </View>
                      <View style={styles.matchResultCopy}>
                        <NemuText
                          density="compact"
                          numberOfLines={1}
                          style={[styles.matchResultTitle, { color: tokens.foreground }]}
                        >
                          {result.title}
                        </NemuText>
                        {result.subtitle ? (
                          <NemuText
                            density="compact"
                            numberOfLines={1}
                            style={[styles.matchResultSubtitle, { color: tokens.mutedForeground }]}
                          >
                            {result.subtitle}
                          </NemuText>
                        ) : null}
                        <NemuText
                          density="compact"
                          numberOfLines={1}
                          style={[styles.matchResultMeta, { color: tokens.mutedForeground }]}
                        >
                          {matchSummary(result)}
                        </NemuText>
                      </View>
                      <Ionicons name="add-circle-outline" size={21} color={tokens.primary} />
                    </NemuPressable>

                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.matchFieldActions}
                    >
                      {MOBILE_METADATA_MATCH_FIELD_ORDER.filter(
                        (field) => availability[field],
                      ).map((field) => {
                        const fieldLabel = matchFieldLabel(field, strings);
                        return (
                          <NemuButton
                            key={field}
                            accessibilityLabel={formatMobileString(
                              strings.metadataEditor.applyMatchField,
                              {
                                field: fieldLabel,
                                provider: result.providerLabel,
                              }
                            )}
                            accessibilityState={{
                              busy: matchApplying || undefined,
                              disabled: editorActionBusy,
                            }}
                            containerStyle={styles.matchFieldButton}
                            disabled={editorActionBusy}
                            icon={matchFieldIcon(field)}
                            label={fieldLabel}
                            onPress={() => {
                              void handleApplyMatchField(result, field);
                            }}
                            size="xs"
                            variant="secondary"
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          ) : null}
        </GlassSurface>

        <MetadataTextField
          label={strings.metadataEditor.titleField}
          value={form.title}
          placeholder={
            fieldOverrides.title ? baseForm.title : undefined
          }
          autoCapitalize="words"
          isOverridden={fieldOverrides.title}
          disabled={editorActionBusy}
          resetAccessibilityLabel={resetFieldAccessibilityLabel(
            strings.metadataEditor.titleField
          )}
          resetLabel={strings.metadataEditor.reset}
          onChangeText={(value) => setField("title", value)}
          onReset={() => resetField("title")}
        />

        <View style={styles.field}>
          <View style={styles.fieldLabelRow}>
            <NemuText
              density="compact"
              style={[styles.fieldLabel, { color: tokens.mutedForeground }]}
            >
              {strings.metadataEditor.status}
            </NemuText>
            {fieldOverrides.status ? (
              <NemuButton
                accessibilityLabel={resetFieldAccessibilityLabel(
                  strings.metadataEditor.status
                )}
                accessibilityState={{ disabled: editorActionBusy }}
                disabled={editorActionBusy}
                icon="refresh-outline"
                label={strings.metadataEditor.reset}
                onPress={() => resetField("status")}
                size="xs"
                variant="secondary"
              />
            ) : null}
          </View>
          <View accessibilityRole="tablist" style={styles.statusGrid}>
            {MOBILE_MANGA_STATUS_OPTIONS.map((option) => {
              const selected = form.status === option.value;
              const label = metadataStatusLabel(option.value, strings);
              const canSelect = canSelectMobileMetadataStatusOption({
                selected,
                disabled: editorActionBusy,
              });
              return (
                <NemuPressable
                  key={option.value}
                  accessibilityLabel={formatMobileString(
                    strings.metadataEditor.selectStatus,
                    {
                      status: label,
                    },
                  )}
                  accessibilityRole="tab"
                  accessibilityState={{ selected, disabled: editorActionBusy }}
                  disabled={editorActionBusy}
                  hapticFeedback={canSelect ? "selection" : "none"}
                  onPress={() => {
                    if (canSelect) {
                      setField("status", option.value);
                    }
                  }}
                  pressedScale={0.98}
                  style={[
                    styles.statusChip,
                    {
                      backgroundColor: selected ? tokens.primary : tokens.muted,
                      borderColor: selected ? tokens.primary : tokens.border,
                      opacity: editorActionBusy ? 0.64 : 1,
                    },
                  ]}
                >
                  <NemuText
                    density="compact"
                    numberOfLines={1}
                    style={[
                      styles.statusChipText,
                      { color: selected ? tokens.primaryForeground : tokens.mutedForeground },
                    ]}
                  >
                    {label}
                  </NemuText>
                </NemuPressable>
              );
            })}
          </View>
        </View>

        <MetadataTextField
          label={strings.metadataEditor.authors}
          value={form.authorsText}
          placeholder={strings.metadataEditor.authorsPlaceholder}
          autoCapitalize="words"
          isOverridden={fieldOverrides.authorsText}
          disabled={editorActionBusy}
          resetAccessibilityLabel={resetFieldAccessibilityLabel(
            strings.metadataEditor.authors
          )}
          resetLabel={strings.metadataEditor.reset}
          onChangeText={(value) => setField("authorsText", value)}
          onReset={() => resetField("authorsText")}
        />
        <MetadataTextField
          label={strings.metadataEditor.description}
          value={form.description}
          placeholder={
            fieldOverrides.description ? baseForm.description : undefined
          }
          multiline
          isOverridden={fieldOverrides.description}
          disabled={editorActionBusy}
          resetAccessibilityLabel={resetFieldAccessibilityLabel(
            strings.metadataEditor.description
          )}
          resetLabel={strings.metadataEditor.reset}
          onChangeText={(value) => setField("description", value)}
          onReset={() => resetField("description")}
        />
        <MetadataTextField
          label={strings.metadataEditor.tags}
          value={form.tagsText}
          placeholder={strings.metadataEditor.tagsPlaceholder}
          autoCapitalize="words"
          isOverridden={fieldOverrides.tagsText}
          disabled={editorActionBusy}
          resetAccessibilityLabel={resetFieldAccessibilityLabel(
            strings.metadataEditor.tags
          )}
          resetLabel={strings.metadataEditor.reset}
          onChangeText={(value) => setField("tagsText", value)}
          onReset={() => resetField("tagsText")}
        />
        <MetadataTextField
          label={strings.metadataEditor.coverUrl}
          value={form.coverUrl}
          keyboardType="url"
          autoCapitalize="none"
          placeholder={strings.metadataEditor.coverUrlPlaceholder}
          isOverridden={coverUrlOverridden}
          disabled={editorActionBusy}
          resetAccessibilityLabel={resetFieldAccessibilityLabel(
            strings.metadataEditor.coverUrl
          )}
          resetLabel={strings.metadataEditor.reset}
          onChangeText={(value) => {
            setSelectedCoverAsset(null);
            setCoverPreviewSourceId(null);
            setCoverError(null);
            setField("coverUrl", value);
          }}
          onReset={() => resetField("coverUrl")}
        />
      </ScrollView>

      <View style={styles.footer}>
        <NemuButton
          accessibilityLabel={strings.metadataEditor.reset}
          containerStyle={styles.resetButtonSlot}
          disabled={editorActionBusy || !canResetForm}
          icon="refresh-outline"
          label={strings.metadataEditor.reset}
          onPress={() => {
            if (editorActionBusy || !canResetForm) return;
            setSelectedCoverAsset(null);
            setCoverPreviewSourceId(null);
            setCoverError(null);
            setForm(mobileMetadataFormFromBase(entry));
          }}
          variant="secondary"
        />
        <NemuButton
          accessibilityLabel={strings.common.save}
          containerStyle={styles.saveButtonSlot}
          disabled={!canSave}
          icon="checkmark-outline"
          label={
            uploadingCover
              ? strings.metadataEditor.uploadingCover
              : saving || saveInFlight
                ? strings.metadataEditor.saving
                : strings.common.save
          }
          loading={saveInFlight || saving || uploadingCover}
          onPress={() => {
            void handleSave();
          }}
          variant={saveInFlight || saving || uploadingCover || canSave ? "default" : "secondary"}
        />
      </View>
    </MobileNativeSheetScaffold>
    <MobileConfirmationSheet
      visible={discardConfirm === "asking"}
      title={strings.metadataEditor.discardTitle}
      description={discardDescription}
      iconName="trash-outline"
      cancelLabel={strings.metadataEditor.discardKeepEditing}
      confirmLabel={strings.metadataEditor.discardConfirm}
      destructive
      onCancel={() => {
        discardCancelRef.current = true;
        setDiscardConfirm("cancelling");
      }}
      onConfirm={discardDraft}
      onDismiss={() => {
        if (!discardCancelRef.current) return;
        // Editing continues, so the editor owns its own dismissal again and
        // re-presents only once the prompt is fully gone.
        discardCancelRef.current = false;
        suppressDismissRef.current = false;
        setDiscardConfirm("hidden");
      }}
    />
    </>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    maxHeight: "100%",
    gap: 14,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: 13,
    paddingBottom: 2,
  },
  coverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  coverPreview: {
    width: 76,
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  coverImage: {
    width: "100%",
    height: "100%",
  },
  coverPlaceholder: {
    flex: 1,
  },
  coverCopy: {
    flex: 1,
    minWidth: 0,
  },
  coverTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  coverText: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
  },
  coverActions: {
    marginTop: 9,
    gap: 6,
  },
  coverActionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  coverSelectedText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  coverError: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  sourcePanel: {
    borderRadius: radius.xl,
  },
  sourcePanelContent: {
    gap: 10,
    padding: 12,
  },
  sourceHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  sourceHeaderIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  sourceHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  sourceTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  sourceSubtitle: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sourceList: {
    gap: 8,
  },
  sourceChoice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 8,
  },
  sourceChoiceIcon: {
    width: 36,
    height: 36,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceChoiceImage: {
    width: "100%",
    height: "100%",
  },
  sourceChoiceCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sourceChoiceTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  sourceChoiceDetail: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  sourceErrorNotice: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  sourceErrorCopy: {
    flex: 1,
    minWidth: 0,
  },
  sourceErrorTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  sourceErrorDetail: {
    marginTop: 1,
    fontSize: 12,
    lineHeight: 16,
  },
  matchPanel: {
    borderRadius: radius.xl,
  },
  matchPanelContent: {
    gap: 10,
    padding: 12,
  },
  matchHeader: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  matchIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  matchHeaderCopy: {
    flex: 1,
    minWidth: 0,
  },
  matchTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  matchSubtitle: {
    marginTop: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  matchSearchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  matchInputShell: {
    minHeight: 48,
    flex: 1,
    borderRadius: radius.lg,
  },
  matchInputContent: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
  },
  matchInput: {
    minHeight: 48,
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
  },
  matchSearchButton: {
    width: 48,
    height: 48,
  },
  matchError: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: nemuFontWeight.medium,
  },
  matchResults: {
    gap: 8,
  },
  matchResultGroup: {
    gap: 7,
  },
  matchResult: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    padding: 8,
  },
  matchCover: {
    width: 38,
    aspectRatio: 2 / 3,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  matchCoverImage: {
    width: "100%",
    height: "100%",
  },
  matchResultCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  matchResultTitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: nemuFontWeight.semibold,
  },
  matchResultSubtitle: {
    fontSize: 11,
    lineHeight: 14,
  },
  matchResultMeta: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.medium,
  },
  matchFieldActions: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingRight: 2,
  },
  matchFieldButton: {
    maxWidth: 120,
  },
  field: {
    gap: 7,
  },
  fieldLabelRow: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fieldLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: nemuFontWeight.semibold,
    textTransform: "uppercase",
  },
  inputShell: {
    minHeight: 44,
    borderRadius: radius.lg,
  },
  textAreaShell: {
    minHeight: 118,
  },
  inputContent: {
    paddingHorizontal: 12,
  },
  input: {
    minHeight: 44,
    fontSize: 14,
    lineHeight: 18,
  },
  textArea: {
    minHeight: 118,
    paddingTop: 11,
  },
  statusGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  statusChip: {
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
  },
  statusChipText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: nemuFontWeight.semibold,
  },
  footer: {
    flexDirection: "row",
    gap: 9,
  },
  resetButtonSlot: {
    flex: 0.42,
  },
  saveButtonSlot: {
    flex: 0.58,
  },
});
