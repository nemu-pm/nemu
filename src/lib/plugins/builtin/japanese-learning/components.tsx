import { useMemo, useState, useEffect, useRef, useCallback, Fragment, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from '@/components/ui/drawer'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon } from '@hugeicons/core-free-icons'
import { useTextDetectorStore } from './store'
import { useConvex } from 'convex/react'
import { api } from '../../../../../convex/_generated/api'
import type { TextDetection } from './types'
import type { GrammarToken } from './ichiran-types'
import type { ReaderPluginContext } from '../../types'
import { usePluginCtx } from '../../context'
import { cn, copyToClipboard } from '@/lib/utils'
import { motion, AnimatePresence } from 'motion/react'
import { getPOSStyles } from './pos-styles'
import { getPOSCategory, PartOfSpeechCategory } from './grammar-analysis'
import { tokenize } from './ichiran-service'
import { convertIchiranToGrammarTokens } from './grammar-analysis'

// ============================================================================
// Language Check Helper
// ============================================================================

/**
 * Check if plugin features should be enabled for the given context.
 * Returns true if enableForAllLanguages is true OR source languages include Japanese.
 */
function isJapaneseSource(ctx: ReaderPluginContext): boolean {
  const { settings } = useTextDetectorStore.getState()
  if (settings.enableForAllLanguages) return true
  return ctx.sourceLanguages.some((l) => l === 'ja' || l === 'multi')
}

// ============================================================================
// Scroll Fading Overlay - for drawer scrollable areas
// ============================================================================

interface ScrollFadingOverlayProps {
  scrollRef: RefObject<HTMLElement | null>
  gradientHeight?: number
  gradientColor?: string
  threshold?: number
}

function ScrollFadingOverlay({
  scrollRef,
  gradientHeight = 48,
  gradientColor = 'var(--background)',
  threshold,
}: ScrollFadingOverlayProps) {
  const [topOpacity, setTopOpacity] = useState(0)
  const [bottomOpacity, setBottomOpacity] = useState(0)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const effectiveThreshold = threshold ?? gradientHeight

    const update = () => {
      const scrollTop = el.scrollTop
      const scrollHeight = el.scrollHeight
      const clientHeight = el.clientHeight
      const scrollableHeight = scrollHeight - clientHeight

      // Top gradient: fade in as you scroll down from top
      setTopOpacity(Math.min(scrollTop / effectiveThreshold, 1))

      // Bottom gradient: fade in when there's more content below
      const distanceFromBottom = scrollableHeight - scrollTop
      setBottomOpacity(Math.min(distanceFromBottom / effectiveThreshold, 1))
    }

    update()
    el.addEventListener('scroll', update, { passive: true })
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(el)

    return () => {
      el.removeEventListener('scroll', update)
      resizeObserver.disconnect()
    }
  }, [scrollRef, gradientHeight, threshold])

  return (
    <>
      <div
        className="absolute top-0 left-0 right-0 pointer-events-none z-10 transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to bottom, ${gradientColor}, transparent)`,
          opacity: topOpacity,
        }}
      />
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none z-10 transition-opacity duration-150"
        style={{
          height: `${gradientHeight}px`,
          background: `linear-gradient(to top, ${gradientColor}, transparent)`,
          opacity: bottomOpacity,
        }}
      />
    </>
  )
}

// ============================================================================
// Model Loading Content (for popover)
// ============================================================================

export function ModelLoadingContent() {
  const { t } = useTranslation()
  const modelLoadingStage = useTextDetectorStore((s) => s.modelLoadingStage)
  const cancelModelLoading = useTextDetectorStore((s) => s.cancelModelLoading)

  const handleCancel = () => {
    cancelModelLoading()
  }

  if (!modelLoadingStage) return null

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Spinner className="size-3.5" />
        <span className="text-xs reader-ui-text-secondary">
          {modelLoadingStage === 'downloading' 
            ? t('plugin.japaneseLearning.downloadingModel') 
            : t('plugin.japaneseLearning.initializingModel')}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="w-full h-7 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10"
        onClick={handleCancel}
      >
        {t('common.cancel')}
      </Button>
    </div>
  )
}

