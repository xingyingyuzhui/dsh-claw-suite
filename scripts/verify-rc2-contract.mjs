#!/usr/bin/env node
/**
 * Scan suite component sources for forbidden RC2 APIs.
 * Exit 1 when any forbidden pattern remains (M0 gate — red until fixed).
 */
import { readFileSync } from 'node:fs'
import { relative } from 'node:path'
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

function main() {
  const hits = scanForbiddenApis()
  if (hits.length === 0) {
    console.log('verify-rc2-contract: OK (no forbidden APIs)')
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
