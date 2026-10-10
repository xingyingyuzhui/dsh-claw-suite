#!/usr/bin/env node
/**
 * Scan suite component sources for forbidden RC2 APIs.
 * Exit 1 when any forbidden pattern remains (M0 gate — red until fixed).
 */
import { existsSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CLIENT_FORBIDDEN_PATTERNS } from '../contract/v02-client-contract.mjs'
import { HOST_FORBIDDEN_PATTERNS } from '../contract/v02-host-contract.mjs'
import { SUBAGENT_FORBIDDEN_PATTERNS } from '../contract/v02-subagent-contract.mjs'
import { listRuntimePackages, walkSourceFiles, SUITE_ROOT } from '../contract/package-shape.mjs'

const PATTERNS = [
  ...CLIENT_FORBIDDEN_PATTERNS,
  ...HOST_FORBIDDEN_PATTERNS,
  ...SUBAGENT_FORBIDDEN_PATTERNS,
]

export function scanForbiddenApis(suiteRoot = SUITE_ROOT) {
  const hits = []
  const seen = new Set()
  for (const { name, dir } of listRuntimePackages(suiteRoot)) {
    if (name === 'dsh-claw-core') continue
    for (const file of walkSourceFiles(dir, { includeTests: false })) {
      const src = readFileSync(file, 'utf8')
      const lines = src.split('\n')
      for (const { id, re } of PATTERNS) {
        const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`)
        let m
        while ((m = global.exec(src))) {
          const line = src.slice(0, m.index).split('\n').length
          const key = `${relative(suiteRoot, file)}:${line}:${id}`
          if (seen.has(key)) continue
          seen.add(key)
          const text = lines[line - 1] || ''
          hits.push({
            package: name,
            file: relative(suiteRoot, file),
            line,
            id,
            match: m[0],
            text: text.trim().slice(0, 160),
          })
        }
      }
    }
  }
  return hits
}

/** Cordis context members that are not services and need no `inject` entry. */
const CTX_BUILTINS = new Set(['get', 'set', 'effect', 'on', 'off', 'emit', 'plugin', 'provide', 'inject', 'scope', 'root', 'runtime'])

/**
 * A Client touching `ctx.X` or `ctx.remote.Y` without declaring `X` / `remote.Y` in `inject`
 * throws at runtime ("cannot get property ... without inject"); fake-ctx unit tests never see it.
 */
export function scanClientInjects(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, dir } of listRuntimePackages(suiteRoot)) {
    const file = join(dir, 'client.js')
    if (!existsSync(file)) continue
    const src = readFileSync(file, 'utf8')
    const decl = src.match(/inject = \[([^\]]*)\]/)
    const injected = new Set(decl ? [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [])
    const used = new Set()
    for (const m of src.matchAll(/\bctx\.([A-Za-z_]\w*)(?:\.([A-Za-z_]\w*))?/g)) {
      if (CTX_BUILTINS.has(m[1])) continue
      used.add(m[1])
      if (m[1] === 'remote' && m[2]) used.add(`remote.${m[2]}`)
    }
    for (const id of [...used].sort()) {
      if (injected.has(id)) continue
      hits.push({ package: name, file: relative(suiteRoot, file), line: 0, id: 'client.inject', match: id, text: `ctx.${id} used but not in inject` })
    }
  }
  return hits
}

function main() {
  const hits = [...scanForbiddenApis(), ...scanClientInjects()]
  if (hits.length === 0) {
    console.log('verify-rc2-contract: OK (no forbidden APIs, client injects complete)')
    process.exit(0)
  }
  console.error(`verify-rc2-contract: FAIL (${hits.length} violation(s))`)
  const byId = new Map()
  for (const h of hits) {
    byId.set(h.id, (byId.get(h.id) || 0) + 1)
    console.error(`  ${h.file}:${h.line}  [${h.id}]  ${h.text}`)
  }
  console.error('\nBy id:')
  for (const [id, n] of [...byId.entries()].sort()) {
    console.error(`  ${id}: ${n}`)
  }
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