// ============================================================================
// Detection Overlay Component
// ============================================================================

interface DetectionOverlayProps {
  pageIndex: number
  ctx: ReaderPluginContext
}

interface ImageBounds {
  naturalWidth: number
  naturalHeight: number
  renderLeft: number
  renderTop: number
  renderWidth: number
  renderHeight: number
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
    const containerRect = container.getBoundingClientRect()
    const pluginAwareRoot = container.parentElement?.parentElement
    const img = pluginAwareRoot?.querySelector('img')
    if (!img) return

    const naturalWidth = img.naturalWidth
    const naturalHeight = img.naturalHeight
    if (!naturalWidth || !naturalHeight) return

    const containerW = containerRect.width
    const containerH = containerRect.height
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
              pageIndex={pageIndex}
              imageUrl={ctx.getPageImageUrl(pageIndex)}
              isFlashing={isFlashing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Individual Detection Box
// ============================================================================

const LABEL_COLORS: Record<string, { bg: string; border: string }> = {
  ja: { bg: 'rgba(59, 130, 246, VAR)', border: 'rgb(96, 165, 250)' },
  eng: { bg: 'rgba(34, 197, 94, VAR)', border: 'rgb(74, 222, 128)' },
  unknown: { bg: 'rgba(168, 85, 247, VAR)', border: 'rgb(192, 132, 252)' },
}

interface DetectionBoxInternalProps {
  detection: TextDetection
  imageDims: { width: number; height: number }
  opacity: number
  pageIndex: number
  imageUrl: string | undefined
  isFlashing: boolean
}

function DetectionBox({ detection, imageDims, opacity, pageIndex, imageUrl, isFlashing }: DetectionBoxInternalProps) {
  const colors = LABEL_COLORS[detection.label] ?? LABEL_COLORS.unknown
  const openOcrSheet = useTextDetectorStore((s) => s.openOcrSheet)
  const setCroppedImage = useTextDetectorStore((s) => s.setCroppedImage)
  const setOcrResult = useTextDetectorStore((s) => s.setOcrResult)
  const setGrammarAnalysis = useTextDetectorStore((s) => s.setGrammarAnalysis)
  const convex = useConvex()

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
    
    if (!imageUrl) return

    const clickPosition = { x: e.clientX, y: e.clientY }

    // Open sheet immediately with click position
    openOcrSheet({
      detection,
      pageIndex,
      clickPosition,
      croppedImageUrl: null,
      croppedDimensions: null,
    })

    // Crop the image region
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('Failed to load image'))
        img.src = imageUrl
      })

      const padding = 10
      const cropX = Math.max(0, detection.x1 - padding)
      const cropY = Math.max(0, detection.y1 - padding)
      const cropWidth = Math.min(img.naturalWidth - cropX, (detection.x2 - detection.x1) + padding * 2)
      const cropHeight = Math.min(img.naturalHeight - cropY, (detection.y2 - detection.y1) + padding * 2)

      const canvas = document.createElement('canvas')
      canvas.width = cropWidth
      canvas.height = cropHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

      const base64 = canvas.toDataURL('image/jpeg', 0.9)
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.9)
      })
      const blobUrl = URL.createObjectURL(blob)
      
      setCroppedImage(blobUrl, { width: cropWidth, height: cropHeight })

      // Step 1: Run OCR via Convex
      try {
        const ocrResult = await convex.action(api.ocr.extractText, { imageBase64: base64 })
        setOcrResult({ text: ocrResult.text, loading: false, error: null })
        
        // Step 2: Run grammar analysis via ichiran API
        if (ocrResult.text) {
          setGrammarAnalysis({ loading: true, error: null })
          
          try {
            const response = await tokenize(ocrResult.text)
            const grammarTokens = convertIchiranToGrammarTokens(response.tokens)
            setGrammarAnalysis({ 
              tokens: grammarTokens, 
              grammars: response.grammars || {},
              loading: false, 
              error: null 
            })
          } catch (err) {
            console.error('[OCR] Analysis failed:', err)
            setGrammarAnalysis({ loading: false, error: 'Analysis failed' })
          }
        }
      } catch (err) {
        console.error('[OCR] Failed:', err)
        setOcrResult({ text: '', loading: false, error: 'OCR failed' })
      }
    } catch (err) {
      console.error('[OCR] Failed to crop image:', err)
      setOcrResult({ text: '', loading: false, error: 'Failed to process image' })
    }
  }, [detection, pageIndex, imageUrl, openOcrSheet, setCroppedImage, setOcrResult, setGrammarAnalysis, convex])

  return (
    <button
      className={cn(
        "absolute pointer-events-auto cursor-pointer rounded-sm border-2 transition-opacity duration-200",
        isFlashing ? "opacity-100" : "opacity-0 hover:opacity-100"
      )}
      style={style}
      onClick={handleClick}
      title={`${detection.label} (${(detection.confidence * 100).toFixed(0)}%)`}
    />
  )
}

