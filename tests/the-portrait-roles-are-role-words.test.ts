// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE PORTRAITS TOOL NAMES EVERY PORTRAIT BY A ROLE WORD, AND THE OWNER'S BY "owner".
 *
 * tools/portraits-from-openrouter.mjs names each picture, and the folder it is written to, by its role. The owner's three
 * portraits used to be named by one person's name. `--list` asks nothing of OpenRouter and needs no key, so this reads
 * the names from it.
 *
 * MUTATION PROOF: one of the owner's three portraits given its old role back, and this goes red.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')
const TOOL = join(REPO, 'tools', 'portraits-from-openrouter.mjs')
const ROLES = ['worker', 'investigator', 'supervisor', 'secretary', 'inspector', 'administrator', 'owner']

it('lists three portraits for each of the six role cards and for the owner, by role word', () => {
  const ran = spawnSync(process.execPath, [TOOL, '--list'], { cwd: REPO, encoding: 'utf8' })
  expect(ran.status, ran.stderr).toBe(0)
  const names = ran.stdout.split('\n').filter((line) => line !== '').map((line) => line.slice(0, line.indexOf(':')))
  expect(names).toEqual(ROLES.flatMap((role) => [1, 2, 3].map((n) => `${role}-${String(n)}`)))
})
