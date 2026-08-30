const REGULAR_PORTRAIT_MAX_WIDTH = 390;

export type MobileEmptyLibraryLayout = {
  portraitMaxWidth: number;
  rootMinHeight: number;
};

export function getMobileEmptyLibraryLayout({
  width,
}: {
  width: number;
}): MobileEmptyLibraryLayout {
  const safeWidth = Math.max(1, width);

  // `width - 56` keeps the glow inside PageScaffold's horizontal padding on
  // narrow phones. Keep the same portrait -> copy -> action hierarchy in every
  // orientation, matching the web empty state instead of introducing a second
  // landscape-only information layout.
  return {
    portraitMaxWidth: Math.max(
      1,
      Math.min(REGULAR_PORTRAIT_MAX_WIDTH, Math.round(safeWidth - 56)),
    ),
    rootMinHeight: 560,
  };
}
