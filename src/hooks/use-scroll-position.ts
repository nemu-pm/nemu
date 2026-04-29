import { useState, useEffect } from "react";

/**
 * Returns whether the document has been scrolled past `threshold`.
 *
 * Capacitor / iOS Safari scroll-lock note: when vaul opens a drawer it
 * applies `body { position: fixed; top: -<scrollY>px }` to lock the page in
 * place. While that lock is active, `window.scrollY` is 0 even though the
 * page is *visually* still scrolled. Reading the locked offset from
 * `body.style.top` gives the true visual scroll position, so consumers like
 * PageHeader don't snap from "scrolled" appearance back to "top of page"
 * appearance every time a sheet opens.
 */
function readVisualScrollY(): number {
  const top = document.body.style.top;
  if (top && top.startsWith("-")) {
    const parsed = parseInt(top, 10);
    if (Number.isFinite(parsed)) return -parsed;
  }
  return window.scrollY;
}

export function useScrollPosition(threshold = 0) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(readVisualScrollY() > threshold);
    };

    // Initial check
    handleScroll();

    window.addEventListener("scroll", handleScroll, { passive: true });

    // Also re-check when the body's inline style mutates (e.g. vaul applying
    // or releasing its position-fixed scroll lock); without this the
    // "scrolled" indicator flips off as soon as a sheet opens because the
    // scroll event fires AFTER body has been moved to scroll 0.
    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== "undefined") {
      observer = new MutationObserver(handleScroll);
      observer.observe(document.body, { attributes: true, attributeFilter: ["style"] });
    }

    return () => {
      window.removeEventListener("scroll", handleScroll);
      observer?.disconnect();
    };
  }, [threshold]);

  return isScrolled;
}

