import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encodeTerminalStreamText,
  TerminalStreamOpcode
} from '../../../../../shared/terminal/stream/terminal-stream-protocol'
import { OrcaRuntimeService } from '../../../orca-runtime'
import { RuntimeTerminalWriter } from '../../../terminal/input/runtime-terminal-writer'
import { TerminalInputSequenceLedger } from './terminal-input-sequence-ledger'
import type { TerminalMultiplexConnection } from './terminal-multiplex-connection'
import { handleMultiplexInputFrame } from './terminal-multiplex-input-frame'
import type { TerminalMultiplexStream } from './terminal-stream-types'

afterEach(() => {
  vi.restoreAllMocks()
})

function unsequencedInputSender(runtime: unknown, terminal: string): (text: string) => void {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: unsequenced input from a client-less stream only calls `runtime` and `notifyStreamWriteUnavailable`.
  const state = {
    runtime,
    notifyStreamWriteUnavailable: vi.fn()
  } as unknown as TerminalMultiplexConnection
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: an unsequenced desktop stream reads only these fields.
  const stream = {
    terminal,
    ptyId: 'pty-1',
    client: undefined,
    isMobile: false,
    inputSessionId: null,
    unsequencedInputTail: Promise.resolve(),
    desktopClaimTail: Promise.resolve(true)
  } as unknown as TerminalMultiplexStream
  const ledger = new TerminalInputSequenceLedger()
  return (text) =>
    handleMultiplexInputFrame(state, ledger, stream, {
      opcode: TerminalStreamOpcode.Input,
      streamId: 1,
      seq: 0,
      payload: encodeTerminalStreamText(text)
    })
}

describe('handleMultiplexInputFrame', () => {
  it('writes unsequenced frames to the PTY in send order while a large paste is chunked', async () => {
    const written: string[] = []
    const writer = new RuntimeTerminalWriter((_ptyId, data) => {
      written.push(data)
      return true
    })
    const send = unsequencedInputSender(
      {
        sendTerminal: async (
          _handle: string,
          action: { text: string },
          options: Parameters<RuntimeTerminalWriter['writeAction']>[3]
        ) => {
          await writer.writeAction('pty-1', action, action.text, options)
          return { handle: 'terminal-1', accepted: true, bytesWritten: 0 }
        }
      },
      'terminal-1'
    )
    const paste = 'a'.repeat(50 * 1024)
    const inputs = ['\x1b[200~', paste, '\x1b[201~', 'x']
    for (const text of inputs) {
      send(text)
    }

    await vi.waitFor(() => expect(written.join('').length).toBe(inputs.join('').length))
    expect(written.map((data) => (data === paste.slice(0, data.length) ? 'paste' : data))).toEqual([
      '\x1b[200~',
      'paste',
      'paste',
      'paste',
      'paste',
      '\x1b[201~',
      'x'
    ])
  })

  it('bounds queued frames by one endpoint re-attach wait and gives a frame queued before the loss the full wait', async () => {
    let clockSkewMs = 0
    const realNow = performance.now.bind(performance)
    vi.spyOn(performance, 'now').mockImplementation(() => realNow() + clockSkewMs)
    const runtime = new OrcaRuntimeService()
    const writes: { data: string; reattached: boolean }[] = []
    let reattached = false
    let finishAttach = (_attached: boolean): void => {}
    runtime.setPtyController({
      write: (_ptyId: string, data: string) => {
        writes.push({ data, reattached })
        return true
      },
      kill: () => true,
      getForegroundProcess: async () => 'bash',
      attach: () => new Promise<boolean>((resolve) => (finishAttach = resolve))
    })
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the protected registration a live local terminal goes through; no public seam exists.
    const internals = runtime as unknown as {
      registerPty: (ptyId: string, worktreeId: string) => void
      issuePtyHandle: (pty: unknown) => void
      ptysById: Map<string, unknown>
      handles: Map<string, unknown>
    }
    internals.registerPty('pty-1', 'wt-1')
    internals.issuePtyHandle(internals.ptysById.get('pty-1'))
    const [handle] = internals.handles.keys()
    const send = unsequencedInputSender(runtime, handle)
    try {
      // Stuck re-attach: frames whose turn comes 9.9 s into it share the remaining 0.1 s.
      runtime.notePtyEndpointLoss('pty-1')
      for (const text of ['a', 'b', 'c']) {
        send(text)
      }
      clockSkewMs += 9_900
      await vi.waitFor(() => expect(writes.map(({ data }) => data)).toEqual(['a', 'b', 'c']), {
        timeout: 3_000
      })

      finishAttach(true)
      await new Promise((resolve) => setImmediate(resolve))
      // A frame that arrived 15 s before a new loss still waits for that re-attach.
      send('d')
      clockSkewMs += 15_000
      runtime.notePtyEndpointLoss('pty-1')
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(writes).toHaveLength(3)
      reattached = true
      finishAttach(true)
      await vi.waitFor(() => expect(writes[3]).toEqual({ data: 'd', reattached: true }))
    } finally {
      await runtime.onPtyExit('pty-1', 0)
    }
  })
})
