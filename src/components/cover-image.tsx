import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { useSourceImage, defaultFetch } from "@/hooks/use-source-image"

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

  useEffect(() => {
    if (!src) {
      setError(true)
      setLoading(false)
      return
    }

    let blobUrl: string | null = null
    let aborted = false

    fetchImage(src)
      .then((blob) => {
        if (aborted) return
        blobUrl = URL.createObjectURL(blob)
        setImgSrc(blobUrl)
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
  }, [src, contextFetcher])

  if (loading) {
    return <Skeleton className={cn("bg-muted", className)} />
  }

  if (error) {
    return (
      <div
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
      src={imgSrc}
      alt={alt}
      className={className}
      loading="lazy"
    />
  )
}

