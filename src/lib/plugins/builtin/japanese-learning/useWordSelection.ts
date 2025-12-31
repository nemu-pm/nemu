import { useState, useCallback, useEffect } from 'react'
import { hapticSelection } from '@/lib/haptics'

export interface UseWordSelectionReturn {
  selectedTokenIndex: number | null
  setSelectedTokenIndex: (index: number | null) => void
  selectionStart: number | null
  selectionEnd: number | null
  isDragging: boolean
  dragStartIndex: number | null
  handlePointerDown: (index: number) => void
  handlePointerMove: (index: number) => void
  handlePointerUp: (index: number) => void
  clearSelection: () => void
  hasSelection: () => boolean
  getSelectionType: () => 'single' | 'multi' | 'none'
}

export function useWordSelection(): UseWordSelectionReturn {
  const [selectedTokenIndex, setSelectedTokenIndex] = useState<number | null>(null)
  const [selectionStart, setSelectionStart] = useState<number | null>(null)
  const [selectionEnd, setSelectionEnd] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null)

  const handlePointerDown = useCallback((index: number) => {
    setDragStartIndex(index)
    setIsDragging(false)
  }, [])

  const handlePointerMove = useCallback((index: number) => {
    if (dragStartIndex !== null && dragStartIndex !== index) {
      setIsDragging(true)
      setSelectionStart(Math.min(dragStartIndex, index))
      setSelectionEnd(Math.max(dragStartIndex, index))
      setSelectedTokenIndex(null)
    }
  }, [dragStartIndex])

  const handlePointerUp = useCallback((index: number) => {
    if (isDragging) {
      // Multi selection already set - haptic feedback for multi-select complete
      hapticSelection()
    } else if (dragStartIndex === index) {
      if (selectionStart !== null || selectionEnd !== null) {
        setSelectionStart(null)
        setSelectionEnd(null)
        setSelectedTokenIndex(index)
        hapticSelection()
      } else if (selectedTokenIndex === index) {
        setSelectedTokenIndex(null)
      } else {
        setSelectedTokenIndex(index)
        hapticSelection()
      }
    }

    setDragStartIndex(null)
    setIsDragging(false)
  }, [dragStartIndex, isDragging, selectionEnd, selectionStart, selectedTokenIndex])

  const clearSelection = useCallback(() => {
    setSelectionStart(null)
    setSelectionEnd(null)
    setSelectedTokenIndex(null)
    setIsDragging(false)
    setDragStartIndex(null)
  }, [])

  const hasSelection = useCallback(() => {
    return selectedTokenIndex !== null ||
      (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd)
  }, [selectedTokenIndex, selectionEnd, selectionStart])

  const getSelectionType = useCallback((): 'single' | 'multi' | 'none' => {
    if (selectedTokenIndex !== null) return 'single'
    if (selectionStart !== null && selectionEnd !== null && selectionStart !== selectionEnd) return 'multi'
    return 'none'
  }, [selectedTokenIndex, selectionEnd, selectionStart])

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      setDragStartIndex(null)
      setIsDragging(false)
    }

    document.addEventListener('mouseup', handleGlobalMouseUp)
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp)
    }
  }, [])

  return {
    selectedTokenIndex,
    setSelectedTokenIndex,
    selectionStart,
    selectionEnd,
    isDragging,
    dragStartIndex,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearSelection,
    hasSelection,
    getSelectionType,
  }
}

/** Helper: check if index falls within selection range */
export function isWordInSelection(index: number, start: number | null, end: number | null): boolean {
  if (start === null || end === null) return false
  const rangeStart = Math.min(start, end)
  const rangeEnd = Math.max(start, end)
  return index >= rangeStart && index <= rangeEnd
}

