import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import type { BaseRebaseState } from './base-rebase-state'
import { OperationBar, type OperationBarProps, type OperationBarStep } from './operation-bar'

export type BaseRebaseActions = {
  state: BaseRebaseState
  isAbortingRebase: boolean
  isContinuingRebase: boolean
  isRetryingRebaseInspect: boolean
  hasGitOwner: boolean
  onAbortRebase: () => void
  onContinueRebase: () => void
  onRetryRebaseInspect: () => void
}

type PausedRebase = Extract<BaseRebaseState, { kind: 'rebase_paused' }>

/** The one step the paused rebase offers next; a single slot so focus survives state changes. */
function useRebaseStepButton(actions: BaseRebaseActions, paused: PausedRebase): OperationBarStep {
  const t = useTranslate()
  const busy = actions.isAbortingRebase || actions.isContinuingRebase || !actions.hasGitOwner
  if (paused.continueState === 'unreadable' || actions.isRetryingRebaseInspect) {
    return {
      label: t('auto.components.right.sidebar.SourceControl.rebaseRetryInspect', 'Retry'),
      ariaLabel: t(
        'auto.components.right.sidebar.SourceControl.rebaseRetryInspectLabel',
        'Retry checking the rebase step'
      ),
      reason: t('auto.components.right.sidebar.SourceControl.rebaseCheckAgain', 'Check again'),
      unavailable: busy || actions.isRetryingRebaseInspect,
      busy: actions.isRetryingRebaseInspect,
      onPress: actions.onRetryRebaseInspect
    }
  }
  const reason =
    paused.unresolvedCount > 0
      ? t(
          'auto.components.right.sidebar.SourceControl.rebaseResolveConflictsFirst',
          'Resolve conflicts first'
        )
      : paused.continueState === 'blocked' || paused.continueState === 'empty'
        ? t(
            'auto.components.right.sidebar.SourceControl.rebaseStoppedFinishInTerminal',
            'Git paused this step. Finish it in a terminal or abort.'
          )
        : paused.continueState === 'unknown'
          ? t(
              'auto.components.right.sidebar.SourceControl.rebaseCheckingStep',
              'Checking the rebase step'
            )
          : null
  return {
    label: t('auto.components.right.sidebar.SourceControl.rebaseContinue', 'Continue'),
    reason: busy ? null : reason,
    unavailable: busy || reason !== null,
    busy: actions.isContinuingRebase,
    onPress: actions.onContinueRebase
  }
}

export function RebaseOperationBar({
  actions,
  paused,
  abortTargetKey,
  resolveWithAi
}: {
  actions: BaseRebaseActions
  paused: PausedRebase
  abortTargetKey: string
  resolveWithAi: OperationBarProps['resolveWithAi']
}): React.JSX.Element {
  const t = useTranslate()
  const step = useRebaseStepButton(actions, paused)
  return (
    <OperationBar
      operation="rebase"
      abortTargetKey={abortTargetKey}
      unresolvedCount={paused.unresolvedCount}
      detailLabel={
        paused.continueState === 'unreadable'
          ? t(
              'auto.components.right.sidebar.SourceControl.rebaseStepUnreadableShort',
              'Check failed'
            )
          : paused.continueState === 'empty'
            ? t('auto.components.right.sidebar.SourceControl.rebaseEmptyStepShort', 'Empty step')
            : null
      }
      abort={{
        unavailable: actions.isAbortingRebase || actions.isContinuingRebase,
        busy: actions.isAbortingRebase && !actions.isContinuingRebase,
        onAbort: actions.onAbortRebase
      }}
      step={step}
      resolveWithAi={resolveWithAi}
    />
  )
}
