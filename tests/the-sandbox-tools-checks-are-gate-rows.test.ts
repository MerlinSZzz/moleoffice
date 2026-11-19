// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Every reason and setting value here is made up in a fresh test office. */
import type { FastifyInstance } from 'fastify'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { theWordAPageDraws } from './words-waiting-for-translation.ts'

// THE SANDBOX TOOLS' 18 CHECKS GET THEIR ROWS (wave 13r round O, item 10b of briefs/REQUIREMENTS.md; d6SnhY430pQe
// and XTEcIEuD-E1o). Each row comes from round H's table. No tool reads its row yet, so each allows only the position its
// tool acts by today, and starts there in both kinds of office. BS-28 is the server's own and is counted by it; the
// other 17 are counted from the gate-count spool. Which of those 17 the spool still waits for is not pinned here; the
// every-gate test holds that list to the sites that exist. Round AC adds three checks of tools that run on the host to
// the group, CK-20 and CK-23 of the inspector and RG-49 of the profiles installer, so it holds 21 rows, and those three
// are counted from the spool too (tests/the-host-tools-count-through-the-spool.test.ts).
interface DeclaredGate { id: string; class: string; group: string; setting: string; positions: {kind: string; allowed?: string[]}; whoMayChange: string; defaults: {buildsMoleOffice: string; ordinary: string}; countedBy: string; looksAgain: string | null }
interface GateList { GATES: DeclaredGate[]; GATE_GROUPS: {class: string; group: string}[] }
async function list(): Promise<GateList> { const path = '../src/config/gates.mjs'; return import(path) }
const AS_OWNER = { 'x-mole-office-workspace': 'default', 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_TEST_OFFICES_OWNER.id }
let t: TestDb, app: FastifyInstance
beforeEach(async () => { t = await freshDb(); app = (await apiApp()).app; await app.ready() })
afterEach(async () => { await app.close(); t.close() })

function save(name: string, value: string) {
  return app.inject({ method: 'POST', url: '/api/office/settings', headers: AS_OWNER, payload: {changes: [{name, value}], because: 'Made-up reason for a sandbox gate'} })
}
/** A word the page draws in English, which must be there and say something. */
function aSentence(key: string): string {
  const word = theWordAPageDraws('en', key)
  expect(typeof word === 'string' && word.trim() !== '', key).toBe(true)
  return word!
}

// Round H's table: the row, its class, the one position its tool acts by today, and who counts it.
const ROWS = [
  ['the-office-vouches-for-a-runs-sandbox', 'process', 'block', 'the-server'],
  ['a-raise-has-a-reason-and-goes-up', 'process', 'block', 'the-sandbox-spool'],
  ['a-codex-command-is-checked', 'process', 'block', 'the-sandbox-spool'],
  ['other-gpu-sandboxes-reminder', 'process', 'remind', 'the-sandbox-spool'],
  ['main-refreshed-only-from-its-own-checkout', 'quality', 'remind', 'the-sandbox-spool'],
  ['sandbox-folder-size-warning', 'process', 'remind', 'the-sandbox-spool'],
  ['the-hosts-run-list-is-sound', 'process', 'block', 'the-sandbox-spool'],
  ['a-round-continues-only-this-agents-run', 'process', 'block', 'the-sandbox-spool'],
  ['a-rounds-run-was-filed-here', 'process', 'block', 'the-sandbox-spool'],
  ['a-round-reads-only-its-runs-output', 'process', 'block', 'the-sandbox-spool'],
  ['codex-resumes-only-this-sandboxs-thread', 'process', 'block', 'the-sandbox-spool'],
  ['opencode-resumes-only-this-sandboxs-session', 'process', 'block', 'the-sandbox-spool'],
  ['a-handshake-only-for-own-commands', 'process', 'block', 'the-sandbox-spool'],
  ['a-run-is-filed-in-one-sandbox', 'process', 'block', 'the-sandbox-spool'],
  ['launch-logs-stay-in-the-sandbox', 'process', 'block', 'the-sandbox-spool'],
  ['plain-env-strips-the-launchers-variables', 'process', 'block', 'the-sandbox-spool'],
  ['a-refused-message-is-said-another-way', 'process', 'remind', 'the-sandbox-spool'],
  ['a-world-copy-is-a-sound-database', 'quality', 'block', 'the-sandbox-spool'],
  ['a-models-login-outlasts-the-check', 'process', 'block', 'the-sandbox-spool'],
  ['a-check-reads-its-own-worktree', 'quality', 'block', 'the-sandbox-spool'],
  ['profiles-in-use-are-never-written', 'quality', 'block', 'the-sandbox-spool'],
] as const
const POSITIONS = ['block', 'remind', 'off'] as const

