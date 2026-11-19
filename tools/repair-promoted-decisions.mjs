// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE ONTO EVERY ALREADY-PROMOTED DECISION WHAT THE PROMOTE ROUTE SHOULD HAVE WRITTEN.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT WAS WRONG
 * ---------------------------------------------------------------------------------------
 *
 * Until 6 September 2026, POST /api/records/<a proposal>/promote stored only what the caller sent —
 * `because`, `option_taken` — so the decision it filed carried no `authority` and no `decided_by`.
 * That decision was complete by the promote route's rule and incomplete by the record contract's,
 * and the first time anybody tried to correct one the PATCH was refused for the two fields the
 * route had left blank. A decision record that cannot be changed is a defect.
 * Problem `EV_G2eOWHeWy` has the measurement; `whatThisDecisionStandsOn` in
 * src/server/lib/records.ts is the route's half of the fix. This script is the corpus's half.
 *
 * ---------------------------------------------------------------------------------------
 * IT ONLY EVER WRITES DOWN WHAT THE LEDGER ALREADY SAYS
 * ---------------------------------------------------------------------------------------
 *
 * Nothing here decides anything. For each decision it reads the act that CREATED it — which is a
 * row in the change log, not a guess — and writes the fields that act already implies:
 *
 *   the person pressed promote themselves  →  authority "the owner said so", decided_by "the owner"
 *   an agent promoted carrying a warrant →  the same, because the warrant carries the person's words
 *   the decision already says what it stands on, on one of the four evidence authorities
 *                                          →  decided_by is the handle of the agent that filed it
 *
 * A decision whose create act says neither of those is LEFT ALONE and listed as skipped. Inventing
 * an authority for it would be the exact defect the `authority` field exists to stop.
 *
 * ---------------------------------------------------------------------------------------
 * RUNNING IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/repair-promoted-decisions.mjs                  reports what it would write
 *   node tools/repair-promoted-decisions.mjs --apply          writes it
 *
 *   --api <url>        where the API is; otherwise `whereIsTheApi` answers
 *   --workspace <id>   which project; repeatable; otherwise every project the API lists
 *   --since <date>     only decisions created on or after this local date. Default 2026-09-05,
 *                      the day the promotions this is about begin.
 *
 * It reports every decision by id, and it is safe to run twice: a second run finds nothing to
 * write, because it asks what each record holds now rather than remembering what it did.
 */

import { whereIsTheApi } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { readAFullList } from './a-full-list-read.mjs'

const THE_OWNER = 'the owner'
const THE_OWNERS_WORD = 'the owner said so'
/** The four a caller may claim for a choice of its own. Kept in step by the check at the bottom. */
const EVIDENCE_AUTHORITIES = [
  'an existing decision',
  'a product invariant',
  'a measurement',
  'reversible engineering judgement',
]

/**
 * THE DECISIONS, WHOLE: a decision deleted by hand must not be patched, and the narrow row carries
 * no `deletedAt`. Asks the whole list; an older office is asked without the new word.
 */
async function getWholeList(path, workspaceId) {
  const answer = await readAFullList(async (one) => {
    const res = await fetch(`${BASE}${one}`, { headers: headers(workspaceId) })
    return { status: res.status, json: () => res.json(), text: () => res.text() }
  }, path)
  if (answer.status !== 200) throw new Error(`GET ${path} answered ${String(answer.status)}: ${(await answer.text()).slice(0, 400)}`)
  const page = await answer.json()
  if (!Array.isArray(page.records) || page.records.some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error(`GET ${path} did not answer the whole records this tool reads`)
  }
  return page
}

function flag(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? fallback : process.argv[i + 1]
}
function allFlags(name) {
  const out = []
  for (let i = 0; i < process.argv.length; i += 1) if (process.argv[i] === `--${name}`) out.push(process.argv[i + 1])
  return out
}

const BASE = flag('api', whereIsTheApi())
const SINCE = flag('since', '2026-09-05')
const APPLY = process.argv.includes('--apply')
const ACTOR = flag('actor', 'claude-code/builder-bx')

function headers(workspaceId) {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspaceId,
    // With a key: the key, under --actor when the caller named itself there, else MOLE_OFFICE_AGENT.
    // With no key: ACTOR, as before.
    ...anAgentsToolHeaders({ self: flag('actor'), withoutAKey: ACTOR }),
    'x-mole-office-purpose': 'module-work',
    'x-mole-office-trace': 'repair-promoted-decisions',
  }
}

async function get(path, workspaceId) {
  const res = await fetch(`${BASE}${path}`, { headers: headers(workspaceId) })
  if (!res.ok) throw new Error(`GET ${path} answered ${res.status}: ${(await res.text()).slice(0, 400)}`)
  return res.json()
}

