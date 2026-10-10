import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readOverrides, removeOverrides, setOverride } from '../../scripts/profile-overrides.mjs'

const DSH_WORKSPACE = `packages:
  - .

nodeLinker: hoisted
autoInstallPeers: false
strictDepBuilds: true
allowBuilds:
  node-pty: true
  '@google/genai': false
`

test('setOverride appends a block without touching DSH-managed keys', () => {
  const out = setOverride(DSH_WORKSPACE, 'dsh-claw-suite', 'file:/p/a.tgz')
  assert.ok(out.startsWith(DSH_WORKSPACE))
  assert.ok(out.endsWith('overrides:\n  dsh-claw-suite: "file:/p/a.tgz"\n'))
  assert.deepEqual(readOverrides(out), { 'dsh-claw-suite': 'file:/p/a.tgz' })
})

test('setOverride replaces an existing entry and keeps foreign ones', () => {
  const start = `${DSH_WORKSPACE}overrides:\n  lodash: 4.17.21\n  dsh-claw-suite: "file:/old.tgz"\n`
  const out = setOverride(start, 'dsh-claw-suite', 'file:/new.tgz')
  assert.deepEqual(readOverrides(out), { lodash: '4.17.21', 'dsh-claw-suite': 'file:/new.tgz' })
  assert.equal(out.match(/^overrides:/gm).length, 1)
})

test('setOverride inserts into a block that is followed by other keys', () => {
  const start = 'overrides:\n  lodash: 4.17.21\n\nallowBuilds:\n  koffi: true\n'
  const out = setOverride(start, 'dsh-claw-suite', 'file:/x.tgz')
  assert.deepEqual(readOverrides(out), { lodash: '4.17.21', 'dsh-claw-suite': 'file:/x.tgz' })
  assert.match(out, /allowBuilds:\n {2}koffi: true\n$/)
})

test('removeOverrides drops claw entries and the empty header', () => {
  const start = setOverride(DSH_WORKSPACE, 'dsh-claw-suite', 'file:/a.tgz')
  assert.equal(removeOverrides(start, (name) => name.startsWith('dsh-claw-')), DSH_WORKSPACE)
})

test('removeOverrides keeps the header while foreign entries remain', () => {
  const start = 'overrides:\n  lodash: 4.17.21\n  dsh-claw-suite: "file:/a.tgz"\n'
  assert.equal(removeOverrides(start, (name) => name === 'dsh-claw-suite'), 'overrides:\n  lodash: 4.17.21\n')
})

test('inline overrides mapping is refused rather than corrupted', () => {
  assert.throws(() => setOverride('overrides: { a: "1" }\n', 'dsh-claw-suite', 'file:/a.tgz'), /inline/)
})

test('empty or missing file yields just the override block', () => {
  assert.equal(setOverride('', 'dsh-claw-suite', 'file:/a.tgz'), 'overrides:\n  dsh-claw-suite: "file:/a.tgz"\n')
})
