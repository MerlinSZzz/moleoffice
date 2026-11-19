// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE SANDBOXES' LOGINS ARE SET BY THE PERSON, ON THE SETTINGS PAGE, AND NEVER READ BACK.
 * The doors are src/server/api/sandbox-logins.ts and the file handling is src/server/lib/sandbox-logins.ts.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IS CLAIMED
 * ---------------------------------------------------------------------------------------
 *
 *   · The read lists every login the real sandbox templates declare, with the programs that read it, set or not set,
 *     and never a value.
 *   · Only the person sets or clears one. An agent is refused, and so is a name no template declares, a value of more
 *     than one line, and an empty one. None of those changes the file.
 *   · Setting one writes its line into the file the templates name, at mode 600, and keeps every other line as it was.
 *     Setting it again replaces the line; clearing it takes the line out and keeps the rest.
 *   · A file others can read is named on the reading, and the next write makes it 600.
 *   · What was written is what the launcher hands a run: tools/sandbox-common.mjs gives an opencode run the login
 *     set here, its very line, and a claude-code run does not get it.
 *   · A line with nothing after the = is not set on the page and not passed by the launcher, which names it, so the
 *     two say the same thing about one file. Both are the inspector's notes on the release of run ZN18jAuiPeUx
 *     (message 5UVO4vJq74Kk).
 *   · The paid voice platforms' keys, which only ai-news-studio declares and no program reads, are listed on the page
 *     as read by nothing, go to a plain exec in the studio, and go to no run of any runtime and to no other template,
 *     as message rj3upPAbKcmT says.
 *   · The studio's OpenAI image key, OPENAI_IMAGE_API_KEY, which only ai-news-studio declares and no program reads, is
 *     listed on the page as read by nothing, goes to a plain exec in the studio that names it with --secret and not to
 *     one that names another key, goes to no run of any runtime, and is refused as undeclared in every other template
 *     (messages 3mGi1mGz0NXv and rmWErFbjc6O0).
 *
 * ---------------------------------------------------------------------------------------
 * THE HOME FOLDER IS THIS TEST'S OWN
 * ---------------------------------------------------------------------------------------
 *
 * The templates name the file under `~`, so HOME is pointed at a scratch folder before anything is asked, and every
 * case first checks that the file it would write is inside that folder. The logins here are made up.
 *
 * ---------------------------------------------------------------------------------------
 * MUTATIONS, NAMED, EACH AFTER A CONTROL RUN
 * ---------------------------------------------------------------------------------------
 *
 *   1. src/server/api/sandbox-logins.ts: drop the person-only clause from the set door. The agent case goes red.
 *   2. src/server/lib/sandbox-logins.ts, setASandboxLogin: keep only the new line. The kept-lines case goes red.
 *   3. src/server/lib/sandbox-logins.ts, writeWhole: create the new file at 0644. The mode case goes red.
 *   4. src/server/lib/sandbox-logins.ts, aDeclaredName: take any name. The undeclared-name case goes red.
 *   5. tools/sandbox-common.mjs, theDeclaredSecrets: hand each line with its value dropped (NAME= alone), which leaves
 *      the names as they were. The launcher case goes red on its lines.
 *   6. tools/sandbox-common.mjs, theDeclaredSecrets: pass a line with nothing after the =. The empty-line case goes red.
 *   7. tools/sandbox-common.mjs, theDeclaredSecrets: leave the sentence about an empty line out. The empty-line case
 *      goes red.
 *   8. tools/sandbox-common.mjs, theDeclaredSecrets: give a run a name whose readBy is empty, as if every program read
 *      it. The voice-keys case goes red.
 *   9. sandboxes/ai-news-studio/sandbox.json: MINIMAX_API_KEY read by opencode. The voice-keys case goes red.
 *  10. sandboxes/ai-news-studio/sandbox.json: MINIMAX_GROUP_ID not declared. The voice-keys case goes red.
 *  11. sandboxes/mole-office-dev/sandbox.json: ELEVENLABS_API_KEY declared there too. The voice-keys case goes red.
 *  12. sandboxes/ai-news-studio/sandbox.json: OPENAI_IMAGE_API_KEY not declared. Each of the five image-key cases goes
 *      red.
 *  13. sandboxes/ai-news-studio/sandbox.json: OPENAI_IMAGE_API_KEY read by codex. The image key's runs case goes red.
 *  14. sandboxes/cfc-gpu/sandbox.json: OPENAI_IMAGE_API_KEY declared there too. The image key's other-templates case
 *      goes red.
 *  15. tools/sandbox-common.mjs, theDeclaredSecrets: hand every declared line, whatever --secret names. The image
 *      key's two plain-exec cases go red.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { THE_PERSON } from '../src/shared/person.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const A_MADE_UP_LOGIN = 'not-a-real-login-4321'
