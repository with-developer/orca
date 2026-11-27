import { describe, expect, it, vi } from 'vitest'
import type {
  AgentSenderDelta,
  AgentSenderPublication
} from '../../../../../shared/orchestration/mailbox/agent-sender-associations'
import {
  agentSenderDeltaPatch,
  agentSenderPublicationPatch,
  deliveredAgentSenderRevision
} from './agent-sender-publication-patch'

describe('agentSenderDeltaPatch and zero-stringify equality', () => {
  it('applies scoped deltas while preserving baseline object identity without JSON.stringify', () => {
    const rev1 = { epoch: 'e1', revision: 1 }
    const rev2 = { epoch: 'e1', revision: 2 }
    const rowA = { identity: 'dispatch:a', paneKey: 't1:l1', worktreeId: 'wt-a' }
    const rowB = { identity: 'dispatch:b', paneKey: 't2:l2', worktreeId: 'wt-b' }
    const updatedRowB = { identity: 'dispatch:b2', paneKey: 't2:l2', worktreeId: 'wt-b' }

    const baseline: AgentSenderPublication = {
      associations: [rowA, rowB],
      principals: [{ peerFingerprint: 'p1', homePeerFingerprint: 'h1' }],
      attachments: [],
      revision: rev1
    }
    const stateAfterFull = agentSenderPublicationPatch({}, 'local', '*', baseline)
    const wholeBefore = stateAfterFull.agentSenderPublicationsByHost!.local['*']

    const delta: AgentSenderDelta = {
      baseRevision: rev1,
      revision: rev2,
      scopes: [
        [
          'wt-b',
          {
            associations: [updatedRowB],
            principals: baseline.principals,
            attachments: [],
            revision: rev2
          }
        ]
      ]
    }

    const stringifySpy = vi.spyOn(JSON, 'stringify')
    try {
      const stateAfterDelta = agentSenderDeltaPatch(stateAfterFull, 'local', delta)
      const localScopes = stateAfterDelta.agentSenderPublicationsByHost!.local
      expect(localScopes['*']).toBe(wholeBefore)
      expect(localScopes['wt-b'].associations).toEqual([updatedRowB])
      expect(deliveredAgentSenderRevision(localScopes['*'])).toEqual(rev2)

      // Base mismatch is safely ignored without mutating delivered revision.
      const stale = agentSenderDeltaPatch(stateAfterDelta, 'local', {
        ...delta,
        baseRevision: rev1,
        revision: { epoch: 'e1', revision: 3 }
      })
      expect(stale).toEqual({})
      expect(deliveredAgentSenderRevision(localScopes['*'])).toEqual(rev2)
      expect(stringifySpy).not.toHaveBeenCalled()
    } finally {
      stringifySpy.mockRestore()
    }
  })
})
