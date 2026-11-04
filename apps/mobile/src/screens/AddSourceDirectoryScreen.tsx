import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams } from "expo-router";
import { NemuPressable, NemuText, renderNemuNativeToolbarButtons, useNemuTheme } from "@/design-system";
import { useAddSourceDirectoryForm, type AddSourceDirectoryFormParams } from "./useAddSourceDirectoryForm";

/** Android / web: the same groups as the native iOS form, in a plain list. */
export function AddSourceDirectoryScreen() {
  const { tokens } = useNemuTheme();
  const params = useLocalSearchParams<AddSourceDirectoryFormParams>();
  const form = useAddSourceDirectoryForm(params);
  const { strings } = form;
  const s = strings.settings;

  const actionRow = (label: string, icon: keyof typeof Ionicons.glyphMap, onPress: () => void) => (
    <NemuPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      pressHighlight
      style={[styles.row, styles.rowDivider, { borderTopColor: tokens.border }]}
    >
      <Ionicons name={icon} size={20} color={tokens.primary} />
      <NemuText style={[styles.actionLabel, { color: tokens.primary }]}>{label}</NemuText>
    </NemuPressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: strings.browse.addSourceDirectory }} />
      <Stack.Toolbar placement="right">
        {renderNemuNativeToolbarButtons([
          { icon: "checkmark", label: strings.common.add, disabled: !form.canSubmit, onPress: () => void form.submit() },
        ])}
      </Stack.Toolbar>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <NemuText style={[styles.header, { color: tokens.mutedForeground }]}>{s.sourceDirectoryAidokuHeader}</NemuText>
        <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          <TextInput
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
          {actionRow(s.openAidokuSourceListsGuide, "compass-outline", form.openAidokuGuide)}
        </View>
        <NemuText style={[styles.footer, { color: tokens.mutedForeground }]}>
          {`${s.sourceDirectoryAidokuFooter}\n\n${s.sourceDirectoryDisclaimer}`}
        </NemuText>
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
        <NemuText style={[styles.header, styles.spaced, { color: tokens.mutedForeground }]}>{s.sourceDirectoryNemuHeader}</NemuText>
        {form.nemuDirectoriesPageUrl ? (
          <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
            {actionRow(s.openNemuSourceDirectoriesPage, "globe-outline", form.openNemuDirectoriesPage)}
          </View>
        ) : null}
        <NemuText style={[styles.footer, { color: tokens.mutedForeground }]}>{s.sourceDirectoryNemuFooter}</NemuText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 8 },
  header: { fontSize: 13, textTransform: "uppercase", paddingHorizontal: 14 },
  spaced: { marginTop: 16 },
  footer: { fontSize: 13, lineHeight: 18, paddingHorizontal: 14 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, overflow: "hidden" },
  input: { minHeight: 46, paddingVertical: 10, fontSize: 16 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", gap: 12 },
  rowDivider: { borderTopWidth: StyleSheet.hairlineWidth },
  actionLabel: { fontSize: 16 },
  status: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  statusText: { flex: 1 },
});