const ANOTHER_MADE_UP_LOGIN = 'not-a-real-login-8765'

let t: TestDb
let app: FastifyInstance
let home = ''
let file = ''
const previousHome = process.env['HOME']

const AS_THE_PERSON = {
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'human',
  'x-mole-office-actor-id': THE_PERSON,
}
const asAgent = (id: string): Record<string, string> => ({
  'content-type': 'application/json',
  'x-mole-office-workspace': 'default',
  'x-mole-office-actor-type': 'agent',
  'x-mole-office-actor-id': id,
})

interface Reading {
  file: string | null
  unsafe: string | null
  names: { name: string; readBy: string[]; set: boolean }[]
  says: string
}

async function ask(method: 'GET' | 'POST', path: string, headers: Record<string, string>, body?: unknown): Promise<{ code: number; said: Reading; text: string }> {
  const reply = await app.inject({ method, url: path, headers, ...(body === undefined ? {} : { payload: body as object }) })
  return { code: reply.statusCode, said: reply.json() as Reading, text: reply.body }
}

/** THE FILE THE TEMPLATES NAME, which must be inside this test's home before anything writes it. */
function theFileHere(): string {
  expect(file.startsWith(home + sep), `${file} is not inside this test's home ${home}`).toBe(true)
  return file
}

beforeAll(async () => {
  home = mkdtempSync(join(tmpdir(), 'mole-office-sandbox-logins-'))
  process.env['HOME'] = home
  const template = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as { secrets: { hostFile: string } }
  file = template.secrets.hostFile.replace(/^~(?=\/)/, home)
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await ask('POST', '/api/agents/started', AS_THE_PERSON, { handle: 'sec-one', name: 'Secretary One', role: 'secretary' })
})

afterAll(async () => {
  await app.close()
  t.close()
  if (previousHome === undefined) delete process.env['HOME']
  else process.env['HOME'] = previousHome
  if (home !== '') rmSync(home, { recursive: true, force: true })
})

describe('the reading', () => {
  it('lists every login the templates declare, with who reads it, and none set before the file exists', async () => {
    expect(existsSync(theFileHere())).toBe(false)
    const read = await ask('GET', '/api/office/sandbox-logins', asAgent('sec-one'))
    expect(read.code, read.text.slice(0, 300)).toBe(200)
    const names = read.said.names.map((one) => one.name)
    for (const one of ['OPENCODE_API_KEY', 'OPENROUTER_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN', 'CODEX_API_KEY']) expect(names).toContain(one)
    expect(read.said.names.find((one) => one.name === 'OPENCODE_API_KEY')?.readBy).toEqual(['opencode'])
    expect(read.said.names.every((one) => !one.set)).toBe(true)
    expect(read.said.file).toBe('~/.config/mole-office/sandbox-secrets.env')
  })
})

describe('only the person sets or clears one', () => {
  it('refuses an agent, and the file stays as it was', async () => {
    for (const [path, body] of [
      ['/api/office/sandbox-logins/set', { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN }],
      ['/api/office/sandbox-logins/clear', { name: 'OPENCODE_API_KEY' }],
    ] as const) {
      const refused = await ask('POST', path, asAgent('sec-one'), body)
      expect(refused.code, `${path}: ${refused.text.slice(0, 200)}`).toBe(403)
      expect(refused.text).toContain("the owner's own act")
    }
    expect(existsSync(theFileHere())).toBe(false)
  })

  it('refuses a name no template declares, a login of two lines and an empty one, and writes nothing', async () => {
    const undeclared = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'SOME_OTHER_KEY', value: A_MADE_UP_LOGIN })
    expect(undeclared.code).toBe(400)
    expect(undeclared.text).toContain('is not a login the sandbox templates declare')
    const twoLines = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENCODE_API_KEY', value: `${A_MADE_UP_LOGIN}\nSOME_OTHER_KEY=x` })
    expect(twoLines.code).toBe(400)
    expect(twoLines.text).toContain('is one line')
    const empty = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENCODE_API_KEY', value: '   ' })
    expect(empty.code).toBe(400)
    expect(existsSync(theFileHere())).toBe(false)
  })
})

