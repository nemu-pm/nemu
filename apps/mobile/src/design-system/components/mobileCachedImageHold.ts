/**
 * The image stack of a `holdPreviousWhileLoading` view, bottom to top. The top
 * layer is the source asked for; anything under it already loaded and stays on
 * screen until the top has loaded and faded in over it. Every layer keeps its
 * own native view across a change, because a new view would have to decode its
 * `file://` image again (React Native never keeps that decode): a blank frame.
 */
export type MobileHeldImageLayer<T> = {
  key: string;
  paint: T;
  loaded: boolean;
  /** It came in over a loaded image: it fades in, and has no fallback of its own. */
  swap: boolean;
};

export type MobileHeldImageStack<T> = {
  /** The title these images belong to: a recycled cell's new title starts over. */
  identity: string | undefined;
  layers: MobileHeldImageLayer<T>[];
};

function firstLayer<T>(key: string, paint: T): MobileHeldImageLayer<T> {
  return { key, paint, loaded: false, swap: false };
}

export function createMobileHeldImageStack<T>(
  identity: string | undefined,
  key: string,
  paint: T,
): MobileHeldImageStack<T> {
  return { identity, layers: [firstLayer(key, paint)] };
}

/**
 * The stack for the source asked for now (the same object when nothing
 * changed). A layer that never loaded has nothing on screen and just goes; back
 * to a loaded one (a failed cover's parent falling back) drops what is over it.
 */
export function showInMobileHeldImageStack<T>(
  stack: MobileHeldImageStack<T>,
  identity: string | undefined,
  key: string,
  paint: T,
): MobileHeldImageStack<T> {
  if (stack.identity !== identity) return createMobileHeldImageStack(identity, key, paint);
  const index = stack.layers.findIndex((layer) => layer.key === key);
  if (index === stack.layers.length - 1) return stack;
  if (index >= 0) return { identity, layers: stack.layers.slice(0, index + 1) };
  const held = stack.layers.filter((layer) => layer.loaded);
  return {
    identity,
    layers: [...held, { ...firstLayer(key, paint), swap: held.length > 0 }],
  };
}

export function markMobileHeldImageLoaded<T>(
  stack: MobileHeldImageStack<T>,
  key: string,
): MobileHeldImageStack<T> {
  if (!stack.layers.some((layer) => layer.key === key && !layer.loaded)) return stack;
  return {
    identity: stack.identity,
    layers: stack.layers.map((layer) => (layer.key === key ? { ...layer, loaded: true } : layer)),
  };
}

/** The top layer has faded in: nothing under it can show any more. */
export function settleMobileHeldImageStack<T>(
  stack: MobileHeldImageStack<T>,
): MobileHeldImageStack<T> {
  const top = stack.layers[stack.layers.length - 1];
  if (!top?.loaded || stack.layers.length === 1) return stack;
  return { identity: stack.identity, layers: [top] };
}

/** Whether the top layer is fading in over something that can go once it has. */
export function mobileHeldImageStackIsSettling<T>(stack: MobileHeldImageStack<T>): boolean {
  return stack.layers.length > 1 && stack.layers[stack.layers.length - 1]!.loaded;
}
