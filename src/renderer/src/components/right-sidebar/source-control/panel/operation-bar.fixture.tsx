import React from 'react'
import type { GitStatusEntry } from '../../../../../../shared/git/status/git-status-types'
import { getWorktreeGitIdentityDisplay } from '../../../../../../shared/worktree/row-display/git-identity-display'
import { defineFixture } from '../../../../component-fixtures/component-fixture'
import { UncommittedEntryRow } from '../listing/uncommitted-entry-row'
import { SourceControlBranchContextRow } from './branch-context-row'
import { OperationBar, type OperationBarOperation } from './operation-bar'
import { RebaseOperationBar, type BaseRebaseActions } from './rebase-operation-bar'

type Scenario = { kind: OperationBarOperation; conflicts: number; ai?: boolean; long?: boolean }

const LONG_BRANCH = 'feature/source-control-rebase-operation-banner-redesign-follow-up'

function files(conflicts: number): GitStatusEntry[] {
  const conflicted: GitStatusEntry[] = ['src/billing/ledger.ts', 'src/billing/reconcile.test.ts']
    .slice(0, conflicts)
    .map((path) => ({
      path,
      status: 'modified',
      area: 'unstaged',
      conflictKind: 'both_modified',
      conflictStatus: 'unresolved'
    }))
  return [
    ...conflicted,
    { path: 'src/renderer/operation-bar.tsx', status: 'added', area: 'unstaged' },
    { path: 'README.md', status: 'modified', area: 'unstaged' }
  ]
}

function pausedRebase(unresolvedCount: number) {
  const paused = {
    kind: 'rebase_paused',
    unresolvedCount,
    continueState: 'ready',
    inspectFailureMessage: null
  } as const
  const actions: BaseRebaseActions = {
    state: paused,
    isAbortingRebase: false,
    isContinuingRebase: false,
    isRetryingRebaseInspect: false,
    hasGitOwner: true,
    onAbortRebase: () => {},
    onContinueRebase: () => {},
    onRetryRebaseInspect: () => {}
  }
  return { paused, actions }
}

function Bar({ kind, conflicts, ai = true }: Scenario): React.JSX.Element {
  const resolveWithAi = ai ? { unavailable: false, onPress: () => {} } : null
  if (kind === 'rebase') {
    const { paused, actions } = pausedRebase(conflicts)
    return <RebaseOperationBar actions={actions} paused={paused} resolveWithAi={resolveWithAi} />
  }
  return (
    <OperationBar
      operation={kind}
      unresolvedCount={conflicts}
      abort={{ unavailable: false, busy: false, onAbort: () => {} }}
      step={{
        label: 'Continue',
        reason: conflicts > 0 ? 'Resolve conflicts first' : null,
        unavailable: conflicts > 0,
        busy: false,
        onPress: () => {}
      }}
      resolveWithAi={resolveWithAi}
    />
  )
}

/** The header block and file rows around the bar, so its edges can be checked against both. */
function Panel(scenario: Scenario): React.JSX.Element {
  const headDisplay =
    scenario.kind === 'rebase' && !scenario.long
      ? getWorktreeGitIdentityDisplay({ head: '3f9c2a1d8e7b6c5a4f3e2d1c0b9a8f7e6d5c4b3a' })
      : getWorktreeGitIdentityDisplay({ branch: scenario.long ? LONG_BRANCH : 'feature/ledger' })
  return (
    <div className="flex flex-col bg-sidebar text-foreground">
      <div className="flex flex-col border-b border-border px-3 py-1">
        <SourceControlBranchContextRow
          summary={null}
          compareBaseRef={null}
          headDisplay={headDisplay}
          operationBar={<Bar {...scenario} />}
          onRetry={() => {}}
        />
      </div>
      <div className="pt-1">
        {files(scenario.conflicts).map((entry) => (
          <UncommittedEntryRow
            key={entry.path}
            entryKey={entry.path}
            entry={entry}
            currentWorktreeId="fixture-workspace"
            worktreePath="/workspace/ledger"
            onRevealInExplorer={() => {}}
            onOpen={() => {}}
            onStage={async () => {}}
            onResolveConflict={async () => {}}
            onUnstage={async () => {}}
            onDiscard={() => {}}
            commentCount={0}
          />
        ))}
      </div>
    </div>
  )
}

// The fixture frame pads 16px per side; the widths below are the panel's own.
function at(width: number, scenario: Scenario) {
  return defineFixture({ width: width + 32, render: () => <Panel {...scenario} /> })
}

export const rebaseReady320 = at(320, { kind: 'rebase', conflicts: 0, long: true })
export const rebaseReady260 = at(260, { kind: 'rebase', conflicts: 0 })
export const rebaseReady220 = at(220, { kind: 'rebase', conflicts: 0, long: true })
export const rebaseConflicts320 = at(320, { kind: 'rebase', conflicts: 2, long: true })
export const rebaseConflicts260 = at(260, { kind: 'rebase', conflicts: 2 })
export const rebaseConflicts220 = at(220, { kind: 'rebase', conflicts: 2, long: true })
export const rebaseConflictsNoAi260 = at(260, { kind: 'rebase', conflicts: 2, ai: false })
export const rebaseConflictsNoAi220 = at(220, { kind: 'rebase', conflicts: 2, ai: false })
export const mergeReady260 = at(260, { kind: 'merge', conflicts: 0 })
export const mergeConflicts320 = at(320, { kind: 'merge', conflicts: 1, long: true })
export const mergeConflicts220 = at(220, { kind: 'merge', conflicts: 1, long: true })
export const cherryPickConflicts260 = at(260, { kind: 'cherry-pick', conflicts: 2 })
export const cherryPickConflicts220 = at(220, { kind: 'cherry-pick', conflicts: 2 })

export const rebaseAbortArmed = defineFixture({
  width: 260 + 32,
  render: () => <Panel kind="rebase" conflicts={0} />,
  interact: (frame) => {
    frame.querySelector<HTMLButtonElement>('button[aria-label="Abort rebase"]')?.click()
  }
})
