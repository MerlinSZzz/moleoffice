#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN FOR tools/sandbox.mjs THAT FILES A PROCESS ROW FOR EACH COMMAND IT RUNS. SYNTHETIC, FOR
 * tests/the-merge-tool-outlives-an-office-restart.test.ts ONLY. It starts no container.
 *
 * Every word goes on to tests/stand-in-sandbox-tool.mjs, which does the work. For `exec`, this file
 * also does what the real `tools/sandbox.mjs exec --wait --plain-env` does with the office:
 *
 *   1. it registers the running command in the ledger, POST /api/resources, as a process row of the
 *      session it was given with --session (the merge tool's own session), asking as --as;
 *   2. it asks once to release that row when the command ends, and exits with the command's code
 *      whatever the office answered.
 *
 * Like the real one, it asks each time only once, and a failure is printed, not retried. The real one
 * registers the process that runs the command inside the container; this one registers the process
 * that runs it here. Every other verb goes straight on.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const words = process.argv.slice(2)
const standIn = fileURLToPath(new URL('./stand-in-sandbox-tool.mjs', import.meta.url))
const valueOf = (flag) => {
  const at = words.indexOf(flag)
  const end = words.indexOf('--')
  return at === -1 || (end !== -1 && at > end) ? undefined : words[at + 1]
}
const say = (line) => process.stderr.write(`stand-in that files rows: ${line}\n`)

/** One request to the office; `{status: null, why}` when nothing answered, as the real launcher's askTheOffice does. */
async function ask(path, body) {
  try {
    const res = await fetch(`${valueOf('--api')}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-mole-office-workspace': valueOf('--workspace'),
        'x-mole-office-actor-type': 'agent',
        'x-mole-office-actor-id': valueOf('--as'),
        'x-mole-office-session': valueOf('--session'),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    return { status: res.status, text: await res.text() }
  } catch (why) {
    return { status: null, text: why instanceof Error ? why.message : String(why) }
  }
}

const child = spawn(process.execPath, [standIn, ...words], { stdio: 'inherit' })
if (words[0] !== 'exec') {
  child.on('exit', (code) => process.exit(code ?? 1))
} else {
  const command = words.slice(words.indexOf('--') + 1).join(' ')
  const ended = new Promise((done) => child.on('exit', (code, signal) => done(code ?? (signal === null ? 1 : 128))))
  const registered = await ask('/api/resources', {
    type: 'process',
    key: String(child.pid),
    sessionRecordId: valueOf('--session'),
    detail: `synthetic sandbox command: ${command}`,
  })
  let row = null
  if (registered.status === 201) row = JSON.parse(registered.text).resource.id
  else say(`the ledger did not register pid ${String(child.pid)} (${String(registered.status)}: ${registered.text.slice(0, 300)})`)
  const code = await ended
  if (row !== null) {
    const released = await ask(`/api/resources/${encodeURIComponent(row)}/release`, { note: `The command ended with ${String(code)}.` })
    if (released.status !== 200) say(`the process row ${row} could not be closed (${String(released.status)}: ${released.text.slice(0, 300)}); it may still say something runs.`)
  }
  process.exit(code)
}
