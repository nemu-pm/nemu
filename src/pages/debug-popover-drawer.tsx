/**
 * Debug page to reproduce: Popover open + Drawer open → Drawer immediately closes
 * Mimics the reader page structure with controlled popovers (like the plugin does)
 */

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerFooter } from "@/components/ui/drawer"
import { HugeiconsIcon } from "@hugeicons/react"
import { Settings02Icon, Message01Icon, TextIcon } from "@hugeicons/core-free-icons"
import { create } from 'zustand'

// Mimic the plugin's store pattern
interface TestStore {
  settingsPopoverOpen: boolean
  transcriptPopoverOpen: boolean
  drawerOpen: boolean
  toggleSettingsPopover: (open?: boolean) => void
  toggleTranscriptPopover: (open?: boolean) => void
  openDrawer: () => void
  closeDrawer: () => void
}

const useTestStore = create<TestStore>((set, get) => ({
  settingsPopoverOpen: false,
  transcriptPopoverOpen: false,
  drawerOpen: false,
  toggleSettingsPopover: (open) => set({ 
    settingsPopoverOpen: open ?? !get().settingsPopoverOpen 
  }),
  toggleTranscriptPopover: (open) => set({ 
    transcriptPopoverOpen: open ?? !get().transcriptPopoverOpen 
  }),
  openDrawer: () => set({ drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}))

export function DebugPopoverDrawerPage() {
  const {
    settingsPopoverOpen,
    transcriptPopoverOpen,
    drawerOpen,
    toggleSettingsPopover,
    toggleTranscriptPopover,
    openDrawer,
    closeDrawer,
  } = useTestStore()
  
  const [log, setLog] = useState<string[]>([])

  const addLog = useCallback((msg: string) => {
    const ts = new Date().toLocaleTimeString()
    setLog(prev => [`[${ts}] ${msg}`, ...prev.slice(0, 29)])
  }, [])

  useEffect(() => {
    addLog(`Settings Popover: ${settingsPopoverOpen ? 'OPEN' : 'CLOSED'}`)
  }, [settingsPopoverOpen, addLog])

  useEffect(() => {
    addLog(`Transcript Popover: ${transcriptPopoverOpen ? 'OPEN' : 'CLOSED'}`)
  }, [transcriptPopoverOpen, addLog])

  useEffect(() => {
    addLog(`Drawer: ${drawerOpen ? 'OPEN' : 'CLOSED'}`)
  }, [drawerOpen, addLog])

  // Mimic plugin's onClick handler - opens drawer directly
  const handleChatClick = useCallback(() => {
    addLog('Chat button clicked - opening drawer')
    openDrawer()
  }, [openDrawer, addLog])

  return (
    // Match reader page structure with data-vaul-drawer-wrapper
    <div className="relative min-h-dvh bg-background text-foreground" data-vaul-drawer-wrapper>
      {/* Simulated reader content */}
      <div className="h-[200vh] bg-gradient-to-b from-slate-900 to-slate-800 p-4">
        <h1 className="text-xl font-bold text-white mb-4">Debug: Popover + Drawer (iOS Safari)</h1>
        
        <p className="text-white/70 mb-4 text-sm">
          Steps to reproduce:<br />
          1. Tap settings (gear) or transcript (text) icon to open a popover<br />
          2. With popover open, tap the chat icon (message bubble)<br />
          3. BUG: Drawer immediately closes on iOS Safari
        </p>

        {/* Status panel */}
        <div className="p-3 bg-black/50 rounded-lg text-white text-sm">
          <div className="flex flex-wrap gap-3 mb-2">
            <span>Settings: <span className={settingsPopoverOpen ? "text-green-400" : "text-red-400"}>{settingsPopoverOpen ? "OPEN" : "CLOSED"}</span></span>
            <span>Transcript: <span className={transcriptPopoverOpen ? "text-green-400" : "text-red-400"}>{transcriptPopoverOpen ? "OPEN" : "CLOSED"}</span></span>
            <span>Drawer: <span className={drawerOpen ? "text-green-400" : "text-red-400"}>{drawerOpen ? "OPEN" : "CLOSED"}</span></span>
          </div>
          <div className="text-xs text-white/50 max-h-48 overflow-y-auto font-mono">
            {log.map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>

        {/* Fixed bottom bar like reader navbar */}
        <div className="fixed bottom-0 inset-x-0 p-4 bg-black/80 backdrop-blur-md z-50">
          <div className="flex items-center justify-center gap-2">
            {/* Transcript Popover - controlled like plugin */}
            <Popover 
              open={transcriptPopoverOpen} 
              onOpenChange={(open) => !open && toggleTranscriptPopover(false)}
            >
              <PopoverTrigger
                onClick={() => toggleTranscriptPopover()}
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className={`p-2 rounded-xl transition-all ${
                      transcriptPopoverOpen 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <HugeiconsIcon icon={TextIcon} className="size-6" />
                  </button>
                )}
              />
              <PopoverContent side="top" align="center" sideOffset={12} className="w-64">
                <div className="space-y-2">
                  <h3 className="font-medium">Transcript</h3>
                  <p className="text-sm text-muted-foreground">
                    This is the transcript popover. Now tap the chat icon.
                  </p>
                </div>
              </PopoverContent>
            </Popover>

            {/* Chat button - NOT a popover, just opens drawer */}
            <button
              type="button"
              onClick={handleChatClick}
              className="p-2 rounded-xl text-white/60 hover:text-white hover:bg-white/10 transition-all"
            >
              <HugeiconsIcon icon={Message01Icon} className="size-6" />
            </button>

            {/* Settings Popover - controlled like plugin */}
            <Popover 
              open={settingsPopoverOpen} 
              onOpenChange={(open) => !open && toggleSettingsPopover(false)}
            >
              <PopoverTrigger
                onClick={() => toggleSettingsPopover()}
                render={(props) => (
                  <button
                    {...props}
                    type="button"
                    className={`p-2 rounded-xl transition-all ${
                      settingsPopoverOpen 
                        ? 'bg-white/20 text-white' 
                        : 'text-white/60 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <HugeiconsIcon icon={Settings02Icon} className="size-6" />
                  </button>
                )}
              />
              <PopoverContent side="top" align="end" sideOffset={12} className="w-64">
                <div className="space-y-2">
                  <h3 className="font-medium">Settings</h3>
                  <p className="text-sm text-muted-foreground">
                    This is the settings popover. Now tap the chat icon.
                  </p>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      {/* Drawer - matches NemuChatDrawer structure */}
      <Drawer open={drawerOpen} onOpenChange={(open) => !open && closeDrawer()}>
        <DrawerContent className="!h-[70vh] !max-h-[70vh]">
          <DrawerHeader>
            <DrawerTitle>Chat Drawer</DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 p-4 overflow-y-auto">
            <p className="text-muted-foreground">
              If you can see this, the drawer stayed open! ✅
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Try scrolling this content and interacting with it.
            </p>
            {Array.from({ length: 20 }).map((_, i) => (
              <p key={i} className="text-muted-foreground/50 mt-2">
                Line {i + 1} of content...
              </p>
            ))}
          </div>
          <DrawerFooter>
            <Button onClick={closeDrawer}>Close Drawer</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

