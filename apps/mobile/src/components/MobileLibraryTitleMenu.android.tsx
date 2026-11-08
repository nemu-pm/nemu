import { useState } from "react";
import {
  Column,
  DropdownMenu,
  DropdownMenuItem,
  Host,
  HorizontalDivider,
  Icon,
  Row,
  Text,
} from "@expo/ui/jetpack-compose";
import {
  clickable,
  clip,
  padding,
  semantics,
  Shapes,
} from "@expo/ui/jetpack-compose/modifiers";
import ArrowDropDownIcon from "@expo/material-symbols/arrow_drop_down.xml";
import CheckIcon from "@expo/material-symbols/check.xml";
import CollectionsIcon from "@expo/material-symbols/collections_bookmark.xml";
import CreateFolderIcon from "@expo/material-symbols/create_new_folder.xml";
import EditIcon from "@expo/material-symbols/edit.xml";
import FolderManagedIcon from "@expo/material-symbols/folder_managed.xml";
import LibraryBooksIcon from "@expo/material-symbols/library_books.xml";
import type { ImageSourcePropType } from "react-native";
import { nemuFontWeight } from "@/design-system";
import { hapticSelection } from "@/lib/haptics";
import type { MobileLibraryTitleMenuIcon } from "@/lib/mobileLibraryTitleMenu";
import type {
  MobileLibraryTitleMenuHeaderOptions,
  MobileLibraryTitleMenuProps,
} from "./MobileLibraryTitleMenu.types";

/** Android: the title itself is the dropdown anchor (Compose `DropdownMenu`). */
export const mobileLibraryTitleMenuAvailable = true;

const ICONS: Record<MobileLibraryTitleMenuIcon, ImageSourcePropType> = {
  library: LibraryBooksIcon,
  collection: CollectionsIcon,
  edit: EditIcon,
  create: CreateFolderIcon,
  manage: FolderManagedIcon,
};

export function MobileLibraryTitleMenuAnchor(_props: MobileLibraryTitleMenuProps) {
  return null;
}

/**
 * Material "title with dropdown": the top app bar title reads
 * "<collection> ▾" and opens an anchored Material 3 menu — the shown
 * collection checked, then the collection actions — instead of navigating.
 */
function AndroidLibraryTitleMenu({
  title,
  sections,
  accessibilityHint,
  tokens,
  scheme,
  onAction,
}: MobileLibraryTitleMenuProps) {
  const [expanded, setExpanded] = useState(false);
  const select = (id: string) => {
    setExpanded(false);
    void hapticSelection();
    onAction(id);
  };

  return (
    <Host matchContents colorScheme={scheme} seedColor={tokens.primary}>
      <DropdownMenu
        expanded={expanded}
        onDismissRequest={() => setExpanded(false)}
        color={tokens.card}
      >
        <DropdownMenu.Trigger>
          <Row
            verticalAlignment="center"
            modifiers={[
              clip(Shapes.RoundedCorner(12)),
              clickable(() => setExpanded(true)),
              semantics({ contentDescription: `${title}, ${accessibilityHint}` }),
              padding(8, 6, 4, 6),
            ]}
          >
            <Text
              color={tokens.foreground}
              maxLines={1}
              overflow="ellipsis"
              style={{ fontSize: 17, fontWeight: nemuFontWeight.semibold }}
            >
              {title}
            </Text>
            <Icon source={ArrowDropDownIcon} tint={tokens.foreground} size={24} />
          </Row>
        </DropdownMenu.Trigger>
        <DropdownMenu.Items>
          {sections.map((section, sectionIndex) => [
            sectionIndex > 0 ? (
              <HorizontalDivider key={`${section.id}:divider`} color={tokens.border} />
            ) : null,
            ...section.items.map((item) => (
              <DropdownMenuItem
                key={item.id}
                enabled={!item.disabled}
                onClick={() => select(item.id)}
                elementColors={{
                  textColor: item.checked ? tokens.primary : tokens.foreground,
                  leadingIconColor: item.checked ? tokens.primary : tokens.mutedForeground,
                  trailingIconColor: tokens.primary,
                }}
              >
                <DropdownMenuItem.LeadingIcon>
                  <Icon
                    source={ICONS[item.icon]}
                    tint={item.checked ? tokens.primary : tokens.mutedForeground}
                    size={22}
                  />
                </DropdownMenuItem.LeadingIcon>
                <DropdownMenuItem.Text>
                  <Column>
                    <Text
                      color={item.checked ? tokens.primary : tokens.foreground}
                      maxLines={1}
                      overflow="ellipsis"
                      style={{ typography: "bodyLarge" }}
                    >
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text
                        color={tokens.mutedForeground}
                        maxLines={1}
                        style={{ typography: "bodySmall" }}
                      >
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </Column>
                </DropdownMenuItem.Text>
                {item.checked ? (
                  <DropdownMenuItem.TrailingIcon>
                    <Icon source={CheckIcon} tint={tokens.primary} size={22} />
                  </DropdownMenuItem.TrailingIcon>
                ) : null}
              </DropdownMenuItem>
            )),
          ])}
        </DropdownMenu.Items>
      </DropdownMenu>
    </Host>
  );
}

export function getMobileLibraryTitleMenuHeaderOptions(
  props: MobileLibraryTitleMenuProps,
): MobileLibraryTitleMenuHeaderOptions {
  return {
    headerTitle: () => <AndroidLibraryTitleMenu {...props} />,
  };
}
