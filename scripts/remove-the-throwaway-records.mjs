// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * REMOVE THE RECORDS THREE ADVERSARIAL TEST RUNS LEFT BEHIND, AND NOTHING ELSE.
 *
 * WHY THIS SCRIPT EXISTS, AND WHY A PERSON RUNS IT AND NOT AN AGENT.
 *
 * Three adversarial runs tested whether an agent could take a fork off the owner's governance queue.
 * Each one had to file real forks and real decisions to attack, because a guard cannot be proved
 * against a record that is not there. Every title begins THROWAWAY.
 *
 * The guards they tested then refused to let them clean up, and that refusal is right. Deleting an
 * unsettled proposal takes it out of the queue only a person may answer, and deleting a decision is a
 * governance act. All 44 attempts were answered 403. One earlier agent got around that refusal by
 * changing a record's kind first, and said so; that is problem kyHnQSMfkEhN.
 *
 * So the way out is a person running this script.
 *
 * WHICH DATABASE IT CLEANS. It cleans whatever database the running API serves. It does not know which
 * one that is, and it does not guess. A comment that named a database file went stale here twice,
 * each time somebody changed one line of .env. `node tools/where-is-the-api.mjs` says which API it
 * will talk to, and that API's own .env says which file is behind it. Check both before --do-it,
 * because the deletes are real.
 *
 * WHAT IT WILL NOT TOUCH. Three records are the account of what happened, not part of the mess:
 * problem BDXyB1JgAcWc, session qx6Ie1FbTTor and report 8dCfhlie93ui. They stay.
 *
 * RUN IT:
 *     node scripts/remove-the-throwaway-records.mjs            # says what it would do, writes nothing
 *     node scripts/remove-the-throwaway-records.mjs --do-it    # deletes, as you
 *
 * Every delete is soft, attributed to you, and can be undone with Put back.
 *
 * WHO IT WRITES AS. It asks the running office who its owner is (GET /api/office/owner) and sends that
 * id as the person, so it holds no person's id of its own. If the office does not answer with an id,
 * it stops before it reads anything else.
 *
 * IT SENDS NO KEY, SO ONCE THE OWNER'S KEY WINDOW IS CLOSED THE OFFICE REFUSES IT. A request with no
 * key that names the owner counts as the owner only from this computer's own program, and only while
 * the key window is open, as item 1 of two decisions says. The script does
 * not read the owner's key out of the office's key file, because then any program on this computer that ran it would
 * delete as the owner. After the window closes, delete these records on the page, where the owner's paired browser
 * carries their key.
 */
// Where the API is comes from tools/where-is-the-api.mjs, the one place every tool asks. It reads
// the environment and then .env, because nothing hands a script an address. This line once
// read the same variable on both sides of a `??`, so the script went to port 8787 whatever .env said.
import { whereIsTheApi } from '../tools/where-is-the-api.mjs'

const API = whereIsTheApi()
const KEEP = new Set(['BDXyB1JgAcWc', 'qx6Ie1FbTTor', '8dCfhlie93ui'])
const REALLY = process.argv.includes('--do-it')

/* IT LOOKS IN EVERY WORKSPACE. `x-mole-office-workspace` decides which records GET /api/records
   answers with. This script once sent `panelx` and nothing else. On 29 August 2026 one throwaway
   report (6qR1QpNfOwpN) was in `default`, because the run that made it sent no workspace header, and
   `default` answers a request that names none. The script then counted four records with a fifth one
   workspace away. A cleaner that reports a number smaller than the truth is worse than no cleaner. So
   it walks GET /api/workspaces, and each delete goes out under the workspace its record is in. */

/* WHO OWNS THE OFFICE, asked of the office itself. The reply is {id, name, named, placeholder, guide}
   (src/server/api/office-owner.ts). The door needs no actor headers. */
const ownerRes = await fetch(`${API}/api/office/owner`)
if (!ownerRes.ok) {
  console.error(`Could not read who owns the office: ${ownerRes.status}. Is the server running on ${API}? No records were read and nothing was written.`)
  process.exit(1)
}
const owner = await ownerRes.json()
if (typeof owner?.id !== 'string' || owner.id === '') {
  console.error(`The office did not say its owner's id: ${JSON.stringify(owner).slice(0, 200)}. No records were read and nothing was written.`)
  process.exit(1)
}
const OWNER_ID = owner.id

const headersFor = (workspace) => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': OWNER_ID,
})

const isThrowaway = (title) =>
  /throwaway/i.test(title ?? '') || /^r11c-adv/.test(title ?? '')

const wsRes = await fetch(`${API}/api/workspaces`, { headers: headersFor('default') })
if (!wsRes.ok) {
  console.error(`Could not read the workspaces: ${wsRes.status}. Is the server running on ${API}?`)
  process.exit(1)
}
const { workspaces } = await wsRes.json()

const found = []
for (const ws of workspaces) {
  const res = await fetch(`${API}/api/records`, { headers: headersFor(ws.id) })
  if (!res.ok) {
    console.error(`Could not read the records in ${ws.id}: ${res.status}.`)
    process.exit(1)
  }
  const { records } = await res.json()
  for (const r of records) if (isThrowaway(r.title) && !KEEP.has(r.id)) found.push({ ...r, workspace: ws.id })
}

console.log(`${found.length} records left by the adversarial runs, across ${workspaces.length} workspaces.`)
for (const r of found) console.log(`  ${r.id}  ${r.workspace.padEnd(10)} ${r.kind.padEnd(10)} ${r.title.slice(0, 66)}`)

if (!REALLY) {
  console.log(`\nNothing was written. Run again with --do-it to remove them.`)
  process.exit(0)
}

let gone = 0
const refused = []
for (const r of found) {
  const out = await fetch(`${API}/api/records/${r.id}`, { method: 'DELETE', headers: headersFor(r.workspace) })
  if (out.ok) gone += 1
  else refused.push(`${r.id} ${r.workspace} ${r.kind} ${out.status} ${(await out.text()).slice(0, 120)}`)
}

console.log(`\nRemoved ${gone}. Refused ${refused.length}.`)
for (const line of refused) console.log(`  ${line}`)
console.log(`\nEvery delete is soft and attributed. Put back restores any of them.`)
