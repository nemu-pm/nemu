import { useEffect } from "react";

export type SheetProgressObserverProps = {
  visible: boolean;
  onProgress: (progress: number) => void;
};

/** Platforms without UIKit retain controlled visibility. */
export default function SheetProgressObserver({ visible, onProgress }: SheetProgressObserverProps) {
  useEffect(() => {
    onProgress(visible ? 1 : 0);
    return () => onProgress(0);
  }, [visible, onProgress]);
  return null;
}
