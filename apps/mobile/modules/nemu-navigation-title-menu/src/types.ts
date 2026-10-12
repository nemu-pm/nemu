export type NavigationTitleMenuItem = {
  id: string;
  title: string;
  subtitle?: string;
  /** SF Symbol name (iOS). */
  systemImage?: string;
  checked?: boolean;
  disabled?: boolean;
  destructive?: boolean;
};

export type NavigationTitleMenuSection = {
  id: string;
  title?: string;
  items: NavigationTitleMenuItem[];
};

export type NavigationTitleMenuHeader = {
  title: string;
  /** SF Symbol name (iOS), drawn in `tintColor`. */
  systemImage?: string;
  tintColor?: string;
};

export type NavigationTitleMenuProps = {
  sections: NavigationTitleMenuSection[];
  header?: NavigationTitleMenuHeader | null;
  onSelectAction: (id: string) => void;
};
