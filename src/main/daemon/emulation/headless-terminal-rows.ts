import type { Terminal } from '@xterm/headless'
import {
  getClippedTerminalLineColumns,
  translateClippedTerminalLine,
  type TerminalGridReadOptions
} from '../../../shared/terminal/viewport/terminal-line-applied-columns'
import type { RuntimeTerminalRowMetadata } from '../../../shared/terminal/runtime/runtime-terminal-contracts'

export type HeadlessTerminalRow = { text: string; metadata: RuntimeTerminalRowMetadata }

function terminalRowRange(terminal: Terminal, limit?: number) {
  const buffer = terminal.buffer.active
  return {
    buffer,
    start:
      limit === undefined
        ? buffer.viewportY
        : Math.max(0, buffer.length - Math.max(0, Math.floor(limit))),
    end: limit === undefined ? buffer.viewportY + terminal.rows : buffer.length
  }
}

export function readHeadlessTerminalVisibleRange(terminal: Terminal) {
  const buffer = terminal.buffer.active
  const start = buffer.viewportY
  return {
    start,
    endExclusive: Math.min(buffer.length, start + terminal.rows),
    totalLength: buffer.length
  }
}

export function readHeadlessTerminalLines(terminal: Terminal, limit?: number): string[] {
  const { buffer, start, end } = terminalRowRange(terminal, limit)
  const lines: string[] = []
  for (let row = start; row < end; row += 1) {
    lines.push(buffer.getLine(row)?.translateToString(true) ?? '')
  }
  return lines
}

/** Reads the viewport up from its bottom row, stopping once `maxNonBlank` rows hold text or after `maxRows` rows. */
export function readHeadlessTerminalBottomLines(
  terminal: Terminal,
  maxNonBlank: number,
  maxRows: number
): string[] {
  const { buffer, start, end } = terminalRowRange(terminal)
  const lowest = Math.max(start, end - maxRows)
  const lines: string[] = []
  let nonBlank = 0
  for (let row = end - 1; row >= lowest && nonBlank < maxNonBlank; row -= 1) {
    const text = buffer.getLine(row)?.translateToString(true) ?? ''
    nonBlank += text.trim().length > 0 ? 1 : 0
    lines.push(text)
  }
  return lines.toReversed()
}

export function readHeadlessTerminalRows(
  terminal: Terminal,
  limit?: number,
  options?: TerminalGridReadOptions
): HeadlessTerminalRow[] {
  if (options?.clipToGrid && limit === undefined) {
    return readHeadlessTerminalGridRows(terminal)
  }
  const { buffer, start, end } = terminalRowRange(terminal, limit)
  const rows: HeadlessTerminalRow[] = []
  for (let row = start; row < end; row += 1) {
    const line = buffer.getLine(row)
    const text = line?.translateToString(true) ?? ''
    rows.push({
      text,
      metadata: {
        wrapped: line?.isWrapped ?? false,
        trailingSpaces: buffer.getLine(row + 1)?.isWrapped
          ? (line?.translateToString(false).length ?? text.length) - text.length
          : 0
      }
    })
  }
  return rows
}

function readHeadlessTerminalGridRows(terminal: Terminal): HeadlessTerminalRow[] {
  const { buffer, start, end } = terminalRowRange(terminal)
  const rows: HeadlessTerminalRow[] = []
  let reusableCell: ReturnType<typeof buffer.getNullCell> | undefined
  for (let row = start; row < end; row += 1) {
    const line = buffer.getLine(row)
    const clipped =
      line && line.length > terminal.cols
        ? getClippedTerminalLineColumns(
            line,
            terminal.cols,
            (reusableCell ??= buffer.getNullCell())
          )
        : undefined
    const text =
      line && clipped
        ? translateClippedTerminalLine(line, clipped, true, reusableCell)
        : (line?.translateToString(true) ?? '')
    const trailingSpaces = buffer.getLine(row + 1)?.isWrapped
      ? (line && clipped
          ? translateClippedTerminalLine(line, clipped, false, reusableCell).length
          : (line?.translateToString(false).length ?? text.length)) - text.length
      : 0
    rows.push({
      text,
      metadata: {
        wrapped: line?.isWrapped ?? false,
        trailingSpaces
      }
    })
  }
  return rows
}
