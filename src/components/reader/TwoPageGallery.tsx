import { useEffect, useRef, useCallback, useMemo } from 'react'
import { haptic } from '@/lib/haptics'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Keyboard, Zoom, Virtual, Navigation } from 'swiper/modules'
import type { Swiper as SwiperType } from 'swiper'
import { useCustomZoom } from './useCustomZoom'
import type { TwoPageGalleryProps } from './types'

import 'swiper/css'
import 'swiper/css/zoom'
import 'swiper/css/virtual'

export function TwoPageGallery({
  pageCount,
  currentPageIndex,
  onPageChange,
  renderImage,
  getItemKind,
  onBackgroundClick,
  onKeyboardNavigation,
  readingMode = 'rtl',
  disableKeyboard = false,
  disableZoom = false,
  pagePairingMode = 'manga',
}: TwoPageGalleryProps) {
  const swiperRef = useRef<SwiperType>(undefined)

  const { handleClick, handleZoomChange, handleTouchStart, handleTouchMove, cleanup } =
    useCustomZoom({
      swiperRef,
      onBackgroundClick,
      maxZoomRatio: 1.5,
      disableZoom,
    })

  const isSpacer = useCallback(
    (index: number) => getItemKind?.(index) === 'spacer',
    [getItemKind]
  )

  const safeUnderlyingIndex = useMemo(() => {
    if (pageCount <= 0) return 0
    if (!isSpacer(currentPageIndex)) return currentPageIndex

    for (let i = currentPageIndex + 1; i < pageCount; i++) {
      if (!isSpacer(i)) return i
    }
    for (let i = currentPageIndex - 1; i >= 0; i--) {
      if (!isSpacer(i)) return i
    }
    return 0
  }, [currentPageIndex, isSpacer, pageCount])

  const spreads = useMemo(() => {
    const result: number[][] = []

    let i = 0
    let segmentStart = true // resets after spacer

    while (i < pageCount) {
      if (isSpacer(i)) {
        i += 1
        segmentStart = true
        continue
      }

      if (pagePairingMode === 'manga' && segmentStart) {
        // First page of each segment alone (segment == chapter when spacer inserted at breaks)
        result.push([i])
        i += 1
        segmentStart = false
        continue
      }

      const next = i + 1
      if (next < pageCount && !isSpacer(next)) {
        result.push([i, next])
        i += 2
      } else {
        result.push([i])
        i += 1
      }

      segmentStart = false
    }

    return result
  }, [pageCount, pagePairingMode, isSpacer])

  const currentSpreadIndex = useMemo(() => {
    for (let i = 0; i < spreads.length; i++) {
      if (spreads[i].includes(safeUnderlyingIndex)) return i
    }
    return 0
  }, [spreads, safeUnderlyingIndex])

  useEffect(() => {
    // If parent ever points at a spacer (chapter break), immediately remap out of it.
    if (safeUnderlyingIndex !== currentPageIndex) {
      onPageChange(safeUnderlyingIndex)
    }
  }, [currentPageIndex, onPageChange, safeUnderlyingIndex])

  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentSpreadIndex) {
      swiperRef.current.slideTo(currentSpreadIndex)
    }
  }, [currentSpreadIndex])

  useEffect(() => {
    if (swiperRef.current && swiperRef.current.keyboard) {
      if (disableKeyboard) {
        swiperRef.current.keyboard.disable()
      } else {
        swiperRef.current.keyboard.enable()
      }
    }
  }, [disableKeyboard])

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

  const handleSpreadChange = useCallback(
    (newSpreadIndex: number) => {
      const spreadPages = spreads[newSpreadIndex] ?? [0]
      onPageChange(spreadPages[0] ?? 0)
    },
    [spreads, onPageChange]
  )

  return (
    <div className="w-full h-full bg-black">
      <Swiper
        key={`${readingMode}-${pagePairingMode}`}
        modules={[Keyboard, Zoom, Virtual, Navigation]}
        spaceBetween={0}
        slidesPerView={1}
        centeredSlides={true}
        initialSlide={currentSpreadIndex}
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
          const newSpreadIndex = swiper.activeIndex
          if (newSpreadIndex !== currentSpreadIndex) {
            haptic()
            handleSpreadChange(newSpreadIndex)
          }
        }}
        className="w-full h-full"
      >
        {Array.from({ length: spreads.length }, (_, spreadIndex) => {
          const spreadPages = spreads[spreadIndex] ?? []
          return (
            <SwiperSlide key={`spread-${spreadIndex}`} virtualIndex={spreadIndex}>
              <div className="swiper-zoom-container">
                <div
                  className="swiper-zoom-target relative w-full h-full flex items-center justify-center gap-1"
                  onClick={handleClick}
                >
                  {spreadPages.length === 1 ? (
                    <div className="relative h-full flex items-center justify-center">
                      {renderImage(spreadPages[0])}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      {/* Left page */}
                      <div className="relative h-full flex items-center justify-center flex-1">
                        {renderImage(
                          readingMode === 'rtl' ? spreadPages[0] : spreadPages[1]
                        )}
                      </div>

                      {/* Right page */}
                      <div className="relative h-full flex items-center justify-center flex-1">
                        {renderImage(
                          readingMode === 'rtl' ? spreadPages[1] : spreadPages[0]
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </SwiperSlide>
          )
        })}
      </Swiper>
    </div>
  )
}

