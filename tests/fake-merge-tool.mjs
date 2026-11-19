#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A SYNTHETIC MERGE TOOL, FOR THE TEST OF THE WORKER'S MERGE SLOT ONLY. Sandbox v1, piece P9.
 *
 * It stands where `tools/the-merger.mjs` stands and is started the same way, by the message worker, when
 * `MOLE_OFFICE_FAKE_MERGE_TOOL` names this file. IT MERGES NOTHING: it runs no git, no container and no
 * model, and reports no step. It reads its entry through the API as the office's own tool does, prints
 * what it was given, and ends the way its entry's branch name asks for — so a test chooses a behaviour by
 * the branch it submits, and needs no second channel to this script:
 *
 *   the branch holds "hangs"    it waits until it is signalled, so a test can stop it in flight
 *   the branch holds "silent"   it exits 1 without printing an ending line
 *   the branch holds "shadow"   it does what `tools/sandbox.mjs exec --session <its run>` does for a
 *                               build: once the worker's row for this process is on the ledger and a
 *                               second has passed, it starts a short-lived child, registers the child
 *                               under its own session (with no `startedByTheProduct`), and releases that
 *                               row when the child ends. It then keeps running until it is sent SIGTERM,
 *                               or for 60 seconds, and prints the ending line saying it ended well
 *   anything else               after a short wait, it prints the ending line saying it ended well
 *
 * The run's own session record names this file (`extra.fakeMergeTool`), so nothing it does is ever
 * mistaken for a real merge.
 */
import { spawn } from 'node:child_process'

import { theMergeToolEndingLine } from '../src/config/merge-tool.mjs'

const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const api = value('--api')
const entryId = value('--entry')
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': value('--workspace'),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': 'mole-office/the-message-worker',
  'x-mole-office-session': value('--session'),
}
process.stdout.write(`${JSON.stringify({ synthetic: true, args, pid: process.pid })}\n`)
const read = await fetch(`${api}/api/merge-queue/${entryId}`, { headers })
if (!read.ok) throw new Error(await read.text())
const { entry } = await read.json()
const branch = entry.changeset.branch ?? ''
if (branch.includes('hangs')) {
  process.stdout.write('Synthetic merge tool waiting until it is stopped.\n')
  setInterval(() => {}, 60_000)
} else if (branch.includes('shadow')) {
  const session = value('--session')
  const endWell = () => {
    process.stdout.write(
      `${theMergeToolEndingLine({ ok: true, says: `Synthetic merge tool read merge entry ${entryId}, ran one short command beside itself, and merged nothing.` })}\n`,
    )
    process.exit(0)
  }
  process.on('SIGTERM', endWell)
  // THE WORKER'S ROW FOR THIS PROCESS FIRST, and then a second more: the ledger lists a session's rows
  // newest first by a stamp in whole seconds, so the command's row is then the newest, as the suite's was.
  const deadline = Date.now() + 20_000
  for (;;) {
    const rows = await fetch(`${api}/api/resources?sessionRecordId=${session}`, { headers })
    const { resources } = await rows.json()
    if (resources.some((row) => row.type === 'process' && row.key === String(process.pid))) break
    if (Date.now() > deadline) throw new Error(`The worker never registered this synthetic merge tool, pid ${process.pid}.`)
    await new Promise((go) => setTimeout(go, 100))
  }
  await new Promise((go) => setTimeout(go, 1_100))
  // A GROUP OF ITS OWN, as a command `sandbox.mjs exec` runs is in: releasing its row signals its group,
  // and that group must not be this tool's.
  const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 4000)'], { stdio: 'ignore', detached: true })
  const registered = await fetch(`${api}/api/resources`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionRecordId: session, type: 'process', key: String(child.pid), detail: 'a synthetic command of the synthetic merge tool' }),
  })
  if (registered.status !== 201) throw new Error(`The ledger refused the synthetic command's row: ${await registered.text()}`)
  const row = (await registered.json()).resource
  process.stdout.write(`${JSON.stringify({ synthetic: true, command: child.pid, row: row.id })}\n`)
  child.on('exit', async () => {
    await fetch(`${api}/api/resources/${row.id}/release`, { method: 'POST', headers, body: JSON.stringify({ note: 'The synthetic command ended.' }) })
    process.stdout.write('Synthetic merge tool: its command ended, and it keeps running until it is stopped.\n')
  })
  setTimeout(endWell, 60_000)
} else if (branch.includes('silent')) {
  process.stderr.write('Synthetic merge tool exiting without an ending line.\n')
  process.exitCode = 1
} else {
  // A SHORT WAIT, so the worker's registration of this process lands while it is still running.
  await new Promise((go) => setTimeout(go, 400))
  process.stdout.write(
    `${theMergeToolEndingLine({ ok: true, says: `Synthetic merge tool read merge entry ${entryId}, which is ${entry.state}, and merged nothing.` })}\n`,
  )
}
