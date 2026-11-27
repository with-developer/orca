import { describe, expect, it, vi } from 'vitest'
import { AgentSenderPublisher } from './runtime-agent-sender-publication'

describe('AgentSenderPublisher incremental deltas and zero-stringify equality', () => {
  it('emits scoped deltas for single-worktree changes without JSON.stringify', () => {
    const publisher = new AgentSenderPublisher()
    const baseRowA = { identity: 'dispatch:a', paneKey: 't1:l1', worktreeId: 'wt-a' }
    const baseRowB = { identity: 'dispatch:b', paneKey: 't2:l2', worktreeId: 'wt-b' }

    publisher.publish({
      associations: [baseRowA, baseRowB],
      principals: [{ peerFingerprint: 'p1', homePeerFingerprint: 'h1' }],
      attachments: []
    })
    const initial = publisher.forGraph(undefined)
    expect(initial.agentSenderAssociations).toBeDefined()
    expect(initial.agentSenderDelta).toBeUndefined()

    const baseRev = initial.agentSenderAssociations!.revision
    const stringifySpy = vi.spyOn(JSON, 'stringify')
    try {
      // Unchanged publish should be a no-op with zero JSON.stringify calls.
      publisher.publish({
        associations: [{ ...baseRowA }, { ...baseRowB }],
        principals: [{ peerFingerprint: 'p1', homePeerFingerprint: 'h1' }],
        attachments: []
      })
      expect(publisher.forGraph(baseRev)).toEqual({ agentSenderRevision: baseRev })

      // Single-worktree change emits only wt-b in agentSenderDelta.
      const updatedRowB = { identity: 'dispatch:b2', paneKey: 't2:l2', worktreeId: 'wt-b' }
      publisher.publish({
        associations: [baseRowA, updatedRowB],
        principals: [{ peerFingerprint: 'p1', homePeerFingerprint: 'h1' }],
        attachments: []
      })
      const reply = publisher.forGraph(baseRev)
      expect(reply.agentSenderAssociations).toBeUndefined()
      expect(reply.agentSenderDelta).toBeDefined()
      expect(reply.agentSenderDelta!.baseRevision).toEqual(baseRev)
      expect(reply.agentSenderDelta!.scopes.map(([id]) => id)).toEqual(['wt-b'])
      expect(reply.agentSenderDelta!.scopes[0][1].associations).toEqual([updatedRowB])

      // Host-wide principal change falls back to full baseline snapshot.
      const revAfterDelta = reply.agentSenderDelta!.revision
      publisher.publish({
        associations: [baseRowA, updatedRowB],
        principals: [{ peerFingerprint: 'p2', homePeerFingerprint: 'h2' }],
        attachments: []
      })
      const hostReply = publisher.forGraph(revAfterDelta)
      expect(hostReply.agentSenderAssociations).toBeDefined()
      expect(hostReply.agentSenderDelta).toBeUndefined()

      expect(stringifySpy).not.toHaveBeenCalled()
    } finally {
      stringifySpy.mockRestore()
    }
  })
})
