import { Fragment } from 'react'
import { motion, type Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { getPOSCategory } from '../grammar-analysis'
import type { GrammarToken } from '../ichiran-types'

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

export { getPOSClass }

interface TokenDisplayProps {
  token: GrammarToken
  index: number
  isSelected: boolean
  isMultiSelected: boolean
  onPointerDown: () => void
  onPointerMove: (wordIndex: number) => void
  onPointerUp: () => void
  variants?: Variants
}

export function TokenDisplay({
  token,
  index,
  isSelected,
  isMultiSelected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  variants,
}: TokenDisplayProps) {
  const displayWord = token.word.replace(/\n/g, '')
  const displayReading = token.reading.replace(/\n/g, '')
  const hasNewline = token.word !== displayWord
  const posClass = getPOSClass(token.partOfSpeech)
  const posLabel = getPOSLabel(token.partOfSpeech)
  const showFurigana = displayReading && displayReading !== displayWord
  const isHighlighted = isSelected || isMultiSelected

  // Tokens - textbook styling with komi-style token selection (single + range)
  // Vertical stack: furigana → word → POS label
  return (
    <Fragment>
      <motion.span
        variants={variants}
        className={cn(
          "ja-textbook inline-flex flex-col items-center cursor-pointer",
          "mx-[1px] transition-all duration-150",
          "group/token align-bottom select-none",
          posClass
        )}
        style={{
          willChange: 'transform, opacity',
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
        }}
        data-word-index={index}
      >
        {/* Furigana row - fixed height for alignment */}
        <span className="h-[0.9rem] flex items-end justify-center select-none">
          {showFurigana && (
            <span
              className={cn(
                "text-[0.6rem] sm:text-[0.65rem] tracking-wide whitespace-nowrap",
                "text-muted-foreground font-sans font-normal leading-none",
                "transition-opacity duration-150",
                isHighlighted ? "opacity-100" : "opacity-70 group-hover/token:opacity-90"
              )}
            >
              {displayReading}
            </span>
          )}
        </span>

        {/* Main word - token selection (single + multi range) */}
        <span
          className={cn(
            "relative inline-block rounded-[3px]",
            "text-[1.4rem] sm:text-[1.6rem] px-1 py-0.5",
            "transition-all duration-150",
            "textbook-token"
          )}
          data-selected={isSelected}
          data-multi-selected={isMultiSelected}
          // Use pointer events so we can capture the drag gesture and prevent the Drawer (Vaul)
          // from reacting to it on desktop (mouse) and mobile (touch).
          style={{ touchAction: 'none' }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
            onPointerDown()
          }}
          onPointerMove={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const element = document.elementFromPoint(e.clientX, e.clientY)
            const wordElement = element?.closest('[data-word-index]') as HTMLElement | null
            if (wordElement) {
              const wordIndex = parseInt(wordElement.dataset.wordIndex ?? '0', 10)
              onPointerMove(wordIndex)
            }
          }}
          onPointerUp={(e) => {
            e.preventDefault()
            e.stopPropagation()
            try {
              ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
            } catch {
              // ignore
            }
            onPointerUp()
          }}
          onPointerCancel={(e) => {
            e.preventDefault()
            e.stopPropagation()
            try {
              ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
            } catch {
              // ignore
            }
            onPointerUp()
          }}
        >
          {displayWord}
        </span>

        {/* POS label row - fixed height for alignment */}
        <span className="h-[1rem] flex items-start justify-center mt-0.5 select-none">
          {posLabel && (
            <span
              className={cn(
                "text-[0.5rem] sm:text-[0.55rem] font-medium leading-none",
                "transition-opacity duration-150",
                isHighlighted
                  ? "opacity-100"
                  : "opacity-40 group-hover/token:opacity-70"
              )}
              style={{ color: 'var(--pos-text)' }}
            >
              {posLabel}
            </span>
          )}
        </span>
      </motion.span>
      {hasNewline && <br />}
    </Fragment>
  )
}

