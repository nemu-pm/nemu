import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Skeleton } from "@/components/ui/skeleton"
import { proxyUrl } from "@/config"

interface CoverImageProps {
  src?: string
  alt?: string
  className?: string
}

export function CoverImage({ src, alt = "Cover", className }: CoverImageProps) {
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

    fetch(proxyUrl(src))
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.blob()
      })
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
  }, [src])

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
        <span className="text-xs">No Image</span>
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

