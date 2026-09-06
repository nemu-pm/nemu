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
  MobileChip,
  MobileNativeSheetScaffold,
  MobileCachedImage,
  createNemuShadowStyle,
  iconSize,
  radius,
  spacing,
  useNemuTheme,
  NemuButton,
  GlassSurface,
  NemuTextFieldClearAction,
  NemuPressable,
  NemuText,
  nemuColorWithAlpha,
  nemuMaxFontSizeMultiplier,
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
import { stripMobileMetadataFieldNewlines } from "@/lib/mobileMetadataEditorFieldLayout";
import { getMobileMetadataStatusChipModels } from "@/lib/mobileMetadataEditorStatusChips";
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

/**
 * Every section in the editor opens the same way: a `sectionTitle` heading with
 * an optional caption under it, then the section's own surface. The heading
 * carries the copy that used to sit inside each card next to a filled icon
 * tile, so the cards hold controls only.
 */
function MetadataSectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.sectionHeader}>
      <NemuText
        color={tokens.foreground}
        density="compact"
        numberOfLines={2}
        variant="sectionTitle"
      >
        {title}
      </NemuText>
      {subtitle ? (
        <NemuText
          color={tokens.mutedForeground}
          density="compact"
          variant="caption"
        >
          {subtitle}
        </NemuText>
      ) : null}
    </View>
  );
}

