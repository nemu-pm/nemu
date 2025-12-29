import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { buttonVariants } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import {
  usePluginNavbarActions,
  usePluginPageOverlays,
  usePluginReaderOverlays,
  usePluginSettingsSections,
  usePluginDialog,
  usePluginCtx,
} from './context'
import type { ReaderPluginContext, NavbarAction } from './types'

// ============================================================================
// Plugin Navbar Actions
// ============================================================================

export function PluginNavbarActions() {
  const actions = usePluginNavbarActions()
  const ctx = usePluginCtx()

  // Filter out hidden actions
  const visibleActions = actions.filter((action) => action.isVisible?.(ctx) ?? true)

  if (visibleActions.length === 0) return null

  return (
    <>
      {visibleActions.map((action) => (
        <NavbarActionButton key={action.id} action={action} ctx={ctx} />
      ))}
    </>
  )
}

function NavbarActionButton({ action, ctx }: { action: NavbarAction; ctx: ReaderPluginContext }) {
  const hasPopover = !!action.popoverContent && !!action.usePopoverOpen
  const hasLoadingHook = !!action.useIsLoading
  
  // Route to correct component based on which hooks are needed
  if (hasPopover && hasLoadingHook) {
    return <NavbarActionWithPopoverAndLoading action={action} ctx={ctx} />
  }
  if (hasPopover) {
    return <NavbarActionWithPopover action={action} ctx={ctx} />
  }
  if (hasLoadingHook) {
    return <NavbarActionWithLoading action={action} ctx={ctx} />
  }
  return <NavbarActionSimple action={action} ctx={ctx} />
}

function NavbarActionSimple({ action, ctx }: { action: NavbarAction; ctx: ReaderPluginContext }) {
  const isActive = action.isActive?.(ctx) ?? false
  const isDisabled = action.isDisabled?.(ctx) ?? false

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => action.onClick(ctx)}
      title={action.label}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
        'reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0',
        isActive && 'reader-ui-bg-hover reader-ui-text-primary'
      )}
    >
      {action.icon}
    </button>
  )
}

function NavbarActionWithLoading({ action, ctx }: { action: NavbarAction; ctx: ReaderPluginContext }) {
  const isActive = action.isActive?.(ctx) ?? false
  const isDisabled = action.isDisabled?.(ctx) ?? false
  const isLoading = action.useIsLoading!()

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => action.onClick(ctx)}
      title={action.label}
      className={cn(
        buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
        'reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0',
        isActive && 'reader-ui-bg-hover reader-ui-text-primary'
      )}
    >
      {isLoading ? <Spinner className="size-4" /> : action.icon}
    </button>
  )
}

function NavbarActionWithPopover({ action, ctx }: { action: NavbarAction; ctx: ReaderPluginContext }) {
  const isActive = action.isActive?.(ctx) ?? false
  const isDisabled = action.isDisabled?.(ctx) ?? false
  const popoverOpen = action.usePopoverOpen!()

  return (
    <Popover open={popoverOpen} onOpenChange={(open) => !open && action.onPopoverClose?.()}>
      <PopoverTrigger
        disabled={isDisabled}
        onClick={() => action.onClick(ctx)}
        render={(props) => (
          <button
            {...props}
            type="button"
            title={action.label}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              'reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0',
              (isActive || popoverOpen) && 'reader-ui-bg-hover reader-ui-text-primary'
            )}
          >
            {action.icon}
          </button>
        )}
      />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-auto p-3 reader-settings-popup"
      >
        {action.popoverContent!()}
      </PopoverContent>
    </Popover>
  )
}

