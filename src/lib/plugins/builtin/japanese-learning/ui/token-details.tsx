import { Fragment, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Copy01Icon, MessageMultiple02Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { cn, copyToClipboard } from '@/lib/utils'
import { getPOSStyles } from '../pos-styles'
import { getPOSCategory, PartOfSpeechCategory } from '../grammar-analysis'
import { getPOSClass } from './token-display'
import type { GrammarToken } from '../ichiran-types'

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

function TokenSummary({ token, onAskNemu }: { token: GrammarToken; onAskNemu?: () => void }) {
  const { t } = useTranslation()
  const posClass = getPOSClass(token.partOfSpeech)
  const shouldShowPOSOnly =
    !token.components.length &&
    token.meanings.length === 0 &&
    token.alternatives.length === 0 &&
    token.conjugations.length === 0 &&
    token.partOfSpeech.length > 0 &&
    !token.isSuffix

  const handleCopyWord = useCallback(async () => {
    if (!token.word) return
    const success = await copyToClipboard(token.word)
    if (success) toast.success(t('plugin.japaneseLearning.copySuccess'))
  }, [t, token.word])

  // Only show action buttons for valid tokens (not punctuation or empty)
  const showActions = token.word && getPOSCategory(token.partOfSpeech) !== PartOfSpeechCategory.PUNCTUATION

  return (
    <div className={cn("space-y-2", posClass)}>
      {/* Word header with reading and POS color indicator */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-baseline gap-3 flex-wrap min-w-0">
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
        {showActions && (
          <div className="flex items-center gap-1 mt-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={handleCopyWord}
              className="text-muted-foreground"
              title={t('common.copy', { defaultValue: 'Copy' })}
              aria-label={t('common.copy', { defaultValue: 'Copy' })}
            >
              <HugeiconsIcon icon={Copy01Icon} className="size-3.5" />
            </Button>
            {onAskNemu && (
              <Button
                type="button"
                variant="default"
                size="xs"
                onClick={onAskNemu}
                className="gap-1"
              >
                <HugeiconsIcon icon={MessageMultiple02Icon} className="size-3.5" />
                {t('common.ask', { defaultValue: 'Ask' })}
              </Button>
            )}
          </div>
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

export function TokenDetails({
  token,
  isNested = false,
  onAskNemu,
}: {
  token: GrammarToken
  isNested?: boolean
  onAskNemu?: () => void
}) {
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
        <TokenSummary token={token} onAskNemu={!isNested ? onAskNemu : undefined} />

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

