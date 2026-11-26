import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'

/** Stop all, for a provider that can only stop everything at once: in the open panel's header. */
export function WorkerDockStopAll({
  stopAll
}: {
  stopAll?: { pending: boolean; onStop: () => void }
}) {
  const t = useTranslate()
  return stopAll ? (
    <Button
      variant="ghost"
      size="xs"
      aria-disabled={stopAll.pending}
      onClick={() => {
        if (!stopAll.pending) {
          stopAll.onStop()
        }
      }}
    >
      {stopAll.pending
        ? t('components.native-chat.workerDock.stopping', 'Stopping…')
        : t('components.native-chat.workerDock.stopAll', 'Stop all')}
    </Button>
  ) : null
}

/** The open chip's bulk action, drawn only when it applies: Clear failed once two or more failures
 *  can be acknowledged. */
export function WorkerDockClearFailed({
  clearable,
  clearing,
  onClearAll
}: {
  clearable: number
  clearing: boolean
  onClearAll: () => void
}) {
  const t = useTranslate()
  if (clearable < 2) {
    return null
  }
  return (
    <Button
      variant="ghost"
      size="xs"
      aria-label={t(
        'components.native-chat.workerDock.clearAllLabel',
        'Clear all {{count}} failed workers',
        { count: clearable, defaultValue_one: 'Clear failed worker' }
      )}
      aria-disabled={clearing}
      onClick={() => {
        if (!clearing) {
          onClearAll()
        }
      }}
    >
      {t('components.native-chat.workerDock.clearFailed', 'Clear failed')}
    </Button>
  )
}

/** The open chip's actions beside its label: Clear failed, then Stop all, each only when it applies. */
export function WorkerDockHeadActions({
  stopAll,
  ...clear
}: {
  clearable: number
  clearing: boolean
  onClearAll: () => void
  stopAll?: { pending: boolean; onStop: () => void }
}) {
  return (
    <>
      <WorkerDockClearFailed {...clear} />
      <WorkerDockStopAll stopAll={stopAll} />
    </>
  )
}
