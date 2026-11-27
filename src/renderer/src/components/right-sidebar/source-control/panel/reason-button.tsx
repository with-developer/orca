import React, { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type ReasonButtonProps = Omit<React.ComponentProps<typeof Button>, 'disabled' | 'onClick'> & {
  unavailable: boolean
  reason: string | null
  /** Keeps the reason tooltip open, e.g. while a destructive press waits for its confirm. */
  reasonPinned?: boolean
  onPress: () => void
}

/**
 * aria-disabled, not disabled: an unavailable button keeps focus and hover, so its tooltip can say
 * why, and a button that turns busy or available while focused keeps focus. Every state renders the
 * same node, so React never remounts it under the keyboard.
 */
export function ReasonButton({
  unavailable,
  reason,
  reasonPinned = false,
  onPress,
  children,
  ...buttonProps
}: ReasonButtonProps): React.JSX.Element {
  const reasonId = useId()
  const [hovered, setHovered] = useState(false)
  return (
    <>
      <Tooltip open={Boolean(reason) && (reasonPinned || hovered)} onOpenChange={setHovered}>
        <TooltipTrigger asChild>
          <Button
            {...buttonProps}
            type="button"
            aria-disabled={unavailable || undefined}
            aria-describedby={reason ? reasonId : undefined}
            style={unavailable ? { cursor: 'default' } : undefined}
            onClick={(event) => {
              if (unavailable) {
                event.preventDefault()
                return
              }
              onPress()
            }}
          >
            {children}
          </Button>
        </TooltipTrigger>
        {reason ? (
          <TooltipContent side="top" sideOffset={4}>
            {reason}
          </TooltipContent>
        ) : null}
      </Tooltip>
      {/* Always in the DOM while there is a reason: the tooltip body only exists while it is open. */}
      {reason ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
    </>
  )
}
