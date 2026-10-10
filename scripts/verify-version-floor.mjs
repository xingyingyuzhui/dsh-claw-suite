#!/usr/bin/env node
/**
 * Version floor for Claw 0.3.0 on DSH 0.2.0:
 * - Acceptable peer values: `^0.2.0-rc.1` OR exact `0.2.0-rc.1` / `0.2.0-rc.2`
 * - dsh-claw-core MUST declare exactly `^0.2.0-rc.1`
 * - Other runtime packages fail until they declare an accepted peer
 */
import { pathToFileURL } from 'node:url'
import { listRuntimePackages, SUITE_ROOT } from '../contract/package-shape.mjs'

export const REQUIRED_PEER = '^0.2.0-rc.1'
export const PEER_NAME = '@deepseek-ai/dsh'

const ACCEPTED_PEERS = new Set([REQUIRED_PEER, '0.2.0-rc.1', '0.2.0-rc.2'])

export function isAcceptedPeer(value) {
  return typeof value === 'string' && ACCEPTED_PEERS.has(value)
}

export function collectVersionFloorViolations(suiteRoot = SUITE_ROOT) {
  const hits = []
  for (const { name, pkg } of listRuntimePackages(suiteRoot)) {
    const peers = pkg.peerDependencies || {}
    const value = peers[PEER_NAME]
    if (name === 'dsh-claw-core') {
      if (value !== REQUIRED_PEER) {
        hits.push({ package: name, issue: 'core-peer-mismatch', value: value || null })
      }
      continue
    }
    if (value == null) {
      hits.push({ package: name, issue: 'missing-peer', value: null })
    } else if (!isAcceptedPeer(value)) {
      hits.push({ package: name, issue: 'peer-mismatch', value })
    }
  }
  return hits
}

function main() {
  const hits = collectVersionFloorViolations()
  if (hits.length === 0) {
    console.log(
      `verify-version-floor: OK (core === ${REQUIRED_PEER}; others in {${[...ACCEPTED_PEERS].join(', ')}})`,
    )
    process.exit(0)
  }
  console.error(`verify-version-floor: FAIL (${hits.length} package(s))`)
  for (const h of hits) {
    console.error(`  ${h.package}: ${h.issue} (got ${h.value === null ? '<missing>' : JSON.stringify(h.value)})`)
  }
  process.exit(1)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
