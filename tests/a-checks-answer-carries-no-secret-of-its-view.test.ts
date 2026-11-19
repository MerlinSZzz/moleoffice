// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A CHECK'S ANSWER CARRIES NO SECRET OF ITS VIEW (problem DNSRdZtWGTjS). The exact value of each secret handed to a check's
 * model is masked in what the model answers, before the inspector prints or files any of it, for Claude Code, Codex,
 * OpenCode and dsh. A piece that only looks like a key is posted as the check wrote it, and the tool reminds, as a message
 * gets a reminder. An answer printed for a person is cut, and kept whole, masked, in the check's model state file.
 *
 * Every secret here is made up, and every model is a labelled stand-in. No real key and no model is used. The dsh case
 * that runs the real launcher, view runner and client is case 11 of tests/the-inspector-checks-with-dsh-over-acp.test.ts.
 *
 * WHAT IT PROVES, by case:
 *   A. runInside masks each secret its runtime is handed, in the view's standard output, its error channel and the
 *      receipt's reason, and counts what it masked by name. A made-up value of a secret it was not handed is left as it
 *      is, and so are the other words. The access token of a Claude login seed is masked too.
 *   B. A template that cannot be read, or a secrets file others can read, stops the command before the launcher is
 *      called, because what the view answers could not be masked.
 *   C. On the host, a Claude Code or Codex stand-in puts the made-up secret of its environment in its verdict and on its
 *      error channel. The tool's output, the posted verdict, the usage receipt the tool writes and the model state it
 *      keeps hold the mask and never the value.
 *   D. An answer of 10,000 characters with no verdict is printed cut to its first 4,000, with a line saying how many
 *      characters were not printed and where the whole is kept, and the kept state holds it whole.
 *   E. A verdict holding a made-up piece shaped like an API key is posted as the check wrote it, and the tool's output
 *      reminds, naming where it is, its first four characters and its length, never the piece.
 *   F. A Codex login the view can read is masked as "the Codex login" (Dxiry_2y6vuD point 1): each field that point
 *      names, a field Codex adds later, a JWT's payload and signature each on its own, and the e-mail, subject and user
 *      id in the id_token's payload, decoded. Its auth_mode and last_refresh are left. A login Codex writes again in the
 *      check's private home while the view runs is read after the view and masked too. An id_token that cannot be
 *      decoded stops the command before the launcher. A login in the private home that is a link after the view is not
 *      read through the link, and nothing the view answered is shown. A string of 1 to 7 characters in the login is
 *      left as it is, so ordinary words that hold it are left too, and the tool says how many such values it left and
 *      why (ZlGd3WZt4lTk). The e-mail, subject and ids in the id_token's payload are masked at any length.
 *      A value of exactly 8 characters is masked beside one of 7 that is left. The count of what is left leaves out
 *      a short value the id_token's pass masks and an empty one, and counts a repeated one once (the inspector,
 *      Z_ZHSQawhFCA note a). Each sentence and refusal names the login as "the check's login seed" or ".codex/auth.json
 *      of the check's private home", and its folder the same way, never by its path on the host, which holds the
 *      username (JNaABU_LRnl0).
 *
 * MUTATIONS, each planted after a control run and then restored:
 *   M1  runInside's mask taken out: A red.
 *   M2  the login seed's token left out of what is masked: A's seed case red.
 *   M3  runInside goes on when the template cannot be read or is unsafe, masking nothing: B red.
 *   M4  the host's mask taken out: C red.
 *   M5  the cut taken out: D red.
 *   M6  the reminder taken out: E red.
 *   M7  a Codex login seed is not read: F's cases of the seed red.
 *   M8  only the fields case F names are read, not every other string: F's later field red.
 *   M9  a JWT's payload and signature are not masked on their own: F's JWT case red.
 *   M10 the id_token's payload is not decoded: F's decoded case red.
 *   M11 the private home's login is not read again after the view: F's refreshed case and its case of the link red.
 *   M12 an id_token that cannot be decoded is passed over: F's case of the id_token red.
 *   M13 a login in the private home that is a link is read through the link: F's case of the link red.
 *   M14 every string in the login is masked, however short: F's case of the short field red.
 *   M15 the id_token's e-mail, subject and ids are left when they are short as well: F's case of the short e-mail red.
 *   M16 the short values are left without a word: F's case of the short field red.
 *   M17 a value of exactly 8 characters is left as short (less-than made less-than-or-equal): F's case of 7 and 8 red.
 *   M18 the count includes a short value another pass masks: F's case of the count red.
 *   M19 the count includes an empty value: F's case of the count red.
 *   M20 the count counts a repeated value each time: F's case of the count red.
 *   M21 the seed is named by its path on the host: F's cases of the seed's sentences and refusals red.
 *   M22 the private home's login is named by its path on the host: F's cases of the private home's refusals red.
 *   M23 a refusal that begins with the login's name begins with a small letter: F's cases of the seed's refusals red.
 * The mask of a dsh transcript has its own mutation, in the dsh file.
 */
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TRACED_HOW } from '../src/shared/releasing.ts'
import { FULL_PERMISSIONS } from '../src/config/run-permissions.mjs'
import { DSH_CHECK_ENV, OPENCODE_CHECK_ENV, runInside } from '../tools/inspector-sandbox.mjs'
import { inspectorViewStandIn } from './inspector-view-stand-in.ts'
import { inspectorFixture } from './inspector-tool-fixture.ts'

