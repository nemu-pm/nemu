import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import { useTextDetectorStore } from '../store'
import { motion, AnimatePresence } from 'motion/react'

export function TextPopout() {
  const { t } = useTranslation()
  const boxPopout = useTextDetectorStore((s) => s.boxPopout)
  const ocrSheetOpen = useTextDetectorStore((s) => s.ocrSheetOpen)
  const [dims, setDims] = useState({ width: 200, height: 100 })

  useEffect(() => {
    if (boxPopout?.croppedDimensions) {
      const { width, height } = boxPopout.croppedDimensions
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
  }, [boxPopout?.croppedDimensions])

  const showPopout = ocrSheetOpen && !!boxPopout
  const clickPosition = boxPopout?.clickPosition ?? { x: 0, y: 0 }
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
            // Respect iOS notch / safe area at the top. Keep the popout comfortably below it.
            // Uses `env(safe-area-inset-top)` which is 0 on non-iOS / non-notched displays.
            top: `calc(max(15vh, env(safe-area-inset-top) + 16px) - ${displayHeight / 2}px)`,
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
            {boxPopout?.croppedImageUrl ? (
              <motion.img
                src={boxPopout.croppedImageUrl}
                alt={t('plugin.japaneseLearning.selectedText', { defaultValue: 'Selected text' })}
                className="w-full h-full object-cover"
                style={{ imageRendering: 'crisp-edges' }}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.2 }}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <Spinner className="size-5" />
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )

  if (typeof document === 'undefined') return null
  return createPortal(content, document.body)
}

