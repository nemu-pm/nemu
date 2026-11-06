import { useEffect } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";
import { BottomSheetTextInput } from "@expo/ui/community/bottom-sheet";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  MobileNativeSheetScaffold,
  NemuButton,
  NemuPressable,
  NemuText,
  useMobileNativeSheetTheme,
} from "@/design-system";
import type {
  MobileAddSourceDirectorySheetProps,
  MobileAddSourcesDirectoryPageProps,
  MobileAddSourcesDirectoryStackProps,
} from "./MobileAddSourceDirectorySheet.types";
import {
  useAddSourceDirectoryForm,
  useAddSourceDirectorySheetForm,
  type AddSourceDirectoryForm,
} from "./useAddSourceDirectoryForm";

const SHEET_SNAP_POINTS: (string | number)[] = ["75%"];

/** Android / web: Add Sources swaps the page into its body (`MobileAddSourcesDirectoryPage`). */
export const mobileAddSourcesPushesDirectoryNatively = false;

/** iOS only: the sheet's native stack. */
export function MobileAddSourcesDirectoryStack({ children }: MobileAddSourcesDirectoryStackProps) {
  return <>{children}</>;
}

/** The same groups as the native iOS form, in a plain list; the actions sit by the field, above the keyboard. */
function DirectoryFormBody({ form, onCancel }: { form: AddSourceDirectoryForm; onCancel?: () => void }) {
  const { tokens } = useMobileNativeSheetTheme();
  const { strings } = form;
  const s = strings.settings;

  const actionRow = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void, divider = true) => (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      pressHighlight
      style={[styles.row, divider && [styles.rowDivider, { borderTopColor: tokens.border }]]}
    >
      <Ionicons name={icon} size={20} color={tokens.primary} />
      <NemuText style={[styles.actionLabel, { color: tokens.primary }]}>{label}</NemuText>
    </NemuPressable>
  );

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" nestedScrollEnabled>
      <NemuText style={[styles.header, { color: tokens.mutedForeground }]}>{s.sourceDirectoryAidokuHeader}</NemuText>
      <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
        <BottomSheetTextInput
          accessibilityLabel={s.sourceDirectoryAddress}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          autoFocus
          editable={!form.checking}
          importantForAutofill="no"
          keyboardType="url"
          onChangeText={form.setAddress}
          onSubmitEditing={() => void form.submit()}
          placeholder={s.sourceDirectoryUrlPlaceholder}
          placeholderTextColor={tokens.mutedForeground}
          returnKeyType="go"
          selectionColor={tokens.primary}
          style={[styles.input, { color: tokens.foreground }]}
          value={form.address}
        />
        {form.canPaste ? actionRow(s.pasteSourceDirectoryAddress, "clipboard-outline", () => void form.paste()) : null}
      </View>
      <View style={styles.actions}>
        {onCancel ? (
          <NemuButton
            accessibilityLabel={strings.common.cancel}
            containerStyle={styles.action}
            hapticFeedback="none"
            label={strings.common.cancel}
            onPress={onCancel}
            variant="secondary"
          />
        ) : null}
        <NemuButton
          accessibilityLabel={strings.common.add}
          containerStyle={styles.action}
          disabled={!form.canSubmit}
          label={strings.common.add}
          onPress={() => void form.submit()}
        />
      </View>
      {form.checking ? (
        <View style={[styles.group, styles.status, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <NemuText style={{ color: tokens.mutedForeground }}>{s.checkingSourceDirectory}</NemuText>
          <ActivityIndicator color={tokens.primary} />
        </View>
      ) : null}
      {form.error ? (
        <View
          accessibilityLiveRegion="polite"
          style={[styles.group, styles.status, { backgroundColor: tokens.card, borderColor: tokens.border }]}
        >
          <Ionicons name="warning-outline" size={18} color={tokens.danger} />
          <NemuText style={[styles.statusText, { color: tokens.danger }]}>{form.error}</NemuText>
        </View>
      ) : null}
      <NemuText style={[styles.footer, { color: tokens.mutedForeground }]}>
        {`${s.sourceDirectoryAidokuFooter}\n\n${s.sourceDirectoryDisclaimer}`}
      </NemuText>
      <NemuText style={[styles.header, styles.spaced, { color: tokens.mutedForeground }]}>{s.sourceDirectoryLinksHeader}</NemuText>
      {form.helpUrl ? (
        <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          {actionRow(s.sourceDirectoryHelp, "help-circle-outline", form.openHelp, false)}
        </View>
      ) : null}
      <NemuText style={[styles.footer, { color: tokens.mutedForeground }]}>{s.sourceDirectoryLinksFooter}</NemuText>
    </ScrollView>
  );
}

/** From Settings: its own sheet. Added, it comes down and a toast offers the sources. */
export function MobileAddSourceDirectorySheet(props: MobileAddSourceDirectorySheetProps) {
  const { form, close, handleDismiss } = useAddSourceDirectorySheetForm(props);
  return (
    <MobileNativeSheetScaffold
      visible={props.visible}
      onClose={close}
      onDismiss={handleDismiss}
      // Back is Cancel, also where a swipe-down is blocked.
      onHardwareBackPress={() => {
        close();
        return true;
      }}
      title={form.strings.browse.addSourceDirectory}
      showDismissButton={false}
      enablePanDownToClose={!form.blocksDismiss}
      snapPoints={SHEET_SNAP_POINTS}
      fillContent
      contentBottomInset={0}
      testID="AddSourceDirectorySheet"
    >
      <DirectoryFormBody form={form} onCancel={close} />
    </MobileNativeSheetScaffold>
  );
}

/** From Add Sources: the page in the sheet's body, under the sheet's own back action. */
export function MobileAddSourcesDirectoryPage({ onAdded, onDismissBlockedChange }: MobileAddSourcesDirectoryPageProps) {
  const form = useAddSourceDirectoryForm({ onAdded: (added) => onAdded(added.id) });
  const { blocksDismiss } = form;
  useEffect(() => {
    onDismissBlockedChange(blocksDismiss);
  }, [blocksDismiss, onDismissBlockedChange]);
  return <DirectoryFormBody form={form} />;
}

const styles = StyleSheet.create({
  content: { paddingVertical: 8, gap: 8 },
  header: { fontSize: 13, textTransform: "uppercase", paddingHorizontal: 14 },
  spaced: { marginTop: 16 },
  footer: { fontSize: 13, lineHeight: 18, paddingHorizontal: 14 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, overflow: "hidden" },
  input: { minHeight: 46, paddingVertical: 10, fontSize: 16 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  actionLabel: { fontSize: 16 },
  actions: { flexDirection: "row", gap: 12 },
  action: { flex: 1 },
  status: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  statusText: { flex: 1 },
});
