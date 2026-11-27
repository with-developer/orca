import React from 'react'
import { useTranslate } from '@/i18n/use-translate'
import { useSequencerRecovery } from '../listing/use-sequencer-recovery'
import { OperationBar, type OperationBarOperation, type OperationBarProps } from './operation-bar'
import { RebaseOperationBar } from './rebase-operation-bar'
import type { SourceControlPanelModel } from './use-panel-model'

/** The panel's paused rebase, merge, cherry-pick or revert, as one bar for the header status line. */
export function SourceControlOperationBar({
  model,
  worktreeId
}: {
  model: SourceControlPanelModel
  worktreeId: string
}): React.JSX.Element | null {
  const operation = model.conflictOperation
  const unresolvedCount = model.unresolvedConflictReviewEntries.length
  const recoveryBusy = model.isCheckingRecoveryAdmission || model.isResolvingConflictsWithAI
  const resolveWithAi: OperationBarProps['resolveWithAi'] = model.sourceControlAiActionsVisible
    ? {
        unavailable: model.isAbortingOperation || recoveryBusy,
        onPress: () => void model.handleResolveConflictsWithAI()
      }
    : null
  if (operation === 'unknown') {
    return null
  }
  if (operation === 'rebase') {
    return model.baseRebaseState.kind === 'rebase_paused' ? (
      <RebaseOperationBar
        paused={model.baseRebaseState}
        resolveWithAi={resolveWithAi}
        actions={{
          state: model.baseRebaseState,
          isAbortingRebase: model.isAbortingOperation,
          isContinuingRebase: model.isContinuingRebase,
          isRetryingRebaseInspect: model.isRetryingRebaseInspect,
          hasGitOwner: !!model.activeRepoTarget,
          onAbortRebase: () => void model.handleAbortRebase({ confirmed: true }),
          onContinueRebase: () => void model.handleContinueRebase(),
          onRetryRebaseInspect: model.handleRetryRebaseInspect
        }}
      />
    ) : null
  }
  if (operation === 'merge') {
    return (
      <MergeOperationBar
        model={model}
        unresolvedCount={unresolvedCount}
        recoveryBusy={recoveryBusy}
        resolveWithAi={resolveWithAi}
      />
    )
  }
  return (
    <SequencerOperationBar
      worktreeId={worktreeId}
      operation={operation}
      unresolvedCount={unresolvedCount}
      disabled={recoveryBusy || model.isAbortingOperation || model.isCommitting}
      resolveWithAi={resolveWithAi}
    />
  )
}

function useResolveConflictsFirst(unresolvedCount: number): string | null {
  const t = useTranslate()
  return unresolvedCount > 0
    ? t(
        'auto.components.right.sidebar.SourceControl.rebaseResolveConflictsFirst',
        'Resolve conflicts first'
      )
    : null
}

function MergeOperationBar({
  model,
  unresolvedCount,
  recoveryBusy,
  resolveWithAi
}: {
  model: SourceControlPanelModel
  unresolvedCount: number
  recoveryBusy: boolean
  resolveWithAi: OperationBarProps['resolveWithAi']
}): React.JSX.Element {
  const t = useTranslate()
  const conflictsReason = useResolveConflictsFirst(unresolvedCount)
  const busy = model.isAbortingOperation || model.isCommitting
  return (
    <OperationBar
      operation="merge"
      unresolvedCount={unresolvedCount}
      abort={{
        unavailable: busy,
        busy: model.isAbortingOperation,
        onAbort: () => void model.handleAbortMerge({ confirmed: true })
      }}
      step={{
        label: t('auto.components.right.sidebar.SourceControl.rebaseContinue', 'Continue'),
        reason: busy ? null : conflictsReason,
        unavailable: busy || recoveryBusy || conflictsReason !== null,
        busy: model.isCommitting,
        onPress: () => void model.handleCompleteMerge()
      }}
      resolveWithAi={resolveWithAi}
    />
  )
}

function SequencerOperationBar({
  worktreeId,
  operation,
  unresolvedCount,
  disabled,
  resolveWithAi
}: {
  worktreeId: string
  operation: Exclude<OperationBarOperation, 'rebase' | 'merge'>
  unresolvedCount: number
  disabled: boolean
  resolveWithAi: OperationBarProps['resolveWithAi']
}): React.JSX.Element {
  const t = useTranslate()
  const recovery = useSequencerRecovery({ worktreeId, operation, disabled })
  const conflictsReason = useResolveConflictsFirst(unresolvedCount)
  const busy = recovery.busyAction !== null
  const unavailable = !recovery.supported || disabled || busy
  // An old host cannot run these; its reason says why on both buttons.
  const hostReason = recovery.supported ? null : recovery.reason
  return (
    <OperationBar
      operation={operation}
      unresolvedCount={unresolvedCount}
      abort={{
        unavailable,
        busy: recovery.busyAction === 'abort',
        reason: hostReason,
        onAbort: () => void recovery.run('abort', { confirmed: true })
      }}
      step={{
        label: t('auto.components.right.sidebar.SourceControl.rebaseContinue', 'Continue'),
        reason: hostReason ?? (busy ? null : conflictsReason),
        unavailable: unavailable || conflictsReason !== null,
        busy: recovery.busyAction === 'continue',
        onPress: () => void recovery.run('continue')
      }}
      resolveWithAi={resolveWithAi}
    />
  )
}
