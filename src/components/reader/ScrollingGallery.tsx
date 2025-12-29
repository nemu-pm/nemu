import { useEffect, useLayoutEffect, useRef, useCallback, useState, useMemo } from 'react'
import { List, type ListImperativeAPI, useDynamicRowHeight } from 'react-window'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import type { ScrollingGalleryProps, PagePairingMode } from './types'

interface RowProps {
  pageCount: number
  renderImage: (index: number) => React.ReactNode
  getItemKind?: (index: number) => 'page' | 'spacer'
  onBackgroundClick?: () => void
  isTwoPageMode: boolean
  pagePairingMode: PagePairingMode
  readingMode: 'rtl' | 'ltr' | 'scrolling'
  spreads: number[][]
  pageWidthScale: number
}

// Helper functions
const calculateSpreads = (
  pageCount: number,
  pagePairingMode: PagePairingMode,
  getItemKind?: (index: number) => 'page' | 'spacer'
): number[][] => {
  const result: number[][] = []

  const isSpacer = (index: number) => getItemKind?.(index) === 'spacer'

  let i = 0
  let segmentStart = true
  while (i < pageCount) {
    if (isSpacer(i)) {
      result.push([i])
      i += 1
      segmentStart = true
      continue
    }

    if (pagePairingMode === 'manga' && segmentStart) {
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
}

const findSpreadIndex = (spreads: number[][], pageIndex: number): number => {
  for (let i = 0; i < spreads.length; i++) {
    if (spreads[i].includes(pageIndex)) {
      return i
    }
  }
  return 0
}

// Row component for react-window v2
function ScrollingRow({
  index,
  style,
  renderImage,
  getItemKind,
  onBackgroundClick,
  isTwoPageMode,
  readingMode,
  spreads,
  pageWidthScale,
}: { index: number; style: React.CSSProperties } & RowProps) {
  if (isTwoPageMode) {
    const spreadPages = spreads[index]

    return (
      <div style={style} className="flex items-center justify-center bg-black" data-row-index={index}>
        <div
          className="relative h-full flex items-center justify-center mx-auto"
          style={{ width: `${Math.max(1, Math.min(100, pageWidthScale * 100))}%` }}
          onClick={onBackgroundClick}
        >
          {spreadPages.length === 1 ? (
            <div className="relative h-full flex items-center justify-center max-w-full">
              {renderImage(spreadPages[0])}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
              {/* Left page */}
              <div className="relative h-full flex items-center justify-end">
                {renderImage(readingMode === 'rtl' ? spreadPages[0] : spreadPages[1])}
              </div>

              {/* Right page */}
              <div className="relative h-full flex items-center justify-start">
                {renderImage(readingMode === 'rtl' ? spreadPages[1] : spreadPages[0])}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Single page mode
  const kind = getItemKind?.(index) ?? 'page'
  const widthPct = kind === 'page' ? pageWidthScale * 100 : 100
  return (
    <div
      style={style}
      className="flex items-start justify-center bg-black"
      onClick={onBackgroundClick}
      data-row-index={index}
      data-row-kind={kind}
    >
      <div className="mx-auto" style={{ width: `${Math.max(1, Math.min(100, widthPct))}%`, maxWidth: '100%' }}>
        {renderImage(index)}
      </div>
    </div>
  )
}

export function ScrollingGallery({
  pageCount,
  currentPageIndex,
  onPageChange,
  renderImage,
  getItemKind,
  onBackgroundClick,
  isTwoPageMode = false,
  pagePairingMode = 'manga',
  readingMode = 'scrolling',
  pageWidthScale = 1,
  onReachStart,
  onVisiblePageIndicesChange,
}: ScrollingGalleryProps) {
  const listRef = useRef<ListImperativeAPI>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [currentScale, setCurrentScale] = useState(1)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [listReady, setListReady] = useState(false)
  const prevRowHeightRef = useRef<number | null>(null)
  const lastReachStartAtRef = useRef(0)
  const touchStartYRef = useRef<number | null>(null)
  const onReachStartRef = useRef<typeof onReachStart>(onReachStart)
  const lastVisibleKeyRef = useRef<string>('')
  
  // Track the last page index we reported to prevent scroll-to-row feedback loop
  const lastReportedPageIndex = useRef(currentPageIndex)
  const didInitialScrollRef = useRef(false)
  // Track which row we intend to land on during initial positioning.
  // We only start reporting visible rows after this target is actually visible,
  // otherwise react-window's initial render (row 0) can override the restored page.
  const initialTargetRowRef = useRef<number | null>(null)
  // When parent requests a jump (e.g. progress slider), we programmatically scrollToRow.
  // While that scroll is in-flight, ignore onRowsRendered updates to avoid feedback loops
  // that can trigger "Maximum update depth exceeded" under rapid slider movement.
  const pendingProgrammaticTargetRowRef = useRef<number | null>(null)
  // Track if we're in the middle of user-initiated scrolling (drag or inertia)
  const isUserScrolling = useRef(false)

  // Drag-to-scroll state
  const isDragging = useRef(false)
  const dragStartY = useRef(0)
  const dragStartScrollTop = useRef(0)
  const currentScrollOffset = useRef(0)

  // Velocity tracking for inertia
  const velocityTracker = useRef<Array<{ time: number; position: number }>>([])
  const inertiaAnimation = useRef<number | null>(null)

  // Memoized calculations
  const spreads = useMemo(
    () => (isTwoPageMode ? calculateSpreads(pageCount, pagePairingMode, getItemKind) : []),
    [pageCount, isTwoPageMode, pagePairingMode, getItemKind]
  )

  const currentSpreadIndex = useMemo(
    () => (isTwoPageMode ? findSpreadIndex(spreads, currentPageIndex) : currentPageIndex),
    [currentPageIndex, isTwoPageMode, spreads]
  )

  const rowCount = isTwoPageMode ? spreads.length : pageCount

  const publishVisibleRows = useCallback(
    (rows: number[]) => {
      if (!onVisiblePageIndicesChange) return
      if (!rows || rows.length === 0) return

      const visible = new Set<number>()
      if (isTwoPageMode) {
        for (const row of rows) {
          const spread = spreads[row]
          if (!spread) continue
          for (const pageIndex of spread) {
            if ((getItemKind?.(pageIndex) ?? 'page') === 'spacer') continue
            visible.add(pageIndex)
          }
        }
      } else {
        for (const row of rows) {
          if ((getItemKind?.(row) ?? 'page') === 'spacer') continue
          visible.add(row)
        }
      }

      const next = Array.from(visible).sort((a, b) => a - b)
      const key = next.join(',')
      if (key === lastVisibleKeyRef.current) return
      lastVisibleKeyRef.current = key
      onVisiblePageIndicesChange(next)
    },
    [onVisiblePageIndicesChange, isTwoPageMode, spreads, getItemKind]
  )

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        })
      }
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.current)

    return () => resizeObserver.disconnect()
  }, [])

  const stopInertia = useCallback(() => {
    if (inertiaAnimation.current) {
      cancelAnimationFrame(inertiaAnimation.current)
      inertiaAnimation.current = null
    }
  }, [])

  const getRowHeight = useCallback(() => {
    if (isTwoPageMode) {
      return containerSize.height || window.innerHeight
    }
    // For single-page scrolling: be width-driven so pages fill width by default.
    // The 1.4 factor is a heuristic for typical manga page aspect ratio.
    const width = (containerSize.width || window.innerWidth) * pageWidthScale
    return Math.max(1, Math.round(width * 1.4))
  }, [containerSize.height, containerSize.width, isTwoPageMode, pageWidthScale])

  const rowHeightPx = useMemo(() => getRowHeight(), [getRowHeight])
  const dynamicRowHeight = useDynamicRowHeight({
    // Good initial estimate so first render doesn't jump too much.
    defaultRowHeight: rowHeightPx,
  })

  // Keep the current page anchored when row height changes (e.g., pageWidthScale slider).
  useLayoutEffect(() => {
    // Only meaningful for fixed-height rows.
    if (!isTwoPageMode) return
    const el = listRef.current?.element
    const prev = prevRowHeightRef.current
    prevRowHeightRef.current = rowHeightPx

    if (!el || !prev || prev === rowHeightPx) return

    // Anchor at the page/spread that the rest of the app considers "current".
    const anchorRowIndex = isTwoPageMode ? currentSpreadIndex : currentPageIndex
    const scrollTopOld = el.scrollTop
    const withinRowOffsetOld = scrollTopOld - anchorRowIndex * prev
    const withinRowFrac = prev > 0 ? withinRowOffsetOld / prev : 0

    const scrollTopNew = (anchorRowIndex + withinRowFrac) * rowHeightPx
    el.scrollTop = Math.max(0, scrollTopNew)
    currentScrollOffset.current = el.scrollTop
  }, [rowHeightPx, currentPageIndex, currentSpreadIndex, isTwoPageMode])

  // Handle scroll via native scroll event on the list's element
  const handleNativeScroll = useCallback(
    (e: Event) => {
      const target = e.target as HTMLElement
      const scrollOffset = target.scrollTop
      currentScrollOffset.current = scrollOffset

      // If the user reaches the very bottom, force the last page as current.
      // This prevents an off-by-one where the final page is short and the "midpoint"
      // visibility heuristic never selects it.
      const EPS_PX = 2
      const isAtBottom =
        target.scrollTop + target.clientHeight >= target.scrollHeight - EPS_PX
      if (isAtBottom) {
        // Choose the last non-spacer item, if any.
        let last = pageCount - 1
        while (last > 0 && (getItemKind?.(last) ?? 'page') === 'spacer') last -= 1
        if (last >= 0 && last !== lastReportedPageIndex.current) {
          lastReportedPageIndex.current = last
          onPageChange(last)
        }
      }

      // Single-page scrolling: compute "current page" from the scroll viewport every scroll.
      // `onRowsRendered` may not fire while scrolling within the same rendered row window,
      // so relying on it can make current page appear to only update on rerenders (e.g. clicks).
      if (!isTwoPageMode) {
        // Keep the same gating semantics as handleRowsRendered to avoid feedback loops.
        if (!didInitialScrollRef.current) return
        if (pendingProgrammaticTargetRowRef.current != null) {
          // If our pending target is now rendered and visible, clear suppression.
          const pending = pendingProgrammaticTargetRowRef.current
          const pendingEl = target.querySelector<HTMLElement>(`[data-row-index="${pending}"]`)
          if (pendingEl) {
            const cr = target.getBoundingClientRect()
            const pr = pendingEl.getBoundingClientRect()
            const overlapPx = Math.min(pr.bottom, cr.bottom) - Math.max(pr.top, cr.top)
            if (overlapPx > 0) {
              pendingProgrammaticTargetRowRef.current = null
            } else {
              return
            }
          } else {
            return
          }
        }

        const containerRect = target.getBoundingClientRect()
        const centerY = (containerRect.top + containerRect.bottom) / 2

        let bestIndex: number | null = null
        let bestDist = Number.POSITIVE_INFINITY
        let bestOverlapPx = -1

        const nodes = target.querySelectorAll<HTMLElement>('[data-row-index]')
        const visibleRows: number[] = []
        for (const node of nodes) {
          const rawIndex = node.dataset.rowIndex
          if (rawIndex == null) continue
          const idx = Number(rawIndex)
          if (!Number.isFinite(idx)) continue
          if ((getItemKind?.(idx) ?? 'page') === 'spacer') continue

          const rect = node.getBoundingClientRect()
          const overlapPx =
            Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
          if (overlapPx <= 0) continue
          visibleRows.push(idx)

          const containsCenter = rect.top <= centerY && rect.bottom >= centerY
          const dist = containsCenter ? 0 : Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY))

          if (
            dist < bestDist ||
            (dist === bestDist && overlapPx > bestOverlapPx) ||
            (dist === bestDist && overlapPx === bestOverlapPx && (bestIndex == null || idx > bestIndex))
          ) {
            bestIndex = idx
            bestDist = dist
            bestOverlapPx = overlapPx
          }
        }

        publishVisibleRows(visibleRows)
        if (bestIndex == null) return
        const newPageIndex = Math.max(0, Math.min(pageCount - 1, bestIndex))
        if (newPageIndex === lastReportedPageIndex.current) return
        lastReportedPageIndex.current = newPageIndex
        onPageChange(newPageIndex)

        return
      }

      // For fixed-height rows (two-page mode), we can compute the visible item directly.
      const targetCount = spreads.length
      const itemHeight = rowHeightPx
      if (targetCount <= 0 || itemHeight <= 0) return

      const i = Math.max(0, Math.min(targetCount - 1, Math.floor((scrollOffset + itemHeight * 0.5) / itemHeight)))
      const startRow = Math.max(0, Math.min(targetCount - 1, Math.floor(scrollOffset / itemHeight)))
      const endRow = Math.max(
        0,
        Math.min(targetCount - 1, Math.floor((scrollOffset + target.clientHeight - 1) / itemHeight))
      )
      if (endRow >= startRow) {
        const rows: number[] = []
        for (let row = startRow; row <= endRow; row++) rows.push(row)
        publishVisibleRows(rows)
      }
      const newPageIndex = spreads[i]?.[0] ?? 0
      if (newPageIndex === lastReportedPageIndex.current) return
      lastReportedPageIndex.current = newPageIndex
      onPageChange(newPageIndex)
    },
    [onPageChange, isTwoPageMode, spreads, rowHeightPx, pageCount, getItemKind, publishVisibleRows]
  )

  // Attach scroll listener to list element
  useEffect(() => {
    const listElement = listRef.current?.element
    if (!listElement) return

    listElement.addEventListener('scroll', handleNativeScroll)
    setListReady(true)
    return () => {
      setListReady(false)
      listElement.removeEventListener('scroll', handleNativeScroll)
    }
  }, [handleNativeScroll, containerSize])

  useEffect(() => {
    onReachStartRef.current = onReachStart
  }, [onReachStart])

  const maybeReachStart = useCallback(() => {
    const cb = onReachStartRef.current
    if (!cb) return
    const now = Date.now()
    // Simple cooldown: wheel/touch/drag can fire many times at the top.
    if (now - lastReachStartAtRef.current < 800) return
    lastReachStartAtRef.current = now
    cb()
  }, [])

  // Detect user intent to scroll past the very top (wheel/touch overscroll).
  useEffect(() => {
    if (!listReady) return
    const el = listRef.current?.element
    if (!el) return
    if (!onReachStart) return

    const onWheel = (e: WheelEvent) => {
      // deltaY < 0 means user trying to scroll up.
      if (e.deltaY < 0 && el.scrollTop <= 0) {
        maybeReachStart()
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0]
      touchStartYRef.current = t ? t.clientY : null
    }

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!t) return
      const startY = touchStartYRef.current
      if (startY == null) return
      const dy = t.clientY - startY
      // dy > 0: finger moved down, which attempts to scroll up.
      if (dy > 12 && el.scrollTop <= 0) {
        maybeReachStart()
      }
    }

    el.addEventListener('wheel', onWheel, { passive: true })
    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: true })
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
    }
  }, [listReady, onReachStart, maybeReachStart])

  // For variable-height single-page scrolling, use react-window's visibility reporting
  // to update the current page index (no height math required).
  const handleRowsRendered = useCallback(
    (visibleRows: { startIndex: number; stopIndex: number }) => {
      const rows: number[] = []
      for (let row = visibleRows.startIndex; row <= visibleRows.stopIndex; row++) {
        rows.push(row)
      }
      publishVisibleRows(rows)
      if (isTwoPageMode) return
      const listEl = listRef.current?.element
      if (listEl) {
        const EPS_PX = 2
        const isAtBottom =
          listEl.scrollTop + listEl.clientHeight >= listEl.scrollHeight - EPS_PX
        if (isAtBottom) {
          let last = pageCount - 1
          while (last > 0 && (getItemKind?.(last) ?? 'page') === 'spacer') last -= 1
          if (last >= 0 && last !== lastReportedPageIndex.current) {
            lastReportedPageIndex.current = last
            onPageChange(last)
          }
          return
        }
      }
      // Don't let react-window's initial (row 0) render override the desired starting page.
      // Wait until our initial target row is actually visible, then start reporting.
      if (!didInitialScrollRef.current) {
        const target = initialTargetRowRef.current
        if (
          target != null &&
          visibleRows.startIndex <= target &&
          visibleRows.stopIndex >= target
        ) {
          didInitialScrollRef.current = true
          lastReportedPageIndex.current = currentPageIndex
        }
        return
      }

      // If we're mid-programmatic scroll to a specific target row, don't report mid-page changes
      // until that target is actually visible. This prevents state update ping-pong.
      const pendingTarget = pendingProgrammaticTargetRowRef.current
      if (pendingTarget != null) {
        if (
          visibleRows.startIndex <= pendingTarget &&
          visibleRows.stopIndex >= pendingTarget
        ) {
          pendingProgrammaticTargetRowRef.current = null
        }
        return
      }
      // Stable "current page" rule: choose the page whose row contains the viewport centerline.
      // This flips exactly when you scroll past the midpoint between pages (direction-independent).
      if (!listEl) return
      const containerRect = listEl.getBoundingClientRect()
      const centerY = (containerRect.top + containerRect.bottom) / 2

      let bestIndex: number | null = null
      let bestDist = Number.POSITIVE_INFINITY
      let bestOverlapPx = -1

      const nodes = listEl.querySelectorAll<HTMLElement>('[data-row-index]')
      for (const node of nodes) {
        const rawIndex = node.dataset.rowIndex
        if (rawIndex == null) continue
        const idx = Number(rawIndex)
        if (!Number.isFinite(idx)) continue
        if ((getItemKind?.(idx) ?? 'page') === 'spacer') continue

        const rect = node.getBoundingClientRect()
        const overlapPx =
          Math.min(rect.bottom, containerRect.bottom) - Math.max(rect.top, containerRect.top)
        if (overlapPx <= 0) continue

        const containsCenter = rect.top <= centerY && rect.bottom >= centerY
        const dist = containsCenter ? 0 : Math.min(Math.abs(rect.top - centerY), Math.abs(rect.bottom - centerY))

        if (
          dist < bestDist ||
          (dist === bestDist && overlapPx > bestOverlapPx) ||
          (dist === bestDist && overlapPx === bestOverlapPx && (bestIndex == null || idx > bestIndex))
        ) {
          bestIndex = idx
          bestDist = dist
          bestOverlapPx = overlapPx
        }
      }

      if (bestIndex == null) return
      const newPageIndex = Math.max(0, Math.min(pageCount - 1, bestIndex))
      if (newPageIndex === lastReportedPageIndex.current) return
      lastReportedPageIndex.current = newPageIndex
      onPageChange(newPageIndex)
    },
    [isTwoPageMode, onPageChange, pageCount, currentPageIndex, getItemKind, publishVisibleRows]
  )

  // Initial scroll so switching into scrolling mode lands on the current page, not row 0.
  useEffect(() => {
    if (didInitialScrollRef.current) return
    if (!listReady) return
    if (!listRef.current) return
    if (currentPageIndex < 0) return
    if (rowCount <= 0) return

    const rawTargetIndex = isTwoPageMode ? currentSpreadIndex : currentPageIndex
    const targetIndex = Math.max(0, Math.min(rowCount - 1, rawTargetIndex))
    initialTargetRowRef.current = targetIndex
    lastReportedPageIndex.current = currentPageIndex
    listRef.current.scrollToRow({ index: targetIndex, align: isTwoPageMode ? 'center' : 'start' })
  }, [listReady, currentPageIndex, currentSpreadIndex, isTwoPageMode, rowCount, containerSize.height])

  // Mouse interaction handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 || currentScale > 1) return

      isDragging.current = true
      isUserScrolling.current = true
      dragStartY.current = e.clientY
      dragStartScrollTop.current = currentScrollOffset.current
      velocityTracker.current = [{ time: Date.now(), position: e.clientY }]

      stopInertia()

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      e.preventDefault()
    },
    [stopInertia, currentScale]
  )

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging.current || !listRef.current?.element) return

    const scrollDeltaY = dragStartY.current - e.clientY
    const newScrollTop = dragStartScrollTop.current + scrollDeltaY
    if (newScrollTop < 0 && listRef.current.element.scrollTop <= 0) {
      maybeReachStart()
    }

    listRef.current.element.scrollTop = Math.max(0, newScrollTop)

    const now = Date.now()
    velocityTracker.current.push({ time: now, position: e.clientY })
    velocityTracker.current = velocityTracker.current.filter((point) => now - point.time < 100)

    e.preventDefault()
  }, [maybeReachStart])

  const calculateVelocity = useCallback(() => {
    if (velocityTracker.current.length < 2) return 0

    const recent = velocityTracker.current.slice(-3)
    const first = recent[0]
    const last = recent[recent.length - 1]

    const deltaTime = last.time - first.time
    const deltaPosition = last.position - first.position

    if (deltaTime === 0) return 0

    return (deltaPosition / deltaTime) * -12
  }, [])

  const animateInertia = useCallback((initialVelocity: number) => {
    if (!listRef.current?.element) return

    let velocity = initialVelocity
    const friction = 0.96
    const minVelocity = 0.1

    const animate = () => {
      if (!listRef.current?.element || Math.abs(velocity) < minVelocity) {
        inertiaAnimation.current = null
        isUserScrolling.current = false
        return
      }

      const currentScroll = currentScrollOffset.current
      if (currentScroll <= 0 && velocity < 0) {
        // User is trying to scroll past top during inertia.
        maybeReachStart()
        inertiaAnimation.current = null
        isUserScrolling.current = false
        return
      }
      const newScroll = Math.max(0, currentScroll + velocity)

      listRef.current.element.scrollTop = newScroll
      currentScrollOffset.current = newScroll
      velocity *= friction

      inertiaAnimation.current = requestAnimationFrame(animate)
    }

    inertiaAnimation.current = requestAnimationFrame(animate)
  }, [maybeReachStart])

  const handleMouseUp = useCallback(() => {
    if (!isDragging.current) return

    isDragging.current = false

    const velocity = calculateVelocity()
    if (Math.abs(velocity) > 0.01) {
      animateInertia(velocity)
    } else {
      // No inertia, user scrolling ends immediately
      isUserScrolling.current = false
    }

    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }, [handleMouseMove, calculateVelocity, animateInertia])

  // Scroll to page when currentPageIndex changes from external source (slider, buttons, etc.)
  useEffect(() => {
    // Only scroll programmatically if:
    // 1. The page index changed from an external source (not from our scroll handler)
    // 2. User is not currently scrolling (dragging or inertia)
    if (
      listRef.current &&
      currentPageIndex >= 0 &&
      currentPageIndex !== lastReportedPageIndex.current &&
      !isUserScrolling.current &&
      rowCount > 0
    ) {
      lastReportedPageIndex.current = currentPageIndex
      const rawTargetIndex = isTwoPageMode ? currentSpreadIndex : currentPageIndex
      const targetIndex = Math.max(0, Math.min(rowCount - 1, rawTargetIndex))
      if (!isTwoPageMode) {
        pendingProgrammaticTargetRowRef.current = targetIndex
      }
      listRef.current.scrollToRow({ index: targetIndex, align: isTwoPageMode ? 'center' : 'start' })
    }
  }, [currentPageIndex, currentSpreadIndex, isTwoPageMode, rowCount])

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      stopInertia()
    }
  }, [handleMouseMove, handleMouseUp, stopInertia])


  const rowProps: RowProps = useMemo(
    () => ({
      pageCount,
      renderImage,
      getItemKind,
      onBackgroundClick,
      isTwoPageMode,
      pagePairingMode,
      readingMode: readingMode as 'rtl' | 'ltr' | 'scrolling',
      spreads,
      pageWidthScale,
    }),
    [
      pageCount,
      renderImage,
      getItemKind,
      onBackgroundClick,
      isTwoPageMode,
      pagePairingMode,
      readingMode,
      spreads,
      pageWidthScale,
    ]
  )

  return (
    <div ref={containerRef} className="w-full h-full bg-black">
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={3}
        doubleClick={{
          disabled: false,
          mode: 'toggle',
          step: 0.5,
        }}
        wheel={{
          wheelDisabled: currentScale <= 1,
          touchPadDisabled: currentScale <= 1,
          step: 0.1,
        }}
        onTransformed={(_ref, state) => {
          setCurrentScale(state.scale)
        }}
        pinch={{
          disabled: false,
          step: 5,
        }}
        panning={{
          disabled: currentScale <= 1,
          velocityDisabled: true,
        }}
        limitToBounds={true}
        centerOnInit={true}
      >
        <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full">
          <div
            onMouseDown={handleMouseDown}
            style={{ cursor: currentScale <= 1 ? 'grab' : 'default' }}
            className="w-full h-full"
          >
            {containerSize.height > 0 && (
              <List<RowProps>
                listRef={listRef}
                rowComponent={ScrollingRow}
                rowCount={rowCount}
                rowHeight={isTwoPageMode ? rowHeightPx : dynamicRowHeight}
                rowProps={rowProps}
                overscanCount={1}
                onRowsRendered={(visibleRows) => {
                  handleRowsRendered(visibleRows)
                }}
                style={{
                  height: containerSize.height,
                  width: containerSize.width,
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
                className="[&::-webkit-scrollbar]:hidden"
              />
            )}
          </div>
        </TransformComponent>
      </TransformWrapper>
    </div>
  )
}
