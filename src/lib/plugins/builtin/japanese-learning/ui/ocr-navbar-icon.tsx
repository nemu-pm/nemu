import { HugeiconsIcon } from '@hugeicons/react'
import { TextSquareIcon } from '@hugeicons/core-free-icons'
import { useTextDetectorStore } from '../store'
import { usePluginCtx } from '../../../context'
import { cn } from '@/lib/utils'
import { getOcrPageRef } from '../page-ref'

export function OcrNavbarIcon() {
  const ctx = usePluginCtx()
  const detections = useTextDetectorStore((s) => s.detections)

  // In scrolling mode, only count detections for the current (most prominent) page
  const pageIndices = ctx.readingMode === 'scrolling'
    ? [ctx.currentPageIndex]
    : ctx.visiblePageIndices
  const count = pageIndices.reduce((sum, pageIndex) => {
    const ref = getOcrPageRef(ctx, pageIndex)
    if (!ref) return sum
    return sum + (detections.get(ref.pageKey)?.length ?? 0)
  }, 0)

  return (
    <span className="relative inline-flex">
      <HugeiconsIcon icon={TextSquareIcon} className="size-5" />
      {count > 0 && (
        <span
          className={cn(
            'absolute -top-1 -right-1 min-w-4 h-4 px-1',
            'rounded-full bg-primary text-primary-foreground',
            'text-[10px] leading-4 font-semibold tabular-nums',
            'flex items-center justify-center'
          )}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
}

