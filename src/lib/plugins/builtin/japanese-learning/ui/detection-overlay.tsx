import { useMemo, useState, useEffect, useRef, useCallback } from 'react'
import { useTextDetectorStore } from '../store'
import { cn } from '@/lib/utils'
import type { TextDetection } from '../types'
import type { ReaderPluginContext } from '../../../types'
import { isJapaneseSource } from './utils'
import { useIsInteractionLocked } from '../../../context'
import { getOcrPageRef } from '../page-ref'
import type { OcrPageCacheKeyV3 } from '../ocr-page-cache'
import { createTtsId, useTtsStore } from '@/stores/tts'
import { buildLineTimings } from './transcript-timing'
import { hapticSelection } from '@/lib/haptics'

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
  pageKey: string
  imageUrl: string | undefined
  cacheKey: OcrPageCacheKeyV3 | undefined
  disabled?: boolean
}

function DetectionBox({ detection, imageDims, opacity, isFlashing, pageKey, imageUrl, cacheKey, disabled }: DetectionBoxProps) {
  const colors = LABEL_COLORS[detection.label] ?? LABEL_COLORS.unknown
  const openOcrSheetFromBox = useTextDetectorStore((s) => s.openOcrSheetFromBox)
  const setBoxPopout = useTextDetectorStore((s) => s.setBoxPopout)
  const runOcr = useTextDetectorStore((s) => s.runOcr)
  const transcripts = useTextDetectorStore((s) => s.transcripts)
  const ocrLoadingPages = useTextDetectorStore((s) => s.ocrLoadingPages)
  const hoveredLine = useTextDetectorStore((s) => s.hoveredLine)
  const playingLine = useTextDetectorStore((s) => s.playingLine)

  // Check if this box is highlighted (matches hovered transcript line)
  const isHovered = hoveredLine &&
    hoveredLine.pageKey === pageKey &&
    detection.x1 === hoveredLine.x1 &&
    detection.y1 === hoveredLine.y1 &&
    detection.x2 === hoveredLine.x2 &&
    detection.y2 === hoveredLine.y2
  const isPlaying = playingLine &&
    playingLine.pageKey === pageKey &&
    detection.x1 === playingLine.x1 &&
    detection.y1 === playingLine.y1 &&
    detection.x2 === playingLine.x2 &&
    detection.y2 === playingLine.y2
  const isHighlighted = Boolean(isHovered || isPlaying)

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
    hapticSelection()

    const clickPosition = { x: e.clientX, y: e.clientY }
    openOcrSheetFromBox(pageKey, detection, clickPosition)
    setBoxPopout({ pageKey, box: detection, clickPosition, croppedImageUrl: null, croppedDimensions: null })

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
          pageKey,
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
    if (transcripts.has(pageKey) || ocrLoadingPages.has(pageKey)) return

    try {
      const res = await fetch(imageUrl)
      if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`)
      const blob = await res.blob()
      runOcr(pageKey, blob, cacheKey)
    } catch (err) {
      console.error('[JapaneseLearning] Failed to start OCR from box click:', err)
    }
  }, [openOcrSheetFromBox, setBoxPopout, pageKey, detection, imageUrl, transcripts, ocrLoadingPages, runOcr, cacheKey])

  return (
    <button
      type="button"
      className={cn(
        "absolute rounded-sm border-2 transition-opacity duration-200",
        disabled ? "pointer-events-none" : "pointer-events-auto cursor-pointer",
        isFlashing || isHighlighted ? "opacity-100" : "opacity-0 hover:opacity-100"
      )}
      style={style}
      onClick={handleClick}
      disabled={disabled}
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
  const transcripts = useTextDetectorStore((s) => s.transcripts)
  const playingLine = useTextDetectorStore((s) => s.playingLine)
  const setPlayingLine = useTextDetectorStore((s) => s.setPlayingLine)
  const currentAudioId = useTtsStore((s) => s.currentAudioId)
  const currentTime = useTtsStore((s) => s.currentTime)
  const ensureAlignment = useTtsStore((s) => s.ensureAlignment)
  const containerRef = useRef<HTMLDivElement>(null)
  const [bounds, setBounds] = useState<ImageBounds | null>(null)
  const [isFlashing, setIsFlashing] = useState(false)
  const isInteractionLocked = useIsInteractionLocked()
  const lastPlayingRef = useRef<string | null>(null)

  // Check if plugin should be enabled for this source
  const isEnabled = isJapaneseSource(ctx)

  const pageRef = useMemo(() => getOcrPageRef(ctx, pageIndex), [ctx, pageIndex])
  const blocks = isEnabled && pageRef ? (detections.get(pageRef.pageKey) ?? []) : []
  const isFreshDetection = !!pageRef && freshlyDetectedPages.has(pageRef.pageKey)
  const transcriptLines = useMemo(
    () => (pageRef ? transcripts.get(pageRef.pageKey) ?? [] : []),
    [pageRef, transcripts]
  )
  const transcriptText = useMemo(
    () => transcriptLines.map((line) => line.text).filter(Boolean).join('\n'),
    [transcriptLines]
  )
  const ttsId = useMemo(
    () => (pageRef && transcriptText ? createTtsId(`transcript-${pageRef.pageKey}`, transcriptText) : null),
    [pageRef, transcriptText]
  )
  const alignment = useTtsStore((s) => (ttsId ? s.alignments.get(ttsId) : null))
  const isCurrent = currentAudioId === ttsId
  const lineTimings = useMemo(
    () => (alignment ? buildLineTimings(transcriptLines, alignment) : null),
    [alignment, transcriptLines]
  )

  useEffect(() => {
    if (!ttsId || !transcriptText) return
    if (!isCurrent) return
    if (transcriptText.length > 500) return
    if (alignment) return
    ensureAlignment(ttsId, transcriptText, { source: 'transcript' }).catch(() => undefined)
  }, [alignment, ensureAlignment, isCurrent, transcriptText, ttsId])

  useEffect(() => {
    if (!pageRef || !lineTimings || !isCurrent) {
      if (playingLine && pageRef && playingLine.pageKey === pageRef.pageKey) {
        lastPlayingRef.current = null
        setPlayingLine(null)
      }
      return
    }

    const activeIndex = lineTimings.findIndex(
      (timing) => timing && currentTime >= timing.start && currentTime <= timing.end
    )
    if (activeIndex === -1) {
      if (playingLine && playingLine.pageKey === pageRef.pageKey) {
        lastPlayingRef.current = null
        setPlayingLine(null)
      }
      return
    }
    const activeLine = transcriptLines[activeIndex]
    if (!activeLine) return
    const key = `${pageRef.pageKey}:${activeLine.order}`
    if (lastPlayingRef.current === key) return
    lastPlayingRef.current = key
    setPlayingLine({
      pageKey: pageRef.pageKey,
      x1: activeLine.x1,
      y1: activeLine.y1,
      x2: activeLine.x2,
      y2: activeLine.y2,
    })
  }, [currentTime, isCurrent, lineTimings, pageRef, playingLine, setPlayingLine, transcriptLines])

  // Handle flash animation for fresh detections (non-auto-detect mode only)
  useEffect(() => {
    if (isFreshDetection && !settings.autoDetect && blocks.length > 0) {
      setIsFlashing(true)
      const timer = setTimeout(() => {
        setIsFlashing(false)
        if (pageRef) clearFreshlyDetected(pageRef.pageKey)
      }, 600) // Flash duration
      return () => clearTimeout(timer)
    }
  }, [isFreshDetection, settings.autoDetect, blocks.length, clearFreshlyDetected, pageRef])

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
              pageKey={pageRef?.pageKey ?? String(pageIndex)}
              imageUrl={ctx.getPageImageUrl(pageIndex)}
              cacheKey={pageRef?.cacheKey}
              disabled={isInteractionLocked}
            />
          ))}
        </div>
      )}
    </div>
  )
}
