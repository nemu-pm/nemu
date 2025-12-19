export type ReadingMode = 'rtl' | 'ltr' | 'scrolling'

export type PagePairingMode = 'manga' | 'book'

export interface ReaderProps {
  pageCount: number
  currentPage: number
  onPageChange: (page: number) => void
  renderImage: (index: number) => React.ReactNode
  readingMode?: ReadingMode
  isTwoPageMode?: boolean
  pagePairingMode?: PagePairingMode
  onBackgroundClick?: () => void
  disableKeyboard?: boolean
}

export interface GalleryProps {
  pageCount: number
  currentPageIndex: number
  onPageChange: (newPageIndex: number) => void
  renderImage: (index: number) => React.ReactNode
  onBackgroundClick?: () => void
  readingMode?: 'rtl' | 'ltr'
  disableKeyboard?: boolean
}

export interface ScrollingGalleryProps extends Omit<GalleryProps, 'readingMode'> {
  readingMode?: 'rtl' | 'ltr' | 'scrolling'
  isTwoPageMode?: boolean
  pagePairingMode?: PagePairingMode
}

export interface TwoPageGalleryProps extends GalleryProps {
  pagePairingMode: PagePairingMode
}

