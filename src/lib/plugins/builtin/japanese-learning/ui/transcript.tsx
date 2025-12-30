import { useTextDetectorStore } from '../store'
import { usePluginCtx } from '../../../context'
import { cn } from '@/lib/utils'
import type { TextDetection, OcrTranscriptLine } from '../types'

interface TranscriptColumnProps {
  pageIndex: number
  lines: OcrTranscriptLine[]
  imageUrl: string | undefined
}

function TranscriptColumn({ pageIndex, lines, imageUrl }: TranscriptColumnProps) {
  const openOcrSheetFromTranscript = useTextDetectorStore((s) => s.openOcrSheetFromTranscript)
  const setHoveredLine = useTextDetectorStore((s) => s.setHoveredLine)
  const setBoxPopout = useTextDetectorStore((s) => s.setBoxPopout)
  const hoveredLine = useTextDetectorStore((s) => s.hoveredLine)

  if (lines.length === 0) {
    return (
      <div className="flex-1 min-w-0 text-center py-4 text-xs text-muted-foreground/60 italic">
        No text detected
      </div>
    )
  }

  // Check if a line matches the current hover
  const isLineHovered = (line: OcrTranscriptLine) =>
    hoveredLine &&
    hoveredLine.pageIndex === pageIndex &&
    hoveredLine.x1 === line.x1 &&
    hoveredLine.y1 === line.y1 &&
    hoveredLine.x2 === line.x2 &&
    hoveredLine.y2 === line.y2

  return (
    <div className="flex-1 min-w-0 space-y-0.5">
      {lines.map((line) => {
        const isHovered = isLineHovered(line)
        const somethingHovered = hoveredLine !== null
        // Fade non-hovered lines when any line is hovered
        const isFaded = somethingHovered && !isHovered

        return (
          <button
            key={line.order}
            type="button"
            onClick={(e) => {
              const clickPosition = { x: e.clientX, y: e.clientY }

              if (imageUrl) {
                // Set popout immediately (spinner), then fill with cropped image when ready.
                const box: TextDetection = {
                  x1: line.x1,
                  y1: line.y1,
                  x2: line.x2,
                  y2: line.y2,
                  confidence: line.confidence,
                  class: line.class,
                  label: line.label,
                }
                setBoxPopout({
                  pageIndex,
                  box,
                  clickPosition,
                  croppedImageUrl: null,
                  croppedDimensions: null,
                })

                ;(async () => {
                  try {
                    const res = await fetch(imageUrl)
                    if (!res.ok) throw new Error(`Failed to fetch image for popout: ${res.status} ${res.statusText}`)
                    const sourceBlob = await res.blob()
                    const bitmap = await createImageBitmap(sourceBlob)

                    const padding = 10
                    const cropX = Math.max(0, line.x1 - padding)
                    const cropY = Math.max(0, line.y1 - padding)
                    const cropWidth = Math.min(bitmap.width - cropX, line.x2 - line.x1 + padding * 2)
                    const cropHeight = Math.min(bitmap.height - cropY, line.y2 - line.y1 + padding * 2)
                    if (cropWidth <= 1 || cropHeight <= 1) return

                    const canvas = document.createElement('canvas')
                    canvas.width = cropWidth
                    canvas.height = cropHeight
                    const ctx2d = canvas.getContext('2d')
                    if (!ctx2d) return
                    ctx2d.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

                    const blob = await new Promise<Blob>((resolve, reject) => {
                      canvas.toBlob(
                        (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
                        'image/jpeg',
                        0.9
                      )
                    })

                    const blobUrl = URL.createObjectURL(blob)
                    setBoxPopout({
                      pageIndex,
                      box,
                      clickPosition,
                      croppedImageUrl: blobUrl,
                      croppedDimensions: { width: cropWidth, height: cropHeight },
                    })
                    bitmap.close()
                  } catch (err) {
                    console.warn('[JapaneseLearning] Failed to crop transcript selection for popout:', err)
                  }
                })()
              }

              openOcrSheetFromTranscript(pageIndex, line, { preserveBoxPopout: true })
            }}
            onMouseEnter={() => setHoveredLine({ pageIndex, x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })}
            onMouseLeave={() => setHoveredLine(null)}
            className={cn(
              'block w-full text-left rounded-md px-2 py-1.5',
              'transition-all duration-100',
              'text-[13px] leading-relaxed',
              'active:scale-[0.98]',
              isHovered
                ? 'bg-white/90 text-black'
                : 'hover:bg-white/15 reader-ui-text-primary',
              isFaded && 'opacity-10'
            )}
            lang="ja"
          >
            {line.text}
          </button>
        )
      })}
    </div>
  )
}

export function OcrTranscriptPopoverContent() {
  const ctx = usePluginCtx()
  const settings = useTextDetectorStore((s) => s.settings)
  const transcripts = useTextDetectorStore((s) => s.transcripts)
  const hoveredLine = useTextDetectorStore((s) => s.hoveredLine)

  // In scrolling mode, only show the current (most prominent) page transcript
  const visiblePages = ctx.readingMode === 'scrolling'
    ? [ctx.currentPageIndex]
    : ctx.visiblePageIndices
  const isRTL = ctx.readingMode === 'rtl'
  const isTwoPage = visiblePages.length >= 2
  const isHovering = hoveredLine !== null

  // Get filtered transcripts for visible pages
  const pageTranscripts = visiblePages.map((pageIndex) => {
    const raw = transcripts.get(pageIndex) ?? []
    return raw.filter(
      (line) => line.label === 'ja' && line.confidence >= settings.minConfidence
    )
  })

  // For RTL, reverse the column order (right page first visually = left column)
  const orderedPages = isRTL ? [...visiblePages].reverse() : visiblePages
  const orderedTranscripts = isRTL ? [...pageTranscripts].reverse() : pageTranscripts

  return (
    <div
      data-hovering={isHovering || undefined}
      className={cn(
        'transcript-popover-content relative max-h-[50vh] overflow-y-auto overscroll-contain',
        isTwoPage ? 'w-[480px] max-w-[85vw]' : 'w-[260px] max-w-[75vw]'
      )}
    >
      <div
        className={cn(
          isTwoPage && 'flex gap-3',
          isTwoPage && 'divide-x divide-border/40'
        )}
      >
        {orderedPages.map((pageIndex, i) => (
          <div
            key={pageIndex}
            className={cn(isTwoPage && i > 0 && 'pl-3')}
            style={{ flex: isTwoPage ? 1 : undefined }}
          >
            <TranscriptColumn
              pageIndex={pageIndex}
              lines={orderedTranscripts[i]}
              imageUrl={ctx.getPageImageUrl(pageIndex)}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

