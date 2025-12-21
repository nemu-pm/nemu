import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ReaderPopupCardProps {
  children: ReactNode
  className?: string
}

/**
 * Consistent styling for popups/cards in the reader UI
 * Uses the same glassmorphism effect as the settings popup
 */
export const ReaderPopupCard = forwardRef<HTMLDivElement, ReaderPopupCardProps>(
  ({ children, className }, ref) => {
    return (
      <div
        ref={ref}
        className={cn('reader-settings-popup p-4', className)}
      >
        {children}
      </div>
    )
  }
)

ReaderPopupCard.displayName = 'ReaderPopupCard'

