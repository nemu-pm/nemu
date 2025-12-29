export type ReadingMode = 'rtl' | 'ltr' | 'scrolling'

export type PagePairingMode = 'manga' | 'book'

export type ReaderItemKind = 'page' | 'spacer'

export interface ReaderProps {
  pageCount: number
  currentPage: number
  onPageChange: (page: number) => void
  renderImage: (index: number) => React.ReactNode
  getPageKey?: (index: number) => string
  getItemKind?: (index: number) => ReaderItemKind
  readingMode?: ReadingMode
  isTwoPageMode?: boolean
  pagePairingMode?: PagePairingMode
  /**
   * Scrolling mode only. 1 = full viewport width, <1 shrinks to show side gaps.
   * Intended to be persisted via localStorage at the page level (not synced).
   */
  scrollPageWidthScale?: number
  onBackgroundClick?: () => void
  /** Called when keyboard navigation occurs (arrow keys) */
  onKeyboardNavigation?: () => void
  /**
   * Scrolling mode only. Called when user tries to scroll "past the top".
   * Useful for explicitly loading/prepending previous chapter without auto-prefetch.
   */
  onScrollingReachStart?: () => void
  onVisiblePageIndicesChange?: (indices: number[]) => void
  disableKeyboard?: boolean
  /** When true, double-click/tap zoom is disabled */
  disableZoom?: boolean
}

export interface GalleryProps {
  pageCount: number
  currentPageIndex: number
  onPageChange: (newPageIndex: number) => void
  renderImage: (index: number) => React.ReactNode
  getPageKey?: (index: number) => string
  getItemKind?: (index: number) => ReaderItemKind
  onBackgroundClick?: () => void
  onKeyboardNavigation?: () => void
  readingMode?: 'rtl' | 'ltr'
  disableKeyboard?: boolean
  /** When true, double-click/tap zoom is disabled */
  disableZoom?: boolean
}

export interface ScrollingGalleryProps extends Omit<GalleryProps, 'readingMode'> {
  readingMode?: 'rtl' | 'ltr' | 'scrolling'
  isTwoPageMode?: boolean
  pagePairingMode?: PagePairingMode
  /**
   * 1 = full viewport width, <1 shrinks to show side gaps.
   */
  pageWidthScale?: number
  /** Called when user tries to scroll "past the top" of the list. */
  onReachStart?: () => void
  onVisiblePageIndicesChange?: (indices: number[]) => void
}

export interface TwoPageGalleryProps extends GalleryProps {
  pagePairingMode: PagePairingMode
}
