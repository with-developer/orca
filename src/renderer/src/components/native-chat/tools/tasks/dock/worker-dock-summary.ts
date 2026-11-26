import type { Translate } from '@/i18n/use-translate'
import { workerDockWorkerCount } from './worker-dock-labels'
import type { WorkerDockRowView } from './WorkerDockRow'

export function workerDockSummary(
  identities: readonly { id: string; state: WorkerDockRowView['state']; kind?: string }[],
  rows: ReadonlyMap<string, WorkerDockRowView>,
  t: Translate
) {
  let failures = 0
  let needsYou = 0
  let running = 0
  const kinds = new Map<string, number>()
  for (const row of identities) {
    const kind = row.kind ?? rows.get(row.id)?.kind ?? 'worker'
    kinds.set(kind, (kinds.get(kind) ?? 0) + 1)
    if (row.state === 'failed' || row.state === 'unexpected') {
      failures++
    } else if (row.state === 'needs-you') {
      needsYou++
    } else if (row.state === 'running' || row.state === 'starting' || row.state === 'stopping') {
      running++
    }
  }
  const total = identities.length
  // One count for everything listed: workers, subagents and background tasks alike.
  const countLabel = total ? workerDockWorkerCount(t, total) : ''
  const status = failures
    ? t('components.native-chat.workerDock.failedCount', '{{count}} failed', { count: failures })
    : needsYou
      ? t('components.native-chat.workerDock.needsYouCount', '{{count}} needs you', {
          count: needsYou
        })
      : running
        ? t('components.native-chat.workerDock.runningCount', '{{count}} running', {
            count: running
          })
        : ''
  return {
    failures,
    needsYou,
    running,
    mixed: kinds.size > 1,
    total,
    label: countLabel,
    count: [countLabel, status].filter(Boolean).join(' · ')
  }
}

/** The chip's text, never empty: the one worker's title, "1 needs you · 4 workers", "3 running",
 *  "3 workers", or the empty copy with no rows. A held roster can outlive its live count by a
 *  gesture, so it then counts its own rows. */
export function workerDockChipLabel(
  t: Translate,
  {
    summary,
    rows,
    empty,
    single
  }: {
    summary: { total: number; failures: number; needsYou: number; running: number; label: string }
    rows: number
    empty: string | null
    /** The title of the only worker, when there is exactly one. */
    single: string | null
  }
): string {
  if (empty !== null) {
    return empty
  }
  if (single !== null && (summary.total || rows) === 1) {
    return single
  }
  if (!summary.total) {
    return workerDockWorkerCount(t, rows)
  }
  const attention = summary.failures + summary.needsYou
  if (attention) {
    return [
      t('components.native-chat.workerDock.needsYouCount', '{{count}} needs you', {
        count: attention
      }),
      summary.label
    ].join(' · ')
  }
  return summary.running
    ? t('components.native-chat.workerDock.runningCount', '{{count}} running', {
        count: summary.running
      })
    : summary.label
}
