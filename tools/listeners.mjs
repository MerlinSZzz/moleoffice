// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WHAT IS LISTENING THAT LOOKS LIKE A MOLE OFFICE, AND WHO OWNS EACH ONE.
 *
 *     node tools/listeners.mjs
 *     node tools/listeners.mjs --api http://127.0.0.1:29601
 *     node tools/listeners.mjs --json
 *
 * ---------------------------------------------------------------------------------------
 * IT NAMES. IT NEVER STOPS ANYTHING.
 * ---------------------------------------------------------------------------------------
 *
 * The owner's rule, 3 September 2026, answering F1 of design/ground/ACCEPTANCE.md:
 * The rule for F1 of design/ground/ACCEPTANCE.md, 3 September 2026:
 *     F1: naming only, and no killing of a process because a clock ran out.
 *
 * Naming only. They sometimes start an agent for something unrelated, and killing what is
 * unregistered because a clock ran out is too wide a rule. This tool sends no signal, has no
 * timer, and has no flag that would give it either. Where something is yours and you want it
 * stopped, it prints the command and you run it.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS THE ROUTE, NOT A SECOND OPINION
 * ---------------------------------------------------------------------------------------
 *
 * `GET /api/runtime/listeners` does the work. This asks a running Mole Office and prints the
 * answer. `tools/stray-servers.mjs` reads the machine itself, with the product's own judgement of
 * what a Mole Office process looks like, imported from src/server/lib/mole-office-parts.ts. This
 * one judges no process itself: with no server answering it says so and stops, rather than
 * producing a second, weaker list that a reader would have no way to tell from the real one.
 */

import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { wordForAKindOfWorld, wordForAStanding } from '../src/config/world-words.mjs'

const args = process.argv.slice(2)
const flag = (name) => {
  const at = args.indexOf(`--${name}`)
  return at === -1 ? undefined : args[at + 1]
}
const asJson = args.includes('--json')
const API = whereIsTheApi(flag('api'))

const res = await fetch(`${API}/api/runtime/listeners`, {
  headers: { 'x-mole-office-workspace': whichWorkspace() },
}).catch((err) => {
  console.error(
    `Nothing answered at ${API} (${err.message}), so nothing was listed.\n` +
      'This tool asks a running Mole Office rather than reading the machine itself, because a second\n' +
      'reading of what a Mole Office process looks like is a second thing to be wrong. Start one, or\n' +
      'point this at one with --api.',
  )
  process.exit(2)
})

if (!res.ok) {
  console.error(`${API}/api/runtime/listeners answered ${res.status}. Nothing was listed.`)
  console.error(await res.text())
  process.exit(2)
}

const report = await res.json()
if (asJson) {
  console.log(JSON.stringify(report, null, 2))
  process.exit(0)
}

const answering = report.answeredBy
console.log(`asked ${API} at ${report.readAt}`)
console.log(
  `  it is ${answering.standing.kind}: ${answering.repository}, ${answering.database}` +
    `${answering.head === null ? '' : `, ${answering.head}`}`,
)
console.log('')
console.log(`${report.listeners.length} listener${report.listeners.length === 1 ? '' : 's'} that look like a Mole Office:`)
for (const one of report.listeners) {
  console.log('')
  console.log(`  port ${one.port}${one.pid === null ? '' : `  pid ${one.pid}`}${one.pgid === null ? '' : `  group ${one.pgid}`}`)
  console.log(`    ${one.says}`)
  console.log(`    found because: ${one.caughtBy.join('; ')}`)
  if (one.command !== null) console.log(`    ${one.command}`)
  if (one.startedAt !== null) console.log(`    started ${one.startedAt}`)
  if (!one.stoppable) {
    console.log(`    Mole Office will not stop this: ${one.notStoppableBecause}`)
    if (one.pgid !== null) console.log(`    if it is yours:  kill -TERM -${one.pgid}`)
  }
}
/**
 * AND WHO HAS COME THROUGH ONE OF THOSE DOORS FROM SOMEWHERE ELSE.
 *
 * Printed even when the list is empty, because "nobody has" is the answer this machine gives every
 * day and leaving the heading out would make it indistinguishable from a tool too old to ask.
 * The list is read from the call log by the server; this prints what it was handed.
 */
console.log('')
if (report.fromOtherMachines.length === 0) {
  console.log('nothing has reached this API from off this machine.')
} else {
  const many = report.fromOtherMachines.length !== 1
  console.log(`${report.fromOtherMachines.length} machine${many ? 's' : ''} ${many ? 'have' : 'has'} reached this API from off this one:`)
  for (const one of report.fromOtherMachines) {
    const where = one.address === null ? 'an address nothing on the way here recorded' : one.address
    console.log(`  ${where}`)
    console.log(`    ${one.requests} request${one.requests === 1 ? '' : 's'}, first ${one.firstAt}, last ${one.lastAt}`)
  }
}

if (report.couldNotRead.length > 0) {
  console.log('')
  console.log('could not read:')
  for (const gap of report.couldNotRead) console.log(`  ${gap.what}: ${gap.why}`)
}
console.log('')
console.log('what this looked for:')
for (const line of report.lookedFor) console.log(`  ${line}`)
/**
 * AND THE WORLDS THE OFFICE KNOWS. Criterion C3: *the listeners and stray tools read the office as
 * the one list.*
 *
 * A LISTENER IS A PORT AND A WORLD IS A DATABASE, and this is where the two meet: a port a world
 * says it answers on is named with the world's own name, so a reader looking at a port number does
 * not have to work out which Mole Office it is. A port no world claims is left as it is — that is
 * what the section above is for, and this one adds nothing to it.
 *
 * IT ASKS THE SAME SERVER, so a run of this tool is one reading and not two.
 */
const office = await fetch(`${API}/api/office/worlds`, {
  headers: { 'x-mole-office-workspace': whichWorkspace() },
}).catch(() => null)
console.log('')
if (office === null || !office.ok) {
  console.log(`the office could not be read at ${API}/api/office/worlds, so no world is named below.`)
} else {
  const said = await office.json()
  const live = said.worlds.filter((one) => one.diedAt === null)
  const where = said.from === 'the office' ? 'this world holds the office' : `read from ${said.from}`
  if (live.length === 0) {
    console.log(`no world is open at the office (${where}).`)
  } else {
    console.log(`${live.length} world${live.length === 1 ? '' : 's'} open at the office (${where}):`)
    for (const one of live) {
      // THE WORDS, FROM THE ONE TABLE. This tool runs on a node that cannot read TypeScript, so it
      // reads src/config/world-words.mjs — the same table src/shared/words.ts reads for the screen.
      console.log(`  ${one.name} — ${wordForAKindOfWorld(one.kind)}, ${wordForAStanding(one.standing)}`)
      console.log(`    database ${one.databaseIdentity}, ${one.address ?? 'no address recorded'}, born ${one.bornAt}`)
      const port = one.address === null ? null : Number(new URL(one.address).port)
      const listener = port === null ? undefined : report.listeners.find((l) => l.port === port)
      if (listener !== undefined) console.log(`    answering on port ${String(port)}, pid ${String(listener.pid ?? 0)}`)
    }
  }
  const dead = said.worlds.length - live.length
  if (dead > 0) console.log(`  and ${String(dead)} world${dead === 1 ? '' : 's'} that ${dead === 1 ? 'has' : 'have'} ended.`)
}

console.log('')
console.log('Nothing was stopped. This tool names and never signals.')
