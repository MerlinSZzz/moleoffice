// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Compare hashes with readable container files and process environments. For a file, candidates are maximal UTF-8
 * strings separated by whitespace, quotes, equals signs, colons, commas, semicolons or JSON brackets; each environment
 * value is also a candidate whole. A key split by a delimiter, escaped, encoded (for example base64), or hidden in an
 * unreadable file cannot be found. The scan does not read /proc, /sys or /dev as files; it reads process environments
 * separately. Input is a JSON array of full sha256 hashes, never keys.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const digest = (value) => createHash('sha256').update(value).digest('hex')
const inaccessible = (error) => ['EACCES', 'EPERM', 'ENOENT', 'ESRCH', 'ENOTDIR'].includes(error?.code)
const parts = (text) => text.split(/[\s"'`=:,;{}[\]]+/u).filter(Boolean)
const arg = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1] }

try {
  const root = resolve(arg('--root', '/'))
  const proc = resolve(arg('--proc', '/proc'))
  const hashes = JSON.parse(readFileSync(0, 'utf8'))
  if (!Array.isArray(hashes) || !hashes.every((one) => typeof one === 'string' && /^[a-f0-9]{64}$/.test(one))) throw new Error('bad hashes')
  const wanted = new Set(hashes)
  let found = false
  const report = (where, candidates) => {
    const matched = new Set()
    for (const value of candidates) {
      const hash = digest(value)
      if (wanted.has(hash)) matched.add(hash)
    }
    for (const hash of matched) { process.stdout.write(`${where} sha256:${hash.slice(0, 12)}\n`); found = true }
  }
  // Reading /proc itself is required; a process can disappear or be unreadable while the scan is running.
  for (const pid of readdirSync(proc).filter((name) => /^\d+$/.test(name))) {
    let env
    try { env = readFileSync(join(proc, pid, 'environ'), 'utf8') } catch (error) { if (inaccessible(error)) continue; throw error }
    for (const entry of env.split('\0')) {
      const at = entry.indexOf('=')
      if (at < 1) continue
      const name = entry.slice(0, at), value = entry.slice(at + 1)
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue
      report(`pid ${pid} env ${name}`, [value, ...parts(value)])
    }
  }
  const excluded = ['/proc', '/sys', '/dev']
  const outside = (path) => excluded.some((one) => path === one || path.startsWith(`${one}${sep}`))
  const seen = new Set()
  function visit(path) {
    let real, info
    try { real = realpathSync(path); if (outside(real)) return; info = lstatSync(path); if (info.isSymbolicLink()) info = statSync(path) }
    catch (error) { if (inaccessible(error)) return; throw error }
    if (info.isDirectory()) {
      if (seen.has(real)) return
      seen.add(real)
      let entries
      try { entries = readdirSync(path) } catch (error) { if (inaccessible(error)) return; throw error }
      for (const entry of entries) visit(join(path, entry))
    } else if (info.isFile()) {
      let text
      try { text = readFileSync(path, 'utf8') } catch (error) { if (inaccessible(error)) return; throw error }
      report(path, parts(text))
    }
  }
  // A missing root is not a clean scan.
  if (!statSync(root).isDirectory()) throw new Error('bad root')
  visit(root)
  process.exitCode = found ? 1 : 0
} catch {
  process.stderr.write('The scan could not be completed.\n')
  process.exitCode = 2
}
