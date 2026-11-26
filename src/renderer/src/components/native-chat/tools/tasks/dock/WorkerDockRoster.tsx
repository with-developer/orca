import { useTranslate } from '@/i18n/use-translate'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { defaultRangeExtractor } from '@tanstack/react-virtual'
import { useNativeChatToolRunWindow } from '../../runs/use-native-chat-tool-run-window'
import { workerDockClearable } from '../../../../../../../shared/orchestration/dock/worker-dock'
import { workerDockRowTitle, type WorkerDockRowView } from './WorkerDockRow'
import { WorkerDockRowSlots } from './WorkerDockRowSlots'
import { useLatestHandler } from '@/lib/use-latest-handler'
import { cn } from '@/lib/class-names'
import { workerDockChipLabel, workerDockSummary } from './worker-dock-summary'
import { workerDockEmptyCopy } from './worker-dock-labels'
import { compareWorkerDockCardRows, workerDockGlyph } from './worker-dock-card-order'
import {
  workerDockAnchorIndex,
  workerDockListKeyTarget,
  workerDockScrollAnchorAt,
  workerDockScrollFade,
  type WorkerDockScrollAnchor
} from './worker-dock-scroll-anchor'
import { WorkerDockHeadActions } from './WorkerDockHeadActions'
import { useWorkerDockCardFocus } from './use-worker-dock-card-focus'
import { useWorkerDockCardBudget, WORKER_DOCK_ROW } from './use-worker-dock-card-budget'
import { useWorkerDockDetailReads } from './use-worker-dock-detail-reads'
import {
  WORKER_DOCK_FLOAT_CLASS,
  WORKER_DOCK_SURFACE_CLASS,
  WorkerDockPill,
  useWorkerDockJumpLift,
  useWorkerDockOutsidePress
} from './WorkerDockPill'
import {
  useWorkerDockHover,
  useWorkerDockMorphWidth,
  useWorkerDockRowsMounted
} from './use-worker-dock-hover'
import './worker-dock-morph.css'

type Identity = {
  id: string
  state: WorkerDockRowView['state']
  changedAt?: number | null
  ownerActionsAvailable?: boolean
  settlement?: string | null
}

/** The chat's open workers as one floating pill over the end of the transcript; pressing it opens
 *  a card of every worker above it. Nothing is drawn behind either, so the chat stays readable. */
