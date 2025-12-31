"use client"

import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "@/lib/utils"
import { hapticSelection } from "@/lib/haptics"

function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  step,
  onValueChange,
  onValueCommitted,
  ...props
}: SliderPrimitive.Root.Props) {
  const _values = React.useMemo(
    () =>
      Array.isArray(value)
        ? value
        : Array.isArray(defaultValue)
          ? defaultValue
          : [min, max],
    [value, defaultValue, min, max]
  )

  // Track previous value to only trigger haptic on actual step changes
  const prevValueRef = React.useRef<readonly number[] | null>(null)

  const handleValueChange = React.useCallback(
    (newValue: number | readonly number[], eventDetails: Parameters<NonNullable<SliderPrimitive.Root.Props['onValueChange']>>[1]) => {
      // Normalize to array for comparison
      const valArray = Array.isArray(newValue) ? newValue : [newValue]
      const prev = prevValueRef.current
      // Trigger haptic if value actually changed (not just noise)
      if (!prev || valArray.some((v, i) => v !== prev[i])) {
        hapticSelection()
        prevValueRef.current = valArray
      }
      onValueChange?.(newValue, eventDetails)
    },
    [onValueChange]
  )

  return (
    <SliderPrimitive.Root
      className="data-horizontal:w-full data-vertical:h-full"
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      step={step}
      thumbAlignment="edge"
      onValueChange={handleValueChange}
      onValueCommitted={onValueCommitted}
      {...props}
    >
      <SliderPrimitive.Control
        className={cn(
          "data-vertical:min-h-40 relative flex w-full touch-none items-center select-none data-disabled:opacity-50 data-vertical:h-full data-vertical:w-auto data-vertical:flex-col",
          className
        )}
      >
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="bg-muted rounded-full data-horizontal:h-1.5 data-horizontal:w-full data-vertical:h-full data-vertical:w-1.5 relative overflow-hidden select-none"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="bg-primary select-none data-horizontal:h-full data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="border-primary ring-ring/50 size-4 rounded-full border bg-white shadow-sm transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden block shrink-0 select-none disabled:pointer-events-none disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )
}

export { Slider }
