import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { bumpManifest, bumpSuite } from '../../scripts/bump-version.mjs'

test('bumpManifest pins suite packages exactly and leaves third-party specs alone', () => {
  const next = bumpManifest({
    name: 'dsh-claw-registry',
    version: '0.3.0-rc.1',
    dependencies: { 'dsh-claw-core': '0.3.0-rc.1', 'js-yaml': '^4.1.0' },
    peerDependencies: { '@deepseek-ai/dsh': '^0.2.0-rc.1' },
  }, '0.3.0')
  assert.equal(next.version, '0.3.0')
  assert.deepEqual(next.dependencies, { 'dsh-claw-core': '0.3.0', 'js-yaml': '^4.1.0' })
  assert.deepEqual(next.peerDependencies, { '@deepseek-ai/dsh': '^0.2.0-rc.1' })
})

test('bumpSuite rewrites components and the collection-root meta package', () => {
  const root = mkdtempSync(join(tmpdir(), 'claw-bump-'))
  try {
    writeFileSync(join(root, 'package.json'), JSON.stringify({
      name: 'dsh-claw-suite',
      version: '0.3.0-rc.1',
      dependencies: { 'dsh-claw-core': '0.3.0-rc.1' },
    }))
    mkdirSync(join(root, 'plugins', 'dsh-claw-core'), { recursive: true })
    writeFileSync(join(root, 'plugins', 'dsh-claw-core', 'package.json'), JSON.stringify({ name: 'dsh-claw-core', version: '0.3.0-rc.1' }))
    const changed = bumpSuite('0.3.0-rc.2', { suiteRoot: root })
    assert.equal(changed.length, 2)
    const meta = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
    assert.equal(meta.version, '0.3.0-rc.2')
    assert.equal(meta.dependencies['dsh-claw-core'], '0.3.0-rc.2')
    assert.deepEqual(bumpSuite('0.3.0-rc.2', { suiteRoot: root }), [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('bumpSuite rejects non-semver input', () => {
  assert.throws(() => bumpSuite('v0.3.0'), /not a semver/)
})
