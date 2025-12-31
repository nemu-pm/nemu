/**
 * LINE-style message bubble with per-message read receipts
 * Tail SVG extracted from actual LINE bubble screenshot (bubble.png)
 * The tail points diagonally UP-RIGHT from the top-right corner of the bubble
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { ChatMessage } from '../types'
import { NemuAvatar } from './avatar'
import { ExpandableText } from '@/components/ui/expandable-text'
import { AudioWaveform } from '@/components/tts/audio-waveform'

function formatTime(timestamp: number, locale: string): string {
  const localeMap: Record<string, string> = { en: 'en-US', ja: 'ja-JP', zh: 'zh-CN' }
  return new Date(timestamp).toLocaleTimeString(localeMap[locale] || locale, { 
    hour: 'numeric', 
    minute: '2-digit',
    hour12: true 
  })
}

/**
 * LINE-style bubble tail with overlap for seamless connection
 * Includes 15px (scaled) of bubble body that overlaps with the actual bubble
 * Position: top: 0, right: -5px (only 5px extends beyond bubble edge)
 */
const TAIL_PATH = "M 0 7 L 0 7 L 1 7 L 2 8 L 3 8 L 4 9 L 5 9 L 6 10 L 7 10 L 8 11 L 9 11 L 10 12 L 11 12 L 12 13 L 13 14 L 14 14 L 15 15 L 16 16 L 17 16 L 18 17 L 19 18 L 20 18 L 21 19 L 22 20 L 23 20 L 24 21 L 25 21 L 26 21 L 27 21 L 28 21 L 29 21 L 30 21 L 31 21 L 32 21 L 33 20 L 34 20 L 35 20 L 36 20 L 37 20 L 38 20 L 39 19 L 40 19 L 41 19 L 42 19 L 43 19 L 44 18 L 45 18 L 46 18 L 47 18 L 48 17 L 49 17 L 50 16 L 51 16 L 52 16 L 53 16 L 54 15 L 55 14 L 56 14 L 57 14 L 58 13 L 59 13 L 60 12 L 61 12 L 62 11 L 63 11 L 64 10 L 65 9 L 66 9 L 67 8 L 68 7 L 69 7 L 70 7 L 71 7 L 72 7 L 72 8 L 72 9 L 71 10 L 71 11 L 71 12 L 71 13 L 70 14 L 70 15 L 70 16 L 70 17 L 69 18 L 69 19 L 68 20 L 68 21 L 68 22 L 67 23 L 67 24 L 66 25 L 66 26 L 66 27 L 65 28 L 65 29 L 64 30 L 64 31 L 63 32 L 63 33 L 62 34 L 61 35 L 61 36 L 60 37 L 60 38 L 59 39 L 58 40 L 58 41 L 57 42 L 56 43 L 55 44 L 54 45 L 54 46 L 53 47 L 52 48 L 51 49 L 50 50 L 50 51 L 49 52 L 49 53 L 50 54 L 71 10 L 70 14 L 69 18 L 68 20 L 67 23 L 66 25 L 65 28 L 64 30 L 63 32 L 62 34 L 61 35 L 60 37 L 59 39 L 58 40 L 57 42 L 56 43 L 55 44 L 54 45 L 53 47 L 52 48 L 51 49 L 50 50 L 49 55 L 48 55 L 47 55 L 46 55 L 45 55 L 44 55 L 43 55 L 42 55 L 41 55 L 40 55 L 39 55 L 38 55 L 37 55 L 36 55 L 35 55 L 34 55 L 33 55 L 32 55 L 31 55 L 30 55 L 29 55 L 28 55 L 27 55 L 26 55 L 25 55 L 24 55 L 23 55 L 22 55 L 21 55 L 20 55 L 19 55 L 18 55 L 17 55 L 16 55 L 15 55 L 14 55 L 13 55 L 12 55 L 11 55 L 10 55 L 9 55 L 8 55 L 7 55 L 6 55 L 5 55 L 4 55 L 3 55 L 2 55 L 1 55 L 0 55 L 0 54 L 0 53 L 0 52 L 0 51 L 0 50 L 0 49 L 0 48 L 0 47 L 0 46 L 0 45 L 0 44 L 0 43 L 0 42 L 0 41 L 0 40 L 0 39 L 0 38 L 0 37 L 0 36 L 0 35 L 0 34 L 0 33 L 0 32 L 0 31 L 0 30 L 0 29 L 0 28 L 0 27 L 0 26 L 0 25 L 0 24 L 0 23 L 0 22 L 0 21 L 0 20 L 0 19 L 0 18 L 0 17 L 0 16 L 0 15 L 0 14 L 0 13 L 0 12 L 0 11 L 0 10 L 0 9 L 0 8 L 0 7 Z"

function TailRight({ className, color = '#5ac463' }: { className?: string; color?: string }) {
  return (
    <svg className={className} width="20" height="14" viewBox="0 0 80 55" aria-hidden="true">
      <path d={TAIL_PATH} fill={color}/>
    </svg>
  )
}

