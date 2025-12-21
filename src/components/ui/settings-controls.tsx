/**
 * Reusable settings controls for settings dialogs
 * Used by source settings and plugin settings
 */
import * as React from "react"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { HugeiconsIcon } from "@hugeicons/react"
import { Add01Icon, Remove01Icon, Delete02Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

/**
 * Group container for settings with title and optional footer
 */
interface SettingsGroupProps {
  title: string
  footer?: string
  children: React.ReactNode
  className?: string
}

export function SettingsGroup({ title, footer, children, className }: SettingsGroupProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <h3 className="text-xs font-medium uppercase text-muted-foreground tracking-wide">
        {title}
      </h3>
      <div className="rounded-lg border divide-y">
        {children}
      </div>
      {footer && (
        <p className="text-xs text-muted-foreground px-1">{footer}</p>
      )}
    </div>
  )
}

/**
 * Page link that navigates to a nested settings page
 */
interface SettingsPageLinkProps {
  title: string
  onClick: () => void
}

export function SettingsPageLink({ title, onClick }: SettingsPageLinkProps) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
    >
      <span className="text-sm">{title}</span>
      <span className="text-muted-foreground">›</span>
    </button>
  )
}

/**
 * Select dropdown control
 */
interface SettingsSelectProps {
  label: string
  subtitle?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}