function NavbarActionWithPopoverAndLoading({ action, ctx }: { action: NavbarAction; ctx: ReaderPluginContext }) {
  const isActive = action.isActive?.(ctx) ?? false
  const isDisabled = action.isDisabled?.(ctx) ?? false
  const popoverOpen = action.usePopoverOpen!()
  const isLoading = action.useIsLoading!()

  return (
    <Popover open={popoverOpen} onOpenChange={(open) => !open && action.onPopoverClose?.()}>
      <PopoverTrigger
        disabled={isDisabled}
        onClick={() => action.onClick(ctx)}
        render={(props) => (
          <button
            {...props}
            type="button"
            title={action.label}
            className={cn(
              buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
              'reader-ui-text-secondary hover:reader-ui-text-primary hover:reader-ui-bg-hover rounded-xl transition-all duration-200 shrink-0',
              (isActive || popoverOpen) && 'reader-ui-bg-hover reader-ui-text-primary'
            )}
          >
            {isLoading ? <Spinner className="size-4" /> : action.icon}
          </button>
        )}
      />
      <PopoverContent
        side="top"
        align="end"
        sideOffset={12}
        className="w-auto p-3 reader-settings-popup"
      >
        {action.popoverContent!()}
      </PopoverContent>
    </Popover>
  )
}

// ============================================================================
// Plugin Page Overlay Wrapper
// ============================================================================

interface PluginPageOverlayProps {
  pageIndex: number
  children: ReactNode
}

export function PluginPageOverlayWrapper({ pageIndex, children }: PluginPageOverlayProps) {
  const overlays = usePluginPageOverlays()
  const ctx = usePluginCtx()

  return (
    <div className="relative w-full h-full">
      {children}
      {overlays.map((overlay) => (
        <div
          key={overlay.id}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: overlay.zIndex ?? 10 }}
        >
          {overlay.render(pageIndex, ctx)}
        </div>
      ))}
    </div>
  )
}

// ============================================================================
// Plugin Reader Overlays (mounted once per reader session)
// ============================================================================

export function PluginReaderOverlays() {
  const overlays = usePluginReaderOverlays()
  const ctx = usePluginCtx()

  if (overlays.length === 0) return null

  return (
    <>
      {overlays.map((overlay) => (
        <div
          key={overlay.id}
          className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"
          style={{ zIndex: overlay.zIndex ?? 10 }}
        >
          {overlay.render(ctx)}
        </div>
      ))}
    </>
  )
}

// ============================================================================
// Plugin Settings Sections
// ============================================================================

export function PluginSettingsSections() {
  const sections = usePluginSettingsSections()
  const ctx = usePluginCtx()

  if (sections.length === 0) return null

  return (
    <>
      {sections.map((section) => (
        <div key={section.id} className="mt-3 border-t reader-ui-border pt-3">
          <div className="text-xs reader-ui-text-primary mb-2">{section.title}</div>
          {section.render(ctx)}
        </div>
      ))}
    </>
  )
}

// ============================================================================
// Plugin Dialog
// ============================================================================

export function PluginDialog() {
  const { state, hide } = usePluginDialog()

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && hide()}>
      <DialogContent className={state?.options?.className}>
        {state?.options?.title && (
          <DialogHeader>
            <DialogTitle>{state.options.title}</DialogTitle>
          </DialogHeader>
        )}
        {state?.content}
      </DialogContent>
    </Dialog>
  )
}

// ============================================================================
// Helper: Wrap renderImage to include overlays
// ============================================================================

export function createOverlayRenderImage(
  originalRenderImage: (index: number) => ReactNode,
  ctx: ReaderPluginContext,
  overlays: ReturnType<typeof usePluginPageOverlays>
) {
  return (index: number) => {
    const content = originalRenderImage(index)
    if (overlays.length === 0) return content

    return (
      <div className="relative w-full h-full">
        {content}
        {overlays.map((overlay) => (
          <div
            key={overlay.id}
            className="absolute inset-0 pointer-events-none [&>*]:pointer-events-auto"
            style={{ zIndex: overlay.zIndex ?? 10 }}
          >
            {overlay.render(index, ctx)}
          </div>
        ))}
      </div>
    )
  }
}

