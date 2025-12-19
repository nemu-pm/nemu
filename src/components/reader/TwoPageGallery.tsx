import { useEffect, useRef, useCallback } from 'react'
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
  onBackgroundClick,
  readingMode = 'rtl',
  disableKeyboard = false,
  pagePairingMode = 'manga',
}: TwoPageGalleryProps) {
  const swiperRef = useRef<SwiperType>(undefined)

  const { handleClick, handleZoomChange, handleTouchStart, handleTouchMove, cleanup } =
    useCustomZoom({
      swiperRef,
      onBackgroundClick,
      maxZoomRatio: 1.5,
    })

  // Calculate which spread contains the current page
  const getCurrentSpreadIndex = useCallback(() => {
    if (pagePairingMode === 'manga') {
      if (currentPageIndex === 0) return 0
      return Math.floor((currentPageIndex - 1) / 2) + 1
    } else {
      return Math.floor(currentPageIndex / 2)
    }
  }, [currentPageIndex, pagePairingMode])

  // Calculate total number of spreads
  const getTotalSpreads = useCallback(() => {
    if (pagePairingMode === 'manga') {
      return Math.ceil((pageCount - 1) / 2) + 1
    } else {
      return Math.ceil(pageCount / 2)
    }
  }, [pageCount, pagePairingMode])

  // Get page indices for a given spread
  const getSpreadPages = useCallback(
    (spreadIndex: number) => {
      if (pagePairingMode === 'manga') {
        if (spreadIndex === 0) {
          return [0]
        } else {
          const firstPageIndex = (spreadIndex - 1) * 2 + 1
          const secondPageIndex = firstPageIndex + 1
          return secondPageIndex < pageCount
            ? [firstPageIndex, secondPageIndex]
            : [firstPageIndex]
        }
      } else {
        const firstPageIndex = spreadIndex * 2
        const secondPageIndex = firstPageIndex + 1
        return secondPageIndex < pageCount
          ? [firstPageIndex, secondPageIndex]
          : [firstPageIndex]
      }
    },
    [pageCount, pagePairingMode]
  )

  const currentSpreadIndex = getCurrentSpreadIndex()

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

  const handleSpreadChange = useCallback(
    (newSpreadIndex: number) => {
      const spreadPages = getSpreadPages(newSpreadIndex)
      onPageChange(spreadPages[0])
    },
    [getSpreadPages, onPageChange]
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
            handleSpreadChange(newSpreadIndex)
          }
        }}
        className="w-full h-full"
      >
        {Array.from({ length: getTotalSpreads() }, (_, spreadIndex) => {
          const spreadPages = getSpreadPages(spreadIndex)

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

