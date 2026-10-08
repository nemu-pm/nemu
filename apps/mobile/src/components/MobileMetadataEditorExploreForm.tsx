import { Fragment, type ReactNode } from "react";
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type ImageSourcePropType,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { Button as SwiftButton, HStack as SwiftHStack, Host as SwiftHost, Image as SwiftImage, Menu as SwiftMenu, Text as SwiftText } from "@expo/ui/swift-ui";
import {
  buttonStyle,
  disabled as swiftDisabled,
  font as swiftFont,
  foregroundStyle,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import {
  MobileCachedImage,
  MobileChip,
  MobileNativeSheetEndSpacer,
  NemuNativeSearchField,
  NemuPressable,
  NemuRingSpinner,
  NemuText,
  iconSize,
  nemuColorWithAlpha,
  nemuFontWeight,
  nemuMaxFontSizeMultiplier,
  useMobileNativeSheetTheme,
} from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import { formatMobileString, type MobileStrings } from "@/lib/mobileI18n";
import { stripMobileMetadataFieldNewlines } from "@/lib/mobileMetadataEditorFieldLayout";
import type { MobileMetadataStatusChipModel } from "@/lib/mobileMetadataEditorStatusChips";
import {
  MOBILE_METADATA_MATCH_FIELD_ORDER,
  getMobileMetadataMatchFieldAvailability,
  type MobileMetadataMatchFieldKey,
  type MobileMetadataMatchResult,
} from "@/lib/mobileMetadataMatch";
import type { MobileMetadataFormValues } from "@/lib/mobileMetadataOverrides";
import type { MobileSourceErrorPresentation } from "@/lib/mobileSourceErrors";
import {
  MOBILE_SETTINGS_CONTROL_RADIUS,
  MOBILE_SETTINGS_GROUP_INSET,
  MOBILE_SHEET_GROUP_RADIUS,
} from "@/lib/mobileExploreRadius";

/** The room between a row's edge and its contents; thumbnails and marks sit this far in, so their corners are concentric with the group's. */
const ROW_INSET = MOBILE_SETTINGS_GROUP_INSET;
/** Corner of a thumbnail or mark inside a row: the group's corner less the row inset. */
const MARK_RADIUS = MOBILE_SETTINGS_CONTROL_RADIUS;

type FieldKey = "title" | "authorsText" | "description" | "tagsText" | "coverUrl";

export type MobileMetadataEditorExploreFormProps = {
  strings: MobileStrings;
  form: MobileMetadataFormValues;
  /** Fields that differ from the source (they show a reset glyph). */
  overridden: Record<FieldKey, boolean>;
  /** Lighter placeholders for overridden fields (the source's value). */
  basePlaceholders: Partial<Record<FieldKey, string>>;
  busy: boolean;
  canReset: boolean;
  /** The status differs from the source (it shows a reset glyph). */
  overriddenStatus: boolean;
  cover: {
    imageSource: ImageSourcePropType | { uri: string; headers?: Record<string, string> } | null;
    isPickedAsset: boolean;
    subtitle: string | null;
    picking: boolean;
    error: string | null;
    overridden: boolean;
    onPick: () => void;
    onClear: () => void;
    onChangeUrl: (value: string) => void;
  };
  sources: {
    choices: { id: string; label: string; detail?: string; icon?: string }[];
    fetchingId: string | null;
    error: MobileSourceErrorPresentation | null;
    onFetch: (id: string) => void;
  } | null;
  match: {
    query: string;
    canSearch: boolean;
    loading: boolean;
    applying: boolean;
    error: string | null;
    results: MobileMetadataMatchResult[];
    summary: (result: MobileMetadataMatchResult) => string;
    fieldLabel: (field: MobileMetadataMatchFieldKey) => string;
    fieldIcon: (field: MobileMetadataMatchFieldKey) => keyof typeof Ionicons.glyphMap;
    onChangeQuery: (value: string) => void;
    onSearch: () => void;
    onApply: (result: MobileMetadataMatchResult) => void;
    onApplyField: (result: MobileMetadataMatchResult, field: MobileMetadataMatchFieldKey) => void;
  };
  statusChips: MobileMetadataStatusChipModel[];
  canSelectStatus: (chip: MobileMetadataStatusChipModel) => boolean;
  resetFieldLabel: (field: string) => string;
  onSetField: (key: FieldKey, value: string) => void;
  onSetStatus: (value: number) => void;
  onResetField: (key: FieldKey | "status") => void;
  onResetAll: () => void;
};

/**
 * The metadata editor as an inset-grouped form, in the shape of the system's
 * own editors: a small heading and a footnote around each rounded group,
 * rows (not boxes) with hairline separators, a native search field for the
 * match, a menu row for the status. Save and close live in the sheet's bar,
 * Reset is the last row. Design-explore only.
 */
export function MobileMetadataEditorExploreForm(props: MobileMetadataEditorExploreFormProps) {
  const { strings, form, overridden, basePlaceholders, busy, cover, sources, match, statusChips } = props;
  const { tokens } = useMobileNativeSheetTheme();
  const status = statusChips.find((chip) => chip.selected);

  return (
    <ScrollView
      // Android: inside a native sheet, hand the drag to the sheet at the top.
      nestedScrollEnabled
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
    >
      <Section title={strings.metadataEditor.coverTitle} footer={cover.error ? undefined : strings.metadataEditor.coverDescription}>
        <Group>
          <View style={styles.row}>
            <View
              accessibilityRole="image"
              accessibilityLabel={strings.metadataEditor.coverPreview}
              style={[styles.coverThumb, { backgroundColor: tokens.muted, borderColor: tokens.coverBorder }]}
            >
              {cover.imageSource ? (
                cover.isPickedAsset ? (
                  <Image source={cover.imageSource as ImageSourcePropType} style={styles.fill} />
                ) : (
                  <MobileCachedImage
                    fallback={<CoverPlaceholder />}
                    uriOwnership="source"
                    source={cover.imageSource as { uri: string; headers?: Record<string, string> }}
                    style={styles.fill}
                  />
                )
              ) : (
                <CoverPlaceholder />
              )}
            </View>
            <View style={styles.copy}>
              <NemuText color={tokens.foreground} density="compact" numberOfLines={1} style={styles.rowTitle}>
                {strings.metadataEditor.cover}
              </NemuText>
              {cover.subtitle ? (
                <NemuText
                  color={tokens.mutedForeground}
                  density="compact"
                  ellipsizeMode="middle"
                  numberOfLines={1}
                  style={styles.rowDetail}
                >
                  {cover.subtitle}
                </NemuText>
              ) : null}
            </View>
            <RowGlyph
              accessibilityLabel={strings.metadataEditor.chooseCoverImage}
              busy={cover.picking}
              disabled={busy}
              icon="image-outline"
              onPress={cover.onPick}
            />
            {cover.overridden ? (
              <RowGlyph
                accessibilityLabel={props.resetFieldLabel(strings.metadataEditor.cover)}
                disabled={busy}
                icon="trash-outline"
                onPress={cover.onClear}
              />
            ) : null}
          </View>
          <Separator />
          <TextRow
            label={strings.metadataEditor.coverUrl}
            value={form.coverUrl}
            placeholder={strings.metadataEditor.coverUrlPlaceholder}
            keyboardType="url"
            autoCapitalize="none"
            disabled={busy}
            overridden={cover.overridden}
            resetLabel={props.resetFieldLabel(strings.metadataEditor.coverUrl)}
            onChangeText={cover.onChangeUrl}
            onReset={() => props.onResetField("coverUrl")}
          />
        </Group>
        {cover.error ? (
          <NemuText color={tokens.danger} density="compact" style={styles.footer} variant="caption">
            {cover.error}
          </NemuText>
        ) : null}
      </Section>

      {sources ? (
        <Section title={strings.metadataEditor.sourceFetchTitle} footer={strings.metadataEditor.sourceFetchSubtitle}>
          <Group>
            {sources.choices.map((choice, index) => {
              const loading = sources.fetchingId === choice.id;
              return (
                <Fragment key={choice.id}>
                  {index > 0 ? <Separator inset={ROW_INSET + 32 + 12} /> : null}
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={formatMobileString(strings.metadataEditor.sourceFetchAccessibility, {
                      source: choice.label,
                    })}
                    accessibilityState={{ busy: loading || undefined, disabled: busy }}
                    disabled={busy}
                    onPress={() => sources.onFetch(choice.id)}
                    pressHighlight
                    pressedScale={1}
                    style={[styles.row, { opacity: busy && !loading ? 0.55 : 1 }]}
                  >
                    <View style={styles.sourceMark}>
                      {choice.icon ? (
                        <MobileCachedImage
                          fallback={<Ionicons name="albums-outline" size={iconSize.md} color={tokens.mutedForeground} />}
                          uriOwnership="source"
                          source={{ uri: choice.icon }}
                          style={styles.fill}
                        />
                      ) : (
                        <Ionicons name="albums-outline" size={iconSize.md} color={tokens.mutedForeground} />
                      )}
                    </View>
                    <View style={styles.copy}>
                      <NemuText color={tokens.foreground} density="compact" numberOfLines={1} style={styles.rowTitle}>
                        {choice.label}
                      </NemuText>
                      {choice.detail ? (
                        <NemuText color={tokens.mutedForeground} density="compact" numberOfLines={1} style={styles.rowDetail}>
                          {choice.detail}
                        </NemuText>
                      ) : null}
                    </View>
                    {loading ? (
                      <ActivityIndicator color={tokens.mutedForeground} size="small" />
                    ) : (
                      <Ionicons name="cloud-download-outline" size={iconSize.md} color={tokens.primary} />
                    )}
                  </NemuPressable>
                </Fragment>
              );
            })}
            {sources.error ? (
              <>
                <Separator />
                <View style={styles.row}>
                  <Ionicons name="alert-circle-outline" size={iconSize.sm} color={tokens.danger} />
                  <View style={styles.copy}>
                    <NemuText color={tokens.foreground} density="compact" numberOfLines={1} style={styles.rowTitle}>
                      {sources.error.title}
                    </NemuText>
                    <NemuText color={tokens.mutedForeground} density="compact" numberOfLines={2} style={styles.rowDetail}>
                      {sources.error.detail}
                    </NemuText>
                  </View>
                </View>
              </>
            ) : null}
          </Group>
        </Section>
      ) : null}

      <Section title={strings.metadataEditor.matchTitle} footer={strings.metadataEditor.matchSubtitle}>
        <NemuNativeSearchField
          accessibilityLabel={strings.metadataEditor.searchMatches}
          clearAccessibilityLabel={strings.common.clear}
          clearActionTestID="MetadataMatchSearchClearAction"
          onChangeText={match.onChangeQuery}
          onSubmit={() => {
            if (!match.canSearch) return;
            match.onSearch();
          }}
          placeholder={strings.metadataEditor.matchSearchPlaceholder}
          testID="MetadataMatchSearchField"
          value={match.query}
        />
        {match.loading ? (
          <View style={styles.statusLine}>
            <NemuRingSpinner size={16} />
            <NemuText color={tokens.mutedForeground} density="compact" variant="caption">
              {strings.search.searching}
            </NemuText>
          </View>
        ) : null}
        {match.error ? (
          <NemuText color={tokens.danger} density="compact" style={styles.footer} variant="caption">
            {match.error}
          </NemuText>
        ) : null}
        {match.results.length ? (
          <Group>
            {match.results.map((result, index) => {
              const availability = getMobileMetadataMatchFieldAvailability(result);
              return (
                <Fragment key={`${result.provider}:${result.externalId}`}>
                  {index > 0 ? <Separator /> : null}
                  <NemuPressable
                    accessibilityRole="button"
                    accessibilityLabel={formatMobileString(strings.metadataEditor.applyMatch, {
                      provider: result.providerLabel,
                    })}
                    accessibilityState={{ busy: match.applying || undefined, disabled: busy }}
                    disabled={busy}
                    onPress={() => match.onApply(result)}
                    pressHighlight
                    pressedScale={1}
                    style={[styles.row, { opacity: busy ? 0.7 : 1 }]}
                  >
                    <View style={[styles.matchCover, { backgroundColor: tokens.muted, borderColor: tokens.coverBorder }]}>
                      {result.coverUrl ? (
                        <MobileCachedImage
                          fallback={<Ionicons name="image-outline" size={iconSize.sm} color={tokens.mutedForeground} />}
                          uriOwnership="source"
                          source={{ uri: result.coverUrl }}
                          style={styles.fill}
                        />
                      ) : (
                        <Ionicons name="image-outline" size={iconSize.sm} color={tokens.mutedForeground} />
                      )}
                    </View>
                    <View style={styles.copy}>
                      <NemuText color={tokens.foreground} density="compact" numberOfLines={1} style={styles.rowTitle}>
                        {result.title}
                      </NemuText>
                      {result.subtitle ? (
                        <NemuText color={tokens.mutedForeground} density="compact" numberOfLines={1} style={styles.rowDetail}>
                          {result.subtitle}
                        </NemuText>
                      ) : null}
                      <NemuText color={tokens.mutedForeground} density="compact" numberOfLines={1} style={styles.rowDetail}>
                        {match.summary(result)}
                      </NemuText>
                    </View>
                    <Ionicons name="add-circle-outline" size={iconSize.lg} color={tokens.primary} />
                  </NemuPressable>
                  <ScrollView
                    horizontal
                    scrollsToTop={false}
                    keyboardShouldPersistTaps="handled"
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.chipRow}
                  >
                    {MOBILE_METADATA_MATCH_FIELD_ORDER.filter((field) => availability[field]).map((field) => {
                      const fieldLabel = match.fieldLabel(field);
                      return (
                        <MobileChip
                          key={field}
                          accessibilityLabel={formatMobileString(strings.metadataEditor.applyMatchField, {
                            field: fieldLabel,
                            provider: result.providerLabel,
                          })}
                          accessibilityRole="button"
                          accessibilityState={{ disabled: busy }}
                          disabled={busy}
                          fallbackIcon={match.fieldIcon(field)}
                          hapticFeedback="press"
                          label={fieldLabel}
                          onPress={() => match.onApplyField(result, field)}
                          selected={false}
                          variant="toggle"
                        />
                      );
                    })}
                  </ScrollView>
                </Fragment>
              );
            })}
          </Group>
        ) : null}
      </Section>

      <Section title={strings.metadataEditor.detailsTitle}>
        <Group>
          <TextRow
            label={strings.metadataEditor.titleField}
            value={form.title}
            placeholder={basePlaceholders.title}
            autoCapitalize="words"
            disabled={busy}
            overridden={overridden.title}
            resetLabel={props.resetFieldLabel(strings.metadataEditor.titleField)}
            onChangeText={(value) => props.onSetField("title", value)}
            onReset={() => props.onResetField("title")}
          />
          <Separator />
          <View style={[styles.row, styles.statusRow]}>
            <NemuText color={tokens.foreground} density="compact" style={styles.rowLabel}>
              {strings.metadataEditor.status}
            </NemuText>
            <View style={styles.spacer} />
            <StatusMenu
              chips={statusChips}
              canSelect={props.canSelectStatus}
              disabled={busy}
              label={status?.label ?? ""}
              onSelect={props.onSetStatus}
            />
            {props.overriddenStatus ? (
              <RowGlyph
                accessibilityLabel={props.resetFieldLabel(strings.metadataEditor.status)}
                disabled={busy}
                icon="refresh-outline"
                onPress={() => props.onResetField("status")}
              />
            ) : null}
          </View>
          <Separator />
          <TextRow
            label={strings.metadataEditor.authors}
            value={form.authorsText}
            placeholder={strings.metadataEditor.authorsPlaceholder}
            autoCapitalize="words"
            disabled={busy}
            overridden={overridden.authorsText}
            resetLabel={props.resetFieldLabel(strings.metadataEditor.authors)}
            onChangeText={(value) => props.onSetField("authorsText", value)}
            onReset={() => props.onResetField("authorsText")}
          />
          <Separator />
          <TextRow
            label={strings.metadataEditor.description}
            value={form.description}
            placeholder={basePlaceholders.description}
            multiline
            disabled={busy}
            overridden={overridden.description}
            resetLabel={props.resetFieldLabel(strings.metadataEditor.description)}
            onChangeText={(value) => props.onSetField("description", value)}
            onReset={() => props.onResetField("description")}
          />
          <Separator />
          <TextRow
            label={strings.metadataEditor.tags}
            value={form.tagsText}
            placeholder={strings.metadataEditor.tagsPlaceholder}
            autoCapitalize="words"
            disabled={busy}
            overridden={overridden.tagsText}
            resetLabel={props.resetFieldLabel(strings.metadataEditor.tags)}
            onChangeText={(value) => props.onSetField("tagsText", value)}
            onReset={() => props.onResetField("tagsText")}
          />
        </Group>
      </Section>

      <Section>
        <Group>
          <NemuPressable
            accessibilityRole="button"
            accessibilityLabel={strings.metadataEditor.resetAll}
            accessibilityState={{ disabled: busy || !props.canReset }}
            disabled={busy || !props.canReset}
            onPress={props.onResetAll}
            pressHighlight
            pressedScale={1}
            style={[styles.row, { opacity: busy || !props.canReset ? 0.45 : 1 }]}
          >
            <Ionicons name="refresh-outline" size={iconSize.md} color={tokens.primary} />
            <NemuText color={tokens.primary} density="compact" style={styles.rowTitle}>
              {strings.metadataEditor.resetAll}
            </NemuText>
          </NemuPressable>
        </Group>
      </Section>
      <MobileNativeSheetEndSpacer />
    </ScrollView>
  );
}