// Mutation: let the settings door take a position a row does not allow, or refuse the one it does.
// THIS CASE HAS 30 SECONDS, not the five a test that only computes has. It makes 63 writes through the server, which
// took 2,174 ms alone on 13 November 2026 at load average 7.5. In the whole suite that day it went red and was green
// alone. It writes into a fresh office of its own, so the one thing here that depends on the machine is how long
// the writes take, and the five seconds were their only bound. Those five seconds are there so that a hung pure test
// says so at once; they say nothing about how long 63 writes take on a loaded machine.
it('refuses each position a sandbox tool row does not allow at the settings door, keeping nothing, and takes the one it does', async () => {
  const {GATES} = await list()
  for (const [id, , position] of ROWS) {
    const setting = GATES.find(one => one.id === id)!.setting
    for (const other of POSITIONS.filter(one => one !== position)) {
      const refused = await save(setting, other)
      expect(refused.statusCode, `${id} ${other}: ${refused.body}`).toBe(400)
      expect(refused.json().error, id).toContain(setting)
      expect(t.client.sqlite.prepare('SELECT value FROM runtime_settings WHERE name = ?').get(setting), id).toBeUndefined()
    }
    const saved = await save(setting, position)
    expect(saved.statusCode, `${id} ${position}: ${saved.body}`).toBe(200)
  }
}, 30_000)

// SIX ROWS SAY WHY THE SPOOL DOES NOT COUNT THEM (wave 13r round AA, item 10b point 7; CeQUKTnH_Iqd). Five checks
// also run on a start from inside the sandbox, under an agent's own command, whose output the host never reads, so a
// line printed there is only the sandbox's own word. One runs at the run's end, after the host has stopped reading.
// Each reason is the last sentence of its row's words and the reason the waiting list keeps, and all six stay waiting.
const FROM_INSIDE = ['a-codex-command-is-checked', 'a-handshake-only-for-own-commands', 'a-run-is-filed-in-one-sandbox', 'launch-logs-stay-in-the-sandbox', 'plain-env-strips-the-launchers-variables']
const AT_THE_RUNS_END = ['a-refused-message-is-said-another-way']

// Mutation: drop a reason from a row's words, give one of the five the other reason, take one of the six off the
// waiting list, or let the container's own lines count one of them.
it('says in each of the six rows the spool cannot count why it is not counted, and keeps all six waiting', async () => {
  const {GATES} = await list()
  const {GATES_COUNTED_FROM_INSIDE, GATES_THE_SPOOL_WAITS_FOR} = await import('../src/config/gate-count-spool.mjs')
  const why = (id: string) => GATES_THE_SPOOL_WAITS_FOR.find(one => one.gate === id)?.why
  const fromInside = why(FROM_INSIDE[0]!)!, atTheEnd = why(AT_THE_RUNS_END[0]!)!
  for (const words of ['from inside the sandbox', "an agent's own command", 'the host never reads', "only the sandbox's own word", 'not counted']) expect(fromInside, words).toContain(words)
  for (const words of ["at the run's end", 'after the host has stopped reading', 'not counted']) expect(atTheEnd, words).toContain(words)
  for (const [ids, reason] of [[FROM_INSIDE, fromInside], [AT_THE_RUNS_END, atTheEnd]] as const) {
    for (const id of ids) {
      expect(why(id), `${id} waits with this reason`).toBe(reason)
      const setting = GATES.find(one => one.id === id)!.setting
      expect(aSentence(`gates.row.${id}`).endsWith(` ${reason}`), `${id}: its words end with the reason`).toBe(true)
      expect(aSentence(`settingsWords.${setting}`).endsWith(` ${reason}`), `${setting}: its words end with the reason`).toBe(true)
      expect(GATES_COUNTED_FROM_INSIDE, id).not.toContain(id)
    }
  }
})
