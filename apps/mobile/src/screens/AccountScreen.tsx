import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { Stack } from "expo-router";
import { NemuButton, NemuText, useNemuTheme } from "@/design-system";
import { useMobileAccountPage } from "./useMobileAccountPage";

/** Android / web: a plain list with the same three groups. */
export function AccountScreen() {
  const { tokens } = useNemuTheme();
  const page = useMobileAccountPage();
  const { strings } = page;
  const rows: Array<[string, string]> = [
    [strings.account.name, page.displayName],
    [strings.account.email, page.email],
    [strings.account.signInMethod, page.providerLabel],
  ];
  return (
    <View style={{ flex: 1, backgroundColor: tokens.background }}>
      <Stack.Screen options={{ title: strings.account.title }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.group, { backgroundColor: tokens.card, borderColor: tokens.border }]}>
          {rows.map(([label, value]) => (
            <View key={label} style={styles.row}>
              <NemuText style={{ color: tokens.foreground }}>{label}</NemuText>
              <NemuText numberOfLines={1} style={[styles.value, { color: tokens.mutedForeground }]}>
                {value}
              </NemuText>
            </View>
          ))}
        </View>
        <NemuButton
          label={strings.settings.cloudSyncSignOut}
          onPress={page.requestSignOut}
          variant="secondary"
        />
        <NemuButton
          label={strings.account.deleteAccount}
          loading={page.deleting}
          onPress={() =>
            Alert.alert(strings.account.deleteAlertTitle, strings.account.deleteAlertMessage, [
              { text: strings.common.cancel, style: "cancel" },
              {
                text: strings.account.deleteConfirm,
                style: "destructive",
                onPress: () => void page.deleteAccount(),
              },
            ])
          }
          variant="destructive"
        />
        <NemuText style={{ color: tokens.mutedForeground }}>{strings.account.deleteFooter}</NemuText>
      </ScrollView>
      {page.signOutSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12 },
  group: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14 },
  row: { minHeight: 46, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  value: { flexShrink: 1 },
});
