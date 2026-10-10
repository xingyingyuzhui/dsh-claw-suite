/** 0.2.0 subagent API allowlist / denylist (dsh-v0.2.0-rc.2 @ 639ed015). */

export const SUBAGENT_ALLOW = Object.freeze(['start', 'startContinuable', 'sendMessage'])

export const SUBAGENT_FORBID = Object.freeze(['reportFrom'])

export const SUBAGENT_FORBIDDEN_PATTERNS = Object.freeze([
  { id: 'subagents.reportFrom', re: /\breportFrom\b/ },
])

export function assertSubagentAllowlist(subagents = {}) {
  const missing = []
  for (const name of SUBAGENT_ALLOW) {
    if (typeof subagents[name] !== 'function') missing.push(name)
  }
  return missing
}

export function assertNoForbiddenSubagentApis(subagents = {}) {
  const hits = []
  if (typeof subagents.reportFrom === 'function') hits.push('reportFrom')
  return hits
}
