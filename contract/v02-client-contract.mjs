/**
 * 0.2.0 client API allowlist / denylist (dsh-v0.2.0-rc.2 @ 639ed015).
 *
 * Notes from 0.2.0 API audit (Claw seams still valid):
 * - `sessions.fork` may take optional `onCreated`.
 * - `uiWorkspace.forkSession` is allowed when present; returns `Promise<SessionId>`.
 *   It is optional in assertClientAllowlist (not required for Hosts that omit it).
 */

export const CLIENT_ALLOW = Object.freeze({
  sessions: Object.freeze(['create', 'fork', 'binding', 'list', 'refresh']),
  remoteSession: Object.freeze(['create', 'selectModel']),
  uiWorkspace: Object.freeze(['openSession', 'startSession', 'archiveSession', 'unarchiveSession']),
})

/** Optional allowlist: present ⇒ must be a function; absence is OK. */
export const CLIENT_ALLOW_OPTIONAL = Object.freeze({
  uiWorkspace: Object.freeze(['forkSession']),
})

export const CLIENT_FORBID = Object.freeze([
  'connection.api',
  'sessions.open',
  'sessions.get',
  'workspaces.startSession',
])

/** Patterns scanned in suite source (word-ish, avoid matching allowlisted neighbors). */
export const CLIENT_FORBIDDEN_PATTERNS = Object.freeze([
  { id: 'connection.api', re: /\bconnection\.api\b/ },
  { id: 'sessions.open', re: /\bsessions\.open\b/ },
  { id: 'sessions.get', re: /\bsessions\.get\b/ },
  { id: 'workspaces.startSession', re: /\bworkspaces\.startSession\b/ },
])

export function assertClientAllowlist(api = {}) {
  const missing = []
  for (const name of CLIENT_ALLOW.sessions) {
    if (api.sessions && typeof api.sessions[name] !== 'function') missing.push(`sessions.${name}`)
  }
  for (const name of CLIENT_ALLOW.remoteSession) {
    const remote = api.remote && api.remote.session
    if (remote && typeof remote[name] !== 'function') missing.push(`remote.session.${name}`)
  }
  for (const name of CLIENT_ALLOW.uiWorkspace) {
    if (api.uiWorkspace && typeof api.uiWorkspace[name] !== 'function') missing.push(`uiWorkspace.${name}`)
  }
  // Optional: if present must be a function (forkSession → Promise<SessionId>).
  for (const name of CLIENT_ALLOW_OPTIONAL.uiWorkspace) {
    if (
      api.uiWorkspace &&
      api.uiWorkspace[name] != null &&
      typeof api.uiWorkspace[name] !== 'function'
    ) {
      missing.push(`uiWorkspace.${name}`)
    }
  }
  return missing
}

export function assertNoForbiddenClientApis(api = {}) {
  const hits = []
  if (api.connection && api.connection.api != null) hits.push('connection.api')
  if (api.sessions && typeof api.sessions.open === 'function') hits.push('sessions.open')
  if (api.sessions && typeof api.sessions.get === 'function') hits.push('sessions.get')
  if (api.workspaces && typeof api.workspaces.startSession === 'function') hits.push('workspaces.startSession')
  return hits
}
