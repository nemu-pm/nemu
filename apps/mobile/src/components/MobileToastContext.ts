import { createContext, useContext } from "react";

export type MobileToastTone = "success" | "info" | "warning" | "danger";

type MobileToastAction = {
  label: string;
  onPress: () => void;
};

type MobileToastDuration = "normal" | "long" | "sticky";

export type MobileToastOptions = {
  tone?: MobileToastTone;
  title: string;
  detail?: string;
  action?: MobileToastAction;
  /** Replaces the tone icon with an indeterminate activity indicator. */
  loading?: boolean;
  /** `sticky` toasts stay until replaced or dismissed (e.g. progress). */
  duration?: MobileToastDuration;
  /** Passing the same id replaces the visible toast instead of stacking. */
  id?: string;
};

export type MobileToastController = {
  show: (options: MobileToastOptions) => string;
  dismiss: (id: string) => void;
};

export const MobileToastContext =
  createContext<MobileToastController | null>(null);

export function useMobileToast(): MobileToastController {
  const controller = useContext(MobileToastContext);
  if (!controller) {
    throw new Error("useMobileToast requires a MobileToastProvider ancestor");
  }
  return controller;
}
