import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { GitCommitHorizontal, GitMerge, GitPullRequestArrow, Sparkles } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'
import { cn } from '@/lib/class-names'
import type { GitConflictOperation } from '../../../../../../shared/git/status/git-status-types'
import { ReasonButton } from './reason-button'

export type OperationBarOperation = Exclude<GitConflictOperation, 'unknown'>

export type OperationBarStep = {
  label: string
  ariaLabel?: string
  reason: string | null
  unavailable: boolean
  busy: boolean
  onPress: () => void
}

export type OperationBarProps = {
  operation: OperationBarOperation
  /** Identifies what Abort would abort (workspace, host, operation, step); a change disarms it. */
  abortTargetKey: string
  unresolvedCount: number
  /** A short state after the verb, e.g. "Empty step". */
  detailLabel?: string | null
  abort: { unavailable: boolean; busy: boolean; reason?: string | null; onAbort: () => void }
  step: OperationBarStep
  /** Null when AI actions are off; the action only shows while conflicts remain. */
  resolveWithAi: { unavailable: boolean; onPress: () => void } | null
}

function useOperationCopy(operation: OperationBarOperation) {
  const t = useTranslate()
  if (operation === 'rebase') {
    return {
      verb: t('auto.components.sidebar.WorktreeCardHelpers.conflictRebasing', 'Rebasing'),
      abortLabel: t('auto.components.right.sidebar.SourceControl.rebaseAbortLabel', 'Abort rebase')
    }
  }
  if (operation === 'merge') {
    return {
      verb: t('auto.components.sidebar.WorktreeCardHelpers.conflictMerging', 'Merging'),
      abortLabel: t('auto.components.right.sidebar.SourceControl.540ca8f78c', 'Abort merge')
    }
  }
  const name =
    operation === 'revert'
      ? t('gitGraph.revert', 'Revert')
      : t('gitGraph.cherryPick', 'Cherry-pick')
  return {
    verb:
      operation === 'revert'
        ? t('gitGraph.reverting', 'Reverting')
        : t('auto.components.sidebar.WorktreeCardHelpers.conflictCherryPicking', 'Cherry-picking'),
    abortLabel: t('gitGraph.abortOperation', 'Abort {{operation}}', { operation: name })
  }
}

const OPERATION_ICONS = {
  rebase: GitPullRequestArrow,
  merge: GitMerge,
  'cherry-pick': GitCommitHorizontal,
  revert: GitCommitHorizontal
} as const

/** Measures now, again whenever a slot or its hidden measurer resizes, and once web fonts load. */
function observeForMeasure(measure: () => void, elements: (Element | null)[]): () => void {
  measure()
  const observer = new ResizeObserver(measure)
  for (const element of elements) {
    if (element) {
      observer.observe(element)
    }
  }
  let live = true
  // A first measure can run on fallback font metrics; the text then shrinks without a resize.
  void document.fonts?.ready
    .then(() => {
      if (live) {
        measure()
      }
    })
    .catch(() => {})
  return () => {
    live = false
    observer.disconnect()
  }
}

/**
 * The verb and its detail show whole or not at all. When they do not fit together, a conflict count
 * outranks the verb (the icon already names the operation); any other detail goes first.
 */
function OperationStatusLabel({
  verb,
  detail,
  detailIsCount
}: {
  verb: string
  detail: string | null
  detailIsCount: boolean
}): React.JSX.Element {
  const slot = useRef<HTMLSpanElement>(null)
  const full = useRef<HTMLSpanElement>(null)
  const kept = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState<'full' | 'kept' | 'none'>('none')
  const keptText = detail && detailIsCount ? detail : verb
  useLayoutEffect(() => {
    const measure = () => {
      const width = slot.current?.clientWidth ?? 0
      setVisible(
        width >= (full.current?.scrollWidth ?? Infinity)
          ? 'full'
          : width >= (kept.current?.scrollWidth ?? Infinity)
            ? 'kept'
            : 'none'
      )
    }
    return observeForMeasure(measure, [slot.current, full.current, kept.current])
  }, [verb, detail, detailIsCount])
  const verbNode = <span className="font-medium text-foreground">{verb}</span>
  const detailNode = detail ? (
    <span className="text-muted-foreground tabular-nums">{detail}</span>
  ) : null
  const fullNode = detailNode ? (
    <>
      {verbNode} {detailNode}
    </>
  ) : (
    verbNode
  )
  const keptNode = detail && detailIsCount ? detailNode : verbNode
  return (
    <span
      ref={slot}
      role="status"
      aria-live="polite"
      className="relative min-w-0 flex-1 overflow-hidden whitespace-nowrap"
    >
      <span
        ref={full}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap"
      >
        {fullNode}
      </span>
      <span
        ref={kept}
        aria-hidden="true"
        className="pointer-events-none invisible absolute whitespace-nowrap"
      >
        {keptText}
      </span>
      {/* Why: a narrow bar may show only part of the label or none; the live region still announces all of it. */}
      <span className="sr-only">{detail ? `${verb} · ${detail}` : verb}</span>
      <span aria-hidden="true">
        {visible === 'full' ? fullNode : visible === 'kept' ? keptNode : null}
      </span>
    </span>
  )
}