// ============================================================================
// Text Popout - Floating cropped image preview
// ============================================================================

export function TextPopout() {
  const { t } = useTranslation()
  const ocrSelection = useTextDetectorStore((s) => s.ocrSelection)
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const [dims, setDims] = useState({ width: 200, height: 100 })

  useEffect(() => {
    if (ocrSelection?.croppedDimensions) {
      const { width, height } = ocrSelection.croppedDimensions
      const aspectRatio = width / height
      let displayHeight = window.innerHeight * 0.2
      let displayWidth = displayHeight * aspectRatio
      const maxWidth = window.innerWidth * 0.9
      if (displayWidth > maxWidth) {
        displayWidth = maxWidth
        displayHeight = displayWidth / aspectRatio
      }
      setDims({ width: displayWidth, height: displayHeight })
    }
  }, [ocrSelection?.croppedDimensions])

  const showPopout = ocrSheetOpen && ocrSelection?.croppedImageUrl
  const clickPosition = ocrSelection?.clickPosition ?? { x: 0, y: 0 }
  const { width: displayWidth, height: displayHeight } = dims

  const content = (
    <AnimatePresence>
      {showPopout && (
        <motion.div
          key="textPopout"
          initial={{
            opacity: 0,
            scale: 0.1,
            left: clickPosition.x - displayWidth / 2,
            top: clickPosition.y - displayHeight / 2,
          }}
          animate={{
            opacity: 1,
            scale: 1,
            left: `calc(50vw - ${displayWidth / 2}px)`,
            top: `calc(20vh - ${displayHeight / 2}px)`,
          }}
          exit={{
            opacity: 0,
            scale: 0.8,
            transition: { duration: 0.2, ease: 'easeOut' },
          }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="fixed pointer-events-none z-[60]"
        >
          <motion.div
            initial={{ rotateY: 0, scale: 1.2 }}
            animate={{ rotateY: [0, 2, -2, 0], scale: [1.2, 1.05, 1] }}
            transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
            className="bg-background/95 backdrop-blur-xl rounded-xl overflow-hidden shadow-2xl"
            style={{
              width: displayWidth,
              height: displayHeight,
              boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.1)',
            }}
          >
            <motion.img
              src={ocrSelection!.croppedImageUrl!}
              alt={t('plugin.japaneseLearning.selectedText')}
              className="w-full h-full object-cover"
              style={{ imageRendering: 'crisp-edges' }}
              initial={{ scale: 1.1 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

// ============================================================================
// Token Display - Scholarly Textbook Style with Visual Grammar Parsing
// ============================================================================

interface TokenDisplayProps {
  token: GrammarToken
  index: number
  isSelected: boolean
  onSelect: () => void
}

// Map POS category to CSS class for color theming
function getPOSClass(pos: string): string {
  const category = getPOSCategory(pos)
  const classMap: Record<string, string> = {
    noun: 'pos-noun',
    verb: 'pos-verb',
    adjective: 'pos-adjective',
    adverb: 'pos-adverb',
    particle: 'pos-particle',
    pronoun: 'pos-pronoun',
    conjunction: 'pos-conjunction',
    copula: 'pos-copula',
    interjection: 'pos-expression',
    auxiliary: 'pos-auxiliary',
    counter: 'pos-numeric',
    expression: 'pos-expression',
    numeric: 'pos-numeric',
    'prefix-suffix': 'pos-prefix-suffix',
    unknown: 'pos-unknown',
    other: 'pos-other',
  }
  return classMap[category] || 'pos-unknown'
}

// Get abbreviated POS label for display
function getPOSLabel(pos: string): string {
  const category = getPOSCategory(pos)
  const labelMap: Record<string, string> = {
    noun: '名',
    verb: '動',
    adjective: '形',
    adverb: '副',
    particle: '助',
    pronoun: '代',
    conjunction: '接',
    copula: '繋',
    interjection: '感',
    auxiliary: '助動',
    counter: '助数',
    expression: '表現',
    numeric: '数',
    'prefix-suffix': '接辞',
  }
  return labelMap[category] || ''
}

function TokenDisplay({ token, index, isSelected, onSelect }: TokenDisplayProps) {
  const category = getPOSCategory(token.partOfSpeech)
  const isPunctuation = category === PartOfSpeechCategory.PUNCTUATION
  const displayWord = token.word.replace(/\n/g, '')
  const displayReading = token.reading.replace(/\n/g, '')
  const hasNewline = token.word !== displayWord
  const posClass = getPOSClass(token.partOfSpeech)
  const posLabel = getPOSLabel(token.partOfSpeech)
  const showFurigana = displayReading && displayReading !== displayWord

  // Punctuation - plain unstyled, but EXACT same structure for alignment
  if (isPunctuation) {
    return (
      <Fragment>
        <span className="ja-textbook inline-flex flex-col items-center align-bottom mx-[1px]">
          {/* Furigana row - same as tokens */}
          <span className="h-[0.9rem] flex items-end justify-center" />
          {/* Word - exact same structure as tokens */}
          <span
            className="relative inline-block rounded-[3px] text-[1.4rem] sm:text-[1.6rem] px-1 py-0.5 text-muted-foreground/50"
            style={{ borderBottom: '2px solid transparent' }}
          >
            {displayWord}
          </span>
          {/* POS row - same as tokens */}
          <span className="h-[1rem] flex items-start justify-center mt-0.5" />
        </span>
        {hasNewline && <br />}
      </Fragment>
    )
  }

  // All other tokens - unified structure
  // Vertical stack: furigana → word → POS label
  return (
    <Fragment>
      <motion.button
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{
          delay: index * 0.018,
          duration: 0.28,
          ease: [0.22, 1, 0.36, 1]
        }}
        className={cn(
          "ja-textbook inline-flex flex-col items-center cursor-pointer",
          "mx-[1px] transition-all duration-150",
          "select-none group/token align-bottom",
          posClass
        )}
        onClick={onSelect}
        data-selected={isSelected}
      >
        {/* Furigana row - fixed height for alignment */}
        <span className="h-[0.9rem] flex items-end justify-center">
          {showFurigana && (
            <span
              className={cn(
                "text-[0.6rem] sm:text-[0.65rem] tracking-wide whitespace-nowrap",
                "text-muted-foreground font-sans font-normal leading-none",
                "transition-opacity duration-150",
                isSelected ? "opacity-100" : "opacity-70 group-hover/token:opacity-90"
              )}
            >
              {displayReading}
            </span>
          )}
        </span>

        {/* Main word - same size for everything */}
        <span
          className={cn(
            "relative inline-block rounded-[3px]",
            "text-[1.4rem] sm:text-[1.6rem] px-1 py-0.5",
            "transition-all duration-150",
            !isSelected && "group-hover/token:brightness-95 dark:group-hover/token:brightness-110"
          )}
          style={{
            background: isSelected
              ? 'color-mix(in oklch, var(--pos-bg) 100%, var(--pos-border) 25%)'
              : 'var(--pos-bg)',
            borderBottom: isSelected
              ? '3px solid var(--pos-border)'
              : '2px solid var(--pos-border)',
            boxShadow: isSelected
              ? 'inset 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)'
              : undefined,
            marginBottom: isSelected ? '-1px' : undefined, // Compensate for thicker border
          }}
        >
          {displayWord}
        </span>

        {/* POS label row - fixed height for alignment */}
        <span className="h-[1rem] flex items-start justify-center mt-0.5">
          {posLabel && (
            <span
              className={cn(
                "text-[0.5rem] sm:text-[0.55rem] font-medium leading-none",
                "transition-opacity duration-150",
                isSelected
                  ? "opacity-100"
                  : "opacity-40 group-hover/token:opacity-70"
              )}
              style={{ color: 'var(--pos-text)' }}
            >
              {posLabel}
            </span>
          )}
        </span>
      </motion.button>
      {hasNewline && <br />}
    </Fragment>
  )
}

// ============================================================================
// Token Details - Refined card with meaning and grammar info
// ============================================================================

function POSTag({ pos, subtle = false }: { pos: string; subtle?: boolean }) {
  const { t } = useTranslation()
  const styles = getPOSStyles(pos)
  // Try to get translation, fall back to original string
  const translatedPos = t(`plugin.japaneseLearning.pos.${pos}`, { defaultValue: pos })
  const translatedConjugation = t(`plugin.japaneseLearning.conjugation.${pos}`, { defaultValue: translatedPos })
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[0.65rem] font-medium tracking-wide',
        'border transition-colors',
        subtle
          ? 'bg-muted/50 text-muted-foreground border-transparent'
          : styles.tag
      )}
    >
      {translatedConjugation}
    </span>
  )
}

function TokenSummary({ token }: { token: GrammarToken }) {
  const posClass = getPOSClass(token.partOfSpeech)
  const shouldShowPOSOnly =
    !token.components.length &&
    token.meanings.length === 0 &&
    token.alternatives.length === 0 &&
    token.conjugations.length === 0 &&
    token.partOfSpeech.length > 0 &&
    !token.isSuffix

  return (
    <div className={cn("space-y-2", posClass)}>
      {/* Word header with reading and POS color indicator */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="ja-textbook text-2xl sm:text-3xl font-semibold tracking-tight text-foreground selectable"
          lang="ja"
        >
          {token.word}
        </span>
        {token.reading && (
          <span className="text-base text-muted-foreground font-normal selectable" lang="ja">
            {token.reading}
          </span>
        )}
      </div>

      {/* POS tags row */}
      {(shouldShowPOSOnly || token.conjugationTypes?.length || token.suffix) && (
        <div className="flex flex-wrap gap-1.5 items-center">
          {shouldShowPOSOnly && <POSTag pos={token.partOfSpeech} />}
          {token.conjugationTypes?.map((conj, index) => (
            <POSTag key={`conj-${index}`} pos={conj} subtle />
          ))}
          {token.suffix && <POSTag pos={token.suffix} subtle />}
        </div>
      )}
    </div>
  )
}

function TokenMeanings({ meanings }: { meanings: GrammarToken['meanings'] }) {
  if (!meanings.length) return null

  return (
    <div className="space-y-3">
      {meanings.map((meaning, index) => (
        <motion.div
          key={index}
          className="flex items-start gap-3"
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 + 0.1, duration: 0.2 }}
        >
          {/* Number indicator */}
          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/80 text-muted-foreground text-[0.65rem] font-medium flex items-center justify-center mt-0.5">
            {index + 1}
          </span>

          <div className="flex-1 min-w-0">
            {/* POS tags for this meaning */}
            {meaning.partOfSpeech.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {meaning.partOfSpeech.map((pos, j) => (
                  <POSTag key={j} pos={pos} />
                ))}
              </div>
            )}

            {/* Meaning text */}
            <p className="text-sm text-foreground/90 leading-relaxed selectable">
              {meaning.text}
            </p>

            {/* Additional info */}
            {meaning.info && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                {meaning.info}
              </p>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase tracking-widest">
        {children}
      </span>
      <div className="flex-1 h-px bg-border/50" />
    </div>
  )
}

function TokenDetails({ token, isNested = false }: { token: GrammarToken; isNested?: boolean }) {
  const { t } = useTranslation()
  const shouldShowMeanings =
    !token.components.length &&
    token.meanings.length > 0 &&
    getPOSCategory(token.partOfSpeech) !== PartOfSpeechCategory.PUNCTUATION

  const content = (
    <div
      className={cn(
        'rounded-xl overflow-hidden',
        isNested
          ? 'p-3 bg-muted/30 border border-border/50'
          : 'p-4 sm:p-5 token-details-card'
      )}
    >
      <div className="space-y-4">
        <TokenSummary token={token} />

        {shouldShowMeanings && (
          <div className="pt-1">
            <TokenMeanings meanings={token.meanings} />
          </div>
        )}

        {/* Components (compound word breakdown) */}
        {token.components.length > 0 && (
          <div className="pt-2">
            <SectionHeader>{t('plugin.japaneseLearning.structure')}</SectionHeader>
            <div className="flex flex-wrap gap-1.5 items-center mb-3">
              {token.components.map((component, i) => (
                <Fragment key={i}>
                  <span
                    className="inline-flex items-center px-2.5 py-1 rounded-lg bg-secondary/80 text-sm font-medium selectable"
                    lang="ja"
                  >
                    {component.word}
                  </span>
                  {i < token.components.length - 1 && (
                    <span className="text-muted-foreground/50 text-xs">+</span>
                  )}
                </Fragment>
              ))}
            </div>
            <div className="space-y-2">
              {token.components.map((component, i) => (
                <TokenDetails key={i} token={component} isNested />
              ))}
            </div>
          </div>
        )}

        {/* Conjugations */}
        {token.conjugations.length > 0 && (
          <div className="pt-2">
            <SectionHeader>
              {token.hasConjugationVia ? t('plugin.japaneseLearning.conjugationPath') : t('plugin.japaneseLearning.baseForm')}
            </SectionHeader>
            <div className="space-y-2">
              {token.conjugations.map((conj, i) => (
                <TokenDetails key={i} token={conj} isNested />
              ))}
            </div>
          </div>
        )}

        {/* Alternatives */}
        {token.alternatives.length > 0 && (
          <div className="pt-2">
            <SectionHeader>{t('plugin.japaneseLearning.alternativeReadings')}</SectionHeader>
            <div className="space-y-2">
              {token.alternatives.map((alt, i) => (
                <TokenDetails key={i} token={alt} isNested />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )

  if (isNested) {
    return content
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{
        duration: 0.25,
        ease: [0.22, 1, 0.36, 1]
      }}
    >
      {content}
    </motion.div>
  )
}

// ============================================================================
// Sentence Display - Scholarly Textbook with Visual Grammar Parsing
// ============================================================================

interface SentenceDisplayProps {
  tokens: GrammarToken[]
  showTokens: boolean
  selectedIndex: number | null
  onSelectToken: (index: number | null) => void
}

function SentenceDisplay({ tokens, showTokens, selectedIndex, onSelectToken }: SentenceDisplayProps) {
  const { t } = useTranslation()
  // Wait for tokens - no intermediate state to prevent flashing
  if (!showTokens || tokens.length === 0) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="text-sm text-muted-foreground">{t('plugin.japaneseLearning.analyzingGrammar')}</div>
      </div>
    )
  }

  // Tokenized display with visual grammar parsing
  return (
    <div className="space-y-4">
      {/* Token sentence with grammar-highlighted tokens */}
      <div className="pt-2 pb-4" lang="ja">
        {tokens.map((token, i) => (
          <TokenDisplay
            key={`${i}-${token.word}`}
            token={token}
            index={i}
            isSelected={selectedIndex === i}
            onSelect={() => onSelectToken(selectedIndex === i ? null : i)}
          />
        ))}
      </div>

      {/* Selected token details with smooth transition */}
      <AnimatePresence mode="wait">
        {selectedIndex !== null && tokens[selectedIndex] ? (
          <TokenDetails
            key={`details-${selectedIndex}`}
            token={tokens[selectedIndex]}
          />
        ) : (
          <motion.div
            key="empty-selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col items-center justify-center py-6 text-center"
          >
            <p className="text-xs text-muted-foreground/70">
              {t('plugin.japaneseLearning.tapWordHint')}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ============================================================================
// OCR Result Sheet - Using Vaul Drawer for consistent UI
// ============================================================================

export function OcrResultSheet() {
  const { t } = useTranslation()
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const ocrResult = useTextDetectorStore((s) => s.ocrResult)
  const grammarAnalysis = useTextDetectorStore((s) => s.grammarAnalysis)
  const closeOcrSheet = useTextDetectorStore((s) => s.closeOcrSheet)
  const selectedTokenIndex = useTextDetectorStore((s) => s.selectedTokenIndex)
  const setSelectedTokenIndex = useTextDetectorStore((s) => s.setSelectedTokenIndex)
  const scrollRef = useRef<HTMLDivElement>(null)

  const showTokens = !grammarAnalysis.loading && grammarAnalysis.tokens.length > 0

  const handleCopy = useCallback(async () => {
    if (ocrResult.text) {
      const success = await copyToClipboard(ocrResult.text)
      if (success) {
        toast.success(t('plugin.japaneseLearning.copySuccess'))
      }
    }
  }, [ocrResult.text, t])

  return (
    <Drawer open={ocrSheetOpen} onOpenChange={(open) => !open && closeOcrSheet()}>
      <DrawerContent className="!h-[60vh] !max-h-[60vh] max-w-2xl mx-auto !border-0">
        <DrawerHeader className="pb-2">
          <DrawerTitle className="text-base font-medium">{t('plugin.japaneseLearning.sentenceAnalysis')}</DrawerTitle>
        </DrawerHeader>

        <div className="flex-1 min-h-0 relative overflow-hidden">
          <ScrollFadingOverlay scrollRef={scrollRef} />
          <div ref={scrollRef} className="absolute inset-0 overflow-auto px-4 pb-4">
          <AnimatePresence mode="wait">
            {ocrResult.loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center py-16"
              >
                <motion.div
                  className="rounded-full h-12 w-12 border-2 border-primary/30 border-t-primary"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                />
                <motion.p
                  className="mt-4 text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  {t('plugin.japaneseLearning.extractingText')}
                </motion.p>
              </motion.div>
            ) : ocrResult.error ? (
              <motion.div
                key="error"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-12"
              >
                <div className="text-destructive font-medium">{ocrResult.error}</div>
                <p className="text-muted-foreground text-sm mt-2">{t('plugin.japaneseLearning.tryAnotherRegion')}</p>
              </motion.div>
            ) : (
              <motion.div
                key="content"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              >
                <SentenceDisplay
                  tokens={grammarAnalysis.tokens}
                  showTokens={showTokens}
                  selectedIndex={selectedTokenIndex}
                  onSelectToken={setSelectedTokenIndex}
                />
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </div>

        <DrawerFooter className="pt-2">
          <div className="flex gap-2 justify-end w-full">
            {ocrResult.text && !ocrResult.loading && (
              <Button variant="ghost" size="sm" onClick={handleCopy} className="gap-1.5 text-muted-foreground">
                <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
                Copy
              </Button>
            )}
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// ============================================================================
// Global OCR UI - renders both popout and sheet via portal
// ============================================================================


const PLUGIN_ID = 'japanese-learning'

export function JapaneseLearningGlobalUI() {
  const ctx = usePluginCtx()
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)

  // Check if plugin should be enabled for this source
  const isEnabled = isJapaneseSource(ctx)

  // Lock/unlock reader interactions when sheet is open
  useEffect(() => {
    if (ocrSheetOpen) {
      ctx.lockInteraction(PLUGIN_ID)
    } else {
      ctx.unlockInteraction(PLUGIN_ID)
    }
  }, [ocrSheetOpen, ctx])

  // Don't render if not enabled for this source
  if (!isEnabled) return null

  return (
    <>
      <TextPopout />
      <OcrResultSheet />
    </>
  )
}
