"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { Drawer as DrawerPrimitive } from "vaul"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { HugeiconsIcon } from "@hugeicons/react"
import { Cancel01Icon } from "@hugeicons/core-free-icons"

type ScrollPos = { x: number; y: number }
type BodyLockSnapshot = {
  pos: ScrollPos
  body: {
    position: string
    top: string
    left: string
    right: string
    width: string
    overflow: string
    paddingRight: string
  }
  html: {
    overflow: string
  }
}

let bodyLockCount = 0
let bodyLockSnapshot: BodyLockSnapshot | null = null

function lockBodyScroll() {
  if (typeof window === "undefined") return
  bodyLockCount += 1
  if (bodyLockCount !== 1) return

  const pos: ScrollPos = { x: window.scrollX, y: window.scrollY }
  const body = document.body
  const html = document.documentElement

  bodyLockSnapshot = {
    pos,
    body: {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
      overflow: body.style.overflow,
      paddingRight: body.style.paddingRight,
    },
    html: {
      overflow: html.style.overflow,
    },
  }

  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
  body.style.position = "fixed"
  body.style.top = `${-pos.y}px`
  body.style.left = `${-pos.x}px`
  body.style.right = "0"
  body.style.width = "100%"
  body.style.overflow = "hidden"
  html.style.overflow = "hidden"
  if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`
}

function unlockBodyScroll() {
  if (typeof window === "undefined") return
  bodyLockCount = Math.max(0, bodyLockCount - 1)
  if (bodyLockCount !== 0) return

  const snap = bodyLockSnapshot
  bodyLockSnapshot = null
  if (!snap) return

  const body = document.body
  const html = document.documentElement
  body.style.position = snap.body.position
  body.style.top = snap.body.top
  body.style.left = snap.body.left
  body.style.right = snap.body.right
  body.style.width = snap.body.width
  body.style.overflow = snap.body.overflow
  body.style.paddingRight = snap.body.paddingRight
  html.style.overflow = snap.html.overflow
  window.scrollTo(snap.pos.x, snap.pos.y)
}

interface ResponsiveDialogContextValue {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  isMobile?: boolean
  dismissible?: boolean
}

const ResponsiveDialogContext = React.createContext<ResponsiveDialogContextValue>({})

interface ResponsiveDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  /** If false, prevents closing via backdrop click, escape key, and hides close button/handle */
  dismissible?: boolean
}

function ResponsiveDialog({ open, onOpenChange, children, dismissible = true }: ResponsiveDialogProps) {
  const isMobile = useIsMobile()

  const wasOpenRef = React.useRef(false)

  // Safety net for externally-controlled state changes.
  React.useEffect(() => {
    if (!isMobile) return

    if (open !== undefined && !!open !== wasOpenRef.current) {
      if (open) lockBodyScroll()
      else unlockBodyScroll()
      wasOpenRef.current = !!open
    }
    return () => {
      if (wasOpenRef.current) {
        unlockBodyScroll()
        wasOpenRef.current = false
      }
    }
  }, [isMobile, open])

  const handleDrawerOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (isMobile && nextOpen !== wasOpenRef.current) {
        if (nextOpen) lockBodyScroll()
        else unlockBodyScroll()
        wasOpenRef.current = nextOpen
      }
      onOpenChange?.(nextOpen)
    },
    [isMobile, onOpenChange]
  )
  
  if (isMobile) {
    return (
      <ResponsiveDialogContext.Provider value={{ open, onOpenChange, isMobile: true, dismissible }}>
        <DrawerPrimitive.Root 
          open={open} 
          onOpenChange={handleDrawerOpenChange}
          snapPoints={[1]}
          fadeFromIndex={0}
          dismissible={dismissible}
          // Prevent Vaul from doing its own scroll locking (can scrollTo(0,0) on iOS).
          disablePreventScroll
          // Prevent Vaul from mutating body styles; we handle locking ourselves.
          noBodyStyles
        >
          {children}
        </DrawerPrimitive.Root>
      </ResponsiveDialogContext.Provider>
    )
  }
  
  return (
    <ResponsiveDialogContext.Provider value={{ open, onOpenChange, isMobile: false, dismissible }}>
      <DialogPrimitive.Root 
        open={open} 
        onOpenChange={dismissible ? onOpenChange : undefined}
      >
        {children}
      </DialogPrimitive.Root>
    </ResponsiveDialogContext.Provider>
  )
}

interface ResponsiveDialogTriggerProps {
  children: React.ReactNode
  className?: string
  asChild?: boolean
}

function ResponsiveDialogTrigger({ children, className, asChild }: ResponsiveDialogTriggerProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  if (isMobile) {
    return (
      <DrawerPrimitive.Trigger asChild={asChild} className={className}>
        {children}
      </DrawerPrimitive.Trigger>
    )
  }
  
  return (
    <DialogPrimitive.Trigger className={className}>
      {children}
    </DialogPrimitive.Trigger>
  )
}

interface ResponsiveDialogCloseProps {
  children?: React.ReactNode
  className?: string
  asChild?: boolean
  render?: React.ReactElement
}

function ResponsiveDialogClose({ children, className, asChild, render }: ResponsiveDialogCloseProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  if (isMobile) {
    return (
      <DrawerPrimitive.Close asChild={asChild || !!render} className={className}>
        {render ? React.cloneElement(render, {}, children) : children}
      </DrawerPrimitive.Close>
    )
  }
  
  return (
    <DialogPrimitive.Close className={className} render={render}>
      {children}
    </DialogPrimitive.Close>
  )
}

interface ResponsiveDialogContentProps {
  className?: string
  children: React.ReactNode
  showCloseButton?: boolean
}

function ResponsiveDialogContent({
  className,
  children,
  showCloseButton = true,
}: ResponsiveDialogContentProps) {
  const { isMobile, dismissible } = React.useContext(ResponsiveDialogContext)

  // Hide close button if not dismissible
  const shouldShowCloseButton = showCloseButton && dismissible !== false

  if (isMobile) {
    return (
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="bg-black/10 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50" />
        <DrawerPrimitive.Content
          data-slot="responsive-dialog-content"
          className={cn(
            "bg-background flex flex-col gap-6 p-6 text-sm inset-x-0 bottom-0 rounded-t-xl border-t group/drawer-content fixed z-50 max-h-[96vh]",
            dismissible !== false ? "pt-0" : "pt-6",
            className
          )}
        >
          {dismissible !== false && (
            <div className="bg-muted mx-auto mt-4 h-1.5 w-[100px] shrink-0 rounded-full" />
          )}
          {children}
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    )
  }

  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Backdrop
        data-slot="responsive-dialog-overlay"
        className="data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 isolate z-50"
      />
      <DialogPrimitive.Popup
        data-slot="responsive-dialog-content"
        className={cn(
          "bg-background data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0 data-closed:zoom-out-95 data-open:zoom-in-95 ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-6 rounded-xl p-6 text-sm ring-1 duration-100 sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none",
          className
        )}
      >
        {children}
        {shouldShowCloseButton && (
          <DialogPrimitive.Close
            data-slot="responsive-dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-4 right-4"
                size="icon-sm"
              />
            }
          >
            <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPrimitive.Portal>
  )
}

function ResponsiveDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  return (
    <div
      data-slot="responsive-dialog-header"
      className={cn(
        "flex flex-col",
        isMobile ? "gap-0.5" : "gap-2",
        className
      )}
      {...props}
    />
  )
}

interface ResponsiveDialogFooterProps extends React.ComponentProps<"div"> {
  showCloseButton?: boolean
}

function ResponsiveDialogFooter({ 
  className, 
  showCloseButton = false,
  children,
  ...props 
}: ResponsiveDialogFooterProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  return (
    <div
      data-slot="responsive-dialog-footer"
      className={cn(
        "gap-2 mt-auto flex",
        isMobile ? "flex-col" : "flex-col-reverse sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <ResponsiveDialogClose render={<Button variant="outline" />}>
          Close
        </ResponsiveDialogClose>
      )}
    </div>
  )
}

interface ResponsiveDialogTitleProps {
  className?: string
  children: React.ReactNode
}

function ResponsiveDialogTitle({ className, children }: ResponsiveDialogTitleProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  if (isMobile) {
    return (
      <DrawerPrimitive.Title
        data-slot="responsive-dialog-title"
        className={cn("text-foreground font-medium", className)}
      >
        {children}
      </DrawerPrimitive.Title>
    )
  }
  
  return (
    <DialogPrimitive.Title
      data-slot="responsive-dialog-title"
      className={cn("leading-none font-medium", className)}
    >
      {children}
    </DialogPrimitive.Title>
  )
}

interface ResponsiveDialogDescriptionProps {
  className?: string
  children: React.ReactNode
}

function ResponsiveDialogDescription({ className, children }: ResponsiveDialogDescriptionProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  if (isMobile) {
    return (
      <DrawerPrimitive.Description
        data-slot="responsive-dialog-description"
        className={cn("text-muted-foreground text-sm", className)}
      >
        {children}
      </DrawerPrimitive.Description>
    )
  }
  
  return (
    <DialogPrimitive.Description
      data-slot="responsive-dialog-description"
      className={cn("text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3", className)}
    >
      {children}
    </DialogPrimitive.Description>
  )
}

// ============================================================================
// Nested Dialog Support (for stacked drawers on mobile)
// ============================================================================

interface ResponsiveDialogNestedProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
}

/**
 * Nested dialog for stacked UI (e.g., match picker inside edit dialog).
 * On mobile: Uses Vaul's NestedRoot for the stacked drawer effect.
 * On desktop: Uses regular dialog (appears on top).
 */
function ResponsiveDialogNested({ open, onOpenChange, children }: ResponsiveDialogNestedProps) {
  const { isMobile } = React.useContext(ResponsiveDialogContext)
  
  if (isMobile) {
    return (
      <ResponsiveDialogContext.Provider value={{ open, onOpenChange, isMobile: true, dismissible: true }}>
        <DrawerPrimitive.NestedRoot open={open} onOpenChange={onOpenChange}>
          {children}
        </DrawerPrimitive.NestedRoot>
      </ResponsiveDialogContext.Provider>
    )
  }
  
  return (
    <ResponsiveDialogContext.Provider value={{ open, onOpenChange, isMobile: false, dismissible: true }}>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        {children}
      </DialogPrimitive.Root>
    </ResponsiveDialogContext.Provider>
  )
}

export {
  ResponsiveDialog,
  ResponsiveDialogNested,
  ResponsiveDialogTrigger,
  ResponsiveDialogClose,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogFooter,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogContext,
}
