import { Link } from "@tanstack/react-router"
import { useTranslation } from "react-i18next"
import { motion } from "motion/react"
import { CoverImage } from "@/components/cover-image"
import { cn, formatRelativeTime } from "@/lib/utils"

// ============================================================================
// Base MangaCard - Vertical card with cover and title
// ============================================================================

interface MangaCardProps {
  to: string
  params: Record<string, string>
  cover?: string
  title: string
  subtitle?: string
  /** Badge text shown on top-right of cover (e.g., "Updated") */
  badge?: string
  className?: string
}

export function MangaCard({ to, params, cover, title, subtitle, badge, className }: MangaCardProps) {
  return (
    <Link
      to={to}
      params={params}
      className={cn("group block", className)}
    >
      <div className="space-y-2">
        <motion.div
          className="relative aspect-[2/3] overflow-hidden rounded-lg bg-muted manga-cover-glass"
          whileHover={{ y: -3, scale: 1.02 }}
          whileTap={{ y: -1, scale: 0.98 }}
          transition={{
            type: "spring",
            stiffness: 400,
            damping: 25,
          }}
        >
          <CoverImage
            src={cover}
            alt={title}
            className="size-full object-cover"
          />
          {/* Subtle gradient overlay for depth */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {/* Badge overlay */}
          {badge && (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-primary px-1.5 py-1 text-[11px] font-semibold leading-none text-primary-foreground shadow-md">
              {badge}
            </span>
          )}
        </motion.div>
        <div className="h-[3.75rem] px-0.5">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug tracking-tight">
            {title}
          </p>
          {subtitle && (
            <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
              {subtitle}
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ============================================================================
// MangaCardCompact - Smaller variant for dense scrollers
// ============================================================================

interface MangaCardCompactProps {
  to: string
  params: Record<string, string>
  cover?: string
  title: string
  subtitle?: string
  width?: number
  height?: number
  className?: string
}

export function MangaCardCompact({
  to,
  params,
  cover,
  title,
  subtitle,
  width = 120,
  height = 180,
  className,
}: MangaCardCompactProps) {
  return (
    <Link
      to={to}
      params={params}
      className={cn("group block shrink-0", className)}
      style={{ width }}
    >
      <motion.div
        className="overflow-hidden rounded-lg bg-muted manga-cover-glass"
        style={{ height }}
        whileHover={{ y: -2, scale: 1.02 }}
        whileTap={{ y: -1, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <CoverImage
          src={cover}
          alt={title}
          className="size-full object-cover"
        />
      </motion.div>
      <div className="mt-2 space-y-0.5 px-0.5">
        <p className="line-clamp-2 text-[13px] font-medium leading-tight tracking-tight">
          {title}
        </p>
        {subtitle && (
          <p className="line-clamp-1 text-[11px] text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
    </Link>
  )
}

// ============================================================================
// MangaCardFeatured - Large horizontal card with metadata
// ============================================================================

interface MangaCardFeaturedProps {
  to: string
  params: Record<string, string>
  cover?: string
  title: string
  authors?: string[]
  description?: string
  tags?: string[]
  className?: string
}

export function MangaCardFeatured({
  to,
  params,
  cover,
  title,
  authors,
  description,
  tags,
  className,
}: MangaCardFeaturedProps) {
  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "group flex w-full gap-4 rounded-xl p-3 text-left transition-colors",
        "hover:bg-accent/40 active:bg-accent/60",
        className
      )}
    >
      {/* Cover with lift animation */}
      <motion.div
        className="relative shrink-0 overflow-hidden rounded-lg bg-muted manga-cover-glass"
        style={{ width: 110, height: 165 }}
        whileHover={{ y: -2, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <CoverImage
          src={cover}
          alt={title}
          className="size-full object-cover"
        />
      </motion.div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col py-1">
        <h3 className="line-clamp-2 text-base font-semibold leading-snug tracking-tight">
          {title}
        </h3>

        {authors && authors.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {authors.slice(0, 2).join(", ")}
          </p>
        )}

        {description && (
          <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-muted-foreground/80">
            {description}
          </p>
        )}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

// ============================================================================
// MangaCardList - Horizontal list item with cover and info
// ============================================================================

interface MangaCardListProps {
  to: string
  params: Record<string, string>
  cover?: string
  title: string
  subtitle?: string
  tags?: string[]
  rank?: number
  className?: string
}

export function MangaCardList({
  to,
  params,
  cover,
  title,
  subtitle,
  tags,
  rank,
  className,
}: MangaCardListProps) {
  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg py-2 transition-colors",
        "hover:bg-accent/40 active:bg-accent/60",
        className
      )}
    >
      {/* Cover with subtle lift */}
      <motion.div
        className="relative shrink-0 overflow-hidden rounded-lg bg-muted manga-cover-glass"
        style={{ width: 64, height: 96 }}
        whileHover={{ y: -1, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <CoverImage
          src={cover}
          alt={title}
          className="size-full object-cover"
        />
      </motion.div>

      {/* Rank badge */}
      {rank !== undefined && (
        <div className="flex size-7 shrink-0 items-center justify-center">
          <span className="text-lg font-bold tabular-nums text-muted-foreground/70">
            {rank}
          </span>
        </div>
      )}

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
          {title}
        </h4>
        {subtitle && (
          <p className="line-clamp-1 text-xs text-muted-foreground">
            {subtitle}
          </p>
        )}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
              >
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  )
}

// ============================================================================
// MangaCardChapter - List item showing manga with chapter info
// ============================================================================

interface MangaCardChapterProps {
  to: string
  params: Record<string, string>
  cover?: string
  title: string
  chapterTitle?: string
  chapterNumber?: number
  dateUploaded?: number
  className?: string

}

export function MangaCardChapter({
  to,
  params,
  cover,
  title,
  chapterTitle,
  chapterNumber,
  dateUploaded,
  className,
}: MangaCardChapterProps) {
  const { t } = useTranslation()
  const chapterLabel =
    chapterTitle ||
    (chapterNumber !== undefined ? t("chapter.chapterX", { n: chapterNumber }) : t("chapter.untitled"))

  return (
    <Link
      to={to}
      params={params}
      className={cn(
        "group flex w-full items-start gap-3 rounded-lg py-2 transition-colors",
        "hover:bg-accent/40 active:bg-accent/60",
        className
      )}
    >
      {/* Cover with subtle lift */}
      <motion.div
        className="relative shrink-0 overflow-hidden rounded-lg bg-muted manga-cover-glass"
        style={{ width: 64, height: 96 }}
        whileHover={{ y: -1, scale: 1.02 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        <CoverImage
          src={cover}
          alt={title}
          className="size-full object-cover"
        />
      </motion.div>

      {/* Info */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
        <h4 className="line-clamp-2 text-sm font-medium leading-snug tracking-tight">
          {title}
        </h4>
        <p className="text-xs font-medium text-primary/80">
          {chapterLabel}
        </p>
        {dateUploaded && (
          <p className="text-[11px] text-muted-foreground/70">
            {formatRelativeTime(dateUploaded)}
          </p>
        )}
      </div>
    </Link>
  )
}

// ============================================================================
// MangaCardBanner - Wide image card for banners/promotions
// ============================================================================

interface MangaCardBannerProps {
  to?: string
  params?: Record<string, string>
  imageUrl?: string
  title: string
  width?: number
  height?: number
  onClick?: () => void
  className?: string
}

export function MangaCardBanner({
  to,
  params,
  imageUrl,
  title,
  width = 280,
  height = 160,
  onClick,
  className,
}: MangaCardBannerProps) {
  const content = (
    <motion.div
      className="relative overflow-hidden rounded-xl bg-muted manga-cover-glass"
      style={{ width, height }}
      whileHover={{ y: -2, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <CoverImage
        src={imageUrl}
        alt={title}
        className="size-full object-cover"
      />
      {/* Subtle vignette overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent" />
    </motion.div>
  )

  if (to && params) {
    return (
      <Link
        to={to}
        params={params}
        className={cn("block shrink-0", className)}
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("block shrink-0 text-left", className)}
    >
      {content}
    </button>
  )
}
