import { useEffect, useState } from "react";

interface FadingOverlayProps {
  /**
   * Height of the gradient overlay in pixels (default: 128)
   */
  gradientHeight?: number;
  /**
   * CSS variable or color for the gradient background (default: 'var(--background)')
   */
  gradientColor?: string;
  /**
   * Threshold in pixels before gradients start appearing (default: same as gradientHeight)
   */
  threshold?: number;
}

/**
 * Fading gradient overlays that respond to window scroll.
 * Shows top gradient when scrolled down, bottom gradient when not at bottom.
 */
export function FadingOverlay({
  gradientHeight = 128,
  gradientColor = "var(--background)",
  threshold,
}: FadingOverlayProps) {
  const [topGradientOpacity, setTopGradientOpacity] = useState(0);
  const [bottomGradientOpacity, setBottomGradientOpacity] = useState(0);

  useEffect(() => {
    const effectiveThreshold = threshold ?? gradientHeight;

    const updateGradientOpacity = () => {
      const scrollTop = window.scrollY;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const scrollableHeight = scrollHeight - clientHeight;

      // Top gradient: fade in as you scroll down from top
      const topOpacity = Math.min(scrollTop / effectiveThreshold, 1);
      setTopGradientOpacity(topOpacity);

      // Bottom gradient: fade in as you scroll up from bottom
      const distanceFromBottom = scrollableHeight - scrollTop;
      const bottomOpacity = Math.min(distanceFromBottom / effectiveThreshold, 1);
      setBottomGradientOpacity(bottomOpacity);
    };

    // Initial calculation
    updateGradientOpacity();

    // Update on scroll
    window.addEventListener("scroll", updateGradientOpacity, { passive: true });

    // Also update when content changes
    const resizeObserver = new ResizeObserver(updateGradientOpacity);
    resizeObserver.observe(document.body);

    return () => {
      window.removeEventListener("scroll", updateGradientOpacity);
      resizeObserver.disconnect();
    };
  }, [gradientHeight, threshold]);

  return (
    <>
      {/* Fade gradient overlay at top */}
      <div
        className="fixed top-0 left-0 right-0 z-30 pointer-events-none transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to bottom, ${gradientColor}, transparent)`,
          opacity: topGradientOpacity,
        }}
      />
      {/* Fade gradient overlay at bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 z-30 pointer-events-none transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to top, ${gradientColor}, transparent)`,
          opacity: bottomGradientOpacity,
        }}
      />
    </>
  );
}

