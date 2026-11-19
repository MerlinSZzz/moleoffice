// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CLOSE THE WORLDS THE OFFICE STILL BELIEVES IN AND NOTHING IS SERVING.
 *
 *     node tools/close-worlds-nobody-serves.mjs
 *     node tools/close-worlds-nobody-serves.mjs --api http://127.0.0.1:29601 --close
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A world reports its birth to the office over HTTP and, since problem `JTdajUUs23_M` was fixed,
 * its death on the way down as well. A process killed with SIGKILL runs no shutdown, so it says
 * nothing, and the row stays open for ever. On 4 September 2026 the owner's office listed nine
 * worlds named "mole-office/the-api-server's world", all alive, all gone.
 *
 * A CLOSED WORLD IS NOT A GUESS, WHICH IS THE WHOLE DESIGN. The office stores the address each
 * world answers on, and criterion G3 puts the world's own identity on every reply as the
 * `x-mole-office-world` header. So there are exactly three answers and this tool never gives a
 * fourth:
 *
 *   NOTHING ANSWERS at that address — the world has ended.
 *   SOMETHING ANSWERS AND IS THAT WORLD — it is alive and is left alone.
 *   SOMETHING ANSWERS AND IS ANOTHER WORLD — the port was taken by something else, so the world
 *     that had it has ended. The reason says which world is there now, because a row closed with
 *     "nothing answered" would be a sentence that is not true.
 *
 * A world with NO ADDRESS RECORDED is left alone and said out loud. There is nothing to ask, and a
 * row closed because nobody could think of a way to check it is the fabricated evidence this
 * repository forbids.
 *
 * IT NAMES BEFORE IT ACTS. With no `--close` it prints what it would do and changes nothing. With
 * `--close` it closes each one through `POST /api/office/worlds/:id/close`, which is a route like
 * any other — this tool never touches a database and never signals a process.
 */

import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'
import { wordForAKindOfWorld, wordForAStanding } from '../src/config/world-words.mjs'
// THE ONE READER OF "IS ANYTHING ANSWERING AT THIS WORLD'S ADDRESS", shared with the office's own
// sweep so the tool's dry run and the row the office closes cannot give two different reasons.
import { whoIsAt, theSentenceSayingWhyTheWorldEnded } from '../src/config/world-address.mjs'

const API = process.argv.find((a) => a.startsWith('--api='))?.slice('--api='.length) ?? apiFromFlagOrSettings()
const CLOSE = process.argv.includes('--close')

function apiFromFlagOrSettings() {
  const at = process.argv.indexOf('--api')
  if (at !== -1 && process.argv[at + 1] !== undefined) return process.argv[at + 1]
  return whereIsTheApi()
}

const headers = { 'x-mole-office-workspace': whichWorkspace() }

const listed = await fetch(`${API}/api/office/worlds`, { headers }).catch(() => null)
if (listed === null || !listed.ok) {
  console.log(`The office could not be read at ${API}/api/office/worlds, so nothing was checked and nothing was closed.`)
  console.log('That is not an empty office. Point this at one with --api.')
  process.exit(1)
}
const said = await listed.json()
const live = said.worlds.filter((one) => one.diedAt === null)
console.log(`${live.length} world${live.length === 1 ? '' : 's'} open at the office ${API}, read from ${said.from}.`)
console.log(said.mirrorNote === undefined ? '' : `${said.mirrorNote}\n`)

/** @type {{ world: any, because: string }[]} */
const ended = []
for (const one of live) {
  const what = `${one.name} — ${wordForAKindOfWorld(one.kind)}, ${wordForAStanding(one.standing)}, database ${one.databaseIdentity}, born ${one.bornAt}`
  if (one.address === null || one.address === undefined || one.address === '') {
    console.log(`  LEFT ALONE  ${what}`)
    console.log('    no address is recorded for it, so there is nothing to ask and nothing this tool can prove.')
    continue
  }
  const who = await whoIsAt(one.address, { headers })
  if (who.answering && who.database === one.databaseIdentity) {
    console.log(`  ALIVE       ${what}`)
    console.log(`    ${who.why}`)
    continue
  }
  const because = theSentenceSayingWhyTheWorldEnded(one, who)
  console.log(`  ENDED       ${what}`)
  console.log(`    ${because}`)
  ended.push({ world: one, because })
}

console.log('')
if (ended.length === 0) {
  console.log('Every world open at the office is being served. Nothing to close.')
  process.exit(0)
}
if (!CLOSE) {
  console.log(`${ended.length} world${ended.length === 1 ? ' is' : 's are'} open at the office and served by nothing.`)
  console.log('Nothing was changed. Run this again with --close to mark them ended, each with the reason above.')
  process.exit(0)
}
let closed = 0
for (const { world, because } of ended) {
  const res = await fetch(`${API}/api/office/worlds/${world.id}/close`, {
    method: 'POST',
    headers: {
      ...headers,
      'content-type': 'application/json',
      // AN AGENT'S TOOL, NOT AN OFFICE PROCESS: it runs once, by hand (src/config/world-address.mjs),
      // and the office's own sweep is the tick inside the server. So it sends the caller's own key
      // and name when the caller holds a key, and 'mole-office/the-world-sweep' when it holds none.
      ...anAgentsToolHeaders({ withoutAKey: 'mole-office/the-world-sweep' }),
    },
    body: JSON.stringify({ because }),
  }).catch(() => null)
  if (res === null || !res.ok) {
    console.log(`  could not close ${world.name} (${world.id}): the office answered ${res === null ? 'nothing' : String(res.status)}`)
    continue
  }
  closed += 1
  console.log(`  closed ${world.name} (${world.id})`)
}
console.log(`\n${closed} of ${ended.length} closed, each with the reason it was given above.`)