function CoverPlaceholder() {
  const { tokens } = useMobileNativeSheetTheme();
  return (
    <LinearGradient colors={[nemuColorWithAlpha(tokens.primary, 0.33), tokens.muted]} style={styles.fill} />
  );
}

function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  const { tokens } = useMobileNativeSheetTheme();
  return (
    <View style={styles.section}>
      {title ? (
        <NemuText
          accessibilityRole="header"
          color={tokens.mutedForeground}
          density="compact"
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={styles.header}
        >
          {title}
        </NemuText>
      ) : null}
      {children}
      {footer ? (
        <NemuText
          color={tokens.mutedForeground}
          density="compact"
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          style={styles.footer}
        >
          {footer}
        </NemuText>
      ) : null}
    </View>
  );
}

/** One rounded group: its corner is a sheet group's (the sheet's own corner less the sheet's gutter). */
function Group({ children }: { children: ReactNode }) {
  const { tokens } = useMobileNativeSheetTheme();
  return (
    <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>{children}</View>
  );
}

function Separator({ inset = ROW_INSET }: { inset?: number }) {
  const { tokens } = useMobileNativeSheetTheme();
  return <View style={[styles.separator, { backgroundColor: tokens.border, marginLeft: inset }]} />;
}

function RowGlyph({
  accessibilityLabel,
  busy = false,
  disabled,
  icon,
  onPress,
}: {
  accessibilityLabel: string;
  busy?: boolean;
  disabled: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  return (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ busy: busy || undefined, disabled }}
      disabled={disabled}
      hapticFeedback="press"
      minimumTouchTarget
      onPress={onPress}
      pressProfile="icon"
      style={styles.glyph}
    >
      {busy ? (
        <ActivityIndicator color={tokens.mutedForeground} size="small" />
      ) : (
        <Ionicons name={icon} size={iconSize.md} color={tokens.primary} />
      )}
    </NemuPressable>
  );
}

