export type NemuNativeToolbarSymbol =
  | "chevron.left"
  | "ellipsis.circle"
  | "line.3.horizontal.decrease"
  | "magnifyingglass"
  | "pencil"
  | "plus"
  | "square.stack.3d.up"
  | "trash"
  | "xmark.circle";

export function resolveNemuNativeToolbarIcon(icon: NemuNativeToolbarSymbol) {
  return icon;
}
