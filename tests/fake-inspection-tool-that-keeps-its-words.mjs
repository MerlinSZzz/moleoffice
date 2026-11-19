// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A STAND-IN CHECK TOOL THAT ENDS WITH NO VERDICT AND KEEPS ITS WORDS, as the real check tool keeps a verdict it refused
 * before posting it, twice (tools/the-inspector.mjs; round BL, item 2ao). No model runs and no work is judged: the
 * verdict, the answer and the refusals it keeps are made up, and each names the check session it ran as, so a reader can
 * tell one session's words from another's.
 *
 * It keeps them where the real tool does: on its own check session's record, under the key src/config/inspection-ending.mjs
 * declares, read first and written with that read's version. Where that file declares no key, it keeps nothing and says
 * so. Either way it ends with exit 42, the check tool's code for a check that ended with no verdict.
 */
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { theOfficeKey } from '../src/config/office-key.mjs'
import * as ending from '../src/config/inspection-ending.mjs'

const args = process.argv.slice(2)
const value = (flag) => args[args.indexOf(flag) + 1]
const api = value('--api')
const session = value('--check')
// THE OFFICE'S OWN KEY, found the way the real tool finds it: beside MOLE_OFFICE_DB, which the worker hands a check tool.
const key = theOfficeKey().key
const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': value('--workspace'),
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': value('--as'),
  'x-mole-office-session': session,
  ...(key === null ? {} : { [KEY_HEADER]: key }),
}
process.stdout.write(JSON.stringify({ synthetic: true, args, pid: process.pid }) + '\n')
const keptUnder = ending['THE_UNPOSTED_VERDICT']
if (typeof keptUnder !== 'string') {
  process.stderr.write('Synthetic: src/config/inspection-ending.mjs declares no key for the words a check tool keeps, so none were kept.\n')
} else {
  const path = `${api}/api/records/${encodeURIComponent(session)}`
  const read = await fetch(path, { headers })
  if (!read.ok) throw new Error(`Synthetic: the check session ${session} could not be read: ${await read.text()}`)
  const { record, version } = await read.json()
  const kept = {
    verdict: JSON.stringify({ verdict: 'refused', check: `Synthetic: the check in session ${session} judged no work.`, says: { precedent: 'aPrecedentMadeUp' } }, null, 2),
    answer: `Synthetic: the answer the model gave when asked, in session ${session}.`,
    refusals: [`Synthetic: the first refusal, in session ${session}.`, `Synthetic: the second refusal, in session ${session}.`],
  }
  const wrote = await fetch(path, {
    method: 'PATCH', headers,
    body: JSON.stringify({ ifVersion: version, dataPatch: { extra: { ...(record.data.extra ?? {}), [keptUnder]: kept } } }),
  })
  if (!wrote.ok) throw new Error(`Synthetic: the words could not be kept on the check session ${session}: HTTP ${String(wrote.status)} ${await wrote.text()}`)
  process.stderr.write('Synthetic: the verdict was refused before it was posted, twice, and its words are kept on the check session.\n')
}
// Exit 42 is the check tool's protocol for a completed second answer with no verdict.
process.exitCode = 42
