#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Install the host user's router unit, naming the office the stable unit serves, and enable it.
 *
 * A systemd unit gives its process no environment, so the unit itself names the office: its address and its database,
 * beside which the router finds the office key. Both are read from mole-office-stable.service and checked with that
 * office (tools/key-router/the-office-the-router-serves.mjs), never typed by hand. When the check fails, nothing is
 * written and systemctl is not asked to enable anything.
 *
 * An existing unit equal to the new text is kept. One that is the new text without the two office lines is the unit an
 * earlier install wrote, which named no office: it is replaced through a new file at 0600, and no copy is kept. Any
 * other existing unit is left unchanged and refused.
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { closeSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theOfficeLinesOfTheUnit, theProviderRouterUnit, theProviderRouterUnitPath } from '../../src/config/provider-router.mjs'
import { theOfficeTheRouterServes } from './the-office-the-router-serves.mjs'

const at = process.argv.indexOf('--sandboxes')
const sandboxes = at < 0 ? undefined : process.argv[at + 1]
if (sandboxes === undefined) {
  process.stderr.write('Use: node tools/key-router/install.mjs --sandboxes <dir>\n')
  process.exit(2)
}
const unit = theProviderRouterUnitPath(homedir())
const served = await theOfficeTheRouterServes()
if (served.office === null) {
  process.stderr.write(`The unit ${unit} was not written, and systemctl was not asked to enable it: ${served.says}.\n`)
  process.exit(1)
}
const contents = theProviderRouterUnit({
  node: process.execPath, router: fileURLToPath(new URL('../provider-router.mjs', import.meta.url)), sandboxes: resolve(sandboxes), office: served.office,
})
const officeLines = theOfficeLinesOfTheUnit(served.office)
const earlier = contents.split('\n').filter((line) => !officeLines.includes(line)).join('\n')
mkdirSync(dirname(unit), { recursive: true, mode: 0o700 })
const found = lstatSync(unit, { throwIfNoEntry: false })
const text = found?.isFile() ? readFileSync(unit, 'utf8') : null
if (found === undefined) {
  writeFileSync(unit, contents, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`Wrote ${unit}.\n`)
} else if (text === contents) {
  process.stdout.write(`The unit at ${unit} already matches.\n`)
} else if (text === earlier) {
  // A new file beside the unit, then a rename, so the unit is never half written and is 0600 from its first byte.
  const next = `${unit}.${randomBytes(12).toString('hex')}.new`
  const fd = openSync(next, 'wx', 0o600)
  try {
    try {
      writeSync(fd, contents)
      fsyncSync(fd)
    } finally {
      closeSync(fd)
    }
    renameSync(next, unit)
  } catch (err) {
    rmSync(next, { force: true })
    throw err
  }
  process.stdout.write(`Replaced ${unit}, which an earlier install wrote without naming the office.\n`)
} else {
  process.stderr.write(`The existing unit ${unit} is different, so it was left unchanged.\n`)
  process.exit(1)
}
for (const args of [['--user', 'daemon-reload'], ['--user', 'enable', '--now', 'mole-office-keyrouter.service']]) {
  const result = spawnSync('systemctl', args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    process.stderr.write(`systemctl ${args.join(' ')} failed.\n`)
    process.exit(result.status || 1)
  }
  process.stdout.write(`Ran systemctl ${args.join(' ')}.\n`)
}
