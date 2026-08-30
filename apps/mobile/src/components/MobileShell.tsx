import { StyleSheet, View } from "react-native";
import { useNemuTheme } from "@/design-system";

export function MobileShell({ children }: { children: React.ReactNode }) {
  const { tokens } = useNemuTheme();

  return (
    <View style={[styles.root, { backgroundColor: tokens.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