describe('the file', () => {
  it('writes the login at mode 600 beside every other line, and never answers it', async () => {
    // THE FILE AS THE OWNER LEFT IT: a login of their own and a line that is not a login, both kept as they are.
    mkdirSync(join(home, '.config', 'mole-office'), { recursive: true })
    writeFileSync(theFileHere(), `CLAUDE_CODE_OAUTH_TOKEN=${ANOTHER_MADE_UP_LOGIN}\n# a line of the person's own\n`, { mode: 0o600 })
    const set = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN })
    expect(set.code, set.text.slice(0, 300)).toBe(200)
    expect(set.text).not.toContain(A_MADE_UP_LOGIN)
    expect(set.text).not.toContain(ANOTHER_MADE_UP_LOGIN)
    expect(set.said.names.find((one) => one.name === 'OPENCODE_API_KEY')?.set).toBe(true)
    expect(set.said.names.find((one) => one.name === 'CLAUDE_CODE_OAUTH_TOKEN')?.set).toBe(true)
    expect(readFileSync(theFileHere(), 'utf8')).toBe(`CLAUDE_CODE_OAUTH_TOKEN=${ANOTHER_MADE_UP_LOGIN}\n# a line of the person's own\nOPENCODE_API_KEY=${A_MADE_UP_LOGIN}\n`)
    expect(statSync(theFileHere()).mode & 0o777).toBe(0o600)
  })

  it('replaces the line when set again, and takes only that line out when cleared', async () => {
    const again = await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENCODE_API_KEY', value: `${A_MADE_UP_LOGIN}-2` })
    expect(again.code).toBe(200)
    const lines = readFileSync(theFileHere(), 'utf8').split('\n').filter((line) => line.startsWith('OPENCODE_API_KEY='))
    expect(lines).toEqual([`OPENCODE_API_KEY=${A_MADE_UP_LOGIN}-2`])
    const cleared = await ask('POST', '/api/office/sandbox-logins/clear', AS_THE_PERSON, { name: 'OPENCODE_API_KEY' })
    expect(cleared.code).toBe(200)
    expect(cleared.said.names.find((one) => one.name === 'OPENCODE_API_KEY')?.set).toBe(false)
    expect(readFileSync(theFileHere(), 'utf8')).toBe(`CLAUDE_CODE_OAUTH_TOKEN=${ANOTHER_MADE_UP_LOGIN}\n# a line of the person's own\n`)
  })

  it('names a file others can read, and the next write makes it 600', async () => {
    chmodSync(theFileHere(), 0o644)
    const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
    expect(read.said.unsafe).toContain('can be read by others (mode 644)')
    await ask('POST', '/api/office/sandbox-logins/set', AS_THE_PERSON, { name: 'OPENCODE_API_KEY', value: A_MADE_UP_LOGIN })
    expect(statSync(theFileHere()).mode & 0o777).toBe(0o600)
    expect((await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)).said.unsafe).toBeNull()
  })

  it('is what the launcher hands a run: an opencode run gets the login, a claude-code run does not', async () => {
    const office = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as unknown
    const forOpencode = (await theLauncher()).theDeclaredSecrets(office, home, 'opencode')
    expect(forOpencode.names).toContain('OPENCODE_API_KEY')
    expect(forOpencode.lines).toContain(`OPENCODE_API_KEY=${A_MADE_UP_LOGIN}`)
    const forClaude = (await theLauncher()).theDeclaredSecrets(office, home, 'claude-code')
    expect(forClaude.names).not.toContain('OPENCODE_API_KEY')
    expect(forClaude.lines.filter((line) => line.startsWith('OPENCODE_API_KEY='))).toEqual([])
  })

  it('a line with nothing after the = is not set on the page, and the launcher does not pass it and says so', async () => {
    // THE FILE WITH AN EMPTY LINE, as a hand edit can leave one.
    writeFileSync(theFileHere(), `CLAUDE_CODE_OAUTH_TOKEN=${ANOTHER_MADE_UP_LOGIN}\nOPENCODE_API_KEY=\n`, { mode: 0o600 })
    const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
    expect(read.said.names.find((one) => one.name === 'OPENCODE_API_KEY')?.set).toBe(false)
    const office = JSON.parse(readFileSync(join(REPO, 'sandboxes', 'mole-office-dev', 'sandbox.json'), 'utf8')) as unknown
    const handed = (await theLauncher()).theDeclaredSecrets(office, home, 'opencode')
    expect(handed.lines.filter((line) => line.startsWith('OPENCODE_API_KEY='))).toEqual([])
    expect(handed.names).not.toContain('OPENCODE_API_KEY')
    expect(handed.says).toContain('OPENCODE_API_KEY with nothing after the =, so it is not passed')
  })

  it("the voice platforms' keys, which only the studio declares and no program reads, go to a plain exec there and to no run", async () => {
    // PAID VOICE PLATFORMS ARE APPROVED for ai-news. Their keys are for the studio's own
    // scripts, which are started with `sandbox.mjs exec`, and no agent program is to hold them (message rj3upPAbKcmT).
    const voice = ['MINIMAX_API_KEY', 'MINIMAX_GROUP_ID', 'ELEVENLABS_API_KEY']
    writeFileSync(theFileHere(), voice.map((name) => `${name}=${A_MADE_UP_LOGIN}`).join('\n') + '\n', { mode: 0o600 })
    const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
    for (const name of voice) expect(read.said.names.find((one) => one.name === name), name).toMatchObject({ readBy: [], set: true })
    const launcher = await theLauncher()
    const aTemplate = (name: string): unknown => JSON.parse(readFileSync(join(REPO, 'sandboxes', name, 'sandbox.json'), 'utf8')) as unknown
    const studio = aTemplate('ai-news-studio')
    expect(launcher.theDeclaredSecrets(studio, home).names).toEqual(expect.arrayContaining(voice))
    for (const runtime of ['claude-code', 'codex', 'opencode', 'dsh']) {
      expect(launcher.theDeclaredSecrets(studio, home, runtime).names.filter((name) => voice.includes(name)), runtime).toEqual([])
    }
    const others = readdirSync(join(REPO, 'sandboxes')).filter((name) => name !== 'ai-news-studio' && existsSync(join(REPO, 'sandboxes', name, 'sandbox.json')))
    expect(others.length).toBeGreaterThan(0)
    for (const name of others) {
      expect(launcher.theDeclaredSecrets(aTemplate(name), home).names.filter((one) => voice.includes(one)), name).toEqual([])
    }
  })
})

