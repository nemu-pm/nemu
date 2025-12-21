import { Component, type ErrorInfo, type ReactNode } from "react"
import i18n from "@/lib/i18n"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ error, errorInfo })
    console.error("ErrorBoundary caught:", error, errorInfo)
  }

  handleCopy = () => {
    const { error, errorInfo } = this.state
    const text = this.formatError(error, errorInfo)
    navigator.clipboard.writeText(text)
  }

  handleRefresh = () => {
    window.location.reload()
  }

  formatError(error: Error | null, errorInfo: ErrorInfo | null): string {
    const lines: string[] = []
    lines.push(`Timestamp: ${new Date().toISOString()}`)
    lines.push(`URL: ${window.location.href}`)
    lines.push(`User Agent: ${navigator.userAgent}`)
    lines.push("")
    if (error) {
      lines.push(`Error: ${error.name}`)
      lines.push(`Message: ${error.message}`)
      if (error.stack) {
        lines.push("")
        lines.push("Stack Trace:")
        lines.push(error.stack)
      }
    }
    if (errorInfo?.componentStack) {
      lines.push("")
      lines.push("Component Stack:")
      lines.push(errorInfo.componentStack)
    }
    return lines.join("\n")
  }

  render() {
    if (this.state.hasError) {
      const { error, errorInfo } = this.state
      const t = (key: string) => i18n.t(key)

      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-3xl w-full space-y-6">
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-destructive">
                {t("error.title")}
              </h1>
              <p className="text-muted-foreground">
                {t("error.description")}
              </p>
            </div>

            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
              <div className="font-mono text-sm">
                <span className="text-destructive font-medium">
                  {error?.name}:
                </span>{" "}
                {error?.message}
              </div>
            </div>

            <details className="group">
              <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
                {t("error.showDetails")}
              </summary>
              <pre className="mt-3 p-4 rounded-lg bg-muted/50 border text-xs font-mono overflow-auto max-h-80 whitespace-pre-wrap break-words">
                {this.formatError(error, errorInfo)}
              </pre>
            </details>

            <div className="flex gap-3">
              <button
                onClick={this.handleCopy}
                className="px-4 py-2 text-sm font-medium rounded-md border bg-background hover:bg-muted transition-colors"
              >
                {t("error.copyLog")}
              </button>
              <button
                onClick={this.handleRefresh}
                className="px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                {t("error.refreshPage")}
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

