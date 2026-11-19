#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITE MONEY A RUN SPENT ON A PAID SERVICE OUTSIDE THE OFFICE ONTO ITS USAGE RECEIPT.
 *
 *     node tools/outside-spend.mjs --service OpenRouter --usd 0.42 [--says "Two reviews by a model OpenRouter serves."]
 *
 * Milestone M8 (report 4IoRUKizcZXb), on the leads' ask: a run that pays a service outside the office,
 * OpenRouter and the like, says how many dollars and to which service, on the same receipt as its tokens. Only the run
 * that paid knows the amount, so it writes it here; nothing in the office estimates it.
 *
 * It adds one entry to `usageReceipt.outsideSpend` on the calling run (MOLE_OFFICE_SESSION) and keeps everything else
 * on the receipt. The receipt writers at a run's end keep these entries (keepingTheOutsideSpend in
 * src/config/usage.mjs). The run's key is read as the dsh hooks read it (theHeaders in tools/dsh-hooks/office.mjs) and
 * is never printed.
 *
 * Exit 0 when the entry was written; 2 for a wrong command line; 1, with one sentence on stderr, when it was not
 * written. Nothing else about the run changes either way.
 */
import { parseArgs } from 'node:util'

import { clockStamp } from '../src/shared/time.ts'
import { apiAddress, ask, identity, theHeaders } from './dsh-hooks/office.mjs'

/** One sentence on stderr, and the exit code. */
function stop(code, why) {
  process.stderr.write(`outside-spend: ${why}\n`)
  process.exit(code)
}

let values
try {
  ;({ values } = parseArgs({ options: { service: { type: 'string' }, usd: { type: 'string' }, says: { type: 'string' } }, strict: true }))
} catch (error) {
  stop(2, `${(error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').replace(/\.$/, '')}. Give --service <name> --usd <amount> and, if you like, --says <what it was for>. Nothing was written.`)
}
const service = (values.service ?? '').trim()
if (service === '') stop(2, 'Give --service <the name of the service that was paid>. Nothing was written.')
const usd = Number(values.usd)
if (values.usd === undefined || values.usd.trim() === '' || !Number.isFinite(usd) || usd < 0) {
  stop(2, `--usd must be the amount in US dollars, a number of 0 or more; it was ${JSON.stringify(values.usd ?? null)}. Nothing was written.`)
}
const says = values.says?.trim()

const id = identity()
if (id === null) stop(1, 'MOLE_OFFICE_AGENT, MOLE_OFFICE_SESSION and MOLE_OFFICE_WORKSPACE do not all name the run, so nothing was written.')
const api = apiAddress()
const read = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, { headers: theHeaders(id) })
if (read === null) stop(1, `Mole Office did not answer at ${api}, so nothing was written.`)
if (!read.ok) stop(1, `reading run ${id.session} was answered ${String(read.status)}, so nothing was written.`)
const stored = (read.body?.record ?? read.body)?.data?.usageReceipt ?? {}
const entry = { service, usd, ...(says ? { says } : {}), at: clockStamp().stamp }
const usageReceipt = { ...stored, outsideSpend: [...(Array.isArray(stored.outsideSpend) ? stored.outsideSpend : []), entry] }
const wrote = await ask(api, `/api/records/${encodeURIComponent(id.session)}`, {
  method: 'PATCH',
  headers: theHeaders(id),
  body: { dataPatch: { usageReceipt } },
})
if (wrote === null) stop(1, `Mole Office did not answer at ${api}, so nothing was written.`)
if (!wrote.ok) stop(1, `the write on run ${id.session} was answered ${String(wrote.status)}: ${String(wrote.body?.error ?? '').slice(0, 300)}`)
process.stdout.write(`outside-spend: run ${id.session}'s receipt now says ${usd} US dollars were spent on ${service}.\n`)
