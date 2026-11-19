#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE THE WORK EACH ALREADY-SETTLED FORK CREATED, ONE TASK PER DECISION, OWED BY NOBODY.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * The work a decision creates belongs to the project. Whoever the project assigns that work to
 * owns it, and the person who proposed the decision does not have to finish it.
 *
 * From 7 September 2026 `POST /api/records/:id/promote` files that work itself, as a `task` with a
 * `derived_from` link to the decision. This script is the corpus's half: every fork settled BEFORE
 * that has a decision and no work. Measured on a copy of their corpus on 7 September 2026: 125
 * decisions, 113 of which settle a fork, and not one task linked to any of them.
 *
 * NOTHING HERE DECIDES ANYTHING. The words on each task come from `theWorkADecisionCreates` in
 * src/shared/decisionwork.ts — the same function the promote route calls — so a backfilled task and
 * a new one say the same thing about the same rule. Where the fork wrote no `resultWillBeUsedTo`,
 * the task says nobody wrote down what the decision requires; it does not go looking for a sentence
 * elsewhere in the fork to use instead.
 *
 * ---------------------------------------------------------------------------------------
 * HOW TO RUN IT
 * ---------------------------------------------------------------------------------------
 *
 *   node tools/file-the-work-each-decision-created.mjs                 says what it would write
 *   node tools/file-the-work-each-decision-created.mjs --apply         writes it
 *
 *     --api <url>          which server. Default: the one this checkout is set to.
 *     --workspace <id>     repeatable. Default: every project GET /api/workspaces lists.
 *     --actor <handle>     who the writes are filed as. Default: the one ACTOR sets below.
 *     --limit <n>          write at most this many, so a first run can be looked at.
 *
 * POINT `--api` AT A COPY BEFORE YOU POINT IT AT THEIR SERVER. `node tools/isolated-mole-office.mjs
 * start <name>` gives you one on its own ports, and this script writes over HTTP like any other
 * caller, so the copy is a complete rehearsal.
 *
 * SAFE TO RUN TWICE. It asks what each decision holds NOW rather than remembering what it did: a
 * decision that already has a task linked `derived_from` is left alone and counted as already right.
 */

import { theWorkADecisionCreates } from '../src/shared/decisionwork.ts'
import { whereIsTheApi } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { readAFullList } from './a-full-list-read.mjs'

/** From the task, to the decision it came out of. The same link the promote route writes. */
const THE_WORK_A_DECISION_CREATES = 'derived_from'

function argAfter(name) {
  const at = process.argv.indexOf(name)
  return at === -1 ? null : (process.argv[at + 1] ?? null)
}

function argsAfter(name) {
  const found = []
  for (let i = 0; i < process.argv.length; i += 1) {
    if (process.argv[i] === name && process.argv[i + 1] !== undefined) found.push(process.argv[i + 1])
  }
  return found
}

const APPLY = process.argv.includes('--apply')
const API = argAfter('--api') ?? whereIsTheApi()
const ACTOR = argAfter('--actor') ?? 'claude-code/builder-ce'
const LIMIT = Number(argAfter('--limit') ?? '0') || Infinity

function headers(workspaceId) {
  return {
    'content-type': 'application/json',
    'x-mole-office-workspace': workspaceId,
    // With a key: the key, under --actor when the caller named itself there, else MOLE_OFFICE_AGENT.
    // With no key: ACTOR, as before.
    ...anAgentsToolHeaders({ self: argAfter('--actor'), withoutAKey: ACTOR }),
    'x-mole-office-purpose': 'module-work',
  }
}

async function ask(path, workspaceId) {
  const reply = await fetch(`${API}${path}`, { headers: headers(workspaceId) })
  if (!reply.ok) throw new Error(`GET ${path} answered ${String(reply.status)}: ${(await reply.text()).slice(0, 400)}`)
  return await reply.json()
}

/** Every project this server holds, or the ones named on the command line. */
/**
 * THE DECISIONS, WHOLE: a decision deleted by hand must not be filed work for, and the narrow row
 * does not carry `deletedAt`. Asks the whole list; an older office is asked without the new word.
 */
async function askWholeList(path, workspaceId) {
  const answer = await readAFullList(async (one) => {
    const res = await fetch(`${API}${one}`, { headers: headers(workspaceId) })
    return { status: res.status, json: () => res.json(), text: () => res.text() }
  }, path)
  if (answer.status !== 200) throw new Error(`GET ${path} answered ${String(answer.status)}: ${(await answer.text()).slice(0, 400)}`)
  const page = await answer.json()
  if (!Array.isArray(page.records) || page.records.some((one) => typeof one?.incompleteCount !== 'number')) {
    throw new Error(`GET ${path} did not answer the whole records this tool reads`)
  }
  return page
}