function MetadataFieldLabelRow({
  label,
  disabled,
  isOverridden,
  resetAccessibilityLabel,
  resetLabel,
  onReset,
}: {
  label: string;
  disabled: boolean;
  isOverridden: boolean;
  resetAccessibilityLabel?: string;
  resetLabel?: string;
  onReset?: () => void;
}) {
  const { tokens } = useNemuTheme();

  return (
    <View style={styles.fieldLabelRow}>
      <NemuText
        color={tokens.mutedForeground}
        density="compact"
        numberOfLines={1}
        style={styles.fieldLabel}
        variant="label"
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
  );
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

  /*
    Every field is a `multiline` input, including the ones that hold a single
    logical line (title, cover URL, the comma lists): a single-line iOS field
    can only scroll a long value out of sight. The growing ones then have to
    escape `GlassSurface`'s `flex: 1` content view, which `styles.growingField`
    does — see the note there — so the text's own measured height drives the
    shell instead of the shell capping the text. `submitBehavior` keeps Return
    dismissing the keyboard rather than inserting a break.
  */
  const grows = !multiline;

  return (
    <View style={styles.field}>
      <MetadataFieldLabelRow
        disabled={disabled}
        isOverridden={isOverridden}
        label={label}
        onReset={onReset}
        resetAccessibilityLabel={resetAccessibilityLabel}
        resetLabel={resetLabel}
      />
      <GlassSurface
        style={[styles.inputShell, multiline && styles.textAreaShell]}
        contentStyle={[styles.inputContent, grows && styles.growingField]}
      >
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoCorrect={keyboardType !== "url"}
          keyboardType={keyboardType}
          editable={!disabled}
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          multiline
          onChangeText={
            grows
              ? (next) => onChangeText(stripMobileMetadataFieldNewlines(next))
              : onChangeText
          }
          placeholder={placeholder ?? label}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType={grows ? "done" : undefined}
          scrollEnabled={!grows}
          selectionColor={tokens.primary}
          style={[
            styles.input,
            multiline && styles.textArea,
            { color: tokens.foreground, opacity: disabled ? 0.72 : 1 },
          ]}
          submitBehavior={grows ? "blurAndSubmit" : "newline"}
          textAlignVertical="top"
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
  const statusChips = useMemo(
    () => getMobileMetadataStatusChipModels({ status: form.status, strings }),
    [form.status, strings],
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
        <View style={styles.section}>
          <MetadataSectionHeader
            title={strings.metadataEditor.coverTitle}
            subtitle={strings.metadataEditor.coverDescription}
          />
          <GlassSurface style={styles.card} contentStyle={styles.cardContent}>
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
                    color={tokens.mutedForeground}
                    density="compact"
                    numberOfLines={2}
                    variant="caption"
                  >
                    {strings.metadataEditor.coverSelected}
                  </NemuText>
                ) : null}
              </View>
            </View>
            {coverError ? (
              <NemuText
                color={tokens.danger}
                density="compact"
                variant="caption"
              >
                {coverError}
              </NemuText>
            ) : null}
          </GlassSurface>
        </View>

        {canFetchFromSource ? (
          <View style={styles.section}>
            <MetadataSectionHeader
              title={strings.metadataEditor.sourceFetchTitle}
              subtitle={strings.metadataEditor.sourceFetchSubtitle}
            />
            <View style={styles.rowList}>
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
                      styles.listRow,
                      {
                        backgroundColor: tokens.card,
                        borderColor: tokens.border,
                        opacity: editorActionBusy && !loadingSource ? 0.55 : 1,
                      },
                    ]}
                  >
                    <View style={styles.rowIcon}>
                      {choice.icon ? (
                        <MobileCachedImage
                          fallback={
                            <Ionicons
                              name="albums-outline"
                              size={iconSize.md}
                              color={tokens.mutedForeground}
                            />
                          }
                          uriOwnership="source"
                          source={{ uri: choice.icon }}
                          style={styles.rowIconImage}
                        />
                      ) : (
                        <Ionicons
                          name="albums-outline"
                          size={iconSize.md}
                          color={tokens.mutedForeground}
                        />
                      )}
                    </View>
                    <View style={styles.rowCopy}>
                      <NemuText
                        color={tokens.foreground}
                        density="compact"
                        numberOfLines={1}
                        variant="rowTitle"
                      >
                        {choice.label}
                      </NemuText>
                      {choice.detail ? (
                        <NemuText
                          color={tokens.mutedForeground}
                          density="compact"
                          numberOfLines={1}
                          variant="rowSubtitle"
                        >
                          {choice.detail}
                        </NemuText>
                      ) : null}
                    </View>
                    <View style={styles.rowAccessory}>
                      {loadingSource ? (
                        <ActivityIndicator color={tokens.mutedForeground} size="small" />
                      ) : (
                        <Ionicons
                          name="cloud-download-outline"
                          size={iconSize.md}
                          color={tokens.primary}
                        />
                      )}
                    </View>
                  </NemuPressable>
                );
              })}
            </View>

            {sourceError ? (
              <View
                style={[
                  styles.noticeRow,
                  { backgroundColor: tokens.muted, borderColor: tokens.border },
                ]}
              >
                <Ionicons
                  name="alert-circle-outline"
                  size={iconSize.sm}
                  color={tokens.danger}
                />
                <View style={styles.rowCopy}>
                  <NemuText
                    color={tokens.foreground}
                    density="compact"
                    numberOfLines={1}
                    variant="label"
                  >
                    {sourceError.title}
                  </NemuText>
                  <NemuText
                    color={tokens.mutedForeground}
                    density="compact"
                    numberOfLines={2}
                    variant="caption"
                  >
                    {sourceError.detail}
                  </NemuText>
                </View>
              </View>
            ) : null}
          </View>
        ) : null}

        <View style={styles.section}>
          <MetadataSectionHeader
            title={strings.metadataEditor.matchTitle}
            subtitle={strings.metadataEditor.matchSubtitle}
          />

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
                maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
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
            <NemuText color={tokens.danger} density="compact" variant="caption">
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
                        styles.listRow,
                        {
                          backgroundColor: tokens.card,
                          borderColor: tokens.border,
                          opacity: editorActionBusy ? 0.7 : 1,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.matchCover,
                          {
                            backgroundColor: tokens.muted,
                            borderColor: tokens.coverBorder,
                          },
                        ]}
                      >
                        {result.coverUrl ? (
                          <MobileCachedImage
                            fallback={
                              <Ionicons
                                name="image-outline"
                                size={iconSize.sm}
                                color={tokens.mutedForeground}
                              />
                            }
                            uriOwnership="source"
                            source={{ uri: result.coverUrl }}
                            style={styles.matchCoverImage}
                          />
                        ) : (
                          <Ionicons
                            name="image-outline"
                            size={iconSize.sm}
                            color={tokens.mutedForeground}
                          />
                        )}
                      </View>
                      <View style={styles.rowCopy}>
                        <NemuText
                          color={tokens.foreground}
                          density="compact"
                          numberOfLines={1}
                          variant="rowTitle"
                        >
                          {result.title}
                        </NemuText>
                        {result.subtitle ? (
                          <NemuText
                            color={tokens.mutedForeground}
                            density="compact"
                            numberOfLines={1}
                            variant="rowSubtitle"
                          >
                            {result.subtitle}
                          </NemuText>
                        ) : null}
                        <NemuText
                          color={tokens.mutedForeground}
                          density="compact"
                          numberOfLines={1}
                          variant="caption"
                        >
                          {matchSummary(result)}
                        </NemuText>
                      </View>
                      <View style={styles.rowAccessory}>
                        <Ionicons
                          name="add-circle-outline"
                          size={iconSize.lg}
                          color={tokens.primary}
                        />
                      </View>
                    </NemuPressable>

                    <ScrollView
                      horizontal
                      keyboardShouldPersistTaps="handled"
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.chipRowContent}
                    >
                      {MOBILE_METADATA_MATCH_FIELD_ORDER.filter(
                        (field) => availability[field],
                      ).map((field) => {
                        const fieldLabel = matchFieldLabel(field, strings);
                        return (
                          <MobileChip
                            key={field}
                            accessibilityLabel={formatMobileString(
                              strings.metadataEditor.applyMatchField,
                              {
                                field: fieldLabel,
                                provider: result.providerLabel,
                              }
                            )}
                            accessibilityRole="button"
                            accessibilityState={{
                              disabled: editorActionBusy,
                            }}
                            disabled={editorActionBusy}
                            fallbackIcon={matchFieldIcon(field)}
                            hapticFeedback="press"
                            label={fieldLabel}
                            onPress={() => {
                              void handleApplyMatchField(result, field);
                            }}
                            selected={false}
                            variant="toggle"
                          />
                        );
                      })}
                    </ScrollView>
                  </View>
                );
              })}
            </View>
          ) : null}
        </View>

        <View style={styles.fields}>
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
            <MetadataFieldLabelRow
              disabled={editorActionBusy}
              isOverridden={fieldOverrides.status}
              label={strings.metadataEditor.status}
              onReset={() => resetField("status")}
              resetAccessibilityLabel={resetFieldAccessibilityLabel(
                strings.metadataEditor.status
              )}
              resetLabel={strings.metadataEditor.reset}
            />
            <View accessibilityRole="radiogroup">
              <ScrollView
                horizontal
                keyboardShouldPersistTaps="handled"
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRowContent}
              >
                {statusChips.map((chip) => {
                  const canSelect = canSelectMobileMetadataStatusOption({
                    selected: chip.selected,
                    disabled: editorActionBusy,
                  });
                  return (
                    <MobileChip
                      key={chip.value}
                      accessibilityLabel={chip.accessibilityLabel}
                      accessibilityRole="radio"
                      accessibilityState={{
                        checked: chip.selected,
                        disabled: editorActionBusy,
                      }}
                      disabled={editorActionBusy}
                      hapticFeedback={canSelect ? "selection" : "none"}
                      label={chip.label}
                      onPress={() => {
                        if (canSelect) {
                          setField("status", chip.value);
                        }
                      }}
                      selected={chip.selected}
                      testID={`MetadataStatusChip:${chip.value}`}
                      variant="toggle"
                    />
                  );
                })}
              </ScrollView>
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
        </View>
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
    gap: spacing.md,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    gap: spacing.lg,
    paddingBottom: 2,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    gap: 2,
  },
  card: {
    borderRadius: radius.xl,
  },
  cardContent: {
    gap: spacing.md,
    padding: spacing.md,
  },
  coverRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  coverPreview: {
    width: 68,
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
    gap: spacing.sm,
  },
  coverActionButtons: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  rowList: {
    gap: spacing.sm,
  },
  // The shared row geometry for a fetchable source and a metadata match: the
  // same 64pt list row `NemuListRow` draws, with the busy/press states this
  // editor needs on top.
  listRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  // Sized, but unfilled: a source mark is the icon, so it needs no tile behind
  // it, and the frame only keeps the row's copy aligned while an icon loads.
  rowIcon: {
    width: 38,
    height: 38,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
  },
  rowIconImage: {
    width: "100%",
    height: "100%",
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
  },
  rowAccessory: {
    minWidth: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  matchSearchRow: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
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
    // Stays a single-line field: it scrolls a long query horizontally instead
    // of growing, so the search button beside it keeps its place. See
    // `styles.input` for why it carries no `lineHeight`.
    minHeight: 48,
    flex: 1,
    fontSize: 14,
  },
  matchSearchButton: {
    width: 48,
    height: 48,
  },
  matchResults: {
    gap: spacing.md,
  },
  matchResultGroup: {
    gap: spacing.sm,
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
  // Shared by the status selector and the per-field apply chips. The bottom
  // padding reserves room for the depth surface's shadow halo, which the
  // horizontal scroller would otherwise clip.
  chipRowContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingBottom: 6,
    paddingRight: 2,
  },
  fields: {
    gap: spacing.md,
  },
  field: {
    gap: 6,
  },
  fieldLabelRow: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fieldLabel: {
    flex: 1,
    minWidth: 0,
  },
  inputShell: {
    minHeight: 44,
    // Centres a growing field's text block while it is still shorter than the
    // 44pt floor; once the text is taller there is no slack left to centre.
    justifyContent: "center",
    borderRadius: radius.lg,
  },
  textAreaShell: {
    minHeight: 118,
  },
  inputContent: {
    paddingHorizontal: spacing.md,
  },
  growingField: {
    /*
      `flex: 0` overrides the `flex: 1` that `GlassSurface` puts on its content
      view, and that override is what makes these fields grow at all. With
      `flex: 1` the content view takes its height from the shell rather than
      from the text, so React Native measured the input against a maximum
      height of one line (`BaseTextInputShadowNode::measureContent` clamps the
      measured text to the layout constraints it is given) and the wrapped
      lines below the first were laid out into a box that could never grow to
      hold them. Sized by content instead, the text's own height drives the
      content view, the content view drives the shell, and `minHeight: 44` on
      the shell is left as a floor.
    */
    flex: 0,
    paddingVertical: 8,
  },
  input: {
    // No `lineHeight`: React Native turns it into the paragraph style's
    // minimum *and maximum* line height, and a maximum below the font's own
    // line box shears the glyphs — which is what a 18pt cap does to CJK text
    // at 14pt (PingFang and Hiragino need ~20pt), and to every script once
    // Dynamic Type scales the cap and the font together. The natural line
    // height keeps full ascenders and descenders in every language.
    fontSize: 14,
  },
  textArea: {
    minHeight: 118,
    paddingTop: 11,
  },
  footer: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  resetButtonSlot: {
    flex: 0.42,
  },
  saveButtonSlot: {
    flex: 0.58,
  },
});
