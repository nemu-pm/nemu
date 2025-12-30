/**
 * LINE-style streaming message bubble
 */

import { motion } from 'motion/react'
import { NemuAvatar } from './avatar'

export function StreamingMessage({ content }: { content: string }) {
  return (
    <div className="flex items-start gap-2 px-3">
      <div className="w-10 flex-shrink-0">
        <NemuAvatar size="sm" />
      </div>
      <div className="max-w-[70%] rounded-[20px] px-3.5 py-2.5 bg-white text-[#111] text-[15px] leading-[1.45]">
        <p className="whitespace-pre-wrap break-words">
          {content}
          <motion.span
            className="inline-block w-0.5 h-4 bg-[#111]/60 ml-0.5 align-text-bottom"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          />
        </p>
      </div>
    </div>
  )
}