// THE STUDIO'S OPENAI IMAGE KEY is for the studio's image scripts and the Image API alone (message
// 3mGi1mGz0NXv). It has a name of its own because the three templates share one host file and each declares
// OPENAI_API_KEY as read by codex and opencode, so a line under that name would reach every such run in every sandbox.
describe("the studio's image key", () => {
  const IMAGE = 'OPENAI_IMAGE_API_KEY'
  const aTemplate = (name: string): unknown => JSON.parse(readFileSync(join(REPO, 'sandboxes', name, 'sandbox.json'), 'utf8')) as unknown

  /**
   * The file with the image key and one voice key set, and the studio's template, after checking that the studio
   * hands the image key to a plain exec that names it. Without that check, a case below that shows the key kept out
   * would pass on a key nobody declared.
   */
  async function theStudioWithTheImageKeySet(): Promise<unknown> {
    writeFileSync(theFileHere(), `${IMAGE}=${A_MADE_UP_LOGIN}\nMINIMAX_API_KEY=${ANOTHER_MADE_UP_LOGIN}\n`, { mode: 0o600 })
    const studio = aTemplate('ai-news-studio')
    const named = (await theLauncher()).theDeclaredSecrets(studio, home, undefined, [IMAGE])
    expect(named.unsafe, 'the studio does not declare the image key').toBeNull()
    expect(named.lines).toContain(`${IMAGE}=${A_MADE_UP_LOGIN}`)
    return studio
  }

  it('is listed on the page as read by nothing', async () => {
    writeFileSync(theFileHere(), `${IMAGE}=${A_MADE_UP_LOGIN}\n`, { mode: 0o600 })
    const read = await ask('GET', '/api/office/sandbox-logins', AS_THE_PERSON)
    expect(read.code).toBe(200)
    expect(read.said.names.find((one) => one.name === IMAGE)).toMatchObject({ readBy: [], set: true })
    expect(read.text).not.toContain(A_MADE_UP_LOGIN)
  })

  it('goes to a plain exec in the studio that names it with --secret', async () => {
    const studio = await theStudioWithTheImageKeySet()
    const handed = (await theLauncher()).theDeclaredSecrets(studio, home, undefined, [IMAGE])
    expect(handed.lines).toEqual([`${IMAGE}=${A_MADE_UP_LOGIN}`])
    expect(handed.names).toEqual([IMAGE])
    expect(handed.says).toContain(`passing ${IMAGE} into the sandbox through an env file, because --secret asked for them.`)
  })

  // A PLAIN EXEC WITH NO --secret AT ALL is handed no line, whatever the template declares: tools/sandbox.mjs gives it
  // theNoSecretsFor, which this file cannot call, and tests/sandbox-launcher.test.ts shows it with a made-up template.
  // This case shows the rest: a plain exec that names another of the studio's keys gets that one and not this one.
  it('does not go to a plain exec in the studio that names another key', async () => {
    const studio = await theStudioWithTheImageKeySet()
    const handed = (await theLauncher()).theDeclaredSecrets(studio, home, undefined, ['MINIMAX_API_KEY'])
    expect(handed.unsafe).toBeNull()
    expect(handed.lines).toEqual([`MINIMAX_API_KEY=${ANOTHER_MADE_UP_LOGIN}`])
    expect(handed.names).not.toContain(IMAGE)
  })

  it('goes to no claude-code, codex, opencode or dsh run in the studio', async () => {
    const studio = await theStudioWithTheImageKeySet()
    for (const runtime of ['claude-code', 'codex', 'opencode', 'dsh']) {
      const handed = (await theLauncher()).theDeclaredSecrets(studio, home, runtime)
      expect(handed.names, runtime).not.toContain(IMAGE)
      expect(handed.lines.filter((line) => line.startsWith(`${IMAGE}=`)), runtime).toEqual([])
    }
  })

  it('is refused as undeclared by an exec in mole-office-dev, cfc-gpu and every other template that names it', async () => {
    await theStudioWithTheImageKeySet()
    const others = readdirSync(join(REPO, 'sandboxes')).filter((name) => name !== 'ai-news-studio' && existsSync(join(REPO, 'sandboxes', name, 'sandbox.json')))
    expect(others).toEqual(expect.arrayContaining(['mole-office-dev', 'cfc-gpu']))
    for (const name of others) {
      const refused = (await theLauncher()).theDeclaredSecrets(aTemplate(name), home, undefined, [IMAGE])
      expect(refused.unsafe, name).toContain(`--secret names undeclared secrets: ${IMAGE}.`)
      expect(refused.lines, name).toEqual([])
    }
  })
})

/** The launcher's reading of the secrets file, tools/sandbox-common.mjs, as a run is handed it. */
async function theLauncher(): Promise<{
  theDeclaredSecrets: (office: unknown, home: string, runtime?: string, requestedNames?: string[]) => { names: string[]; lines: string[]; says: string | null; unsafe: string | null }
}> {
  return (await import('../tools/sandbox-common.mjs')) as {
    theDeclaredSecrets: (office: unknown, home: string, runtime?: string, requestedNames?: string[]) => { names: string[]; lines: string[]; says: string | null; unsafe: string | null }
  }
}
