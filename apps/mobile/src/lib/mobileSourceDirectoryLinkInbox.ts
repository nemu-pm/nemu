/**
 * Hand-off between the router's native-intent hook (which sees every incoming
 * link, cold or warm) and the component that confirms and adds the directory.
 * A link that arrives before the handler mounts is kept until it does.
 */
type Listener = (url: string) => void;

let pending: string | null = null;
let listener: Listener | null = null;

export function submitMobileSourceDirectoryLink(url: string): void {
  if (listener) listener(url);
  else pending = url;
}

export function subscribeMobileSourceDirectoryLinks(next: Listener): () => void {
  listener = next;
  if (pending !== null) {
    const url = pending;
    pending = null;
    next(url);
  }
  return () => {
    if (listener === next) listener = null;
  };
}