export function SettingsSelect({ label, subtitle, value, options, onChange }: SettingsSelectProps) {
  if (options.length === 0) return null

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="space-y-0.5">
        <Label className="text-sm font-normal">{label}</Label>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-auto min-w-[100px]" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

/**
 * Segmented control (horizontal button group)
 */
interface SettingsSegmentProps {
  label: string
  value: number
  options: string[]
  onChange: (index: number) => void
}

export function SettingsSegment({ label, value, options, onChange }: SettingsSegmentProps) {
  if (options.length === 0) return null

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <Label className="text-sm font-normal">{label}</Label>
      <div className="flex rounded-md border overflow-hidden">
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onChange(i)}
            className={cn(
              "px-3 py-1 text-sm transition-colors",
              value === i
                ? "bg-primary text-primary-foreground"
                : "bg-transparent hover:bg-muted",
              i > 0 && "border-l"
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * Multi-select with checkboxes
 */
interface SettingsMultiSelectProps {
  label: string
  value: string[]
  options: { value: string; label: string }[]
  onChange: (values: string[]) => void
}

export function SettingsMultiSelect({ label, value, options, onChange }: SettingsMultiSelectProps) {
  const selectedSet = useMemo(() => new Set(value), [value])

  const toggle = (val: string) => {
    const newSet = new Set(selectedSet)
    if (newSet.has(val)) {
      newSet.delete(val)
    } else {
      newSet.add(val)
    }
    onChange(Array.from(newSet))
  }

  if (options.length === 0) return null

  return (
    <div className="px-3 py-2.5 space-y-2">
      <Label className="text-sm font-normal">{label}</Label>
      <div className="space-y-1">
        {options.map((opt) => (
          <label
            key={opt.value}
            className="flex items-center gap-2 py-1 cursor-pointer"
          >
            <Checkbox
              checked={selectedSet.has(opt.value)}
              onCheckedChange={() => toggle(opt.value)}
            />
            <span className="text-sm">{opt.label}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * Switch toggle control
 */
interface SettingsSwitchProps {
  label: string
  subtitle?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export function SettingsSwitch({ label, subtitle, checked, onCheckedChange }: SettingsSwitchProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="space-y-0.5">
        <Label className="text-sm font-normal">{label}</Label>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

/**
 * Stepper control for numeric values
 */
interface SettingsStepperProps {
  label: string
  subtitle?: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (value: number) => void
}

export function SettingsStepper({ label, subtitle, value, min, max, step = 1, onChange }: SettingsStepperProps) {
  const decrement = () => {
    onChange(Math.max(min, value - step))
  }

  const increment = () => {
    onChange(Math.min(max, value + step))
  }

  return (
    <div className="flex items-center justify-between px-3 py-2.5">
      <div className="space-y-0.5">
        <Label className="text-sm font-normal">{label}</Label>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={decrement}
          disabled={value <= min}
        >
          <HugeiconsIcon icon={Remove01Icon} className="size-3" />
        </Button>
        <span className="w-12 text-center text-sm tabular-nums">{value}</span>
        <Button
          variant="outline"
          size="icon-sm"
          onClick={increment}
          disabled={value >= max}
        >
          <HugeiconsIcon icon={Add01Icon} className="size-3" />
        </Button>
      </div>
    </div>
  )
}

/**
 * Text input control
 */
interface SettingsTextProps {
  label: string
  subtitle?: string
  value: string
  placeholder?: string
  secure?: boolean
  onChange: (value: string) => void
}

export function SettingsText({ label, subtitle, value, placeholder, secure, onChange }: SettingsTextProps) {
  return (
    <div className="px-3 py-2.5 space-y-1.5">
      <div className="space-y-0.5">
        <Label className="text-sm font-normal">{label}</Label>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <Input
        type={secure ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
      />
    </div>
  )
}

/**
 * Editable list control - add/remove string items
 */
interface SettingsEditableListProps {
  label: string
  value: string[]
  placeholder?: string
  onChange: (values: string[]) => void
}

export function SettingsEditableList({ label, value, placeholder, onChange }: SettingsEditableListProps) {
  const [newItem, setNewItem] = useState("")

  const addItem = () => {
    if (!newItem.trim()) return
    onChange([...value, newItem.trim()])
    setNewItem("")
  }

  const removeItem = (index: number) => {
    const newList = [...value]
    newList.splice(index, 1)
    onChange(newList)
  }

  return (
    <div className="px-3 py-2.5 space-y-2">
      <Label className="text-sm font-normal">{label}</Label>

      <div className="flex gap-2">
        <Input
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={placeholder ?? "Add item..."}
          onKeyDown={(e) => e.key === "Enter" && addItem()}
          className="h-8 flex-1"
        />
        <Button variant="outline" size="sm" onClick={addItem}>
          <HugeiconsIcon icon={Add01Icon} className="size-3" />
        </Button>
      </div>

      {value.length > 0 && (
        <div className="space-y-1">
          {value.map((item, index) => (
            <div
              key={index}
              className="flex items-center justify-between rounded border px-2 py-1"
            >
              <span className="text-sm truncate">{item}</span>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => removeItem(index)}
                className="shrink-0 size-6"
              >
                <HugeiconsIcon icon={Delete02Icon} className="size-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Simple row item for custom content
 */
interface SettingsRowProps {
  children: React.ReactNode
  className?: string
}

export function SettingsRow({ children, className }: SettingsRowProps) {
  return (
    <div className={cn("px-3 py-2.5", className)}>
      {children}
    </div>
  )
}

/**
 * Slider control for numeric values
 */
interface SettingsSliderProps {
  label: string
  subtitle?: string
  value: number
  min: number
  max: number
  step?: number
  /** Format function for displaying value (default: just the number) */
  formatValue?: (value: number) => string
  onChange: (value: number) => void
}

// Import Slider lazily to avoid circular deps
import { Slider } from "@/components/ui/slider"

export function SettingsSlider({
  label,
  subtitle,
  value,
  min,
  max,
  step = 1,
  formatValue = (v) => String(v),
  onChange,
}: SettingsSliderProps) {
  return (
    <div className="px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <div className="space-y-0.5">
          <Label className="text-sm font-normal">{label}</Label>
          {subtitle && (
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          )}
        </div>
        <span className="text-sm text-muted-foreground">{formatValue(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => {
          const raw = Array.isArray(v) ? v[0] : v
          if (typeof raw === "number") {
            onChange(raw)
          }
        }}
      />
    </div>
  )
}

