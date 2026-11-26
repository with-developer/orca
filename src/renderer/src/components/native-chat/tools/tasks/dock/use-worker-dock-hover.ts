import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type RefObject
} from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'

const OPEN_DELAY = 120
const CLOSE_DELAY = 250
// Matches --worker-dock-morph-ms: rows stay drawn while the shape folds around them.
const FOLD_MS = 280
// A row's dialog or menu is portalled out of the card, so leaving the card to use it must not fold it.
const KEEPS_OPEN = '[role="dialog"],[role="alertdialog"],[role="menu"]'

/** The open list's rows stay mounted until the fold finishes, so they can fade out as it shrinks. */
export function useWorkerDockRowsMounted(expanded: boolean): boolean {
  const [folding, setFolding] = useState(false)
  const [previous, setPrevious] = useState(expanded)
  if (previous !== expanded) {
    setPrevious(expanded)
    setFolding(!expanded)
  }
  useEffect(() => {
    if (!folding) {
      return
    }
    const timer = setTimeout(() => setFolding(false), FOLD_MS)
    return () => clearTimeout(timer)
  }, [folding])
  return expanded || folding
}

/** A mouse resting on the chip opens it; leaving folds it again, unless a press pinned it open. */
export function useWorkerDockHover({
  root,
  expanded,
  onOpen,
  onClose,
  onEnter,
  onLeave
}: {
  root: RefObject<HTMLElement | null>
  expanded: boolean
  onOpen: () => void
  onClose: () => void
  /** Every pointer's entry and exit, touch included. */
  onEnter: () => void
  onLeave: () => void
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const byHover = useRef(false)
  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }
  const open = useLatestHandler(() => {
    timer.current = null
    byHover.current = true
    onOpen()
  })
  const close = useLatestHandler(() => {
    timer.current = null
    const element = root.current
    // A keyboard user inside the list, or a row's dialog, keeps it open.
    if (!element || element.querySelector(':focus-visible') || document.querySelector(KEEPS_OPEN)) {
      return
    }
    byHover.current = false
    onClose()
  })
  useEffect(() => {
    if (!expanded) {
      byHover.current = false
    }
  }, [expanded])
  useEffect(() => cancel, [])
  const pointer = (event: PointerEvent) =>
    event.pointerType === 'mouse' || event.pointerType === 'pen'
  return {
    enter(event: PointerEvent) {
      onEnter()
      if (!pointer(event)) {
        return
      }
      cancel()
      if (!expanded) {
        timer.current = setTimeout(open, OPEN_DELAY)
      }
    },
    leave(event: PointerEvent) {
      onLeave()
      if (!pointer(event)) {
        return
      }
      cancel()
      if (expanded && byHover.current) {
        timer.current = setTimeout(close, CLOSE_DELAY)
      }
    },
    /** A press on a chip the pointer opened pins it open; returns whether the press was used so. */
    pin(): boolean {
      cancel()
      if (expanded && byHover.current) {
        byHover.current = false
        return true
      }
      return false
    }
  }
}

/** Opening grows the chip from its last drawn width: `fit-content` would resolve against the rows
 *  that mount with the open list, leaving nothing to interpolate from. */
export function useWorkerDockMorphWidth(
  card: RefObject<HTMLElement | null>,
  expanded: boolean
): void {
  const width = useRef(0)
  useEffect(() => {
    const element = card.current
    if (!element || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => {
      width.current = element.offsetWidth
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [card])
  useLayoutEffect(() => {
    const element = card.current
    if (!expanded || !element || !width.current) {
      return
    }
    element.style.transition = 'none'
    element.style.width = `${width.current}px`
    // Commit the frozen width as the transition's start before releasing it to 100%.
    void element.offsetWidth
    element.style.transition = ''
    element.style.width = ''
  }, [card, expanded])
}
