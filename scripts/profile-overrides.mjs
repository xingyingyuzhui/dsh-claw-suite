/**
 * Minimal editor for the top-level `overrides:` mapping in a profile's pnpm-workspace.yaml.
 *
 * The profile manifest must keep exact semver pins, so a suite installed from local tarballs is
 * redirected through a pnpm override; otherwise any later `pnpm install` in the profile would
 * fetch the pinned version from the npm registry and fail. DSH edits this file as a YAML
 * document and keeps unknown keys, so only the block-style `overrides:` mapping is touched here.
 */

const TOP_KEY = /^overrides:\s*(#.*)?$/
const TOP_KEY_INLINE = /^overrides:\s*\S/

function splitLines(text) {
  const lines = String(text ?? '').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines
}

function joinLines(lines) {
  return lines.length === 0 ? '' : `${lines.join('\n')}\n`
}

function entryKey(line) {
  const match = line.match(/^\s+(?:"([^"]+)"|'([^']+)'|([^\s:#][^:#]*?))\s*:/)
  return match ? (match[1] ?? match[2] ?? match[3]) : undefined
}

/** @returns {{ start: number, end: number } | undefined} header index and exclusive end of the block */
function findBlock(lines) {
  const start = lines.findIndex((line) => TOP_KEY.test(line))
  if (start < 0) {
    if (lines.some((line) => TOP_KEY_INLINE.test(line))) {
      throw new Error('pnpm-workspace.yaml: inline `overrides:` is not supported; rewrite it as a block mapping')
    }
    return undefined
  }
  let end = start + 1
  while (end < lines.length && (lines[end].trim() === '' || /^\s/.test(lines[end]))) end += 1
  while (end > start + 1 && lines[end - 1].trim() === '') end -= 1
  return { start, end }
}

/**
 * @param {string} text current pnpm-workspace.yaml contents
 * @param {string} name package name
 * @param {string} spec override target, e.g. `file:/abs/pkg.tgz`
 */
export function setOverride(text, name, spec) {
  const lines = splitLines(text)
  const entry = `  ${name}: ${JSON.stringify(spec)}`
  const block = findBlock(lines)
  if (!block) return joinLines([...lines, 'overrides:', entry])
  for (let i = block.start + 1; i < block.end; i += 1) {
    if (entryKey(lines[i]) === name) {
      lines[i] = entry
      return joinLines(lines)
    }
  }
  lines.splice(block.end, 0, entry)
  return joinLines(lines)
}

/**
 * @param {string} text current pnpm-workspace.yaml contents
 * @param {(name: string) => boolean} shouldRemove
 */
export function removeOverrides(text, shouldRemove) {
  const lines = splitLines(text)
  const block = findBlock(lines)
  if (!block) return joinLines(lines)
  const kept = []
  for (let i = block.start + 1; i < block.end; i += 1) {
    const key = entryKey(lines[i])
    if (key === undefined || !shouldRemove(key)) kept.push(lines[i])
  }
  const hasEntries = kept.some((line) => entryKey(line) !== undefined)
  const replacement = hasEntries ? [lines[block.start], ...kept] : []
  lines.splice(block.start, block.end - block.start, ...replacement)
  return joinLines(lines)
}

/** @returns {Record<string, string>} */
export function readOverrides(text) {
  const lines = splitLines(text)
  const block = findBlock(lines)
  const out = {}
  if (!block) return out
  for (let i = block.start + 1; i < block.end; i += 1) {
    const key = entryKey(lines[i])
    if (key === undefined) continue
    const raw = lines[i].slice(lines[i].indexOf(':') + 1).trim()
    out[key] = raw.startsWith('"') ? JSON.parse(raw) : raw.replace(/^'(.*)'$/, '$1')
  }
  return out
}
