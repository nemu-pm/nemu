import { useEffect, useState } from "react";

/** A settings write shorter than this never greys the sheet. */
export const READER_SETTINGS_BUSY_SHOWN_AFTER_MS = 250;

/**
 * Whether the settings rows look disabled: a setting's write takes a few
 * frames, and greying every row for them flashed the whole sheet on each
 * change. Taps during the write are still ignored (`busy`); only one that is
 * actually slow shows.
 */
export function useReaderSettingsBusyShown(busy: boolean): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!busy) return;
    const timer = setTimeout(() => setShown(true), READER_SETTINGS_BUSY_SHOWN_AFTER_MS);
    return () => {
      clearTimeout(timer);
      setShown(false);
    };
  }, [busy]);
  return shown && busy;
}
