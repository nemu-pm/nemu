// No "ellipsis" symbols here on purpose: HIG (iPhone Duo) reserves the
// ellipsis for the system overflow menu, which the vertical bar adds itself.
// Give any nemu-owned menu or sheet a distinct symbol.
export type NemuNativeToolbarSymbol =
  | "chevron.left"
  | "folder.badge.gearshape"
  | "line.3.horizontal.decrease"
  | "magnifyingglass"
  | "pencil"
  | "plus"
  | "rectangle.stack"
  | "square.stack.3d.up"
  | "trash"
  | "xmark.circle";

export function resolveNemuNativeToolbarIcon(icon: NemuNativeToolbarSymbol) {
  return icon;
}
