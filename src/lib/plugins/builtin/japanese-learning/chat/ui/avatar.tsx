import { cn } from '@/lib/utils'
import nemuIconUrl from '/icon.jpg'

export function NemuAvatar({ size = 'md' }: { size?: 'sm' | 'md' }) {
  return (
    <img
      src={nemuIconUrl}
      alt="Nemu"
      className={cn(
        size === 'sm' ? 'size-10' : 'size-12',
        'rounded-full object-cover flex-shrink-0'
      )}
    />
  )
}
