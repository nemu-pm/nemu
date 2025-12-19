import { SwiperGallery } from './SwiperGallery'
import { ScrollingGallery } from './ScrollingGallery'
import { TwoPageGallery } from './TwoPageGallery'
import type { ReaderProps } from './types'

export function Reader({
  pageCount,
  currentPage,
  onPageChange,
  renderImage,
  readingMode = 'rtl',
  isTwoPageMode = false,
  pagePairingMode = 'manga',
  onBackgroundClick,
  disableKeyboard = false,
}: ReaderProps) {
  if (readingMode === 'scrolling') {
    return (
      <ScrollingGallery
        pageCount={pageCount}
        currentPageIndex={currentPage}
        onPageChange={onPageChange}
        renderImage={renderImage}
        onBackgroundClick={onBackgroundClick}
        readingMode={readingMode}
        isTwoPageMode={isTwoPageMode}
        pagePairingMode={pagePairingMode}
      />
    )
  }

  if (isTwoPageMode) {
    return (
      <TwoPageGallery
        pageCount={pageCount}
        currentPageIndex={currentPage}
        onPageChange={onPageChange}
        renderImage={renderImage}
        onBackgroundClick={onBackgroundClick}
        readingMode={readingMode}
        disableKeyboard={disableKeyboard}
        pagePairingMode={pagePairingMode}
      />
    )
  }

  return (
    <SwiperGallery
      pageCount={pageCount}
      currentPageIndex={currentPage}
      onPageChange={onPageChange}
      renderImage={renderImage}
      onBackgroundClick={onBackgroundClick}
      readingMode={readingMode}
      disableKeyboard={disableKeyboard}
    />
  )
}