/** Made-up values, one for each name a check's runtime may be handed. None is a real key. */
const MADE_UP: Record<string, string> = {
  CLAUDE_CODE_OAUTH_TOKEN: 'made-up-claude-token-not-a-real-one',
  OPENAI_API_KEY: 'made-up-openai-key-not-a-real-one',
  CODEX_API_KEY: 'made-up-codex-key-not-a-real-one',
  OPENCODE_API_KEY: 'made-up-opencode-key-not-a-real-one',
  DEEPSEEK_API_KEY: 'made-up-deepseek-key-not-a-real-one',
}
/** A made-up access token, for a Claude login seed. */
const SEED_TOKEN = 'made-up-claude-login-not-a-real-one'
/** What the mask puts where a secret's value was. */
const masked = (name: string) => `<${name}, masked>`
/** What the stand-in view answers on every channel: each made-up value, and words of its own. */
const ANSWER = `${[...Object.values(MADE_UP), SEED_TOKEN].map((value) => `It held ${value}.`).join(' ')} And ordinary words.`

type View = ReturnType<typeof inspectorViewStandIn>
let view: View | null = null
type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let f: Fixture | null = null
afterEach(async () => {
  view?.close(); view = null
  await f?.close(); f = null
})

const openCodeArgv = (model: string) => ['env', ...Object.entries(OPENCODE_CHECK_ENV).map(([key, value]) => `${key}=${value}`),
  'opencode', 'run', '--format', 'json', '--dir', '/work', '-m', model, '--pure', '--']
const DSH_ARGV = ['env', ...Object.entries(DSH_CHECK_ENV).map(([key, value]) => `${key}=${value}`),
  'node', '/inputs/commands/inspector-dsh-acp.mjs', '--provider', 'deepseek-official', '--model', 'deepseek-flash', '--effort', 'high']

/** The view's answer on standard output, on its error channel and as the receipt's reason. */
function theViewAnswers(v: View, text: string): void {
  v.changeReceipt((receipt) => {
    writeFileSync(receipt.out, text)
    writeFileSync(receipt.err, text)
    receipt.why = text
  })
}

