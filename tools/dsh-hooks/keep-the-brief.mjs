// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
//! KEEP THE RUN'S BRIEF ON THE OFFICE, criterion HB4 of design/honour-board/ACCEPTANCE.md.
/**
 * FILED AT THE RUN'S START, BY THE RUNNER: run-agent.sh calls this with the brief path it was
 * given, before the tool runs. It files a `note` record titled "Brief of <handle>'s run <session
 * id>" whose body is the brief file's text, and points it `about` the run's own session record, so
 * the next writer reads the brief from the office and not from a scratch folder that is gone.
 *
 * NOTHING IS WRITTEN WHERE THE RUNNER CANNOT KNOW IT: no brief path exported, a brief file gone or
 * unreadable, an empty brief, and a run with no identity behind it — each prints ONE sentence on
 * stderr and files nothing, because an empty note about nothing would say the brief was there.
 *
 * THE IDENTITY IS THE RUNNER'S OWN: the request goes out under the run's handle and its own
 * session record, so the `about` link names a run the caller is allowed to name.
 */
import { readFileSync, statSync } from 'node:fs'
import {
  apiAddress,
  ask,
  identity,
  theHeaders,
} from './office.mjs'
import { labelOneRecord } from '../label-a-record.mjs'

async function fileTheBrief(api, id, text) {
  const made = await ask(api, '/api/records', {
    method: 'POST',
    headers: theHeaders(id),
    body: {
      kind: 'note',
      title: `Brief of ${id.handle}'s run ${id.session}`,
      data: { body: text },
    },
  })
  if (made === null) {
    process.stderr.write(`dsh-hooks Brief: Mole Office did not answer at ${api} about the run's brief, so the brief was not kept.\n`)
    return
  }
  if (!made.ok || typeof made.body?.record?.id !== 'string') {
    process.stderr.write(`dsh-hooks Brief: Mole Office answered ${String(made.status)} to the run's own note of its brief, so the brief was not kept.\n`)
    return
  }
  const linked = await ask(api, '/api/links', {
    method: 'POST',
    headers: theHeaders(id),
    body: { fromId: made.body.record.id, toId: id.session, type: 'about' },
  })
  if (linked === null || !linked.ok) {
    process.stderr.write(`dsh-hooks Brief: the note ${made.body.record.id} is filed and nobody could point it at the run, so the reading will not find it: the office answered ${String(linked === null ? 'nothing' : String(linked.status))}.\n`)
  }
  // AND ITS LABEL, WRITTEN BY THE HOOK THAT FILED IT. Chapter 10 rule 3 asks every record for one,
  // and this note is not the worker's: the runner files it before the tool starts, and the worker
  // is then refused for a record it never wrote (message KsSsRY6WH1Ea, 22 September 2026). A label
  // that cannot be written is one line here and nothing more: a hook never stops a run by failing.
  const labelled = await labelOneRecord(api, theHeaders(id), made.body.record.id, `Brief for ${id.handle}`)
  if (!labelled.endsWith(`"Brief for ${id.handle}".`)) process.stderr.write(`dsh-hooks Brief: ${labelled}\n`)
}

async function main() {
  const id = identity()
  const briefPath = process.env['MOLE_OFFICE_BRIEF_PATH']
  if (id === null || typeof briefPath !== 'string' || briefPath.trim() === '') {
    process.stderr.write(
      'dsh-hooks Brief: the runner exported no brief path and no run identity' +
        (id === null ? ' (MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE)' : '') +
        ', so there is nothing to keep and nothing was filed.\n',
    )
    return
  }
  let text = null
  try {
    statSync(briefPath)
    text = readFileSync(briefPath, 'utf8')
  } catch (error) {
    process.stderr.write(
      `dsh-hooks Brief: the brief file at ${briefPath} could not be read (${error instanceof Error ? error.message : String(error)}), ` +
        'so nothing was filed and the run starts with a brief nobody kept.\n',
    )
    return
  }
  if (text === '') {
    process.stderr.write(`dsh-hooks Brief: the brief file at ${briefPath} is empty, so nothing was filed.\n`)
    return
  }
  await fileTheBrief(apiAddress(), id, text)
}

try {
  await main()
} catch (error) {
  process.stderr.write(`dsh-hooks Brief: ${error instanceof Error ? error.message : String(error)}; nothing was filed.\n`)
}
