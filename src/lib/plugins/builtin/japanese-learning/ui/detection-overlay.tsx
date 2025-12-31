import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTextDetectorStore } from '../store'
import { cn } from '@/lib/utils'
import type { TextDetection } from '../types'
import type { ReaderPluginContext } from '../../../types'
import { isJapaneseSource } from './utils'

const LABEL_COLORS: Record<string, { bg: string; border: string }> = {
  ja: { bg: 'rgba(59, 130, 246, VAR)', border: 'rgb(96, 165, 250)' },
  eng: { bg: 'rgba(34, 197, 94, VAR)', border: 'rgb(74, 222, 128)' },
  unknown: { bg: 'rgba(168, 85, 247, VAR)', border: 'rgb(192, 132, 252)' },
}

interface ImageBounds {
  naturalWidth: number
  naturalHeight: number
  renderLeft: number
  renderTop: number
  renderWidth: number
  renderHeight: number
}

interface DetectionBoxProps {
  detection: TextDetection
  imageDims: { width: number; height: number }
  opacity: number
  isFlashing: boolean
  pageIndex: number
  imageUrl: string | undefined
}

function DetectionBox({ detection, imageDims, opacity, isFlashing, pageIndex, imageUrl }: DetectionBoxProps) {
  const colors = LABEL_COLORS[detection.label] ?? LABEL_COLORS.unknown
  const openOcrSheetFromBox = useTextDetectorStore((s) => s.openOcrSheetFromBox)
  const setBoxPopout = useTextDetectorStore((s) => s.setBoxPopout)
  const runOcr = useTextDetectorStore((s) => s.runOcr)
  const transcripts = useTextDetectorStore((s) => s.transcripts)
  const ocrLoadingPages = useTextDetectorStore((s) => s.ocrLoadingPages)
  const hoveredLine = useTextDetectorStore((s) => s.hoveredLine)

  // Check if this box is highlighted (matches hovered transcript line)
  const isHighlighted = hoveredLine &&
    hoveredLine.pageIndex === pageIndex &&
    detection.x1 === hoveredLine.x1 &&
    detection.y1 === hoveredLine.y1 &&
    detection.x2 === hoveredLine.x2 &&
    detection.y2 === hoveredLine.y2

  const style = useMemo(() => {
    const left = (detection.x1 / imageDims.width) * 100
    const top = (detection.y1 / imageDims.height) * 100
    const width = ((detection.x2 - detection.x1) / imageDims.width) * 100
    const height = ((detection.y2 - detection.y1) / imageDims.height) * 100

    return {
      left: `${left}%`,
      top: `${top}%`,
      width: `${width}%`,
      height: `${height}%`,
      backgroundColor: colors.bg.replace('VAR', String(opacity)),
      borderColor: colors.border,
    }
  }, [detection, imageDims, opacity, colors])

  const handleClick = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()

    const clickPosition = { x: e.clientX, y: e.clientY }
    openOcrSheetFromBox(pageIndex, detection, clickPosition)
    setBoxPopout({ pageIndex, box: detection, clickPosition, croppedImageUrl: null, croppedDimensions: null })

    // Crop image region for the floating popout preview.
    // This is intentionally independent from OCR/worker state.
    ;(async () => {
      if (!imageUrl) return
      try {
        const res = await fetch(imageUrl)
        if (!res.ok) throw new Error(`Failed to fetch image for popout: ${res.status} ${res.statusText}`)
        const sourceBlob = await res.blob()
        const bitmap = await createImageBitmap(sourceBlob)

        const padding = 10
        const cropX = Math.max(0, detection.x1 - padding)
        const cropY = Math.max(0, detection.y1 - padding)
        const cropWidth = Math.min(bitmap.width - cropX, detection.x2 - detection.x1 + padding * 2)
        const cropHeight = Math.min(bitmap.height - cropY, detection.y2 - detection.y1 + padding * 2)
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
          box: detection,
          clickPosition,
          croppedImageUrl: blobUrl,
          croppedDimensions: { width: cropWidth, height: cropHeight },
        })
        bitmap.close()
      } catch (err) {
        console.warn('[JapaneseLearning] Failed to crop selection for popout:', err)
      }
    })()

    // If transcript isn't ready yet, start OCR for the page.
    if (!imageUrl) return
    if (transcripts.has(pageIndex) || ocrLoadingPages.has(pageIndex)) return

    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`)
      const blob = await res.blob()
      runOcr(pageIndex, blob)
    } catch (err) {
      console.error('[JapaneseLearning] Failed to start OCR from box click:', err)
    }
  }, [openOcrSheetFromBox, setBoxPopout, pageIndex, detection, imageUrl, transcripts, ocrLoadingPages, runOcr])

  return (
    <button
      type="button"
      className={cn(
        "absolute pointer-events-auto cursor-pointer rounded-sm border-2 transition-opacity duration-200",
        isFlashing || isHighlighted ? "opacity-100" : "opacity-0 hover:opacity-100"
      )}
      style={style}
      onClick={handleClick}
      title={`${detection.label} (${(detection.confidence * 100).toFixed(0)}%)`}
    />
  )
}

interface DetectionOverlayProps {
  pageIndex: number
  ctx: ReaderPluginContext
}

export function DetectionOverlay({ pageIndex, ctx }: DetectionOverlayProps) {
  const { detections, settings, freshlyDetectedPages, clearFreshlyDetected } = useTextDetectorStore()
  const containerRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<ImageBounds | null>(null)
  const [isFlashing, setIsFlashing] = useState(false)

  // Check if plugin should be enabled for this source
  const isEnabled = isJapaneseSource(ctx)

  const blocks = isEnabled ? (detections.get(pageIndex) ?? []) : []
  const isFreshDetection = freshlyDetectedPages.has(pageIndex)

  // Handle flash animation for fresh detections (non-auto-detect mode only)
  useEffect(() => {
    if (isFreshDetection && !settings.autoDetect && blocks.length > 0) {
      setIsFlashing(true)
      const timer = setTimeout(() => {
        setIsFlashing(false)
        clearFreshlyDetected(pageIndex)
      }, 600) // Flash duration
      return () => clearTimeout(timer)
    }
  }, [isFreshDetection, settings.autoDetect, blocks.length, pageIndex, clearFreshlyDetected])

  const calculateBounds = useCallback(() => {
    const imageUrl = ctx.getPageImageUrl(pageIndex)
    if (!imageUrl || !containerRef.current) return

    const container = containerRef.current
    // IMPORTANT: use layout (untransformed) size, not getBoundingClientRect().
    // Reader zoom in paged/scrolling modes is implemented via CSS transforms, and
    // getBoundingClientRect() reflects the transformed visual size. Our overlay box
    // is positioned within the element's layout coordinate space.
    const containerW = container.clientWidth
    const containerH = container.clientHeight
    if (containerW <= 0 || containerH <= 0) return
    const pluginAwareRoot = container.parentElement?.parentElement
    const img = pluginAwareRoot?.querySelector('img')
    if (!img) return

    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    if (!naturalWidth || !naturalHeight) return

    const imageAspect = naturalWidth / naturalHeight
    const containerAspect = containerW / containerH

    let renderWidth: number
    let renderHeight: number

    if (imageAspect > containerAspect) {
      renderWidth = containerW
      renderHeight = containerW / imageAspect
    } else {
      renderHeight = containerH
      renderWidth = containerH * imageAspect
    }

    const renderLeft = (containerW - renderWidth) / 2
    const renderTop = (containerH - renderHeight) / 2

    setBounds({ naturalWidth, naturalHeight, renderLeft, renderTop, renderWidth, renderHeight })
  }, [ctx, pageIndex])

  useEffect(() => {
    const imageUrl = ctx.getPageImageUrl(pageIndex)
    if (!imageUrl) return

    const img = new Image()
    img.onload = () => {
      requestAnimationFrame(() => calculateBounds())
    }
    img.src = imageUrl

    const resizeObserver = new ResizeObserver(() => calculateBounds())
    const pluginAwareRoot = containerRef.current?.parentElement?.parentElement
    if (pluginAwareRoot) resizeObserver.observe(pluginAwareRoot)

    return () => resizeObserver.disconnect()
  }, [ctx, pageIndex, calculateBounds, blocks.length])

  const shouldShowBoxes = blocks.length > 0 && bounds

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none">
      {shouldShowBoxes && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: bounds.renderLeft,
            top: bounds.renderTop,
            width: bounds.renderWidth,
            height: bounds.renderHeight,
          }}
        >
          {blocks.map((det, i) => (
            <DetectionBox
              key={`${pageIndex}-${i}`}
              detection={det}
              imageDims={{ width: bounds.naturalWidth, height: bounds.naturalHeight }}
              opacity={0.4}
              isFlashing={isFlashing}
              pageIndex={pageIndex}
              imageUrl={ctx.getPageImageUrl(pageIndex)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