describe('A. runInside masks what the view answers', () => {
  const cases: [string, { runtime: string; label: string; argv: string[]; handed: string[] }][] = [
    ['claude-code', { runtime: 'claude-code', label: 'claude-code', argv: ['synthetic-model'], handed: ['CLAUDE_CODE_OAUTH_TOKEN'] }],
    ['codex', { runtime: 'codex', label: 'codex', argv: ['codex', ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task'], handed: ['OPENAI_API_KEY', 'CODEX_API_KEY'] }],
    ['opencode on opencode-go', { runtime: 'opencode', label: 'opencode', argv: openCodeArgv('opencode-go/deepseek-v4.1-flash'), handed: ['OPENCODE_API_KEY'] }],
    ['opencode on deepseek', { runtime: 'opencode', label: 'opencode', argv: openCodeArgv('deepseek/deepseek-v4.1-flash'), handed: ['DEEPSEEK_API_KEY'] }],
    ['dsh', { runtime: 'dsh', label: 'dsh', argv: DSH_ARGV, handed: ['DEEPSEEK_API_KEY'] }],
  ]
  it.each(cases)('%s: masks each secret it is handed, and leaves every other word', async (_name, c) => {
    view = inspectorViewStandIn({ secrets: MADE_UP })
    theViewAnswers(view, ANSWER)
    const ran = await runInside(view.sandbox, { runtime: c.runtime, label: c.label, cwd: view.work, argv: c.argv, limitMs: 1000, launcher: view.launcher })
    expect(ran.code, ran.why ?? '').toBe(0)
    expect(view.calls[0]!.words.filter((_, i, words) => words[i - 1] === '--secret')).toEqual(c.handed)
    for (const said of [ran.out, ran.err, ran.why]) {
      for (const [name, value] of Object.entries(MADE_UP)) {
        if (c.handed.includes(name)) {
          expect(said).not.toContain(value)
          expect(said).toContain(`It held ${masked(name)}.`)
        } else expect(said).toContain(`It held ${value}.`)
      }
      expect(said).toContain(`It held ${SEED_TOKEN}.`)
      expect(said).toContain('And ordinary words.')
    }
    expect(ran.masked).toEqual(Object.fromEntries(c.handed.map((name) => [name, 3])))
  })

  it('masks the access token of a Claude login seed', async () => {
    view = inspectorViewStandIn()
    const seed = join(view.sandbox.checkDir, 'login-seeds', 'claude.json')
    mkdirSync(join(view.sandbox.checkDir, 'login-seeds'))
    writeFileSync(seed, JSON.stringify({ claudeAiOauth: { accessToken: SEED_TOKEN, expiresAt: 4_102_444_800_000 } }), { mode: 0o600 })
    Object.assign(view.sandbox, { loginSeeds: [{ host: seed, container: '/login/claude.json', target: '.claude/.credentials.json' }] })
    theViewAnswers(view, ANSWER)
    const ran = await runInside(view.sandbox, { runtime: 'claude-code', label: 'claude-code', cwd: view.work, argv: ['synthetic-model'], limitMs: 1000, launcher: view.launcher })
    expect(ran.code, ran.why ?? '').toBe(0)
    for (const said of [ran.out, ran.err, ran.why]) {
      expect(said).not.toContain(SEED_TOKEN)
      expect(said).toContain(`It held ${masked('the Claude login')}.`)
      for (const value of Object.values(MADE_UP)) expect(said).toContain(`It held ${value}.`)
    }
    expect(ran.masked).toEqual({ 'the Claude login': 3 })
  })
})

describe('B. a view whose secrets cannot be read is not started', () => {
  it.each(['cannot be read', 'can be read by others'])('stops before the launcher when the template %s', async (how) => {
    view = inspectorViewStandIn({ secrets: MADE_UP })
    if (how === 'cannot be read') Object.assign(view.sandbox, { templateDir: join(view.root, 'no-template-here') })
    else chmodSync(join(view.root, 'stand-in-secrets'), 0o644)
    theViewAnswers(view, ANSWER)
    const ran = await runInside(view.sandbox, { runtime: 'claude-code', label: 'claude-code', cwd: view.work, argv: ['synthetic-model'], limitMs: 1000, launcher: view.launcher })
    expect(ran.code).toBeNull()
    expect(ran.why).toContain('so what the view answers could not be masked')
    expect(view.calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------- the tool on the host

const THREAD = '01234567-89ab-cdef-0123-456789abcdef'
const RELEASE = { verdict: 'released', check: 'Synthetic check.', chaptersRead: [],
  traced: [{ paths: ['work'], to: 'syntheticAuthority', how: TRACED_HOW[0], said: 'Synthetic authority.' }] }

/**
 * The real tool on the host, with a stand-in `claude` and `codex`. Each answer is its case's, with HANDED replaced by the
 * made-up secret of the stand-in's own runtime, which it also writes on its error channel. `exit` is its exit code.
 */
async function onTheHost(runtime: 'claude-code' | 'codex', answers: string[], { exit = 0 } = {}) {
  f = await inspectorFixture()
  const fixture = f
  fixture.state.checkModel = { runtime, model: runtime === 'codex' ? 'openai/gpt-6.1-sol' : 'anthropic/claude-opus-5-5', variant: 'xhigh', effort: 'xhigh', effortFrom: 'Casting' }
  fixture.state.reading.reports = [{ id: 'native-proof-record', title: 'Synthetic native proof' }]
  fixture.state.records['native-proof-record'] = { status: 200, body: { record: { id: 'native-proof-record', kind: 'report', title: 'Synthetic native proof' } } }
  // A CHECK RUN BY HAND, so the tool writes the usage receipt itself.
  fixture.state.records['native-check'] = { status: 200, body: { record: { kind: 'session', data: { runtime } } } }
  const bin = join(fixture.home, 'bin'), runs = join(fixture.home, 'model-runs')
  mkdirSync(bin); mkdirSync(runs)
  const script = `#!${process.execPath}
// A STAND-IN FOR claude AND codex, written by a test. It starts no model. It answers its case's answers in order, with
// HANDED replaced by the made-up secret its runtime is handed, and writes that secret on its error channel.
import * as fs from 'node:fs'
import * as path from 'node:path'
const program = path.basename(process.argv[1])
const handed = program === 'claude' ? process.env.CLAUDE_CODE_OAUTH_TOKEN : process.env.OPENAI_API_KEY
process.stdin.resume()
process.stdin.on('end', () => {
  const n = fs.readdirSync(${JSON.stringify(runs)}).length
  fs.writeFileSync(path.join(${JSON.stringify(runs)}, n + '.json'), '{}')
  const answers = ${JSON.stringify(answers)}
  const text = answers[Math.min(n, answers.length - 1)].replaceAll('HANDED', handed)
  process.stderr.write('Synthetic error channel, holding ' + handed + '\\n')
  if (program === 'claude') process.stdout.write(JSON.stringify({ type: 'result', session_id: ${JSON.stringify(THREAD)}, result: text, is_error: false, usage: { input_tokens: 11, output_tokens: 3 }, modelUsage: { 'claude-opus-5-5': {} } }))
  else process.stdout.write([{ type: 'thread.started', thread_id: ${JSON.stringify(THREAD)} }, { type: 'item.completed', item: { type: 'agent_message', text } },
    { type: 'turn.completed', usage: { input_tokens: 11, cached_input_tokens: 2, output_tokens: 3 } }].map((event) => JSON.stringify(event)).join('\\n') + '\\n')
  process.exit(${exit})
})
`
  for (const name of ['claude', 'codex']) { writeFileSync(join(bin, name), script); chmodSync(join(bin, name), 0o755) }
  const posts: Record<string, any>[] = []
  fixture.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${fixture.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += part })
    request.on('end', () => {
      posts.push(JSON.parse(raw)); reply.statusCode = 201
      reply.end(JSON.stringify({ verdict: 'released', toTheWorker: 'Synthetic.', toTheStarter: '', group: null }))
    })
    return true
  }
  // EVERY NAME A CHECK MAY BE HANDED IS SET TO A MADE-UP VALUE, so no value this test did not make reaches the stand-in.
  const ran = await fixture.inspect(['--check', 'native-check'], { HOME: fixture.home, PATH: `${bin}:${process.env.PATH}`, ...MADE_UP }, true)
  const stateFile = join(fixture.home, '.cache/mole-office/worktrees', `a-check-of-${fixture.run}-native-check-model.json`)
  return { ran, posts, writes: fixture.state.writes, runs: () => readdirSync(runs).length,
    kept: () => existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : null }
}

const HANDED_TO = { 'claude-code': 'CLAUDE_CODE_OAUTH_TOKEN', codex: 'OPENAI_API_KEY' } as const

for (const runtime of ['claude-code', 'codex'] as const) describe(`C. on the host, ${runtime}`, () => {
  const name = HANDED_TO[runtime]
  it('posts, prints and writes the mask in place of the secret the model put in its verdict', async () => {
    const check = await onTheHost(runtime, [JSON.stringify({ ...RELEASE, check: 'Synthetic check. The model was handed HANDED.' })])
    expect(check.ran.code, check.ran.err).toBe(0)
    expect(`${check.ran.out}${check.ran.err}`).not.toContain(MADE_UP[name])
    expect(check.ran.out).toContain(masked(name))
    expect(check.posts).toHaveLength(1)
    expect(check.posts[0]!.check).toContain(`The model was handed ${masked(name)}.`)
    expect(JSON.stringify(check.posts)).not.toContain(MADE_UP[name])
    const receipt = check.writes.find((write) => write.body.dataPatch?.usageReceipt)
    expect(receipt, 'the tool wrote a usage receipt').toBeDefined()
    expect(JSON.stringify(check.writes)).not.toContain(MADE_UP[name])
  })

  it('prints the mask on its error channel and keeps it in the model state, when the model fails', async () => {
    const check = await onTheHost(runtime, ['Synthetic failure. The model was handed HANDED.'], { exit: 1 })
    expect(check.ran.code).toBe(1)
    expect(`${check.ran.out}${check.ran.err}`).not.toContain(MADE_UP[name])
    expect(check.ran.err).toContain(`Synthetic error channel, holding ${masked(name)}`)
    expect(check.kept()).not.toBeNull()
    expect(check.kept()).not.toContain(MADE_UP[name])
    expect(check.kept()).toContain(masked(name))
  })
})

describe('D. a long answer is printed cut', () => {
  it('prints the first 4,000 characters of an answer with no verdict, says how many were not printed, and keeps it whole', async () => {
    const long = `Synthetic: no verdict. ${'x'.repeat(10_000)}`
    const check = await onTheHost('claude-code', [long, long])
    expect(check.ran.code).toBe(42)
    expect(check.runs()).toBe(2)
    expect(check.ran.err).not.toContain('x'.repeat(4_001))
    expect(check.ran.err).toContain(`${long.slice(0, 4_000)}\n`)
    const notPrinted = `${String(long.length - 4_000)} more characters are not printed here`
    expect(check.ran.err.split(notPrinted)).toHaveLength(3)
    expect(check.ran.err).toContain(`a-check-of-${f!.run}-native-check-model.json`)
    expect(check.ran.err.length).toBeLessThan(12_000)
    expect(check.kept()).toContain('x'.repeat(10_000))
  })
})

describe('E. a piece that only looks like a key', () => {
  it('is posted as the check wrote it, and the tool reminds without printing the piece in the reminder', async () => {
    const piece = 'sk-madeupA1b2C3d4E5f6G7h8'
    const check = await onTheHost('claude-code', [JSON.stringify({ ...RELEASE, check: `Synthetic check. A made-up piece shaped like a key: ${piece}.` })])
    expect(check.ran.code, check.ran.err).toBe(0)
    expect(check.posts[0]!.check).toContain(`A made-up piece shaped like a key: ${piece}.`)
    const reminders = check.ran.out.split('\n').filter((line) => line.includes('seems to hold'))
    expect(reminders).toEqual([expect.stringContaining(`The verdict's check seems to hold an API key: the piece beginning "sk-m", ${String(piece.length)} characters long.`)])
    expect(reminders[0]).not.toContain(piece)
  })
})

// ---------------------------------------------------------------------------- a Codex login

/** Base64url of `value` as JSON, as a JWT's header and payload are written. */
const jwtPart = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')
/** A made-up JWT. Its header says so, and its signature signs nothing. None is a real token. */
const madeUpJwt = (payload: Record<string, unknown>, signature: string) =>
  `${jwtPart({ alg: 'RS256', typ: 'JWT', note: 'made up by a test' })}.${jwtPart(payload)}.${Buffer.from(signature).toString('base64url')}`
/** The payload and the signature of a JWT, each on its own. */
const theJwtPieces = (jwt: string) => jwt.split('.').slice(1)
const CODEX_EMAIL = 'made-up-person@example.invalid'
const CODEX_SUBJECT = 'made-up-provider|made-up-subject-0001'
const CODEX_USER = 'user-madeUpUserNotARealOne'
/** A 36-character account id, as Codex's is. Made up. */
const CODEX_ACCOUNT = '00000000-0000-4000-8000-00000000made'
const ID_TOKEN = madeUpJwt({ iss: 'https://auth.example.invalid', email: CODEX_EMAIL, sub: CODEX_SUBJECT,
  'https://api.openai.com/auth': { chatgpt_account_id: CODEX_ACCOUNT, chatgpt_user_id: CODEX_USER, chatgpt_plan_type: 'made-up-plan' } },
'made-up-id-token-signature-not-a-real-one')
const ACCESS_TOKEN = madeUpJwt({ note: 'a made-up access token' }, 'made-up-access-token-signature-not-a-real-one')
const LATER_FIELD = 'made-up-value-of-a-field-codex-adds-later'
/** A made-up Codex login, in the shape Dxiry_2y6vuD point 1 gives, with one field Codex does not write today. */
const CODEX_LOGIN = { auth_mode: 'chatgpt', OPENAI_API_KEY: 'made-up-codex-login-key-not-a-real-one',
  tokens: { id_token: ID_TOKEN, access_token: ACCESS_TOKEN, refresh_token: 'made-up-refresh-token-not-a-real-one', account_id: CODEX_ACCOUNT },
  last_refresh: '2026-10-18T05:00:00.000000Z', a_field_codex_adds_later: { held: LATER_FIELD } }
const CODEX_ARGV = ['codex', ...FULL_PERMISSIONS.codex!.args, 'exec', '--', 'synthetic task']
/** What every answer of a Codex view says besides what it held: the two fields of the login that are not masked. */
const OPEN_WORDS = `Its auth mode was ${CODEX_LOGIN.auth_mode} and its last refresh ${CODEX_LOGIN.last_refresh}. And ordinary words.`

/** A Codex check's view, signed in by a seed holding `login`, answering that it held each of `held`. */
function aCodexView(login: unknown, held: string[]): View {
  const v = inspectorViewStandIn()
  const seed = join(v.sandbox.checkDir, 'login-seeds', 'codex.json')
  mkdirSync(join(v.sandbox.checkDir, 'login-seeds'))
  writeFileSync(seed, JSON.stringify(login), { mode: 0o600 })
  Object.assign(v.sandbox, { loginSeeds: [{ host: seed, container: '/login/codex.json', target: '.codex/auth.json' }] })
  theViewAnswers(v, `${held.map((value) => `It held ${value}.`).join(' ')} ${OPEN_WORDS}`)
  return v
}
const aCodexCommand = (v: View) =>
  runInside(v.sandbox, { runtime: 'codex', label: 'codex', cwd: v.work, argv: CODEX_ARGV, limitMs: 1000, launcher: v.launcher })
/** Where aCodexView writes its Codex login seed. */
const theCodexSeed = (v: View) => join(v.sandbox.checkDir, 'login-seeds', 'codex.json')
/** Each sentence the tool says to the person who asked for the check, from now on. */
function theSentencesOf(v: View): string[] {
  const said: string[] = []
  v.sandbox.asked.say = (sentence: string) => { said.push(sentence) }
  return said
}

/** Each of `held` is masked as the Codex login, once on each channel, and the fields that are not secret are left. */
function eachIsMasked(ran: Awaited<ReturnType<typeof aCodexCommand>>, held: string[]): void {
  expect(ran.code, ran.why ?? '').toBe(0)
  for (const said of [ran.out, ran.err, ran.why]) {
    for (const value of held) expect(said).not.toContain(value)
    expect(said).toContain(`It held ${masked('the Codex login')}.`)
    expect(said).toContain(OPEN_WORDS)
  }
  expect(ran.masked).toEqual({ 'the Codex login': 3 * held.length })
}

describe('F. a Codex login the view can read is masked (the tool maintainer, Dxiry_2y6vuD point 1)', () => {
  const cases: [string, string[]][] = [
    ['each field the tool maintainer names', [CODEX_LOGIN.OPENAI_API_KEY, ID_TOKEN, ACCESS_TOKEN, CODEX_LOGIN.tokens.refresh_token, CODEX_ACCOUNT]],
    ['a field Codex adds later', [LATER_FIELD]],
    ["a JWT's payload and signature, each on its own", [...theJwtPieces(ID_TOKEN), ...theJwtPieces(ACCESS_TOKEN)]],
    ["the e-mail, the subject and the user id in the id_token's payload, decoded", [CODEX_EMAIL, CODEX_SUBJECT, CODEX_USER]],
  ]
  it.each(cases)('masks %s, and leaves auth_mode and last_refresh', async (_what, held) => {
    view = aCodexView(CODEX_LOGIN, held)
    eachIsMasked(await aCodexCommand(view), held)
  })

  it("masks the login Codex wrote again in the check's private home while the view ran", async () => {
    const refreshed = { ...CODEX_LOGIN, tokens: { ...CODEX_LOGIN.tokens,
      access_token: madeUpJwt({ note: 'a made-up refreshed access token' }, 'made-up-refreshed-signature-not-a-real-one'),
      refresh_token: 'made-up-refreshed-refresh-token-not-a-real-one' } }
    const held = [refreshed.tokens.access_token, refreshed.tokens.refresh_token]
    view = aCodexView(CODEX_LOGIN, held)
    const v = view
    v.changeReceipt((receipt) => {
      // CODEX REFRESHES ITS LOGIN IN THE PRIVATE HOME while the view runs, as the real view keeps it there.
      mkdirSync(join(v.sandbox.home, '.codex'), { recursive: true })
      writeFileSync(join(v.sandbox.home, '.codex', 'auth.json'), JSON.stringify(refreshed), { mode: 0o600 })
      const text = `${held.map((value) => `It held ${value}.`).join(' ')} ${OPEN_WORDS}`
      writeFileSync(receipt.out, text)
      writeFileSync(receipt.err, text)
      receipt.why = text
    })
    eachIsMasked(await aCodexCommand(v), held)
  })

  it('stops before the launcher when the id_token cannot be decoded', async () => {
    view = aCodexView({ ...CODEX_LOGIN, tokens: { ...CODEX_LOGIN.tokens, id_token: 'made-up.not-a-jwt.at-all' } }, [])
    const ran = await aCodexCommand(view)
    expect(ran.code).toBeNull()
    expect(ran.why).toBe("The Codex login in the check's login seed holds an id_token this tool cannot decode, " +
      'so what the view answers could not be masked. Nothing was started.')
    expect(view.calls).toHaveLength(0)
  })

  it("shows nothing the view answered when the login in the check's private home is a link after the view", async () => {
    view = aCodexView(CODEX_LOGIN, [LATER_FIELD])
    const v = view
    const elsewhere = join(v.root, 'a-login-elsewhere.json')
    writeFileSync(elsewhere, JSON.stringify(CODEX_LOGIN), { mode: 0o600 })
    v.changeReceipt((receipt) => {
      // THE VIEW LEAVES A LINK where Codex keeps its login, so the host would read the file the link names.
      mkdirSync(join(v.sandbox.home, '.codex'), { recursive: true })
      symlinkSync(elsewhere, join(v.sandbox.home, '.codex', 'auth.json'))
      writeFileSync(receipt.out, `It held ${LATER_FIELD}.`)
    })
    const ran = await aCodexCommand(v)
    expect(view.calls).toHaveLength(1)
    expect(ran.code).toBeNull()
    expect(ran.why).toBe(".codex/auth.json of the check's private home is a link, so what the view answers could not be masked. " +
      'What it answered is not shown.')
    expect(ran.out).toBe('')
  })

  // Each sentence names the login by where it is for the check, and never by its path on the host, which holds the
  // username (JNaABU_LRnl0).
  const placed: [string, (v: View) => void, string][] = [
    ['the seed is a link', (v) => {
      const elsewhere = join(v.root, 'a-login-elsewhere.json')
      writeFileSync(elsewhere, JSON.stringify(CODEX_LOGIN), { mode: 0o600 })
      rmSync(theCodexSeed(v))
      symlinkSync(elsewhere, theCodexSeed(v))
    }, "The check's login seed is a link, so what the view answers could not be masked. Nothing was started."],
    ["the seed's folder is a link", (v) => {
      const elsewhere = join(v.root, 'seeds-elsewhere')
      renameSync(join(v.sandbox.checkDir, 'login-seeds'), elsewhere)
      symlinkSync(elsewhere, join(v.sandbox.checkDir, 'login-seeds'))
    }, "The folder of the check's login seed is a link, so what the view answers could not be masked. Nothing was started."],
    ['the seed is a folder', (v) => {
      rmSync(theCodexSeed(v))
      mkdirSync(theCodexSeed(v))
    }, "The check's login seed is not a Codex login this tool reads, so what the view answers could not be masked. Nothing was started."],
    ['the seed is not JSON', (v) => writeFileSync(theCodexSeed(v), 'made up, and not JSON'),
      "The check's login seed is not a Codex login this tool can read, so what the view answers could not be masked. Nothing was started."],
    ["the private home's login is not JSON after the view", (v) => v.changeReceipt((receipt) => {
      mkdirSync(join(v.sandbox.home, '.codex'), { recursive: true })
      writeFileSync(join(v.sandbox.home, '.codex', 'auth.json'), 'made up, and not JSON', { mode: 0o600 })
      writeFileSync(receipt.out, `It held ${LATER_FIELD}.`)
    }), ".codex/auth.json of the check's private home is not a Codex login this tool can read, so what the view answers " +
      'could not be masked. What it answered is not shown.'],
    ["the private home's .codex folder is a link after the view", (v) => v.changeReceipt((receipt) => {
      mkdirSync(join(v.root, 'codex-elsewhere'))
      writeFileSync(join(v.root, 'codex-elsewhere', 'auth.json'), JSON.stringify(CODEX_LOGIN), { mode: 0o600 })
      symlinkSync(join(v.root, 'codex-elsewhere'), join(v.sandbox.home, '.codex'))
      writeFileSync(receipt.out, `It held ${LATER_FIELD}.`)
    }), ".codex of the check's private home is a link, so what the view answers could not be masked. What it answered is not shown."],
  ]
  it.each(placed)('names the login relatively, never by its host path, when %s (the tool maintainer, JNaABU_LRnl0)', async (_when, make, sentence) => {
    view = aCodexView(CODEX_LOGIN, [LATER_FIELD])
    make(view)
    const ran = await aCodexCommand(view)
    expect(ran.code).toBeNull()
    expect(ran.why).toBe(sentence)
    expect(ran.out).toBe('')
  })

  it('leaves a string shorter than 8 characters, and says how many it left and why (the tool maintainer, ZlGd3WZt4lTk)', async () => {
    // TWO MADE-UP SHORT VALUES, in fields Codex does not write today. Masked, "pro" would turn "provider" into
    // "<the Codex login, masked>vider" in an answer.
    view = aCodexView({ ...CODEX_LOGIN, a_field_codex_adds_later: { held: LATER_FIELD, a_short_one: 'pro', another: 'plus' } }, [])
    const said = theSentencesOf(view)
    const words = 'Its provider is pro, and its plan is plus.'
    theViewAnswers(view, `It held ${LATER_FIELD}. ${words} ${OPEN_WORDS}`)
    const ran = await aCodexCommand(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    for (const text of [ran.out, ran.err, ran.why]) {
      expect(text).toBe(`It held ${masked('the Codex login')}. ${words} ${OPEN_WORDS}`)
    }
    expect(ran.masked).toEqual({ 'the Codex login': 3 })
    expect(said.filter((sentence) => sentence.includes('Codex login'))).toEqual([`The Codex login in the check's login seed holds 2 values ` +
      'of 1 to 7 characters that are not masked, because a value that short can be part of ordinary words in what the view answers.'])
  })

  it("masks a short e-mail, subject and user id in the id_token's payload, and says nothing of them", async () => {
    // MADE UP, AND EACH SHORTER THAN 8 CHARACTERS. They name the account, so they are masked at any length.
    const held = ['m@x.io', 'sub-1', 'u-1']
    const idToken = madeUpJwt({ iss: 'https://auth.example.invalid', email: held[0], sub: held[1],
      'https://api.openai.com/auth': { chatgpt_account_id: CODEX_ACCOUNT, chatgpt_user_id: held[2] } }, 'made-up-short-id-token-signature')
    view = aCodexView({ ...CODEX_LOGIN, tokens: { ...CODEX_LOGIN.tokens, id_token: idToken } }, held)
    const said = theSentencesOf(view)
    eachIsMasked(await aCodexCommand(view), held)
    expect(said.filter((sentence) => sentence.includes('Codex login'))).toEqual([])
  })

  it('masks a value of exactly 8 characters and leaves one of 7 beside it (the inspector, Z_ZHSQawhFCA note a)', async () => {
    // MADE UP: one value of 7 characters and one of 8, in a field Codex does not write today.
    const seven = 'mk7ch_x'
    const eight = 'mk8ch_xy'
    view = aCodexView({ ...CODEX_LOGIN, a_field_codex_adds_later: { held: LATER_FIELD, seven, eight } }, [])
    const said = theSentencesOf(view)
    theViewAnswers(view, `It held ${LATER_FIELD}. It held ${eight}. Its seven is ${seven}. ${OPEN_WORDS}`)
    const ran = await aCodexCommand(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    for (const text of [ran.out, ran.err, ran.why]) {
      expect(text).toBe(`It held ${masked('the Codex login')}. It held ${masked('the Codex login')}. Its seven is ${seven}. ${OPEN_WORDS}`)
    }
    expect(ran.masked).toEqual({ 'the Codex login': 6 })
    expect(said.filter((sentence) => sentence.includes('Codex login'))).toEqual([`The Codex login in the check's login seed holds 1 value ` +
      'of 1 to 7 characters that is not masked, because a value that short can be part of ordinary words in what the view answers.'])
  })

  it('counts a short value once, and not at all when it is empty or masked as an id in the id_token (the inspector, Z_ZHSQawhFCA note a)', async () => {
    // MADE UP. The user id "u-1" is in the id_token, so it is masked, and the same "u-1" in a field of the login is not
    // counted as left. "plus" is held twice and counted once. The empty string is not counted.
    const idToken = madeUpJwt({ iss: 'https://auth.example.invalid', email: CODEX_EMAIL, sub: CODEX_SUBJECT,
      'https://api.openai.com/auth': { chatgpt_account_id: CODEX_ACCOUNT, chatgpt_user_id: 'u-1' } }, 'made-up-id-token-signature-of-u-1')
    view = aCodexView({ ...CODEX_LOGIN, tokens: { ...CODEX_LOGIN.tokens, id_token: idToken },
      a_field_codex_adds_later: { held: LATER_FIELD, the_user_again: 'u-1', a_plan: 'plus', the_plan_again: 'plus', empty: '' } }, [])
    const said = theSentencesOf(view)
    theViewAnswers(view, `It held u-1. Its plan is plus. ${OPEN_WORDS}`)
    const ran = await aCodexCommand(view)
    expect(ran.code, ran.why ?? '').toBe(0)
    for (const text of [ran.out, ran.err, ran.why]) expect(text).toBe(`It held ${masked('the Codex login')}. Its plan is plus. ${OPEN_WORDS}`)
    expect(ran.masked).toEqual({ 'the Codex login': 3 })
    expect(said.filter((sentence) => sentence.includes('Codex login'))).toEqual([`The Codex login in the check's login seed holds 1 value ` +
      'of 1 to 7 characters that is not masked, because a value that short can be part of ordinary words in what the view answers.'])
  })
})
