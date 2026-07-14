export type NemuNativeToolbarSymbol =
  | "chevron.left"
  | "ellipsis.circle"
  | "magnifyingglass"
  | "pencil"
  | "plus"
  | "square.stack.3d.up"
  | "trash"
  | "xmark.circle";

export function resolveNemuNativeToolbarIcon(icon: NemuNativeToolbarSymbol) {
  return icon;
}
