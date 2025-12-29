import { SwiperGallery } from './SwiperGallery'
import { ScrollingGallery } from './ScrollingGallery'
import { TwoPageGallery } from './TwoPageGallery'
import type { ReaderProps } from './types'

export function Reader({
  pageCount,
  currentPage,
  onPageChange,
  renderImage,
  getPageKey,
  getItemKind,
  readingMode = 'rtl',
  isTwoPageMode = false,
  pagePairingMode = 'manga',
  scrollPageWidthScale,
  onBackgroundClick,
  onKeyboardNavigation,
  onScrollingReachStart,
  onVisiblePageIndicesChange,
  disableKeyboard = false,
  disableZoom = false,
}: ReaderProps) {
  if (readingMode === 'scrolling') {
    return (
      <ScrollingGallery
        pageCount={pageCount}
        currentPageIndex={currentPage}
        onPageChange={onPageChange}
        renderImage={renderImage}
        getPageKey={getPageKey}
        getItemKind={getItemKind}
        onBackgroundClick={onBackgroundClick}
        readingMode={readingMode}
        isTwoPageMode={isTwoPageMode}
        pagePairingMode={pagePairingMode}
        pageWidthScale={scrollPageWidthScale}
        onReachStart={onScrollingReachStart}
        onVisiblePageIndicesChange={onVisiblePageIndicesChange}
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
        getPageKey={getPageKey}
        getItemKind={getItemKind}
        onBackgroundClick={onBackgroundClick}
        onKeyboardNavigation={onKeyboardNavigation}
        readingMode={readingMode}
        disableKeyboard={disableKeyboard}
        disableZoom={disableZoom}
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
      getPageKey={getPageKey}
      getItemKind={getItemKind}
      onBackgroundClick={onBackgroundClick}
      onKeyboardNavigation={onKeyboardNavigation}
      readingMode={readingMode}
      disableKeyboard={disableKeyboard}
      disableZoom={disableZoom}
    />
  )
}
