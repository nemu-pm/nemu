import { ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { NemuText, renderNemuNativeToolbarButtons, useNemuTheme } from "@/design-system";
import { useServerSourceForm, type ServerSourceFormParams } from "./useServerSourceForm";

/** Android / web: the same fields as the native iOS form, in a plain list. */
export function ServerSourceScreen() {
  const { tokens } = useNemuTheme();
  const params = useLocalSearchParams<ServerSourceFormParams>();
  const form = useServerSourceForm(params);
  const { strings, fields } = form;

  const rows: Array<{
    label: string;
    value: string;
    placeholder: string;
    onChange: (value: string) => void;
    secure?: boolean;
    url?: boolean;
    plain?: boolean;
  }> = [
    { label: strings.selfHosted.serverAddress, value: fields.server, placeholder: form.serverPlaceholder, onChange: form.setServer, url: true, plain: true },
    { label: strings.selfHosted.name, value: fields.name, placeholder: form.kindName, onChange: form.setName },
  ];
  const login = [
    { label: strings.selfHosted.username, value: fields.username, placeholder: strings.selfHosted.username, onChange: form.setUsername, plain: true },
    { label: strings.selfHosted.password, value: fields.password, placeholder: strings.selfHosted.password, onChange: form.setPassword, secure: true, plain: true },
    { label: strings.selfHosted.apiKey, value: fields.apiKey, placeholder: strings.selfHosted.apiKey, onChange: form.setApiKey, secure: true, plain: true },
  ];

  const renderGroup = (group: typeof rows) => (
    <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
      {group.map((row) => (
        <View key={row.label} style={styles.row}>
          <NemuText style={{ color: tokens.foreground }}>{row.label}</NemuText>
          <TextInput
            accessibilityLabel={row.label}
            autoCapitalize={row.plain ? "none" : "words"}
            autoComplete="off"
            autoCorrect={false}
            importantForAutofill="no"
            textContentType="none"
            editable={!form.saving}
            keyboardType={row.url ? "url" : "default"}
            onChangeText={row.onChange}
            placeholder={row.placeholder}
            placeholderTextColor={tokens.mutedForeground}
            secureTextEntry={row.secure}
            style={[styles.input, { color: tokens.foreground }]}
            value={row.value}
          />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: form.editing ? fields.name || form.kindName : form.kindName }} />
      <Stack.Toolbar placement="right">
        {renderNemuNativeToolbarButtons([
          { icon: "checkmark", label: strings.common.save, disabled: !form.canSave, onPress: () => void form.save() },
        ])}
      </Stack.Toolbar>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {renderGroup(rows)}
        {renderGroup(login)}
        <NemuText style={{ color: tokens.mutedForeground }}>
          {form.saving ? strings.selfHosted.connecting : strings.selfHosted.loginFooter}
        </NemuText>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  input: { flex: 1, textAlign: "right", paddingVertical: 10 },
});