/**
 * WHAT THE CREATE ACT SAYS ABOUT WHO DECIDED THIS, or null when it says nothing usable.
 *
 * `changes` is the record's own ledger and the `create` row is the act that filed it. Its
 * `actorType` says whether a person pressed the button; its `warrant` holds the person's own words
 * when an agent carried them. Neither is inferred from the decision's text.
 */
function whoTheLedgerSaysDecidedIt(full, proposalId) {
  const created = (full.changes ?? []).find((c) => c.op === 'create')
  if (created === undefined) return { skip: 'no create row in the change log' }
  const data = full.record.data ?? {}
  const said = typeof data.authority === 'string' ? data.authority.trim() : ''

  // ITS OWN JUDGEMENT, ALREADY STATED. The record says what it stands on and it is one of the four
  // a caller may claim for itself, so the agent that filed it is who decided it.
  if (EVIDENCE_AUTHORITIES.includes(said)) {
    if (created.actorType === 'human') return { authority: said, decided_by: THE_OWNER }
    return { authority: said, decided_by: created.actorId }
  }
  // A PRESS BY THE PERSON, OR AN AGENT CARRYING THE PERSON'S WORDS. Either way the choice is the person's, and the proposal is
  // the durable record it was made from.
  if (said === THE_OWNERS_WORD || said === '') {
    if (created.actorType === 'human' || created.warrant != null) {
      return { authority: THE_OWNERS_WORD, decided_by: THE_OWNER, authority_reference: proposalId }
    }
    return {
      skip: `filed by ${created.actorType} "${created.actorId}" with no warrant and no authority, so nothing says what it stands on`,
    }
  }
  return { skip: `authority "${said}" is not one of the words this script knows` }
}

/** The proposal this decision was promoted from, or null when it was not promoted from one. */
function theProposalItCameFrom(full) {
  const link = (full.links ?? []).find(
    (l) => l.type === 'derived_from' && l.isBacklink === false && l.other?.kind === 'proposal',
  )
  return link ? link.other.id : null
}

async function main() {
  const workspaces = allFlags('workspace')
  const ids =
    workspaces.length > 0 ? workspaces : (await get('/api/workspaces', 'default')).workspaces.map((w) => w.id)

  const wrote = []
  const alreadyRight = []
  const skipped = []

  for (const workspaceId of ids) {
    const listed = await getWholeList('/api/records?kind=decision&shape=full', workspaceId)
    for (const row of listed.records ?? []) {
      if (row.deletedAt !== null && row.deletedAt !== undefined) continue
      if (String(row.createdAt) < SINCE) continue
      const full = await get(`/api/records/${row.id}`, workspaceId)
      const proposalId = theProposalItCameFrom(full)
      if (proposalId === null) continue

      const ought = whoTheLedgerSaysDecidedIt(full, proposalId)
      if (ought.skip !== undefined) {
        skipped.push({ id: row.id, workspaceId, why: ought.skip })
        continue
      }
      const data = full.record.data ?? {}
      const patch = {}
      for (const [key, value] of Object.entries(ought)) {
        const held = data[key]
        if (typeof held !== 'string' || held.trim() === '') patch[key] = value
      }
      if (Object.keys(patch).length === 0) {
        alreadyRight.push({ id: row.id, workspaceId })
        continue
      }
      if (APPLY) {
        const res = await fetch(`${BASE}/api/records/${row.id}`, {
          method: 'PATCH',
          headers: headers(workspaceId),
          body: JSON.stringify({ dataPatch: patch }),
        })
        if (!res.ok) {
          skipped.push({ id: row.id, workspaceId, why: `PATCH answered ${res.status}: ${(await res.text()).slice(0, 300)}` })
          continue
        }
      }
      wrote.push({ id: row.id, workspaceId, wrote: patch })
    }
  }

  const verb = APPLY ? 'Wrote' : 'Would write'
  console.log(`${verb} the missing fields onto ${wrote.length} promoted decision(s) created on or after ${SINCE}.`)
  for (const one of wrote) {
    console.log(`  ${one.id}  [${one.workspaceId}]  ${Object.entries(one.wrote).map(([k, v]) => `${k}=${v}`).join('  ')}`)
  }
  console.log(`Already complete, nothing written: ${alreadyRight.length}`)
  for (const one of alreadyRight) console.log(`  ${one.id}  [${one.workspaceId}]`)
  console.log(`Left alone: ${skipped.length}`)
  for (const one of skipped) console.log(`  ${one.id}  [${one.workspaceId}]  ${one.why}`)
  if (!APPLY) console.log('\nNothing was written. Run again with --apply to write it.')
}

await main()
