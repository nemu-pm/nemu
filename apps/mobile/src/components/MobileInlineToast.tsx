import { MobileToastSurface } from "./MobileToast";

type MobileInlineToastProps = {
  title: string;
  detail?: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionLoading?: boolean;
  onActionPress?: () => void;
};

/**
 * Toast geometry embedded in a sheet rather than anchored to app chrome. It is
 * the shared `MobileToastSurface` in its warning tone, so the in-sheet notice
 * and the anchored toast can never drift apart.
 */
export function MobileInlineToast({
  title,
  detail,
  actionLabel,
  actionDisabled = false,
  actionLoading = false,
  onActionPress,
}: MobileInlineToastProps) {
  return (
    <MobileToastSurface
      action={
        actionLabel && onActionPress
          ? {
              label: actionLabel,
              onPress: onActionPress,
              disabled: actionDisabled,
              loading: actionLoading,
            }
          : undefined
      }
      detail={detail}
      detailNumberOfLines={2}
      icon="cloud-offline-outline"
      title={title}
      tone="warning"
    />
  );
}
