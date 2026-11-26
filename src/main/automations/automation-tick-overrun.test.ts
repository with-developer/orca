import { closeTestStores, createStore, testState } from '../persistence/persistence-test-harness'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AutomationService } from './automation-service'

vi.mock('electron', () => ({
  app: {
    getPath: () => testState.dir
  },
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (plaintext: string) => Buffer.from(`encrypted:${plaintext}`, 'utf-8'),
    decryptString: (ciphertext: Buffer) => ciphertext.toString('utf-8').slice('encrypted:'.length)
  }
}))

const TICK_MS = 60_000

describe('a scheduler pass that outlasts the tick', () => {
  beforeEach(() => {
    testState.dir = mkdtempSync(join(tmpdir(), 'orca-automations-overrun-test-'))
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval'] })
    vi.setSystemTime(new Date('2026-11-09T08:00:30Z'))
  })

  afterEach(async () => {
    await closeTestStores()
    vi.useRealTimers()
    rmSync(testState.dir, { recursive: true, force: true })
  })

  it('evaluates again after the pass instead of dropping the tick that arrived during it', async () => {
    const store = await createStore()
    store.addRepo({ id: 'r1', path: '/repo', displayName: 'test', badgeColor: '#fff', addedAt: 1 })
    const automation = store.createAutomation({
      name: 'Every minute',
      prompt: 'Check',
      agentId: 'claude',
      projectId: 'r1',
      workspaceMode: 'existing',
      workspaceId: 'r1::wt1',
      timezone: 'UTC',
      rrule: '* * * * *',
      dtstart: new Date('2026-11-09T00:00:00Z').getTime()
    })
    const flush = store.flushPendingOrThrowAsync.bind(store)
    let stallNextRunWrite = true
    const createRun = vi.spyOn(store, 'createAutomationRun')
    vi.spyOn(store, 'flushPendingOrThrowAsync').mockImplementation(async (options) => {
      if (stallNextRunWrite && createRun.mock.calls.length > 0) {
        stallNextRunWrite = false
        // The 08:01:30 pass is still writing its run when the 08:02:30 tick fires.
        await new Promise((resolve) => setTimeout(resolve, 70_000))
      }
      return flush(options)
    })
    const service = new AutomationService(store, {
      terminalLauncher: {
        launch: vi.fn(async () => ({ workspaceId: 'wt-1', terminalSessionId: 'tab-1' })),
        available: () => true
      }
    })

    service.start()
    await vi.advanceTimersByTimeAsync(3 * TICK_MS)
    service.stop()

    const minutes = store
      .listAutomationRuns(automation.id)
      .map((run) => new Date(run.scheduledFor).toISOString().slice(11, 16))
      .sort()
    expect(minutes).toEqual(['08:01', '08:02', '08:03'])
  })
})
