import type { MobileStrings } from "@/lib/mobileI18n";

export type MobileSourceDirectoryPromptProps = {
  visible: boolean;
  initialUrl?: string;
  strings: MobileStrings;
  onClose: () => void;
  onSubmit: (url: string) => void;
};
