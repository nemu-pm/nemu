import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

export type ReaderChromePanelProps = {
  children: React.ReactNode;
  panelStyle: {
    backgroundColor: string;
    borderColor: string;
  };
  style?: StyleProp<ViewStyle>;
};

export function ReaderChromePanel({
  children,
  panelStyle,
  style,
}: ReaderChromePanelProps) {
  return (
    <View style={[styles.shell, style, panelStyle]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: "hidden",
  },
});
