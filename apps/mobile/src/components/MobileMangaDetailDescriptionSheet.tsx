import { StyleSheet, View } from "react-native";
import { MobileNativeSheetScaffold, NemuText, useMobileNativeSheetTheme } from "@/design-system";
import type { MobileStrings } from "@/lib/mobileI18n";
import { splitMobileDescriptionParagraphs } from "@/lib/mobileMangaDetailInfo";

/**
 * A title's whole description, opened from "more" at the end of the hero's
 * collapsed synopsis instead of expanding it in place, so the page under it
 * never moves. Plain selectable paragraphs that scroll; the sheet closes from
 * the ✕ or a drag.
 */
export function MobileMangaDetailDescriptionSheet({
  visible,
  description,
  strings,
  onClose,
}: {
  visible: boolean;
  description: string;
  strings: MobileStrings;
  onClose: () => void;
}) {
  const { tokens } = useMobileNativeSheetTheme();
  const paragraphs = splitMobileDescriptionParagraphs(description);
  return (
    <MobileNativeSheetScaffold
      visible={visible}
      onClose={onClose}
      title={strings.designExplore.descriptionSheetTitle}
      dismissLabel={strings.designExplore.closeDescription}
      snapPoints={["60%", "92%"]}
      scroll
      scrollContentBottomInset={24}
      testID="MangaDetailDescriptionSheet"
    >
      <View style={styles.body}>
        {paragraphs.map((paragraph, index) => (
          <NemuText key={index} selectable color={tokens.foreground} style={styles.paragraph}>
            {paragraph}
          </NemuText>
        ))}
      </View>
    </MobileNativeSheetScaffold>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: 14,
  },
  paragraph: {
    fontSize: 17,
    lineHeight: 25,
  },
});
