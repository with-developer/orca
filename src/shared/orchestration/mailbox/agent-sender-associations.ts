/** Where a sender a card saved runs now: derived display data, never a structured-worker
 *  credential pane. */
export type AgentSenderAssociation = {
  /** The terminal handle, `dispatch:<id>` or `orca_session_id:<id>` a saved sender carries. */
  identity: string
  paneKey: string
  worktreeId: string
  sessionId?: string
  /** The addressed Dispatch still has its own proved live invocation. Transient display only. */
  dispatchActor?: true
}
/** Which host publication a delivery was cut from: the publishing runtime's epoch and the content
 *  revision the whole host, or one worktree's scope, last changed at. In memory only. */
export type AgentSenderRevision = { epoch: string; revision: number }
export type AgentSenderPublication = {
  associations: readonly AgentSenderAssociation[]
  peerFingerprint?: string
  /** This host's principal as each paired execution peer authenticates it; one per peer. */
  principals: readonly { peerFingerprint: string; homePeerFingerprint: string }[]
  attachments: readonly (AgentSenderAssociation & { homePeerFingerprint: string })[]
  /** Every publishing host stamps one; hosts that predate publications send no field at all. */
  revision: AgentSenderRevision
}

/** Incremental worktree-scope updates from a known base revision within the same epoch when
 *  host-wide principals and peerFingerprint did not change. */
export type AgentSenderDelta = {
  baseRevision: AgentSenderRevision
  revision: AgentSenderRevision
  scopes: readonly (readonly [worktreeId: string, publication: AgentSenderPublication])[]
}

export type AgentSenderContent = Omit<AgentSenderPublication, 'revision'>

function sameAssociation(a: AgentSenderAssociation, b: AgentSenderAssociation): boolean {
  return (
    a === b ||
    (a.identity === b.identity &&
      a.paneKey === b.paneKey &&
      a.worktreeId === b.worktreeId &&
      a.sessionId === b.sessionId &&
      a.dispatchActor === b.dispatchActor)
  )
}

function sameAttachment(
  a: AgentSenderAssociation & { homePeerFingerprint: string },
  b: AgentSenderAssociation & { homePeerFingerprint: string }
): boolean {
  return a === b || (a.homePeerFingerprint === b.homePeerFingerprint && sameAssociation(a, b))
}

/** Host-wide fields shared by every worktree scope on a publication. */
export function sameAgentSenderHostFields(a: AgentSenderContent, b: AgentSenderContent): boolean {
  if (a.peerFingerprint !== b.peerFingerprint) {
    return false
  }
  if (a.principals === b.principals) {
    return true
  }
  if (a.principals.length !== b.principals.length) {
    return false
  }
  for (let i = 0; i < a.principals.length; i++) {
    const left = a.principals[i]
    const right = b.principals[i]
    if (
      left !== right &&
      (left.peerFingerprint !== right.peerFingerprint ||
        left.homePeerFingerprint !== right.homePeerFingerprint)
    ) {
      return false
    }
  }
  return true
}

/** Structural field-by-field comparison without JSON.stringify allocations; revision never counts. */
export function sameAgentSenderContent(a: AgentSenderContent, b: AgentSenderContent): boolean {
  if (a === b) {
    return true
  }
  if (
    a.associations.length !== b.associations.length ||
    a.attachments.length !== b.attachments.length ||
    !sameAgentSenderHostFields(a, b)
  ) {
    return false
  }
  if (a.associations !== b.associations) {
    for (let i = 0; i < a.associations.length; i++) {
      if (!sameAssociation(a.associations[i], b.associations[i])) {
        return false
      }
    }
  }
  if (a.attachments !== b.attachments) {
    for (let i = 0; i < a.attachments.length; i++) {
      if (!sameAttachment(a.attachments[i], b.attachments[i])) {
        return false
      }
    }
  }
  return true
}
