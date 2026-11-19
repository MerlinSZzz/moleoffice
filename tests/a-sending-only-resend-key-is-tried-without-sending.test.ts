// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { execFileSync, spawn } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest'
import shipped from '../src/config/provider-setup/providers.json'
import { createProviderKeySetup, type ProviderSetupRow } from '../src/server/lib/provider-key-setup.ts'
import { askTrial } from '../src/config/provider-setup/trial.mjs'
import { sayInEnglish } from '../src/shared/i18n.ts'
import { copyTheFilesTheGuidedCommandsRead } from './the-files-the-guided-commands-read.ts'

// THE STAND-IN GIVES RESEND'S DOCUMENTED ANSWERS, and nothing here reaches Resend. The bodies are the shape the official
// Node SDK reads (statusCode, message, name); the statuses, names and messages are those of
// https://resend.com/docs/api-reference/errors. Whether the real Resend answers a real key this way is shown only by the
// person's own trial.
const documented = {
  sendingOnly: { status: 401, body: { statusCode: 401, message: 'This API key is restricted to only send emails.', name: 'restricted_api_key' } },
  fullAccess: { status: 200, body: { object: 'list', has_more: false, data: [] } },
  noSuchKey: { status: 400, body: { statusCode: 400, message: 'API key is invalid', name: 'validation_error' } },
  notAKey: { status: 401, body: { statusCode: 401, message: 'API key is invalid', name: 'validation_error' } },
  notActive: { status: 403, body: { statusCode: 403, message: 'API key is not active', name: 'restricted_api_key' } },
  missing: { status: 401, body: { statusCode: 401, message: 'Missing API Key', name: 'missing_api_key' } },
}
const resend = shipped.find((row) => row.id === 'resend') as unknown as ProviderSetupRow
const invented = `${resend.prefix}FAKE_ONLY_58213_TEST_VALUE`
type Reply = { status: number; body?: unknown; raw?: string; headers?: Record<string, string> }
let server: Server, port = 0, reply: Reply = documented.sendingOnly
const seen: { method?: string; path?: string; authorization?: string; bytes: number }[] = []
beforeAll(async () => {
  server = createServer((req, res) => {
    let bytes = 0
    req.on('data', (chunk: Buffer) => { bytes += chunk.length })
    req.on('end', () => {
      seen.push({ method: req.method, path: req.url, authorization: req.headers.authorization, bytes })
      res.writeHead(reply.status, { 'content-type': 'application/json', ...reply.headers })
      res.end(reply.raw ?? (reply.body === undefined ? '' : JSON.stringify(reply.body)))
    })
  })
  await new Promise<void>((ok) => server.listen(0, '127.0.0.1', ok))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No stand-in address')
  port = address.port
})
afterAll(async () => { await new Promise<void>((ok) => server.close(() => ok())) })
const roots: string[] = []
afterEach(() => { seen.splice(0); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

/** The shipped Resend row with only its origin moved to the stand-in: the same path and the same declared answers. */
function standInRow(at = port): ProviderSetupRow {
  if (resend.trial === null) throw new Error('The Resend row declares no trial')
  const url = new URL(resend.trial.url)
  return { ...resend, trial: { ...resend.trial, url: `http://127.0.0.1:${at}${url.pathname}${url.search}` } }
}
function settings(at = port) {
  const home = mkdtempSync(join(tmpdir(), 'resend-trial-settings-'))
  roots.push(home)
  const service = createProviderKeySetup({ home, providers: [standInRow(at)] })
  service.save({ provider: 'resend', value: invented })
  return service
}
const oversized: Reply = { status: 401, raw: JSON.stringify({ ...documented.sendingOnly.body, message: 'x'.repeat(5000) }) }
const printed = (text: string) => text.includes(invented) || Object.values(documented).some((one) => 'message' in one.body && text.includes(one.body.message))

it('passes a key Resend answers as sending-only, after one GET to the declared path with the key as a bearer header', async () => {
  reply = documented.sendingOnly
  const result = await settings().trial('resend')
  expect(result.outcome).toBe('passed')
  expect(seen).toEqual([{ method: 'GET', path: new URL(resend.trial!.url).pathname, authorization: `Bearer ${invented}`, bytes: 0 }])
  expect(printed(JSON.stringify(result))).toBe(false)
})

it('does not pass a key that can read the domain list, and says it can do more than the setup asks', async () => {
  reply = documented.fullAccess
  const result = await settings().trial('resend')
  expect(result.outcome).toBe('too-broad')
  expect(printed(JSON.stringify(result))).toBe(false)
})

it.each([
  ['a key Resend does not know', documented.noSuchKey],
  ['a 401 that says the key is invalid', documented.notAKey],
  ['a key that is not active, though its answer has the same name', documented.notActive],
  ['a 401 whose name is not the sending-only one', documented.missing],
  ['a sending-only answer longer than the trial reads', oversized],
  ['an answer that is not JSON', { status: 401, raw: 'restricted_api_key' }],
  ['a redirect, which is not followed', { status: 302, headers: { location: '/elsewhere' } }],
])('refuses %s without printing the key or the answer', async (_name, answer: Reply) => {
  reply = answer
  let said = ''
  await settings().trial('resend').then(() => { said = 'passed' }, (error: Error) => { said = error.message })
  expect(said).not.toBe('passed')
  expect(printed(said)).toBe(false)
  expect(seen.map((one) => one.path)).toEqual([new URL(resend.trial!.url).pathname])
})

it('reads the same outcome from each answer whatever the order of the row\'s answers', async () => {
  const row = standInRow().trial!
  const expected: [Reply, string][] = [
    [documented.sendingOnly, 'passed'], [documented.fullAccess, 'too-broad'], [documented.noSuchKey, 'refused'],
    [documented.notAKey, 'refused'], [documented.notActive, 'refused'], [documented.missing, 'refused'], [oversized, 'refused'],
    [{ status: 401, raw: 'restricted_api_key' }, 'refused'], [{ status: 302, headers: { location: '/elsewhere' } }, 'unexpected'],
  ]
  for (const answers of [row.answers!, [...row.answers!].reverse()]) {
    const outcomes = []
    for (const [answer] of expected) { reply = answer; outcomes.push((await askTrial({ ...row, answers }, invented)).outcome) }
    expect(outcomes).toEqual(expected.map(([, outcome]) => outcome))
  }
})

/** The guided command on a copy of the tools and table, with only the Resend row's origin moved to the stand-in. */
function guided(input: string, at = port): Promise<{ status: number | null; output: string }> {
  const root = mkdtempSync(join(tmpdir(), 'resend-trial-guided-'))
  roots.push(root)
  const home = join(root, 'home'), table = join(root, 'src', 'config', 'provider-setup')
  mkdirSync(home, { mode: 0o700 })
  mkdirSync(join(root, 'src', 'config'), { recursive: true })
  cpSync(resolve('tools/key-setup'), join(root, 'tools', 'key-setup'), { recursive: true })
  copyTheFilesTheGuidedCommandsRead(resolve('.'), root)
  const rows = JSON.parse(readFileSync(join(table, 'providers.json'), 'utf8')) as ProviderSetupRow[]
  writeFileSync(join(table, 'providers.json'), JSON.stringify(rows.map((row) => row.id === 'resend' ? standInRow(at) : row)))
  const env = { PATH: process.env.PATH, LANG: 'C.UTF-8', HOME: home, KEY_SETUP_NODE: process.execPath, KEY_SETUP_LANG: 'en' }
  return new Promise((ok, reject) => {
    const child = spawn('bash', [join(root, 'tools', 'key-setup', 'setup-provider.sh'), 'resend', '--from', '3'], { env, timeout: 10000 })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    child.on('error', reject); child.on('close', (status) => ok({ status, output }))
    child.stdin.end(input)
  })
}

it('the guided command reads the same answers: sending-only passes, a broader key and an unknown key do not', async () => {
  reply = documented.sendingOnly
  const passed = await guided(`${invented}\n\n`)
  expect(passed.status).toBe(0)
  expect(passed.output.includes(resend.trialDescription!)).toBe(true)
  reply = documented.fullAccess
  const broader = await guided(`${invented}\n\n`)
  expect(broader.status).not.toBe(0)
  reply = documented.noSuchKey
  const unknown = await guided(`${invented}\n\n`)
  expect(unknown.status).not.toBe(0)
  expect(broader.output).not.toBe(unknown.output)
  expect(seen.map((one) => [one.method, one.path, one.authorization])).toEqual(Array(3).fill(['GET', new URL(resend.trial!.url).pathname, `Bearer ${invented}`]))
  for (const run of [passed, broader, unknown]) expect(printed(run.output)).toBe(false)
}, 40000)

it('Settings, its page and the guided command tell each answer in the same words', async () => {
  // A LOOPBACK PORT WITH NOTHING ON IT, for the provider that cannot be reached.
  const closed = createServer()
  await new Promise<void>((ok) => closed.listen(0, '127.0.0.1', ok))
  const address = closed.address()
  if (!address || typeof address === 'string') throw new Error('No closed port')
  await new Promise<void>((ok) => closed.close(() => ok()))
  // THE GUIDED COMMAND'S TWO MARKS, read from the file that sets them, in English: the one it puts before a stopped step's
  // words, and the one that ends a prompt to press Enter.
  const marks = execFileSync('bash', ['-c', 'titles=(); LANGUAGE=en; . "$1"; printf "%s\\0%s" "$MSG_STOP" "$MSG_GO"', 'bash', resolve('tools/key-setup/common.sh')],
    { env: { PATH: process.env.PATH }, encoding: 'utf8' }).split('\0')
  expect(marks.length === 2 && marks.every((mark) => mark !== '')).toBe(true)
  const [stopMark, goMark] = marks as [string, string]
  const answers: [string, Reply | null][] = [['passed', documented.sendingOnly], ['too broad', documented.fullAccess],
    ['refused', documented.noSuchKey], ['not declared', { status: 429, body: {} }], ['not reached', null]]
  const told: Record<string, string> = {}
  for (const [name, answer] of answers) {
    const at = answer === null ? address.port : port
    if (answer !== null) reply = answer
    told[name] = await settings(at).trial('resend').then((result) => result.says, (error: Error) => error.message)
    const run = await guided(`${invented}\n\n`, at)
    // A TERMINAL SHOWS THE ENTER the person presses after a prompt, and the pipe here does not, so it is put back before the
    // output is cut into the lines the person sees.
    const lines = run.output.replaceAll(goMark, `${goMark}\n`).split('\n')
    // A WHOLE LINE, so a guided sentence with words added before or after Settings' sentence is told apart from it.
    const line = name === 'passed' ? told[name] : `${stopMark}${told[name]}`
    expect(lines, `${name}: the guided command's own line says what Settings says, and nothing more`).toContain(line)
    expect(printed(run.output) || printed(told[name]!)).toBe(false)
  }
  expect(new Set(Object.values(told)).size).toBe(answers.length)
  expect(sayInEnglish('providerSetup.savedTrial'), 'the page says what Settings says of a pass').toBe(told['passed'])
  expect(sayInEnglish('providerSetup.tooBroad'), 'the page says what Settings says of a broader key').toBe(told['too broad'])
}, 60000)
