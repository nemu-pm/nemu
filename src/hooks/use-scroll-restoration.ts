import { useEffect, useRef } from "react";

const SCROLL_KEY_PREFIX = "nemu:scroll:";

/**
 * Hook to save and restore window scroll position.
 * Works with virtualized lists by waiting for content to render.
 *
 * @param key - Unique key to identify the scroll position (e.g., sourceKey)
 * @param ready - Whether content is ready for scroll restoration (e.g., data loaded)
 */
export function useScrollRestoration(key: string, ready: boolean) {
  const scrollKey = SCROLL_KEY_PREFIX + key;
  const lastScrollRef = useRef(0);
  const hasRestoredRef = useRef(false);

  // Track scroll position continuously (React Router resets scrollY before cleanup)
  useEffect(() => {
    const handleScroll = () => {
      lastScrollRef.current = window.scrollY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Save scroll position on unmount
  useEffect(() => {
    return () => {
      if (lastScrollRef.current > 0) {
        sessionStorage.setItem(scrollKey, String(lastScrollRef.current));
      }
    };
  }, [scrollKey]);

  // Restore scroll position after content loads
  useEffect(() => {
    if (!ready || hasRestoredRef.current) return;

    const savedY = sessionStorage.getItem(scrollKey);
    if (savedY) {
      hasRestoredRef.current = true;
      const y = parseFloat(savedY);
      sessionStorage.removeItem(scrollKey);

      // Wait for virtualized content to render (may need multiple frames)
      const attemptScroll = (attempts = 0) => {
        const docHeight = document.documentElement.scrollHeight;
        if (docHeight > y || attempts > 10) {
          window.scrollTo(0, y);
        } else {
          requestAnimationFrame(() => attemptScroll(attempts + 1));
        }
      };
      requestAnimationFrame(() => attemptScroll(0));
    }
  }, [ready, scrollKey]);
}

