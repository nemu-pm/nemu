import { useEffect, useMemo, useRef } from 'react'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Keyboard, Zoom, Virtual, Navigation, FreeMode, Mousewheel } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import { useCustomZoom } from './useCustomZoom'
import type { GalleryProps } from './types'

import 'swiper/css'
import 'swiper/css/zoom'
import 'swiper/css/virtual'
import 'swiper/css/navigation'

export function SwiperGallery({
  pageCount,
  currentPageIndex,
  onPageChange,
  renderImage,
  getPageKey,
  getItemKind,
  onBackgroundClick,
  onKeyboardNavigation,
  readingMode = 'rtl',
  disableKeyboard = false,
  disableZoom = false,
}: GalleryProps) {
  const swiperRef = useRef<SwiperType>(undefined)

  const visibleIndices = useMemo(() => {
    // In paged mode, we never want to stop on "spacer" items (chapter breaks).
    // They can be useful for scrolling / spread segmentation, but in single-page swipe mode
    // they appear as a dead slide and can trap navigation/progress.
    const indices: number[] = []
    for (let i = 0; i < pageCount; i++) {
      const kind = getItemKind?.(i) ?? 'page'
      if (kind !== 'spacer') indices.push(i)
    }
    // Defensive fallback: never let Swiper render 0 slides due to an unexpected kind function.
    if (indices.length === 0) return Array.from({ length: pageCount }, (_, i) => i)
    return indices
  }, [pageCount, getItemKind])

  const underlyingToVisibleIndex = useMemo(() => {
    const m = new Map<number, number>()
    for (let i = 0; i < visibleIndices.length; i++) {
      m.set(visibleIndices[i]!, i)
    }
    return m
  }, [visibleIndices])

  const safeUnderlyingIndex = useMemo(() => {
    if (pageCount <= 0) return 0
    // If current points to a spacer, advance to the next real page (or fallback to prev).
    const kind = getItemKind?.(currentPageIndex) ?? 'page'
    if (kind !== 'spacer') return currentPageIndex

    for (let i = currentPageIndex + 1; i < pageCount; i++) {
      if ((getItemKind?.(i) ?? 'page') !== 'spacer') return i
    }
    for (let i = currentPageIndex - 1; i >= 0; i--) {
      if ((getItemKind?.(i) ?? 'page') !== 'spacer') return i
    }
    return 0
  }, [currentPageIndex, getItemKind, pageCount])

  const currentVisibleIndex = useMemo(() => {
    // If we have no visible pages (shouldn't happen), keep Swiper happy with 0.
    if (visibleIndices.length === 0) return 0
    return underlyingToVisibleIndex.get(safeUnderlyingIndex) ?? 0
  }, [underlyingToVisibleIndex, safeUnderlyingIndex, visibleIndices.length])

  const { handleClick, handleZoomChange, handleTouchStart, handleTouchMove, cleanup } =
    useCustomZoom({
      swiperRef,
      onBackgroundClick,
      maxZoomRatio: 1.5,
      disableZoom,
    })

  useEffect(() => {
    // If parent ever points at a spacer (chapter break), immediately remap out of it.
    if (safeUnderlyingIndex !== currentPageIndex) {
      onPageChange(safeUnderlyingIndex)
    }
  }, [currentPageIndex, onPageChange, safeUnderlyingIndex])

  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentVisibleIndex) {
      swiperRef.current.slideTo(currentVisibleIndex)
    }
  }, [currentVisibleIndex])

  // Handle dynamic keyboard enable/disable
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.keyboard) {
      if (disableKeyboard) {
        swiperRef.current.keyboard.disable()
      } else {
        swiperRef.current.keyboard.enable()
      }
    }
  }, [disableKeyboard])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  // Handle keyboard navigation to auto-hide UI
  useEffect(() => {
    if (disableKeyboard) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        onKeyboardNavigation?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [disableKeyboard, onKeyboardNavigation])

  return (
    <div className="w-full h-full bg-black">
      <Swiper
        key={readingMode}
        modules={[Keyboard, Zoom, Virtual, Navigation, FreeMode, Mousewheel]}
        spaceBetween={0}
        slidesPerView={1}
        centeredSlides={true}
        initialSlide={currentVisibleIndex}
        direction="horizontal"
        dir={readingMode === 'ltr' ? 'ltr' : 'rtl'}
        virtual={{
          enabled: true,
          cache: false,
        }}
        allowTouchMove={true}
        touchRatio={1}
        threshold={5}
        followFinger={true}
        grabCursor={true}
        resistance={true}
        resistanceRatio={0.3}
        speed={250}
        keyboard={{
          enabled: true,
          onlyInViewport: true,
        }}
        navigation={{
          enabled: false,
        }}
        zoom={{
          maxRatio: 1.5,
          minRatio: 1,
          toggle: false,
          containerClass: 'swiper-zoom-container',
          zoomedSlideClass: 'swiper-slide-zoomed',
        }}
        onSwiper={(swiper) => {
          swiperRef.current = swiper
          if (swiper.keyboard) {
            if (disableKeyboard) {
              swiper.keyboard.disable()
            } else {
              swiper.keyboard.enable()
            }
          }
        }}
        onZoomChange={handleZoomChange}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onSlideChangeTransitionEnd={(swiper) => {
          const newVisibleIndex = swiper.activeIndex
          const newUnderlyingIndex = visibleIndices[newVisibleIndex]
          if (newUnderlyingIndex == null) return
          if (newUnderlyingIndex !== currentPageIndex) {
            onPageChange(newUnderlyingIndex)
          }
        }}
        className="w-full h-full"
      >
        {Array.from({ length: visibleIndices.length }, (_, visibleIndex) => {
          const underlyingIndex = visibleIndices[visibleIndex]!
          return (
            <SwiperSlide
              key={getPageKey?.(underlyingIndex) ?? underlyingIndex}
              virtualIndex={visibleIndex}
            >
            <div className="swiper-zoom-container">
              <div
                className="swiper-zoom-target relative w-full h-full flex items-center justify-center"
                onClick={handleClick}
              >
                {renderImage(underlyingIndex)}
              </div>
            </div>
          </SwiperSlide>
          )
        })}
      </Swiper>
    </div>
  )
}

