#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Install the host user's router unit; a different existing unit is left untouched. */
import { spawnSync } from 'node:child_process'
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { theProviderRouterUnit, theProviderRouterUnitPath } from '../../src/config/provider-router.mjs'

const at = process.argv.indexOf('--sandboxes')
const sandboxes = at < 0 ? undefined : process.argv[at + 1]
if (sandboxes === undefined) {
  process.stderr.write('Use: node tools/key-router/install.mjs --sandboxes <dir>\n')
  process.exit(2)
}
const unit = theProviderRouterUnitPath(homedir())
const contents = theProviderRouterUnit({ node: process.execPath, router: fileURLToPath(new URL('../provider-router.mjs', import.meta.url)), sandboxes: resolve(sandboxes) })
mkdirSync(dirname(unit), { recursive: true, mode: 0o700 })
const found = lstatSync(unit, { throwIfNoEntry: false })
if (found !== undefined) {
  if (!found.isFile() || readFileSync(unit, 'utf8') !== contents) {
    process.stderr.write(`The existing unit ${unit} is different, so it was left unchanged.\n`)
    process.exit(1)
  }
  process.stdout.write(`The unit at ${unit} already matches.\n`)
} else {
  writeFileSync(unit, contents, { flag: 'wx', mode: 0o600 })
  process.stdout.write(`Wrote ${unit}.\n`)
}
for (const args of [['--user', 'daemon-reload'], ['--user', 'enable', '--now', 'mole-office-keyrouter.service']]) {
  const result = spawnSync('systemctl', args, { stdio: 'inherit' })
  if (result.error || result.status !== 0) {
    process.stderr.write(`systemctl ${args.join(' ')} failed.\n`)
    process.exit(result.status || 1)
  }
  process.stdout.write(`Ran systemctl ${args.join(' ')}.\n`)
}
