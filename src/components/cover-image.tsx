import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useSourceImage, defaultFetch } from "@/hooks/use-source-image"

/** Remote covers start fetching once they come within this margin of the viewport. */
const COVER_PRELOAD_MARGIN_PX = 300

interface CoverImageProps {
  src?: string
  alt?: string
  className?: string
}

export function CoverImage({ src, alt = "Cover", className }: CoverImageProps) {
  const { t } = useTranslation();
  // Use source-aware fetcher from context, fall back to default
  const contextFetcher = useSourceImage();
  const fetchImage = contextFetcher ?? defaultFetch;

  const [imgSrc, setImgSrc] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [visible, setVisible] = useState(false)

  // The rendered root swaps between skeleton/error/img, so track it with a
  // callback ref the IntersectionObserver can observe.
  const nodeRef = useRef<HTMLElement | null>(null)
  const attachRef = useCallback((node: HTMLElement | null) => {
    nodeRef.current = node
  }, [])

  const isLocalUrl = !!src && (src.startsWith("blob:") || src.startsWith("data:"))

  // Defer remote fetches until the cover is near the viewport so large,
  // non-virtualized grids don't fire every request at once.
  useEffect(() => {
    if (!src || isLocalUrl) return
    setVisible(false)
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const node = nodeRef.current
    if (!node) {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: `${COVER_PRELOAD_MARGIN_PX}px` }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [src, isLocalUrl])

  useEffect(() => {
    if (!src) {
      setError(true)
      setLoading(false)
      return
    }

    // Blob URLs and data URLs are already local - use directly
    if (src.startsWith("blob:") || src.startsWith("data:")) {
      setImgSrc(src)
      setLoading(false)
      return
    }

    if (!visible) return

    let blobUrl: string | null = null
    let aborted = false

    fetchImage(src)
      .then((blob) => {
        if (aborted) return
        blobUrl = URL.createObjectURL(blob)
        setImgSrc(blobUrl)
        setError(false)
        setLoading(false)
      })
      .catch((e) => {
        if (aborted) return
        console.error("Failed to load cover:", e)
        setError(true)
        setLoading(false)
      })

    return () => {
      aborted = true
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [src, visible, contextFetcher])

  if (loading) {
    return <Skeleton ref={attachRef} className={cn("bg-muted", className)} />
  }

  if (error) {
    return (
      <div
        ref={attachRef}
        className={cn(
          "flex items-center justify-center bg-muted text-muted-foreground",
          className
        )}
      >
        <span className="text-xs">{t("common.noImage")}</span>
      </div>
    )
  }

  return (
    <img
      ref={attachRef}
      src={imgSrc}
      alt={alt}
      className={className}
      loading="lazy"
    />
  )
}
