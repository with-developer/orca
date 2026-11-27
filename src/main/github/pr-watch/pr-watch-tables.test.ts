import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Database from '../../sqlite/sync-database'
import { insertPRCheckEvent, readPRPendingDeliveryChatIds } from './pr-check-event-tables'
import { sweepGonePRChats } from './pr-watch-chat-retirement'
import { ensurePRWatchTables, insertPRChatAction, readPRChatActions } from './pr-watch-tables'
import type { PRWatchServiceDeps } from './pr-watch-types'

let dir = ''

function openTestDb(): Database.Database {
  dir = mkdtempSync(join(tmpdir(), 'orca-pr-watch-tables-'))
  const db = new Database(join(dir, 'journal.db'))
  ensurePRWatchTables(db)
  return db
}

afterEach(() => {
  if (dir) {
    rmSync(dir, { recursive: true, force: true })
    dir = ''
  }
})

describe('pr-watch SQLite index usage and retirement sweeps', () => {
  it('uses indexes for pr_chat_actions lookups and pending delivery chat queries', () => {
    const db = openTestDb()
    try {
      const actionPlan = db
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT * FROM pr_chat_actions
             WHERE forge_host = ? AND owner = ? AND repo = ? AND number = ?
             ORDER BY observed_at`
        )
        .all('github.com', 'stablyai', 'orca', 42)
        .map((row) => String(row.detail))
      expect(actionPlan.some((d) => d.includes('USING INDEX pr_chat_actions_by_pr'))).toBe(true)

      const pendingPlan = db
        .prepare(
          `EXPLAIN QUERY PLAN
           SELECT DISTINCT chat_id FROM pr_event_deliveries WHERE state = 'pending'`
        )
        .all()
        .map((row) => String(row.detail))
      expect(pendingPlan.some((d) => d.includes('pr_event_deliveries_pending'))).toBe(true)

      insertPRChatAction(db, {
        chatId: 'chat-1',
        anchor: { itemId: 'item-1', revision: 1 },
        forgeHost: 'github.com',
        owner: 'stablyai',
        repo: 'orca',
        number: 42,
        kind: 'opened',
        headSha: 'abc123',
        observedAt: 100
      })
      insertPRChatAction(db, {
        chatId: 'chat-2',
        anchor: { itemId: 'item-2', revision: 1 },
        forgeHost: 'github.com',
        owner: 'stablyai',
        repo: 'orca',
        number: 99,
        kind: 'opened',
        headSha: 'def456',
        observedAt: 100
      })

      expect(readPRChatActions(db, 'github.com/stablyai/orca#42').map((a) => a.chatId)).toEqual([
        'chat-1'
      ])
      expect(readPRChatActions(db, 'not-a-pr-key')).toEqual([])

      const event = insertPRCheckEvent(db, {
        prKey: 'github.com/stablyai/orca#42',
        headSha: 'abc123',
        verdict: 'success',
        observedAt: 200,
        isCurrentHead: true
      })
      expect(event.chatIds).toEqual(['chat-1'])
      expect(readPRPendingDeliveryChatIds(db)).toEqual(['chat-1'])
    } finally {
      db.close()
    }
  })

  it('skips the delete-chats write on periodic sweeps when no chats disappeared', async () => {
    const read = vi.fn().mockResolvedValue(['chat-1'])
    const write = vi.fn().mockResolvedValue(['github.com/stablyai/orca#42'])
    const deps = {
      database: { readOnly: false, isClosed: false, read, write },
      chatExists: (id: string) => id === 'chat-1'
    } as unknown as PRWatchServiceDeps

    const forget = vi.fn()
    const end = vi.fn().mockResolvedValue(undefined)

    // Periodic sweep (cleanupOrphans = false) with no gone chats performs zero writes.
    await sweepGonePRChats(deps, () => false, ['github.com/stablyai/orca#42'], forget, end, false)
    expect(write).not.toHaveBeenCalled()
    expect(end).not.toHaveBeenCalled()

    // Startup sweep (cleanupOrphans = true) still runs orphan cleanup once.
    await sweepGonePRChats(deps, () => false, ['github.com/stablyai/orca#42'], forget, end, true)
    expect(write).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledWith({ kind: 'delete-chats', chatIds: [] })
  })
})
