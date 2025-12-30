import { useEffect, useState, type RefObject } from 'react'

interface ScrollFadingOverlayProps {
  scrollRef: RefObject<HTMLElement | null>
  gradientHeight?: number
  gradientColor?: string
  threshold?: number
}

/**
 * Fading gradient overlays for scrollable container elements.
 * Shows top gradient when scrolled down, bottom gradient when not at bottom.
 */
export function ScrollFadingOverlay({
  scrollRef,
  gradientHeight = 48,
  gradientColor = 'var(--background)',
  threshold,
}: ScrollFadingOverlayProps) {
  const [topOpacity, setTopOpacity] = useState(0)
  const [bottomOpacity, setBottomOpacity] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const effectiveThreshold = threshold ?? gradientHeight

    const update = () => {
      const scrollTop = el.scrollTop
      const scrollHeight = el.scrollHeight
      const clientHeight = el.clientHeight
      const scrollableHeight = scrollHeight - clientHeight

      // Top gradient: fade in as you scroll down from top
      setTopOpacity(Math.min(scrollTop / effectiveThreshold, 1))

      // Bottom gradient: fade in when there's more content below
      const distanceFromBottom = scrollableHeight - scrollTop
      setBottomOpacity(Math.min(distanceFromBottom / effectiveThreshold, 1))
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      resizeObserver.disconnect()
    }
  }, [scrollRef, gradientHeight, threshold])

  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-10 transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to bottom, ${gradientColor}, transparent)`,
          opacity: topOpacity,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-10 transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to top, ${gradientColor}, transparent)`,
          opacity: bottomOpacity,
        }}
      />
    </>
  )
}

