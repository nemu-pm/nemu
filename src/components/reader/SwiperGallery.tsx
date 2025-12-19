import { useEffect, useRef } from 'react'
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
  onBackgroundClick,
  readingMode = 'rtl',
  disableKeyboard = false,
}: GalleryProps) {
  const swiperRef = useRef<SwiperType>(undefined)

  const { handleClick, handleZoomChange, handleTouchStart, handleTouchMove, cleanup } =
    useCustomZoom({
      swiperRef,
      onBackgroundClick,
      maxZoomRatio: 1.5,
    })

  useEffect(() => {
    if (swiperRef.current && swiperRef.current.activeIndex !== currentPageIndex) {
      swiperRef.current.slideTo(currentPageIndex)
    }
  }, [currentPageIndex])

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

  return (
    <div className="w-full h-full bg-black">
      <Swiper
        key={readingMode}
        modules={[Keyboard, Zoom, Virtual, Navigation, FreeMode, Mousewheel]}
        spaceBetween={0}
        slidesPerView={1}
        centeredSlides={true}
        initialSlide={currentPageIndex}
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
          const newIndex = swiper.activeIndex
          if (newIndex !== currentPageIndex) {
            onPageChange(newIndex)
          }
        }}
        className="w-full h-full"
      >
        {Array.from({ length: pageCount }, (_, index) => (
          <SwiperSlide key={index} virtualIndex={index}>
            <div className="swiper-zoom-container">
              <div
                className="swiper-zoom-target relative w-full h-full flex items-center justify-center"
                onClick={handleClick}
              >
                {renderImage(index)}
              </div>
            </div>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}

