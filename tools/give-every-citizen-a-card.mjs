// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * GIVE EVERY CITIZEN ALREADY ON THE ROLL A ROLE CARD. One command, run once, and safe to run again.
 *
 *   node tools/give-every-citizen-a-card.mjs            say what it would do, write nothing
 *   node tools/give-every-citizen-a-card.mjs --apply    do it
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion P46 of design/permissions/ACCEPTANCE.md section 8. When the role cards are built,
 * every citizen
 * already on the roll gets one.
 *
 * A CITIZEN HOLDS A CARD BY NAMING A ROLE ON THEIR REGISTRY ROW. `agents.role` has been there since
 * migration 0135 and `people.role` since 0138. A row that names none is READ as one — an agent as
 * `worker`, a person as `administrator` — so this writes down what is already true rather than
 * choosing anything: every refusal, every gate and every screen already treats those rows that way,
 * and after this the row says so instead of the reader having to know.
 *
 * ---------------------------------------------------------------------------------------
 * WHY A TOOL AND NOT A MIGRATION
 * ---------------------------------------------------------------------------------------
 *
 * Every `.sql` file under `drizzle/` in this repository is a schema change and not one of them
 * writes a row of content; the eight declared data passes are TypeScript and each is fenced by an
 * allow-list in tests/migration.test.ts. Filling in a corpus is a corpus write, and this repository
 * does those with a command that asks first: `tools/repair-promoted-decisions.mjs` is the precedent
 * this is written after. A migration would also run on every database silently, including a copy of
 * somebody else's world, and this is a judgement about who holds what.
 *
 * IT WRITES THROUGH THE API AND NEVER THE DATABASE. An agent's role lives on its agent record and
 * the registry follows it; a person's is written at the participant door. There is no second way in.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO
 * ---------------------------------------------------------------------------------------
 *
 * It does not change a row that already names a role. A card somebody chose is not this tool's to
 * move, and a run that found nothing to do says so rather than reporting a write.
 *
 * It does not register anybody. Nothing here creates a citizen.
 */

import { settings } from '../src/config/settings.mjs'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/give-every-citizen-a-card.mjs [--apply] [--api <url>] [--workspace <id>] [--as <handle>]',
      '',
      '  --apply      write. Without it nothing is written and the run says what it would do.',
      '  --api        which server to ask. Default: the one this checkout is set to.',
      '  --workspace  which project to name on the requests. Default: this checkout\'s.',
      '  --as         the agent id the writes are attributed to. Default: MOLE_OFFICE_AGENT.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

const argv = process.argv.slice(2)
const chosen = { apply: false, api: null, workspace: null, as: null }
for (let i = 0; i < argv.length; i += 1) {
  const word = argv[i]
  if (word === '--apply') chosen.apply = true
  else if (word === '--help' || word === '-h') usage('')
  else if (word === '--api') chosen.api = argv[(i += 1)]
  else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
  else if (word === '--as') chosen.as = argv[(i += 1)]
  else usage(`I do not know the option ${word}.`)
}

const config = settings()
// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address (problem JQ3yaANBi1JC); --api always wins.
const api = whereIsTheApiForACommand(chosen.api)
const workspace = chosen.workspace ?? config.workspace
const as = chosen.as ?? process.env['MOLE_OFFICE_AGENT'] ?? null
if (as === null || as === '') {
  process.stderr.write(
    'NOTHING SAYS WHO IS WRITING, so nothing was done. Pass --as <your handle>, or set MOLE_OFFICE_AGENT in ' +
      "this checkout's .env. A write with no attribution is filed as the person, which this is not.\n",
  )
  process.exit(2)
}

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  // `as` is the caller's own handle (--as, else MOLE_OFFICE_AGENT); the key goes with it when one is held.
  ...anAgentsToolHeaders({ self: as, withoutAKey: as }),
  'x-mole-office-purpose': 'module-work',
}

