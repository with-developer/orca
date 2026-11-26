import { useTranslate } from '@/i18n/use-translate'
import {
  useEffect,
  useLayoutEffect,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { cn } from '@/lib/class-names'
import { WorkerDockGlyph } from './WorkerDockGlyph'
import type { WorkerDockGlyph as Glyph } from './worker-dock-card-order'

// Where Jump to latest rests while the open panel rises over the transcript: 8px above it.
const JUMP_LIFT = '--native-chat-worker-jump-lift'

// The chip's own row at the dock's top, so it never covers transcript text; the open panel rises
// from it over the transcript.
export const WORKER_DOCK_FLOAT_CLASS =
  'pointer-events-none relative z-20 flex h-[30px] shrink-0 flex-col [&:not(:last-child)]:mb-2 [[data-native-chat-dock-fit~=dock]_&]:h-auto'
// Raised over the transcript, opaque even when the chat's message-box surface is translucent.
export const WORKER_DOCK_SURFACE_CLASS =
  'pointer-events-auto border border-border bg-chat-canvas bg-[linear-gradient(var(--color-chat-composer-surface),var(--color-chat-composer-surface))] text-foreground [[data-native-chat-dock-fit~=dock]_&]:static'

/** The chip's one dot: the worst state among the workers. Red needs you, a spinner while work
 *  runs, yellow waiting, green done; false (nothing could be read) is a grey ring. */
function WorkerDockChipDot({ glyph }: { glyph: Glyph | false }) {
  if (glyph === 'running') {
    return <WorkerDockGlyph glyph="running" />
  }
  return (
    <span aria-hidden="true" className="inline-flex size-3 shrink-0 items-center justify-center">
      <span
        className={cn(
          'block size-2 rounded-full',
          (glyph === 'ask' || glyph === 'failed') && 'bg-destructive',
          glyph === 'queued' && 'bg-status-warning',
          glyph === 'done' && 'bg-status-success',
          glyph === false && 'border-[1.5px] border-muted-foreground'
        )}
      />
    </span>
  )
}

/** The worker chip ("3 running"); while the list is open above it, the same chip is its footer. */
export function WorkerDockPill({
  pill,
  glyph,
  label,
  latest,
  total,
  expanded,
  listId,
  action,
  onToggle,
  onKeyDown
}: {
  pill: RefObject<HTMLButtonElement | null>
  glyph: Glyph | false
  /** The chip's text: the one worker's title, how many run or need you, or what is known. */
  label: string
  /** The most relevant worker's title, for assistive technology. */
  latest: string
  total: number
  expanded: boolean
  listId: string
  /** Drawn at the end of the open chip, beside the toggle. */
  action?: ReactNode
  onToggle: () => void
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const t = useTranslate()
  return (
    <div
      className={cn(
        'flex h-7 shrink-0 items-center rounded-b-[inherit] border-t transition-colors duration-[280ms]',
        expanded ? 'border-border pr-1' : 'border-transparent'
      )}
    >
      <button
        ref={pill}
        type="button"
        data-worker-dock-pill=""
        aria-expanded={expanded}
        aria-controls={expanded ? listId : undefined}
        aria-label={
          total <= 1
            ? undefined
            : t('components.native-chat.workerDock.chipLabel', '{{label}}, latest: {{title}}', {
                label,
                title: latest
              })
        }
        className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-[inherit] px-2.5 text-xs whitespace-nowrap hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        onClick={onToggle}
        onKeyDown={onKeyDown}
      >
        <WorkerDockChipDot glyph={glyph} />
        <span data-worker-dock-pill-title="" className="min-w-0 truncate">
          {label}
        </span>
      </button>
      {expanded ? action : null}
    </div>
  )
}

// A dialog, menu or toast a row opened is portalled out of the card but still belongs to it.
const KEEPS_CARD_OPEN =
  '[role="dialog"],[role="alertdialog"],[data-radix-popper-content-wrapper],[data-sonner-toaster]'

/** While the card is open, a press anywhere outside the pill and the card folds it, as Escape does. */
export function useWorkerDockOutsidePress(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  onOutside: () => void
): void {
  const fold = useLatestHandler(onOutside)
  useEffect(() => {
    if (!open) {
      return
    }
    const press = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || root.current?.contains(target)) {
        return
      }
      // Folding under a row's dialog would unmount the row it returns focus to. This pane's Jump to
      // latest shares the card's slot: folding on its press would move it before the click lands.
      // Another pane's Jump is just outside.
      const pane = root.current?.closest('[data-native-chat-root]')
      const ownJump = Boolean(
        pane?.contains(target) && target.closest('[data-native-chat-jump-latest]')
      )
      if (!ownJump && !target.closest(KEEPS_CARD_OPEN)) {
        fold()
      }
    }
    document.addEventListener('pointerdown', press, true)
    return () => document.removeEventListener('pointerdown', press, true)
  }, [root, open, fold])
}

/** While the panel is open, Jump to latest rests 8px above it instead of hiding behind it. */
export function useWorkerDockJumpLift(card: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const element = card.current
    const pane = element?.closest<HTMLElement>('[data-native-chat-root]')
    const dock = element?.closest<HTMLElement>('[data-native-chat-dock]')
    if (!open || !element || !pane || !dock || typeof ResizeObserver === 'undefined') {
      return
    }
    // The transcript, where Jump rests, ends at the dock's top; the panel rises past it.
    const lift = () =>
      pane.style.setProperty(
        JUMP_LIFT,
        `${dock.getBoundingClientRect().top - element.getBoundingClientRect().top + 8}px`
      )
    const observer = new ResizeObserver(lift)
    observer.observe(element)
    lift()
    return () => {
      observer.disconnect()
      pane.style.removeProperty(JUMP_LIFT)
    }
  }, [card, open])
}
