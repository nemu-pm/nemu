import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Form as SwiftForm, Host as SwiftHost, Spacer as SwiftSpacer } from "@expo/ui/swift-ui";
import { MobileServerSourceSections } from "@/components/MobileServerSourceSections.ios";
import { useServerSourceForm, type ServerSourceFormParams } from "@/components/useServerSourceForm";
import { nemuSoftScrollEdge, renderNemuNativeToolbarButtons, useNemuTheme } from "@/design-system";

/** A server source's settings (Komga, Kavita): a native grouped form pushed from its row. */
export function ServerSourceScreen() {
  const { scheme } = useNemuTheme();
  const params = useLocalSearchParams<ServerSourceFormParams>();
  const router = useRouter();
  const form = useServerSourceForm(params, { onSaved: () => router.back() });
  const { strings } = form;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: form.editing ? form.fields.name || form.kindName : form.kindName }} />
      <Stack.Toolbar placement="right">
        {renderNemuNativeToolbarButtons([
          { icon: "checkmark", label: strings.common.save, disabled: !form.canSave, onPress: () => void form.save() },
        ])}
      </Stack.Toolbar>
      <SwiftHost colorScheme={scheme} style={{ flex: 1 }}>
        {form.loaded ? (
          <SwiftForm modifiers={[nemuSoftScrollEdge()]}>
            <MobileServerSourceSections form={form} />
          </SwiftForm>
        ) : <SwiftSpacer />}
      </SwiftHost>
    </View>
  );
}