async function projects() {
  const named = argsAfter('--workspace')
  if (named.length > 0) return named
  const reply = await fetch(`${API}/api/workspaces`, { headers: headers('panelx') })
  if (!reply.ok) throw new Error(`GET /api/workspaces answered ${String(reply.status)}`)
  const body = await reply.json()
  const rows = Array.isArray(body) ? body : (body.workspaces ?? [])
  return rows.map((one) => one.id).filter((one) => typeof one === 'string')
}

/**
 * The fork this decision settled, and the work already filed for it.
 *
 * Both come off the same read, and both are read from the LINKS rather than from any stored flag,
 * because that is the only thing that says either. A `derived_from` pointing away from the decision
 * at a proposal is the settlement; a `derived_from` pointing at the decision from a task is the work.
 */
function whatTheLinksSay(links) {
  let fork = null
  let work = null
  for (const link of links ?? []) {
    if (link.type !== THE_WORK_A_DECISION_CREATES) continue
    if (link.broken === true) continue
    const other = link.other ?? null
    if (other === null) continue
    if (link.isBacklink === false && other.kind === 'proposal') fork = other.id
    if (link.isBacklink === true && other.kind === 'task') work = other.id
  }
  return { fork, work }
}

async function main() {
  const wrote = []
  const alreadyRight = []
  const skipped = []
  const notSettled = []

  for (const workspaceId of await projects()) {
    let list
    try {
      list = await askWholeList(`/api/records?kind=decision&shape=full`, workspaceId)
    } catch (why) {
      skipped.push(`${workspaceId}: ${String(why)}`)
      continue
    }
    const rows = Array.isArray(list) ? list : (list.records ?? [])
    for (const row of rows) {
      if (wrote.length >= LIMIT) break
      if (row.deletedAt != null) continue
      let whole
      try {
        whole = await ask(`/api/records/${row.id}`, workspaceId)
      } catch (why) {
        skipped.push(`${row.id}: ${String(why)}`)
        continue
      }
      const decision = whole.record ?? whole
      const { fork, work } = whatTheLinksSay(whole.links)
      if (fork === null) {
        notSettled.push(row.id)
        continue
      }
      if (work !== null) {
        alreadyRight.push(`${row.id} (${work})`)
        continue
      }

      let proposal
      try {
        const read = await ask(`/api/records/${fork}`, workspaceId)
        proposal = read.record ?? read
      } catch (why) {
        skipped.push(`${row.id}: its fork ${fork} could not be read — ${String(why)}`)
        continue
      }

      const words = theWorkADecisionCreates({ decisionTitle: decision.title, forkData: proposal.data })
      if (!APPLY) {
        wrote.push(`${row.id} → ${words.fromTheFork ? 'the fork’s words' : 'nobody wrote it down'}: ${words.title}`)
        continue
      }
      const reply = await fetch(`${API}/api/records`, {
        method: 'POST',
        headers: headers(workspaceId),
        body: JSON.stringify({
          kind: 'task',
          title: words.title,
          summary: words.summary,
          data: { state: 'todo' },
          links: [{ type: THE_WORK_A_DECISION_CREATES, toId: decision.id }],
        }),
      })
      if (!reply.ok) {
        skipped.push(`${row.id}: POST /api/records answered ${String(reply.status)} — ${(await reply.text()).slice(0, 300)}`)
        continue
      }
      const filed = await reply.json()
      wrote.push(`${row.id} → ${filed.record?.id ?? '(no id in the reply)'} ${words.fromTheFork ? '(the fork’s words)' : '(nobody wrote it down)'}`)
    }
  }

  const say = (what, rows) => {
    process.stdout.write(`\n${what}: ${String(rows.length)}\n`)
    for (const one of rows.slice(0, 20)) process.stdout.write(`  ${one}\n`)
    if (rows.length > 20) process.stdout.write(`  … and ${String(rows.length - 20)} more\n`)
  }

  say(APPLY ? 'Work filed' : 'Work it would file', wrote)
  say('Already had its work filed', alreadyRight)
  say('Decisions that settle no fork, so nothing here is owed', notSettled)
  say('Left alone, and why', skipped)
  if (!APPLY) {
    process.stdout.write('\nNothing was written. Run again with --apply to write it.\n')
  }
  process.stdout.write(`Server: ${API}\n`)
}

await main()