// For assistant (left) bubbles - mirrored horizontally
function TailLeft({ className, color = 'white' }: { className?: string; color?: string }) {
  return (
    <svg className={className} width="20" height="14" viewBox="0 0 80 55" style={{ transform: 'scaleX(-1)' }} aria-hidden="true">
      <path d={TAIL_PATH} fill={color}/>
    </svg>
  )
}

function VoiceBubbleContent({
  message,
  onVoiceAction,
}: {
  message: ChatMessage
  onVoiceAction?: (messageId: string, action: 'play' | 'pause' | 'stop') => void
}) {
  const ttsId = message.id
  const ttsText = message.ttsText ?? message.content

  return (
    <div className="space-y-2">
      <AudioWaveform
        ttsId={ttsId}
        text={ttsText}
        source="voice"
        skipTagging
        className="w-full border-transparent bg-transparent px-0"
        waveformClassName="max-w-[360px]"
        onUserAction={(action) => onVoiceAction?.(ttsId, action)}
      />
      <ExpandableText
        value={message.displayContent ?? message.content}
        lines={2}
        textClassName="text-xs text-black/80"
        triggerClassName="text-[11px] text-black/60"
      />
    </div>
  )
}

export function MessageBubble({
  message,
  showAvatar,
  showTimestamp,
  showTail,
  onVoiceAction,
}: {
  message: ChatMessage
  showAvatar: boolean
  showTimestamp: boolean
  showTail: boolean
  onVoiceAction?: (messageId: string, action: 'play' | 'pause' | 'stop') => void
}) {
  const { t, i18n } = useTranslation()
  const isUser = message.role === 'user'
  const text = message.displayContent || message.content
  const isVoice = message.kind === 'voice'

  if (isUser) {
    const bubbleColor = message.errorMessage ? '#ef4444' : '#5ac463'
    const rowClass = cn(
      'flex justify-end items-end gap-1.5 px-3',
      showTail
    )
    const bubbleClass = cn(
      'max-w-[70%] rounded-[18px] px-3.5 py-2',
      'text-[15px] leading-[1.4] relative',
      message.errorMessage ? 'bg-red-500 text-white' : 'bg-[#5ac463] text-black'
    )
    return (
      <div className={rowClass}>
        {/* Read receipt + Time */}
        {showTimestamp && (
          <div className="flex flex-col items-end text-[11px] text-muted-foreground pb-0.5 leading-tight">
            {message.isRead && <span>{t('plugin.japaneseLearning.chat.read', 'Read')}</span>}
            <span>{formatTime(message.timestamp, i18n.language)}</span>
          </div>
        )}
        {/* User bubble - LINE green */}
        <div className={bubbleClass}>
          {showTail && (
            <TailRight 
              className="absolute top-0 right-[-5px]" 
              color={bubbleColor}
            />
          )}
          <p className="whitespace-pre-wrap break-words select-text">{text}</p>
          {message.errorMessage && (
            <p className="text-xs text-white/80 mt-1">⚠️ {message.errorMessage}</p>
          )}
        </div>
      </div>
    )
  }

  const bubbleColor = message.errorMessage
    ? '#fef2f2'
    : isVoice
      ? 'rgba(0, 0, 0, 0.05)'
      : 'white'
  const rowClass = cn(
    'flex items-start gap-2 px-3',
    showTail
  )
  const assistantBubbleClass = cn(
    'max-w-[70%] rounded-[18px] px-3.5 py-2',
    'text-[15px] leading-[1.4] relative',
    message.errorMessage
      ? 'bg-red-50 border border-red-200'
      : isVoice
        ? 'bg-black/5 text-black border border-black/10 backdrop-blur-md overflow-hidden'
        : 'bg-white text-[#111]',
    showTail && 'mt-1'
  )
  return (
    <div className={rowClass}>
      {/* Avatar */}
      <div className="w-10 flex-shrink-0">
        {showAvatar ? <NemuAvatar size="sm" /> : <div className="w-10" />}
      </div>
      {/* Assistant bubble - white */}
      <div className={assistantBubbleClass}>
        {showTail && (
          <TailLeft 
            className="absolute top-0 left-[-5px]" 
            color={bubbleColor}
          />
        )}
        {message.kind === 'voice' ? (
          <VoiceBubbleContent message={message} onVoiceAction={onVoiceAction} />
        ) : (
          <p className="whitespace-pre-wrap break-words select-text">{text}</p>
        )}
        {message.errorMessage && (
          <p className="text-xs text-red-500 mt-1">⚠️ {message.errorMessage}</p>
        )}
      </div>
      {/* Time */}
      {showTimestamp && (
        <span className="text-[11px] text-muted-foreground self-end pb-0.5">
          {formatTime(message.timestamp, i18n.language)}
        </span>
      )}
    </div>
  )
}

/** LINE-style date pill */
export function DatePill({ text = 'Today' }: { text?: string }) {
  return (
    <div className="flex justify-center py-2">
      <span className="px-3 py-1 text-xs text-muted-foreground bg-white/10 rounded-full">
        {text}
      </span>
    </div>
  )
}
