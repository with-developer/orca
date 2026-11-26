import type { NativeChatToolRunDrawnRow } from '../../runs/use-native-chat-tool-run-window'
import { WorkerDockRow, type WorkerDockRowView } from './WorkerDockRow'

// Rows rise in 22ms apart once the open shape is ~20% grown; later rows share the last delay.
const rowDelay = (drawnIndex: number) =>
  `calc(var(--worker-dock-morph-ms) * 0.2 + ${Math.min(drawnIndex, 10) * 22}ms)`

/** The open list's drawn rows: every row for a small roster, else the virtual window. */
export function WorkerDockRowSlots({
  drawn,
  ids,
  small,
  totalSize,
  measureRow,
  rows,
  mixed,
  visible,
  pending,
  onOpen,
  onAction
}: {
  drawn: readonly NativeChatToolRunDrawnRow[]
  ids: readonly string[]
  small: boolean
  totalSize: number
  measureRow: (node: HTMLDivElement | null) => void
  rows: ReadonlyMap<string, WorkerDockRowView>
  mixed: boolean
  visible: boolean
  pending: ReadonlySet<string>
  onOpen: (row: WorkerDockRowView, opener: HTMLElement) => void
  onAction: (row: WorkerDockRowView, action: 'stop' | 'clear') => void
}) {
  return (
    <div style={{ height: small ? 'auto' : totalSize, position: 'relative' }}>
      {drawn.map((item, drawnIndex) => {
        const id = ids[item.index]
        const row = rows.get(id)
        return (
          <div
            key={id}
            data-index={item.index}
            ref={small ? undefined : measureRow}
            style={{
              position: small ? 'relative' : 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: small ? undefined : `translateY(${item.start}px)`
            }}
          >
            <div data-worker-dock-morph-row="" style={{ animationDelay: rowDelay(drawnIndex) }}>
              {/* One component either way, so focus on a loading row survives its details arriving. */}
              <WorkerDockRow
                id={id}
                row={row}
                mixed={mixed}
                visible={visible}
                pending={row ? pending.has(row.id) : false}
                onOpen={onOpen}
                onAction={onAction}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