export function WorkerDockRoster(props: {
  identities: readonly Identity[]
  countIdentities?: readonly { id: string; state: WorkerDockRowView['state']; kind?: string }[]
  rows: ReadonlyMap<string, WorkerDockRowView>
  visible: boolean
  /** Some running work is not listed: with no rows the pill still shows, so Stop all stays reachable. */
  incomplete?: boolean
  /** The worker read failed, so the rows (if any) cannot be trusted to be the whole roster. */
  unavailable?: boolean
  stopAll?: { pending: boolean; onStop: () => void }
  expanded: boolean
  onExpandedChange: (value: boolean) => void
  pending: ReadonlySet<string>
  onOpen: (row: WorkerDockRowView, opener: HTMLElement) => void
  onAction: (row: WorkerDockRowView, action: 'stop' | 'clear') => void
  onClearAll: () => void
  loadWindow?: (anchor: string) => Promise<void>
}) {
  const t = useTranslate()
  const onOpen = useLatestHandler(props.onOpen)
  const onAction = useLatestHandler(props.onAction)
  const id = useId()
  const root = useRef<HTMLDivElement>(null)
  const viewport = useRef<HTMLDivElement>(null)
  const pill = useRef<HTMLButtonElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const anchor = useRef<WorkerDockScrollAnchor | null>(null)
  const sorted = useMemo(
    () =>
      [...props.identities].sort((a, b) =>
        compareWorkerDockCardRows(
          { ...a, retired: props.rows.get(a.id)?.retired },
          { ...b, retired: props.rows.get(b.id)?.retired }
        )
      ),
    [props.identities, props.rows]
  )
  const [held, setHeld] = useState<readonly Identity[] | null>(null)
  const current = useMemo(() => new Map(sorted.map((row) => [row.id, row])), [sorted])
  // A held order keeps rows from jumping under the pointer, but never keeps a row that left (a
  // cleared or finished worker goes at once) and never hides one that arrived (it joins the end).
  const items = useMemo(() => {
    if (!held) {
      return sorted
    }
    const kept = held.flatMap((row) => current.get(row.id) ?? [])
    const keptIds = new Set(kept.map((row) => row.id))
    return [...kept, ...sorted.filter((row) => !keptIds.has(row.id))]
  }, [held, sorted, current])
  if (
    held &&
    (held.length !== items.length || held.some((row, index) => row.id !== items[index].id))
  ) {
    setHeld(items)
  }
  const [focused, setFocused] = useState<string | null>(null)
  const clearing = props.identities.some(
    (row) => workerDockClearable(row) && props.pending.has(row.id)
  )
  const clearable = props.identities.filter(workerDockClearable).length
  const { mixed, total, count, label, failures, needsYou, running } = workerDockSummary(
    props.countIdentities ?? props.identities,
    props.rows,
    t
  )
  const smallRoster = items.length <= 30
  const rowsMounted = useWorkerDockRowsMounted(props.expanded)
  const activeIndex = useMemo(() => items.findIndex((row) => row.id === focused), [items, focused])
  const rowKeys = useMemo(() => items.map((item) => ({ key: item.id })), [items])
  const estimateSize = useCallback(() => WORKER_DOCK_ROW, [])
  const extractRange = useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indices = defaultRangeExtractor(range)
      return activeIndex >= 0 && !indices.includes(activeIndex)
        ? [...indices, activeIndex].sort((a, b) => a - b)
        : indices
    },
    [activeIndex]
  )
  const rowWindow = useNativeChatToolRunWindow({
    rows: rowKeys,
    getScrollElement: () => viewport.current,
    isVisible: props.visible,
    drawsEveryRow: smallRoster,
    estimateSize,
    rangeExtractor: extractRange,
    enabled: rowsMounted && !smallRoster
  })
  const small = rowWindow.drawsEveryRow
  const virtual = rowWindow.virtualizer
  const visibleItems = rowWindow.drawn
  const [fade, setFade] = useState<string | undefined>(undefined)
  const refade = useLatestHandler(() =>
    setFade(viewport.current ? workerDockScrollFade(viewport.current) : undefined)
  )
  const budget = useWorkerDockCardBudget({
    root,
    pill,
    card,
    open: props.expanded,
    rows: items.length
  })
  // Re-read after the list's size changes; scrolling re-reads it from onScroll.
  useLayoutEffect(() => refade(), [refade, props.expanded, items.length, budget])
  // With no rows, the pill says only what is known: the provider reports work it does not list,
  // or the worker read failed (which claims nothing about whether anything runs).
  const unlisted = items.length === 0 && Boolean(props.incomplete)
  const unread = items.length === 0 && !unlisted && Boolean(props.unavailable)
  const shown = items.length > 0 || unlisted || unread
  const close = useLatestHandler((refocus: boolean) => {
    setHeld(null)
    props.onExpandedChange(false)
    if (refocus) {
      pill.current?.focus()
    }
  })
  useWorkerDockOutsidePress(root, props.expanded, () => close(false))
  useWorkerDockJumpLift(card, props.expanded)
  useWorkerDockMorphWidth(card, props.expanded)
  const top = sorted[0]
  const topRow = top ? props.rows.get(top.id) : undefined
  // The pill names a worker the host has not sent yet; ask for the window around it.
  const loadWindow = useWorkerDockDetailReads(props.identities, props.loadWindow)
  const missingTop = top && !topRow ? top.id : null
  useEffect(() => {
    if (missingTop) {
      loadWindow(missingTop)
    }
  }, [missingTop, loadWindow])
  // Ask for the details of the first row in view that has none. Not the first drawn row: a focused
  // row stays drawn after End, and the card's order (needs-you first) is not the host's.
  const loadVisibleWindow = useLatestHandler(() => {
    const element = viewport.current
    if (!element || !props.expanded) {
      return
    }
    const top = element.scrollTop
    const bottom = top + element.clientHeight
    const missing = visibleItems.find(
      (item) =>
        item.end > top &&
        item.start < bottom &&
        items[item.index] &&
        !props.rows.has(items[item.index].id)
    )
    if (missing) {
      loadWindow(items[missing.index].id)
    }
  })
  const drawnKey = visibleItems.map((item) => item.index).join(',')
  useEffect(loadVisibleWindow, [drawnKey, props.rows, props.expanded, loadVisibleWindow])
  const preserveAnchor = useLatestHandler(() => {
    if (!anchor.current || !viewport.current) {
      return
    }
    const saved = anchor.current
    const target = workerDockAnchorIndex(saved, items)
    if (target < 0) {
      return
    }
    const offset = small
      ? viewport.current.querySelector<HTMLElement>(`[data-index="${target}"]`)?.offsetTop
      : virtual.getOffsetForIndex(target, 'start')?.[0]
    if (offset !== undefined) {
      viewport.current.scrollTop = offset + saved.offset
    }
  })
  const itemIds = useMemo(() => items.map((row) => row.id), [items])
  const identityOrder = itemIds.join('|')
  useLayoutEffect(preserveAnchor, [identityOrder, props.rows, preserveAnchor])
  const hold = () => setHeld((previous) => previous ?? sorted)
  const release = () => {
    if (!root.current?.contains(document.activeElement) && !root.current?.matches(':hover')) {
      setHeld(null)
    }
  }
  const { focusRow, rememberFocus, forgetFocus } = useWorkerDockCardFocus({
    items,
    rows: props.rows,
    loadRow: loadWindow,
    small,
    virtual,
    viewport,
    pill,
    hold
  })
  const hover = useWorkerDockHover({
    root,
    expanded: props.expanded,
    onOpen: () => {
      setHeld(null)
      hold()
      props.onExpandedChange(true)
    },
    onClose: () => close(false),
    onEnter: () => props.expanded && hold(),
    onLeave: release
  })
  if (!shown) {
    return null
  }
  const chipLabel = workerDockChipLabel(t, {
    summary: { total, failures, needsYou, running, label },
    rows: items.length,
    empty: top ? null : workerDockEmptyCopy(t, unlisted).title,
    // Open, the one row already shows the title.
    single: topRow && !props.expanded ? workerDockRowTitle(topRow) : null
  })
  return (
    <div
      ref={root}
      data-native-chat-background-tasks="true"
      data-worker-dock-float=""
      className={WORKER_DOCK_FLOAT_CLASS}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && props.expanded) {
          event.preventDefault()
          event.stopPropagation()
          close(true)
        }
      }}
    >
      {/* One box for the chip and the open panel, so the chip turns into the panel's header in
          place and keeps focus. */}
      <div
        ref={card}
        data-worker-dock-card={props.expanded ? '' : undefined}
        data-worker-dock-morph={props.expanded ? 'open' : 'closed'}
        className={cn(
          WORKER_DOCK_SURFACE_CLASS,
          'absolute bottom-0 left-1/2 flex max-w-full -translate-x-1/2 flex-col overflow-hidden [[data-native-chat-dock-fit~=dock]_&]:translate-x-0',
          props.expanded ? 'rounded-xl shadow-floating' : 'rounded-[14px] shadow-sm'
        )}
        onPointerEnter={hover.enter}
        onPointerLeave={hover.leave}
        onFocusCapture={(event) => {
          // Only the open panel holds its order; the folded chip has none to keep still.
          if (props.expanded) {
            hold()
          }
          const row =
            event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-worker-dock-row]')
              : null
          if (row) {
            const rowId = row.dataset.workerDockRow ?? null
            setFocused(rowId)
            if (rowId) {
              rememberFocus(rowId, row.closest('[data-native-chat-root]'))
            }
            row.scrollIntoView({ block: 'nearest' })
          }
        }}
        onBlurCapture={() =>
          queueMicrotask(() => {
            if (!root.current?.contains(document.activeElement)) {
              forgetFocus()
            }
            setFocused(
              document.activeElement?.closest<HTMLElement>('[data-worker-dock-row]')?.dataset
                .workerDockRow ?? null
            )
            release()
          })
        }
      >
        <div data-worker-dock-clip="">
          <div>
            {rowsMounted ? (
              <div className="flex flex-col px-1 pt-1">
                <div
                  ref={viewport}
                  id={id}
                  role="region"
                  aria-label={t('components.native-chat.workerDock.workersRegion', 'Workers')}
                  className="scrollbar-sleek min-h-0 overflow-y-auto overscroll-contain"
                  style={{ maxHeight: budget, maskImage: fade }}
                  // Rising rows overflow the list for a moment; read the fade again once they land.
                  onAnimationEnd={refade}
                  onScroll={(event) => {
                    anchor.current =
                      workerDockScrollAnchorAt(
                        event.currentTarget,
                        small ? null : virtual.getVirtualItems(),
                        items
                      ) ?? anchor.current
                    hold()
                    loadVisibleWindow()
                    refade()
                  }}
                  onKeyDown={(event) => {
                    const next = workerDockListKeyTarget(event, itemIds)
                    if (next !== null) {
                      event.preventDefault()
                      if (next === 'chip') {
                        pill.current?.focus()
                      } else {
                        focusRow(next)
                      }
                    }
                  }}
                >
                  <WorkerDockRowSlots
                    drawn={visibleItems}
                    ids={itemIds}
                    small={small}
                    totalSize={rowWindow.totalSize}
                    measureRow={rowWindow.measureRow}
                    rows={props.rows}
                    mixed={mixed}
                    visible={props.visible}
                    pending={props.pending}
                    onOpen={onOpen}
                    onAction={onAction}
                  />
                  {unlisted || unread ? (
                    <p className="flex h-[30px] items-center px-2 text-xs text-muted-foreground">
                      {workerDockEmptyCopy(t, unlisted).note}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <WorkerDockPill
          pill={pill}
          glyph={
            top ? workerDockGlyph({ ...top, retired: topRow?.retired }) : unlisted && 'running'
          }
          label={chipLabel}
          latest={topRow ? workerDockRowTitle(topRow) : count}
          total={total}
          expanded={props.expanded}
          listId={id}
          action={
            <WorkerDockHeadActions
              clearable={clearable}
              clearing={clearing}
              onClearAll={() => {
                props.onClearAll()
                pill.current?.focus()
              }}
              stopAll={props.stopAll}
            />
          }
          onToggle={() => {
            // A press on a chip the pointer opened pins it open instead of folding it.
            if (hover.pin()) {
              return
            }
            setHeld(null)
            // The panel opens under a pointer already inside its box, so no pointerenter follows.
            if (!props.expanded && root.current?.matches(':hover')) {
              hold()
            }
            props.onExpandedChange(!props.expanded)
          }}
          onKeyDown={(event) => {
            // The list sits above the chip, so up moves into its last row.
            if (props.expanded && items.length && event.key === 'ArrowUp') {
              event.preventDefault()
              focusRow(items.length - 1)
            }
          }}
        />
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {count || chipLabel}
      </span>
    </div>
  )
}