const ABORT_ARM_MS = 3000
// A second press this soon is the same gesture (double-click, double-tap), not a confirmation.
const ABORT_CONFIRM_MIN_MS = 500

/**
 * First press arms Abort in place (same word, same width); a later, separate press within 3s aborts.
 * The arm belongs to one target: any change of targetKey clears it for good, so returning to an
 * earlier target never revives it.
 */
function useArmedAbort(onAbort: () => void, targetKey: string) {
  const [arm, setArm] = useState<{ target: string; at: number | null }>({
    target: targetKey,
    at: null
  })
  let current = arm
  if (arm.target !== targetKey) {
    // Reset during render, before any press can read the old arm against the new target.
    current = { target: targetKey, at: null }
    setArm(current)
  }
  const armedAt = current.at
  useEffect(() => {
    if (armedAt === null) {
      return
    }
    const timer = window.setTimeout(
      () => setArm((state) => (state.at === armedAt ? { ...state, at: null } : state)),
      ABORT_ARM_MS
    )
    return () => window.clearTimeout(timer)
  }, [armedAt])
  return {
    armed: armedAt !== null,
    disarm: () => setArm({ target: targetKey, at: null }),
    press: () => {
      const now = performance.now()
      // Expiry is checked here too, so a late timer can never leave a stale arm confirmable.
      if (armedAt === null || now - armedAt > ABORT_ARM_MS) {
        setArm({ target: targetKey, at: now })
        return
      }
      if (now - armedAt < ABORT_CONFIRM_MIN_MS) {
        return
      }
      setArm({ target: targetKey, at: null })
      onAbort()
    }
  }
}

function ConflictsRow({
  unresolvedCount,
  resolveWithAi
}: {
  unresolvedCount: number
  resolveWithAi: NonNullable<OperationBarProps['resolveWithAi']>
}): React.JSX.Element {
  const t = useTranslate()
  const row = useRef<HTMLDivElement>(null)
  const countMeasure = useRef<HTMLSpanElement>(null)
  const button = useRef<HTMLButtonElement>(null)
  const [countShown, setCountShown] = useState(true)
  useLayoutEffect(() => {
    // The button label never shrinks, so the count (and its dot) hide whole when both do not fit.
    // The row's gap and the button's -ml-1 cancel out, so only the right padding is subtracted.
    const measure = () => {
      const rowEl = row.current
      const available = rowEl
        ? rowEl.clientWidth - Number.parseFloat(getComputedStyle(rowEl).paddingRight)
        : 0
      const needed =
        (countMeasure.current?.scrollWidth ?? Infinity) + (button.current?.offsetWidth ?? 0)
      setCountShown(needed <= available)
    }
    return observeForMeasure(measure, [row.current, countMeasure.current, button.current])
  }, [unresolvedCount])
  const countLabel = t(
    'auto.components.right.sidebar.SourceControl.rebaseConflictCount',
    '{{count}} conflicts',
    { count: unresolvedCount, defaultValue_one: '{{count}} conflict' }
  )
  return (
    <div
      ref={row}
      className="relative flex h-5 min-w-0 items-center gap-1 overflow-hidden pr-1 whitespace-nowrap text-foreground"
    >
      <span
        ref={countMeasure}
        aria-hidden="true"
        className="pointer-events-none invisible absolute flex items-center gap-1 text-muted-foreground tabular-nums"
      >
        {countLabel}
        <span>·</span>
      </span>
      {countShown ? (
        <span className="flex shrink-0 items-center gap-1 text-muted-foreground tabular-nums">
          {countLabel}
          <span aria-hidden="true">·</span>
        </span>
      ) : (
        <span className="sr-only">{countLabel}</span>
      )}
      <Button
        ref={button}
        type="button"
        // Centers the dot: the button's own padding already spaces it from the sparkle.
        className="-ml-1"
        variant="ghost"
        size="xs-compact"
        disabled={resolveWithAi.unavailable}
        onClick={resolveWithAi.onPress}
      >
        <Sparkles className="text-muted-foreground" aria-hidden="true" />
        {t('auto.components.right.sidebar.SourceControl.f6cb48b6fe', 'Resolve with AI')}
      </Button>
    </div>
  )
}

