/** 0.2.0 host API allowlist / denylist (dsh-v0.2.0-rc.2 @ 639ed015). */

export const HOST_ALLOW = Object.freeze({
  agents: Object.freeze(['list']),
  tools: Object.freeze(['guard']),
  events: Object.freeze(['tools/pre-execute', 'tools/execute', 'agent/created']),
  connection: Object.freeze(['fetch.register']),
})

export const HOST_FORBID = Object.freeze(['agents.values'])

export const HOST_FORBIDDEN_PATTERNS = Object.freeze([
  { id: 'agents.values', re: /\bagents\.values\b/ },
])

export function assertHostAllowlist(ctx = {}) {
  const missing = []
  if (ctx.agents && typeof ctx.agents.list !== 'function') missing.push('agents.list')
  if (ctx.tools && typeof ctx.tools.guard !== 'function') missing.push('tools.guard')
  return missing
}

export function assertNoForbiddenHostApis(ctx = {}) {
  const hits = []
  if (ctx.agents && typeof ctx.agents.values === 'function') hits.push('agents.values')
  return hits
}
