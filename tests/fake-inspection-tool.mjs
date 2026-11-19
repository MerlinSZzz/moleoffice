// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** The old fake tool omitted seal metadata. It now echoes the real submitted identity on its synthetic assembly and verdict; it still runs no model and judges no work. */
/** Synthetic check tool for the C28 worker test. No model runs and no real work is judged. */
import { readFileSync } from 'node:fs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const api = value('--api')
const run = value('--run')
/**
 * THE OFFICE'S OWN KEY, AS THE REAL CHECK TOOL SENDS IT (tools/the-inspector.mjs, theOfficeKeyHeader). The door that takes a
 * verdict refuses one that a listener carried with no key (acceptance finding 79), so a stand-in that sent none would be
 * refused where the real tool is not. The real tool finds the key beside MOLE_OFFICE_DB, which the worker hands the check
 * tool and no other runtime: the absolute path of the database it serves (envFor, in src/worker/runtimes/adapter.ts). A
 * test may name the key file in FAKE_INSPECTION_TOOL_KEY_FILE; without it this reads the key the way the real tool does.
 */
function theKeyTheRealToolWouldSend() {
  const file = process.env['FAKE_INSPECTION_TOOL_KEY_FILE']
  if (file !== undefined && file !== '') return JSON.parse(readFileSync(file, 'utf8')).office ?? null
  return theOfficeKey().key
}
const key = theKeyTheRealToolWouldSend()
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': value('--workspace'),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': value('--as'),
  'x-mole-office-session': value('--check'),
  ...(key === null ? {} : { [KEY_HEADER]: key }),
}
process.stdout.write(JSON.stringify({ synthetic: true, args, pid: process.pid }) + '\n')
const read = await fetch(`${api}/api/records/${run}`, { headers })
if (!read.ok) throw new Error(await read.text())
const { record } = await read.json()
if (record.title.includes('Synthetic no verdict twice')) {
  // Exit 42 is the check tool's protocol for a completed second answer with no verdict.
  process.stderr.write('Synthetic: both completed answers gave no verdict. The office reads this ending.\n')
  process.exitCode = 42
} else if (record.title.includes('Synthetic no session')) {
  process.stderr.write('Synthetic: the answer names no session of its own.\n')
  process.exitCode = 1
} else if (record.title.includes('Synthetic unfinished')) {
  process.stderr.write('Synthetic: the check did not finish.\n')
  process.exitCode = 1
} else if (record.title.includes('Synthetic interrupted')) {
  process.stderr.write('Synthetic check interrupted before a verdict.\n')
  setInterval(() => {}, 60_000)
} else if (record.title.includes('Synthetic released')) {
  const submissionResponse = await fetch(`${api}/api/checks/${run}`, { headers })
  if (!submissionResponse.ok) throw new Error(await submissionResponse.text())
  const { submission } = await submissionResponse.json()
  const permissionResponse = await fetch(`${api}/api/records/${record.data.extra.traceFixturePermission}`, { headers })
  if (!permissionResponse.ok) throw new Error(await permissionResponse.text())
  const { record: permission } = await permissionResponse.json()
  const reading = { worktree: value('--checkout'), tip: record.data.tip, ofItsOwn: false, says: 'Synthetic fixture worktree metadata; no real work was inspected.', ...(submission ? { sealId: submission.id, sealHash: submission.seal.hash } : {}) }
  const base = { ref: submission?.seal.git?.forkBase ?? record.data.tip, how: submission ? 'fork point' : 'typed', says: 'Synthetic fixture base; no real work was inspected.' }

  const assembled = await fetch(`${api}/api/checks/${run}/assembled`, {
    method: 'POST', headers,
    body: JSON.stringify({ changes: [], base, execution: { model: value('--model'), minutes: Number(value('--limit')) }, read: reading }),
  })
  if (!assembled.ok) throw new Error(await assembled.text())
  const verdict = await fetch(`${api}/api/checks/${run}`, {
    method: 'POST', headers,
    body: JSON.stringify({ verdict: 'released',
      traced: [{ paths: submission.seal.git.files.map((one) => one.path), to: permission.id,
        how: "the person's word", said: permission.summary }],
      check: 'Synthetic fixture verdict for the worker test; no model judged work.', chaptersRead: ['5:full'], read: reading }),
  })
  if (!verdict.ok) throw new Error(await verdict.text())
  process.stdout.write('Synthetic fixture wrote its verdict.\n')
} else {
  process.stderr.write('Synthetic check stopped at its clock before writing a verdict.\n')
  process.exitCode = 1
}
