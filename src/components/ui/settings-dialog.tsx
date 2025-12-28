/**
 * Shared settings dialog shell component
 * Used by both source settings and plugin settings for consistent UI
 */
import * as React from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog"
import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

interface SettingsPage {
  title: string
  content: React.ReactNode
}

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Icon element or image URL */
  icon?: React.ReactNode | string
  /** Main title */
  title: string
  /** Subtitle (e.g., registryId for sources, description for plugins) */
  subtitle?: string
  /** Optional description text */
  description?: string
  /** Version to show as badge in title */
  version?: string | number
  /** Content to render in the dialog body */
  children: React.ReactNode
  /** Optional action button in header (e.g., Reset button) */
  headerAction?: React.ReactNode
  /** Loading state - shows loading message instead of children */
  loading?: boolean
  /** Loading message */
  loadingMessage?: string
  /** Empty state - shows empty message instead of children */
  empty?: boolean
  /** Empty state message */
  emptyMessage?: string
  /** Max width class (default: max-w-2xl) */
  maxWidth?: string
}

export function SettingsDialog({
  open,
  onOpenChange,
  icon,
  title,
  subtitle,
  description,
  version,
  children,
  headerAction,
  loading,
  loadingMessage = "Loading settings...",
  empty,
  emptyMessage = "No settings available.",
  maxWidth = "max-w-2xl",
}: SettingsDialogProps) {
  const { t } = useTranslation()
  
  const iconElement = typeof icon === "string" ? (
    <img src={icon} alt="" className="size-10 rounded-md object-cover" />
  ) : icon ? (
    icon
  ) : null

  if (loading) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className={`flex flex-col ${maxWidth}`} showCloseButton={false}>
          <ResponsiveDialogHeader>
            <div className="flex items-start gap-3">
              {iconElement ?? <div className="size-10 rounded-md bg-muted" />}
              <div>
                <div className="flex items-center gap-1">
                  <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
                  {version !== undefined && (
                    <Badge variant="secondary">v{version}</Badge>
                  )}
                </div>
                {subtitle && (
                  <ResponsiveDialogDescription>{subtitle}</ResponsiveDialogDescription>
                )}
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">{loadingMessage}</p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    )
  }

  if (empty) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className={`flex flex-col ${maxWidth}`} showCloseButton={false}>
          <ResponsiveDialogHeader>
            <div className="flex items-start gap-3">
              {iconElement ?? <div className="size-10 rounded-md bg-muted" />}
              <div>
                <div className="flex items-center gap-1">
                  <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
                  {version !== undefined && (
                    <Badge variant="secondary">v{version}</Badge>
                  )}
                </div>
                {subtitle && (
                  <ResponsiveDialogDescription>{subtitle}</ResponsiveDialogDescription>
                )}
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    )
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className={`flex flex-col gap-0 ${maxWidth} max-h-[85vh] overflow-hidden p-0`} showCloseButton={false}>
        <ResponsiveDialogHeader className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0">
              {iconElement ?? <div className="size-10 rounded-md bg-muted shrink-0" />}
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <ResponsiveDialogTitle className="truncate">{title}</ResponsiveDialogTitle>
                  {version !== undefined && (
                    <Badge variant="secondary" className="shrink-0">v{version}</Badge>
                  )}
                </div>
                {(subtitle || description) && (
                  <ResponsiveDialogDescription className="truncate">
                    {subtitle || description}
                  </ResponsiveDialogDescription>
                )}
              </div>
            </div>
            {headerAction}
          </div>
        </ResponsiveDialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {children}
        </div>

        <ResponsiveDialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}

/**
 * Settings dialog with page stack navigation support
 * Used by source settings which has nested pages
 */
interface SettingsDialogWithPagesProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Icon element or image URL */
  icon?: React.ReactNode | string
  /** Main title */
  title: string
  /** Subtitle (e.g., registryId for sources) */
  subtitle?: string
  /** Version to show as badge in title */
  version?: string | number
  /** Page stack - array of { title, content } */
  pageStack: SettingsPage[]
  /** Push a new page onto the stack */
  onPushPage: (page: SettingsPage) => void
  /** Pop the current page from the stack */
  onPopPage: () => void
  /** Root content (shown when pageStack is empty) */
  children: React.ReactNode
  /** Optional action button in header (e.g., Reset button) - only shown on root page */
  headerAction?: React.ReactNode
  /** Loading state */
  loading?: boolean
  /** Loading message */
  loadingMessage?: string
  /** Empty state */
  empty?: boolean
  /** Empty message */
  emptyMessage?: string
  /** Max width class */
  maxWidth?: string
}

export function SettingsDialogWithPages({
  open,
  onOpenChange,
  icon,
  title,
  subtitle,
  version,
  pageStack,
  onPopPage,
  children,
  headerAction,
  loading,
  loadingMessage = "Loading settings...",
  empty,
  emptyMessage = "No settings available.",
  maxWidth = "max-w-2xl",
}: SettingsDialogWithPagesProps) {
  const { t } = useTranslation()
  
  const iconElement = typeof icon === "string" ? (
    <img src={icon} alt="" className="size-10 rounded-md object-cover" />
  ) : icon ? (
    icon
  ) : null

  const currentPage = pageStack[pageStack.length - 1]
  const isOnSubPage = pageStack.length > 0

  if (loading) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className={`flex flex-col ${maxWidth}`} showCloseButton={false}>
          <ResponsiveDialogHeader>
            <div className="flex items-start gap-3">
              {iconElement ?? <div className="size-10 rounded-md bg-muted" />}
              <div>
                <div className="flex items-center gap-1">
                  <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
                  {version !== undefined && (
                    <Badge variant="secondary">v{version}</Badge>
                  )}
                </div>
                {subtitle && (
                  <ResponsiveDialogDescription>{subtitle}</ResponsiveDialogDescription>
                )}
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">{loadingMessage}</p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    )
  }

  if (empty) {
    return (
      <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
        <ResponsiveDialogContent className={`flex flex-col ${maxWidth}`} showCloseButton={false}>
          <ResponsiveDialogHeader>
            <div className="flex items-start gap-3">
              {iconElement ?? <div className="size-10 rounded-md bg-muted" />}
              <div>
                <div className="flex items-center gap-1">
                  <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
                  {version !== undefined && (
                    <Badge variant="secondary">v{version}</Badge>
                  )}
                </div>
                {subtitle && (
                  <ResponsiveDialogDescription>{subtitle}</ResponsiveDialogDescription>
                )}
              </div>
            </div>
          </ResponsiveDialogHeader>
          <div className="flex flex-1 items-center justify-center py-8">
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    )
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className={`flex flex-col gap-0 ${maxWidth} max-h-[85vh] overflow-hidden p-0`} showCloseButton={false}>
        <ResponsiveDialogHeader className="px-4 py-3">
          {isOnSubPage ? (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon-sm" onClick={onPopPage}>
                <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
              </Button>
              <ResponsiveDialogTitle>{currentPage.title}</ResponsiveDialogTitle>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                {iconElement ?? <div className="size-10 rounded-md bg-muted shrink-0" />}
                <div className="min-w-0">
                  <div className="flex items-center gap-1">
                    <ResponsiveDialogTitle className="truncate">{title}</ResponsiveDialogTitle>
                    {version !== undefined && (
                      <Badge variant="secondary" className="shrink-0">v{version}</Badge>
                    )}
                  </div>
                  {subtitle && (
                    <ResponsiveDialogDescription className="truncate">{subtitle}</ResponsiveDialogDescription>
                  )}
                </div>
              </div>
              {headerAction}
            </div>
          )}
        </ResponsiveDialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
          {isOnSubPage ? currentPage.content : children}
        </div>

        <ResponsiveDialogFooter className="px-4 pb-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.done")}</Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  )
}
