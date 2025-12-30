/**
 * Debug page: Drawer with scrollable content + input at bottom
 * Mimics the structure of NemuChatDrawer to reproduce iOS issues
 */
import { useState } from "react"
import { Drawer } from "vaul"

export function DebugDrawerScrollPage() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<string[]>([
    "Message 1 - Hello there!",
    "Message 2 - How are you?",
    "Message 3 - This is a test message",
    "Message 4 - Lorem ipsum dolor sit amet",
    "Message 5 - Consectetur adipiscing elit",
    "Message 6 - Sed do eiusmod tempor",
    "Message 7 - Incididunt ut labore",
    "Message 8 - Et dolore magna aliqua",
    "Message 9 - Ut enim ad minim veniam",
    "Message 10 - Quis nostrud exercitation",
    "Message 11 - Ullamco laboris nisi",
    "Message 12 - Ut aliquip ex ea commodo",
    "Message 13 - Duis aute irure dolor",
    "Message 14 - In reprehenderit in voluptate",
    "Message 15 - Velit esse cillum dolore",
  ])

  const handleSend = () => {
    if (input.trim()) {
      setMessages((prev) => [...prev, `You: ${input}`])
      setInput("")
    }
  }

  return (
    <div style={{ padding: 20, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, marginBottom: 16 }}>Debug: Drawer with Scroll + Input</h1>
      <p style={{ marginBottom: 16, color: "#666" }}>
        This page tests a drawer with scrollable content and an input at the bottom.
      </p>

      <button
        onClick={() => setOpen(true)}
        style={{
          padding: "12px 24px",
          fontSize: 16,
          background: "#007AFF",
          color: "white",
          border: "none",
          borderRadius: 8,
          cursor: "pointer",
        }}
      >
        Open Drawer
      </button>

      <Drawer.Root open={open} onOpenChange={setOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.4)",
              zIndex: 50,
            }}
          />
          <Drawer.Content
            style={{
              position: "fixed",
              bottom: 0,
              left: 0,
              right: 0,
              background: "#1a1a1a",
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              zIndex: 50,
              height: "70vh",
              maxHeight: "70vh",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {/* Handle */}
            <div
              style={{
                width: 48,
                height: 6,
                background: "#444",
                borderRadius: 3,
                margin: "12px auto",
                flexShrink: 0,
              }}
            />

            {/* Header */}
            <div
              style={{
                padding: "8px 16px",
                borderBottom: "1px solid #333",
                flexShrink: 0,
              }}
            >
              <h2 style={{ margin: 0, fontSize: 16, color: "#fff" }}>Chat Test</h2>
            </div>

            {/* Scrollable Messages Area */}
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: 16,
                minHeight: 0, // Important for flex child scrolling
              }}
            >
              {messages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px",
                    marginBottom: 8,
                    background: msg.startsWith("You:") ? "#0066cc" : "#333",
                    borderRadius: 12,
                    color: "#fff",
                    fontSize: 14,
                  }}
                >
                  {msg}
                </div>
              ))}
            </div>

            {/* Input Bar - Fixed at bottom */}
            <div
              style={{
                padding: 12,
                borderTop: "1px solid #333",
                background: "#1a1a1a",
                flexShrink: 0,
              }}
            >
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && input.trim()) {
                      handleSend()
                    }
                  }}
                  placeholder="Type a message..."
                  style={{
                    flex: 1,
                    padding: "12px 16px",
                    fontSize: 16, // 16px to prevent iOS zoom
                    background: "#333",
                    border: "1px solid #444",
                    borderRadius: 24,
                    color: "#fff",
                    outline: "none",
                  }}
                />
                <button
                  onClick={handleSend}
                  style={{
                    padding: "12px 20px",
                    fontSize: 16,
                    background: "#007AFF",
                    color: "white",
                    border: "none",
                    borderRadius: 24,
                    cursor: "pointer",
                  }}
                >
                  Send
                </button>
              </div>
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>

      {/* Some content to scroll on the main page */}
      <div style={{ marginTop: 40 }}>
        <h2>Background Content</h2>
        {Array.from({ length: 30 }).map((_, i) => (
          <p key={i} style={{ color: "#666", marginBottom: 8 }}>
            Background line {i + 1} - This is some content behind the drawer.
          </p>
        ))}
      </div>
    </div>
  )
}

