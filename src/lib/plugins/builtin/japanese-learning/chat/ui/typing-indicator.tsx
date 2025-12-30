/**
 * LINE-style typing indicator
 */

import { motion } from 'motion/react'
import { NemuAvatar } from './avatar'

export function TypingIndicator({ showAvatar = true }: { showAvatar?: boolean }) {
  return (
    <div className="flex items-start gap-2 px-3">
      <div className="w-10 flex-shrink-0">
        {showAvatar ? <NemuAvatar size="sm" /> : <div className="w-10" />}
      </div>
      <div className={`rounded-[20px] px-4 py-3 bg-white${showAvatar ? ' mt-1' : ''}`}>
        <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-[#999]"
              animate={{ y: [0, -5, 0] }}
              transition={{ 
                duration: 0.6, 
                repeat: Infinity, 
                delay: i * 0.15,
                ease: 'easeInOut'
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
