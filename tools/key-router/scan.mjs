#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Host half of the sandbox scan. Example:
 * node tools/key-router/scan.mjs --slots /path/key-slots.json --secrets /path/secrets.env --container NAME
 * Only full sha256 hashes are passed to the container, on docker's stdin. Docker's env-file format treats everything
 * following the first equals sign literally, including quotes. The inside scan prints only a location and a short mark.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { THE_API_KEY_NAMES, readTheKeySlots } from '../../src/config/provider-router.mjs'

try {
  const arg = (name) => { const i = process.argv.indexOf(name); if (i < 0 || !process.argv[i + 1]) throw new Error('missing argument'); return process.argv[i + 1] }
  const slots = readTheKeySlots(arg('--slots'))
  const text = readFileSync(arg('--secrets'), 'utf8')
  const values = slots.map((slot) => slot.key)
  for (const line of text.split('\n')) {
    const at = line.indexOf('=')
    if (at > 0 && THE_API_KEY_NAMES.includes(line.slice(0, at)) && line.slice(at + 1) !== '') values.push(line.slice(at + 1))
  }
  const hashes = [...new Set(values.map((value) => createHash('sha256').update(value).digest('hex')))]
  const source = readFileSync(fileURLToPath(new URL('./scan-inside.mjs', import.meta.url)), 'utf8')
  const run = spawnSync('docker', ['exec', '-i', arg('--container'), 'node', '--input-type=module', '-e', source], { input: JSON.stringify(hashes), encoding: 'utf8' })
  if (![0, 1, 2].includes(run.status)) throw new Error('docker failed')
  process.stdout.write(run.stdout)
  if (run.status === 2) process.stderr.write('The scan could not be completed.\n')
  process.exitCode = run.status
} catch {
  process.stderr.write('The scan could not be completed.\n')
  process.exitCode = 2
}