async function ask(path, init) {
  const reply = await fetch(`${api}${path}`, {
    method: init?.method ?? 'GET',
    headers,
    ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await reply.text()
  let body = null
  try {
    body = text === '' ? null : JSON.parse(text)
  } catch {
    body = null
  }
  return { ok: reply.ok, status: reply.status, body, text }
}

/** The word a registry row with no role of its own is already read as, by kind. */
const READ_AS = { person: 'administrator', agent: 'worker' }

let people
let agents
try {
  const participantPages = []
  const participantPaths = new Set()
  let participantNext = '/api/participants'
  while (participantNext !== null) {
    const n = participantPages.length + 1
    if (participantPaths.has(participantNext)) throw new Error(`The participant roster read stopped at page ${String(n)}: the office named a page that was already read. No rows were used.`)
    if (participantPages.length >= 200) throw new Error(`The participant roster read stopped at page ${String(n)}: it reads at most ${String(200)} pages. No rows were used.`)
    participantPaths.add(participantNext)
    const participantAnswer = await ask(participantNext)
    if (!participantAnswer.ok || participantAnswer.body === null) throw new Error(`The participant roster read stopped at page ${String(n)}: the office refused that page. No rows were used.`)
    participantPages.push(participantAnswer.body)
    participantNext = participantAnswer.body.next ?? null
  }
  people = participantPages.flatMap(page => page.people ?? [])
  agents = participantPages.flatMap(page => page.agents ?? [])
} catch (why) {
  process.stderr.write(`${String(why)}\n`)
  process.exit(1)
}

/** Everybody on this world's roll: a citizen is a registry row with a home world. */
const citizens = [
  ...people.filter((one) => one.homeWorld !== null && one.homeWorld !== undefined).map((one) => ({ kind: 'person', one })),
  ...agents.filter((one) => one.homeWorld !== null && one.homeWorld !== undefined).map((one) => ({ kind: 'agent', one })),
]

const wanted = citizens.filter(({ one }) => one.role === null || one.role === undefined || one.role === '')
const alreadyHeld = citizens.length - wanted.length

process.stdout.write(
  `${String(citizens.length)} citizen(s) on this world's roll: ${String(alreadyHeld)} already name a card, ` +
    `${String(wanted.length)} do not.\n`,
)
for (const { kind, one } of wanted) {
  process.stdout.write(`  ${kind} ${one.handle ?? one.id} would be given the ${READ_AS[kind]} card\n`)
}
if (wanted.length === 0) {
  process.stdout.write('Nothing to do: every citizen already names the card they hold.\n')
  process.exit(0)
}
if (!chosen.apply) {
  process.stdout.write('\nNothing was written. Run it again with --apply to write.\n')
  process.exit(0)
}

const written = []
const refused = []
for (const { kind, one } of wanted) {
  const card = READ_AS[kind]
  if (kind === 'person') {
    // A PERSON'S CARD IS WRITTEN AT THE PARTICIPANT DOOR, which is the only door onto that row.
    const said = await ask(`/api/participants/person/${encodeURIComponent(one.id)}`, {
      method: 'PATCH',
      body: { role: card },
    })
    if (said.ok) written.push(`person ${one.handle ?? one.id} -> ${card}`)
    else refused.push(`person ${one.handle ?? one.id}: ${said.text.slice(0, 300)}`)
    continue
  }
  // AN AGENT'S CARD IS WRITTEN ON ITS AGENT RECORD, and the registry row follows the record. Writing
  // the row itself would be a second door onto one fact.
  if (one.record === null || one.record === undefined) {
    refused.push(
      `agent ${one.handle ?? one.id}: no agent record in the project "${workspace}" answers for it, so there is ` +
        'nothing to write the card on. A registry row can outlive the record that made it.',
    )
    continue
  }
  const said = await ask(`/api/records/${encodeURIComponent(one.record)}`, {
    method: 'PATCH',
    body: { dataPatch: { role: card } },
  })
  if (said.ok) written.push(`agent ${one.handle ?? one.id} -> ${card}`)
  else refused.push(`agent ${one.handle ?? one.id}: ${said.text.slice(0, 300)}`)
}

process.stdout.write(`\n${String(written.length)} written:\n`)
for (const line of written) process.stdout.write(`  ${line}\n`)
if (refused.length > 0) {
  process.stdout.write(`\n${String(refused.length)} refused, and nothing was written for these:\n`)
  for (const line of refused) process.stdout.write(`  ${line}\n`)
}
process.stdout.write(
  '\nThe card each of them holds is the one their row was already read as. Nothing chose a role for anybody: ' +
    'what changed is that the row now says it.\n',
)
process.exit(refused.length === 0 ? 0 : 1)
