import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { scanForbiddenApis } from '../../scripts/verify-rc2-contract.mjs'
import { CLIENT_FORBID } from '../v02-client-contract.mjs'
import { HOST_FORBID } from '../v02-host-contract.mjs'
import { SUBAGENT_FORBID } from '../v02-subagent-contract.mjs'
import { REQUIRED_SLOT_IDS } from '../v02-slots-contract.mjs'

test('contract allow/forbid tables are frozen', () => {
  assert.ok(CLIENT_FORBID.includes('connection.api'))
  assert.ok(HOST_FORBID.includes('agents.values'))
  assert.ok(SUBAGENT_FORBID.includes('reportFrom'))
  assert.ok(REQUIRED_SLOT_IDS.includes('sidebar.panellist'))
  assert.ok(REQUIRED_SLOT_IDS.includes('settings.section'))
})

test('suite sources contain no forbidden 0.2 APIs', () => {
  const hits = scanForbiddenApis()
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} [${h.id}]`), [])
})

test('scanner still detects forbidden APIs in component sources', () => {
  const root = mkdtempSync(join(tmpdir(), 'claw-scan-'))
  try {
    const dir = join(root, 'dsh-claw-registry')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'dsh-claw-registry' }))
    writeFileSync(join(dir, 'host.js'), [
      'ctx.agents.values()',
      'ctx.sessions.get(id)',
      'ctx.sessions.open(id)',
      'ctx.workspaces.startSession(ws)',
      'ctx.subagents.reportFrom(x)',
    ].join('\n'))
    const found = new Set(scanForbiddenApis(root).map((h) => h.id))
    for (const id of ['agents.values', 'sessions.get', 'sessions.open', 'workspaces.startSession', 'subagents.reportFrom']) {
      assert.ok(found.has(id), `scanner missed ${id}`)
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