/** One neutral bar for a paused rebase, merge, cherry-pick or revert, in the header status line. */
export function OperationBar({
  operation,
  abortTargetKey,
  unresolvedCount,
  detailLabel = null,
  abort,
  step,
  resolveWithAi
}: OperationBarProps): React.JSX.Element {
  const t = useTranslate()
  const copy = useOperationCopy(operation)
  const Icon = OPERATION_ICONS[operation]
  const armedAbort = useArmedAbort(abort.onAbort, abortTargetKey)
  const conflictsRowShown = resolveWithAi !== null && unresolvedCount > 0
  const countLabel =
    unresolvedCount > 0 && !conflictsRowShown
      ? t(
          'auto.components.right.sidebar.SourceControl.rebaseConflictCount',
          '{{count}} conflicts',
          {
            count: unresolvedCount,
            defaultValue_one: '{{count}} conflict'
          }
        )
      : null
  const detail = countLabel ?? detailLabel
  const statusText = detail ? `${copy.verb} · ${detail}` : copy.verb
  const abortReason = armedAbort.armed
    ? t('auto.components.right.sidebar.SourceControl.operationAbortConfirm', 'Click again to abort')
    : (abort.reason ?? null)
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col rounded-md bg-foreground/[0.06] pl-2 text-xs',
        conflictsRowShown && 'pb-1'
      )}
      data-testid="source-control-operation-bar"
    >
      <div className="flex h-7 min-w-0 items-center gap-1.5 pr-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              tabIndex={0}
              role="img"
              aria-label={statusText}
              className="shrink-0 rounded-sm text-muted-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <Icon className="size-3.5" aria-hidden="true" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">{statusText}</TooltipContent>
        </Tooltip>
        <OperationStatusLabel
          verb={copy.verb}
          detail={detail}
          detailIsCount={countLabel !== null}
        />
        <span className="flex shrink-0 items-center gap-0.5">
          <ReasonButton
            variant="ghost-arm-destructive"
            size="xs-snug"
            data-armed={armedAbort.armed || undefined}
            unavailable={abort.unavailable}
            reason={abortReason}
            reasonPinned={armedAbort.armed}
            // The visible word alone is ambiguous to a screen reader landing on it from elsewhere.
            aria-label={copy.abortLabel}
            aria-busy={abort.busy || undefined}
            onBlur={armedAbort.disarm}
            onKeyDown={(event) => {
              // A held Enter repeats clicks; only a fresh press may arm or confirm.
              if (event.key === 'Enter' && event.repeat) {
                event.preventDefault()
                return
              }
              if (event.key === 'Escape' && armedAbort.armed) {
                event.stopPropagation()
                armedAbort.disarm()
              }
            }}
            onPress={armedAbort.press}
          >
            {abort.busy ? <LoadingSpinner className="size-3" /> : null}
            {t('auto.components.right.sidebar.SourceControl.rebaseAbort', 'Abort')}
          </ReasonButton>
          {/* The tooltip alone is silent to a screen reader, so arming is announced here. */}
          <span className="sr-only" aria-live="polite">
            {armedAbort.armed ? abortReason : null}
          </span>
          <ReasonButton
            variant="default"
            size="xs-snug"
            unavailable={step.unavailable}
            reason={step.reason}
            aria-label={step.ariaLabel}
            aria-busy={step.busy || undefined}
            onPress={step.onPress}
          >
            {step.busy ? <LoadingSpinner className="size-3" /> : null}
            {step.label}
          </ReasonButton>
        </span>
      </div>
      {conflictsRowShown ? (
        <ConflictsRow unresolvedCount={unresolvedCount} resolveWithAi={resolveWithAi} />
      ) : null}
    </div>
  )
}