/**
 * A field as a row: its label in small type above the value, the value
 * growing with its text (every field is a multiline input underneath, so a
 * long value wraps instead of scrolling out of sight; Return still just
 * dismisses the keyboard on the single-line ones).
 */
function TextRow({
  label,
  value,
  placeholder,
  multiline = false,
  keyboardType = "default",
  autoCapitalize = "sentences",
  overridden,
  disabled,
  resetLabel,
  onChangeText,
  onReset,
}: {
  label: string;
  value: string;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "url";
  autoCapitalize?: "none" | "sentences" | "words";
  overridden: boolean;
  disabled: boolean;
  resetLabel: string;
  onChangeText: (value: string) => void;
  onReset: () => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  return (
    <View style={styles.textRow}>
      <View style={styles.textRowBody}>
        <NemuText color={tokens.mutedForeground} density="compact" numberOfLines={1} style={styles.fieldLabel}>
          {label}
        </NemuText>
        <TextInput
          accessibilityLabel={label}
          autoCapitalize={autoCapitalize}
          autoCorrect={keyboardType !== "url"}
          keyboardType={keyboardType}
          editable={!disabled}
          maxFontSizeMultiplier={nemuMaxFontSizeMultiplier}
          multiline
          onChangeText={multiline ? onChangeText : (next) => onChangeText(stripMobileMetadataFieldNewlines(next))}
          placeholder={placeholder ?? label}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType={multiline ? undefined : "done"}
          scrollEnabled={false}
          selectionColor={tokens.primary}
          style={[styles.input, multiline && styles.textArea, { color: tokens.foreground, opacity: disabled ? 0.72 : 1 }]}
          submitBehavior={multiline ? "newline" : "blurAndSubmit"}
          textAlignVertical="top"
          value={value}
        />
      </View>
      {overridden ? (
        <RowGlyph accessibilityLabel={resetLabel} disabled={disabled} icon="refresh-outline" onPress={onReset} />
      ) : null}
    </View>
  );
}

/** The status as a menu row's trailing value (system picker-menu look: value + up/down chevrons). */
function StatusMenu({
  chips,
  canSelect,
  disabled,
  label,
  onSelect,
}: {
  chips: MobileMetadataStatusChipModel[];
  canSelect: (chip: MobileMetadataStatusChipModel) => boolean;
  disabled: boolean;
  label: string;
  onSelect: (value: number) => void;
}) {
  const { scheme, tokens } = useMobileNativeSheetTheme();
  if (Platform.OS !== "ios") {
    return (
      <View accessibilityRole="radiogroup" style={styles.statusChips}>
        {chips.map((chip) => (
          <MobileChip
            key={chip.value}
            accessibilityLabel={chip.accessibilityLabel}
            accessibilityRole="radio"
            accessibilityState={{ checked: chip.selected, disabled }}
            disabled={disabled}
            hapticFeedback={canSelect(chip) ? "selection" : "none"}
            label={chip.label}
            onPress={() => {
              if (canSelect(chip)) onSelect(chip.value);
            }}
            selected={chip.selected}
            testID={`MetadataStatusChip:${chip.value}`}
            variant="toggle"
          />
        ))}
      </View>
    );
  }
  return (
    <SwiftHost colorScheme={scheme} matchContents style={styles.statusHost}>
      <SwiftMenu
        label={
          <SwiftHStack alignment="center" spacing={6}>
            <SwiftText modifiers={[swiftFont({ size: 16 }), foregroundStyle(tokens.mutedForeground)]}>{label}</SwiftText>
            <SwiftImage systemName="chevron.up.chevron.down" size={12} color={tokens.mutedForeground} />
          </SwiftHStack>
        }
        modifiers={[buttonStyle("plain"), tint(tokens.primary), ...(disabled ? [swiftDisabled(true)] : [])]}
      >
        {chips.map((chip) => (
          <SwiftButton
            key={chip.value}
            label={chip.selected ? `✓ ${chip.label}` : chip.label}
            onPress={() => {
              if (!canSelect(chip)) return;
              void hapticSelection();
              onSelect(chip.value);
            }}
          />
        ))}
      </SwiftMenu>
    </SwiftHost>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { gap: 22, paddingBottom: 24 },
  section: { gap: 6 },
  header: {
    marginLeft: ROW_INSET,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: nemuFontWeight.semibold,
  },
  footer: {
    marginHorizontal: ROW_INSET,
    fontSize: 12,
    lineHeight: 16,
  },
  group: {
    borderRadius: MOBILE_SHEET_GROUP_RADIUS,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  separator: { height: StyleSheet.hairlineWidth },
  row: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: ROW_INSET,
    paddingVertical: 8,
  },
  statusRow: { minHeight: 48 },
  spacer: { flex: 1 },
  copy: { flex: 1, minWidth: 0 },
  rowTitle: { fontSize: 16, lineHeight: 21, fontWeight: nemuFontWeight.medium },
  rowDetail: { fontSize: 13, lineHeight: 17 },
  rowLabel: { fontSize: 16, lineHeight: 21 },
  fill: { width: "100%", height: "100%" },
  coverThumb: {
    width: 40,
    aspectRatio: 2 / 3,
    overflow: "hidden",
    borderRadius: MARK_RADIUS,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  matchCover: {
    width: 38,
    aspectRatio: 2 / 3,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: MARK_RADIUS,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
  },
  sourceMark: {
    width: 32,
    height: 32,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: MARK_RADIUS,
    borderCurve: "continuous",
  },
  glyph: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginRight: -8 },
  statusLine: { minHeight: 20, flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: ROW_INSET },
  chipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: ROW_INSET,
    paddingBottom: 10,
  },
  textRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingLeft: ROW_INSET,
    paddingRight: ROW_INSET,
    paddingVertical: 8,
  },
  textRowBody: { flex: 1, minWidth: 0 },
  fieldLabel: { fontSize: 12, lineHeight: 16 },
  // No `lineHeight`: a fixed one shears CJK glyphs and Dynamic Type; the
  // natural line height keeps ascenders and descenders in every script.
  input: { fontSize: 16, paddingTop: 2, paddingBottom: 2, paddingHorizontal: 0 },
  textArea: { minHeight: 76 },
  statusHost: { alignSelf: "center" },
  statusChips: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "flex-end", flex: 1 },
});
