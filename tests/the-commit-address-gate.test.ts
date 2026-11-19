// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S GATE AGAINST A COMMIT AT THE PLACEHOLDER ADDRESS (wave 13q, 21 October 2026):
 * tools/merge-tool/commit-addresses.mjs.
 *
 * Each case that screens makes a throwaway repository with a main and an entry on it, and screens main..entry as
 * integrate does:
 *
 *   1. a commit whose author is at the placeholder domain is refused by its sha and that address, and its committer,
 *      at another domain, is written nowhere;
 *   2. the same for a commit whose committer is at the placeholder domain;
 *   3. an entry whose commits are all at other domains passes, and the screen says how many commits it read;
 *   4. a commit already on main that carries the placeholder never blocks;
 *   5. the screen refuses at the domain its caller gives it, and integrate gives it the domain of the setting's
 *      declared default, which arguments.mjs reads and integrate's caller passes, and not the value in force: with
 *      MOLE_OFFICE_COMMIT_EMAIL set to another address, a commit at the default's domain is still refused, and the test
 *      reads that domain apart from the gate, so a caller that gave another domain is caught. The case reads integrate's
 *      whole line and arguments.mjs's line, so a value added after the call, or a default no longer read there, is
 *      caught;
 *   6. the domain is compared without regard to case, and a subdomain of it is another domain;
 *   7. a merge commit in the range is read;
 *   9. at block, the gate's default, an entry with a commit at the placeholder is refused as it was before the gate had
 *      positions, and an entry with none goes on and nothing more is said;
 *  10. at remind the entry goes on: the log says so and names each commit, and the gate hands integrate each commit to
 *      carry on the integrated step, so the entry's record and its receipt name them;
 *  11. at off the entry goes on, the gate carries nothing, and the log says the gate is off and stopped nothing;
 *  12. a position the gate does not know is a broken assumption, and throws. The gate reads no position of its own, so
 *      one not given throws too. The reader gives the row's default, each position the row allows, and refuses any other;
 *  13. the office keeps the commits the integrated step carries only when every address in them is at the stated domain;
 *  14. the merge tool knows the step door's refusal of a key the integrated step does not declare by the door's own words
 *      and status, and nothing looser;
 *  15. an office that takes placeholderCommits gets the integrated step once, with them;
 *  16. an office older than the field refuses it once, in those words. The tool sends the step again without it, names
 *      each commit and the remind position in its log, and goes on;
 *  17. any other refusal of the step stops the tool: another key refused, the same words at another status, and a
 *      refusal of the step sent again.
 *
 * The way from the gate's position through the office's step door to data.integrated is driven end to end in
 * tests/the-merger.test.ts. Cases 15 to 17 run the merge tool's own step function in a process of its own, against a
 * stand-in office in this process, because no office that lacks the field can be started from this tree. The stand-in
 * answers with the real door's words for a key it does not declare, read in case 14, with that key changed to
 * placeholderCommits.
 *
 * No placeholder address is written out in this file. The screen refuses at the domain its caller gives it; integrate
 * gives it the domain of the setting's declared default, and the test reads that domain apart from the gate, so a
 * caller that gave another domain is caught. Every other address is at a domain under .test, which names nobody.
 */

import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { gateNamed } from '../src/config/gates.mjs'
import { settingNamed } from '../src/config/settings.mjs'
import { screenTheCommits, theRefusalSaid, theScreenSaid, whatTheGateDoes } from '../tools/merge-tool/commit-addresses.mjs'
import { freshDb, type TestDb } from './helpers.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The placeholder domain, read here from the declaration itself and not through the gate. */
const DECLARED = String(settingNamed('MOLE_OFFICE_COMMIT_EMAIL').fallback)
const PLACEHOLDER = DECLARED.slice(DECLARED.lastIndexOf('@') + 1)
/** An address at the placeholder domain, built at run time. */
const placeholder = (who: string): string => `${who}@${PLACEHOLDER}`
const A_PERSON = 'a.person@mail.test'
const ANOTHER = 'another@elsewhere.test'

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

const before = process.env.MOLE_OFFICE_COMMIT_EMAIL
afterEach(() => {
  if (before === undefined) delete process.env.MOLE_OFFICE_COMMIT_EMAIL
  else process.env.MOLE_OFFICE_COMMIT_EMAIL = before
})

/** Git in a fixture, with no system or user settings, and the author and committer each commit names. */
function git(dir: string, args: string[], who: { author?: string; committer?: string } = {}): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: who.author ?? A_PERSON,
      GIT_COMMITTER_EMAIL: who.committer ?? A_PERSON,
    },
  }).trim()
}

type Who = { author?: string; committer?: string }

/** One commit that adds a file, by `who`. @returns its sha */
function commit(dir: string, file: string, who: Who = {}): string {
  writeFileSync(join(dir, file), `${file}\n`)
  git(dir, ['add', '-A'])
  git(dir, ['commit', '--quiet', '-m', file], who)
  return git(dir, ['rev-parse', 'HEAD'])
}

/** A repository whose main has one commit by `onMain`, and an entry on it whose commits are by each of `entry`. */
function anEntry(entry: Who[], onMain: Who = {}): { dir: string; base: string; head: string; commits: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'commit-address-gate-'))
  made.push(dir)
  git(dir, ['init', '--quiet', '-b', 'main'])
  const base = commit(dir, 'main.md', onMain)
  git(dir, ['checkout', '--quiet', '-b', 'entry'])
  const commits = entry.map((who, i) => commit(dir, `entry-${String(i)}.md`, who))
  return { dir, base, head: git(dir, ['rev-parse', 'HEAD']), commits }
}

describe('the commit-address gate reads the author and committer of every commit the entry would land', () => {
  it('refuses a commit whose author is at the placeholder domain by its sha and that address, and writes its committer nowhere', () => {
    const { dir, base, head, commits } = anEntry([{}, { author: placeholder('round'), committer: ANOTHER }])
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.read.commits).toBe(2)
    expect(screen.refused).toEqual([{ commit: commits[1], author: placeholder('round'), committer: null }])
    const refusal = theRefusalSaid(screen)
    expect(refusal).toContain(`${String(commits[1])}: its author is ${placeholder('round')}, its committer is at another domain`)
    for (const said of [refusal ?? '', JSON.stringify(screen), theScreenSaid(screen)]) {
      expect(said).not.toContain(ANOTHER)
      expect(said).not.toContain(A_PERSON)
    }
  })

  it('refuses a commit whose committer is at the placeholder domain the same way', () => {
    const { dir, base, head, commits } = anEntry([{ author: ANOTHER, committer: placeholder('queue') }])
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.refused).toEqual([{ commit: commits[0], author: null, committer: placeholder('queue') }])
    expect(theRefusalSaid(screen)).toContain(`${String(commits[0])}: its author is at another domain, its committer is ${placeholder('queue')}`)
    expect(JSON.stringify(screen)).not.toContain(ANOTHER)
  })

  it('passes an entry whose commits are all at other domains, and says how many commits it read', () => {
    const { dir, base, head } = anEntry([{}, { author: ANOTHER }, { committer: ANOTHER }])
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.refused).toEqual([])
    expect(theRefusalSaid(screen)).toBeNull()
    expect(theScreenSaid(screen)).toBe(`The commit-address gate read 3 commits in ${base}..${head}: none at the placeholder domain ${PLACEHOLDER}.`)
  })

  it('never blocks on a commit already on main', () => {
    const { dir, base, head } = anEntry([{}], { author: placeholder('old'), committer: placeholder('old') })
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.read.commits).toBe(1)
    expect(screen.refused).toEqual([])
  })


  it('refuses a screen given no domain, naming the placeholder domain in its sentence', () => {
    const { dir, base, head } = anEntry([{}])
    const screen = screenTheCommits as (what: { repo: string; base: string; head: string; domain?: string }) => unknown
    expect(() => screen({ repo: dir, base, head })).toThrow('the caller must pass the placeholder domain')
  })

  it('compares the domain without regard to case, and counts a subdomain as another domain', () => {
    const { dir, base, head, commits } = anEntry([{ author: `round@${PLACEHOLDER.toUpperCase()}` }, { author: `round@sub.${PLACEHOLDER}` }])
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.refused).toEqual([{ commit: commits[0], author: `round@${PLACEHOLDER.toUpperCase()}`, committer: null }])
  })

  it('reads a merge commit in the range', () => {
    const { dir, base } = anEntry([{}])
    git(dir, ['checkout', '--quiet', '-b', 'side', base])
    commit(dir, 'side.md')
    git(dir, ['checkout', '--quiet', 'entry'])
    git(dir, ['merge', '--quiet', '--no-ff', '-m', 'the merge', 'side'], { author: placeholder('merge'), committer: placeholder('merge') })
    const head = git(dir, ['rev-parse', 'HEAD'])
    const screen = screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
    expect(screen.read.commits).toBe(3)
    expect(screen.refused).toEqual([{ commit: head, author: placeholder('merge'), committer: placeholder('merge') }])
  })
})

describe('the commit-address gate does at its position what its row in the gate list says', () => {
  /** An entry with one commit by a person and one whose author is at the placeholder, screened. */
  const aScreenWithOne = () => {
    const { dir, base, head, commits } = anEntry([{}, { author: placeholder('round'), committer: ANOTHER }])
    return { screen: screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER }), commit: String(commits[1]) }
  }
  const aScreenWithNone = () => {
    const { dir, base, head } = anEntry([{}, { author: ANOTHER }])
    return screenTheCommits({ repo: dir, base, head, domain: PLACEHOLDER })
  }

  it('refuses the entry at block with the refusal it had before the gate had positions, and says nothing more when nothing is at the placeholder', () => {
    const { screen } = aScreenWithOne()
    expect(whatTheGateDoes(screen, 'block')).toEqual({ position: 'block', refusal: theRefusalSaid(screen), said: null, carried: null })
    expect(whatTheGateDoes(aScreenWithNone(), 'block')).toEqual({ position: 'block', refusal: null, said: null, carried: null })
  })

  it('lets the entry go on at remind, says so in the log with each commit, and hands each commit on to be carried, writing no other address', () => {
    const { screen, commit } = aScreenWithOne()
    const did = whatTheGateDoes(screen, 'remind')
    expect(did.refusal).toBeNull()
    expect(did.carried).toEqual({ position: 'remind', domain: PLACEHOLDER, commits: [{ commit, author: placeholder('round'), committer: null }] })
    expect(did.said).toContain('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is at remind, so the entry goes on with 1 commit at the placeholder domain')
    expect(did.said).toContain(`${commit}: its author is ${placeholder('round')}, its committer is at another domain`)
    expect(JSON.stringify(did)).not.toContain(ANOTHER)
    expect(JSON.stringify(did)).not.toContain(A_PERSON)
    expect(whatTheGateDoes(aScreenWithNone(), 'remind')).toEqual({ position: 'remind', refusal: null, said: null, carried: null })
  })

  it('lets the entry go on at off, carries nothing, and says in the log that the gate is off and stopped nothing', () => {
    const { screen, commit } = aScreenWithOne()
    const did = whatTheGateDoes(screen, 'off')
    expect(did).toMatchObject({ position: 'off', refusal: null, carried: null })
    expect(did.said).toContain('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is off, so the commit-address gate stopped nothing.')
    expect(did.said).toContain(`${commit}: its author is ${placeholder('round')}, its committer is at another domain`)
    expect(did.said).not.toContain(ANOTHER)
    const none = whatTheGateDoes(aScreenWithNone(), 'off')
    expect(none).toMatchObject({ position: 'off', refusal: null, carried: null })
    expect(none.said).toContain('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is off, so the commit-address gate stopped nothing.')
  })

  it('throws on a position it does not know, and lets nothing through', () => {
    const { screen } = aScreenWithOne()
    expect(() => whatTheGateDoes(screen, 'on')).toThrow('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is "on", and the commit-address gate knows only block, remind and off.')
  })

  // THE GATE READS NO POSITION OF ITS OWN. Integrate reads it, and only when the screen found a commit (case 8).
  // Mutation: give whatTheGateDoes its old default, the position in force, and a position not given is read as block.
  it('reads no position of its own, so a position not given throws as one it does not know', () => {
    const { screen } = aScreenWithOne()
    const given = whatTheGateDoes as (screen: unknown, position?: string) => unknown
    expect(() => given(screen)).toThrow('MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is undefined, and the commit-address gate knows only block, remind and off.')
  })

  // THE READER, as the two guards of wave 13r round L have theirs: the position in the environment it is given, its row's
  // default when there is none, and a refusal that names the setting for a value the row does not allow.
  // Mutation: have the reader read another row, or return the value it was given unchecked.
  it("is read through src/config/integration-guards.mjs: the row's default, each position the row allows, and a refusal of any other", async () => {
    const guards = (await import('../src/config/integration-guards.mjs')) as Record<string, ((env?: Record<string, string | undefined>) => string) | undefined>
    const read = guards['placeholderAddressesPosition']
    expect(read).toBeTypeOf('function')
    const row = gateNamed('placeholder-addresses')
    expect(row.positions.kind).toBe('block-remind-off')
    expect(read!({})).toBe(row.defaults.buildsMoleOffice)
    for (const value of row.positions.kind === 'block-remind-off' ? row.positions.allowed : []) expect(read!({ [row.setting]: value }), value).toBe(value)
    expect(() => read!({ [row.setting]: 'on' })).toThrow(`${row.setting} is "on"`)
  })
})


describe('the office keeps the commits at the placeholder that the integrated step carries', () => {
  let t: TestDb
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  beforeAll(async () => {
    t = await freshDb()
    machine = await import('../src/server/lib/merge-state-machine.ts')
  })
  afterAll(() => t?.close())

  const LOG = '/synthetic/checks/commit-addresses.json'
  const A_SHA = 'a'.repeat(40)
  const kept = (commits: unknown[], more: Record<string, unknown> = {}) => ({ position: 'remind', domain: PLACEHOLDER, commits, log: LOG, ...more })

  it('takes commits whose every address is at the stated domain, in any case', () => {
    expect(machine.PLACEHOLDER_COMMITS.safeParse(kept([{ commit: A_SHA, author: placeholder('round'), committer: null }])).success).toBe(true)
    expect(machine.PLACEHOLDER_COMMITS.safeParse(kept([{ commit: A_SHA, author: `round@${PLACEHOLDER.toUpperCase()}`, committer: placeholder('queue') }])).success).toBe(true)
  })

  it.each([
    ['an address at another domain', kept([{ commit: A_SHA, author: placeholder('round'), committer: ANOTHER }]), 'an address that is not at the stated domain is never kept'],
    ['an address at a subdomain of it', kept([{ commit: A_SHA, author: `round@sub.${PLACEHOLDER}`, committer: null }]), 'an address that is not at the stated domain is never kept'],
    ['a commit with neither address at the domain', kept([{ commit: A_SHA, author: null, committer: null }]), 'each commit has its author or its committer at the stated domain'],
    ['no commit', kept([]), 'Too small'],
    ['a commit that is not a sha', kept([{ commit: 'HEAD', author: placeholder('round'), committer: null }]), 'Invalid string'],
    ['another position', kept([{ commit: A_SHA, author: placeholder('round'), committer: null }], { position: 'off' }), 'Invalid input: expected "remind"'],
    ['a field it does not know', kept([{ commit: A_SHA, author: placeholder('round'), committer: null }], { names: [] }), 'Unrecognized key'],
    ['no log', { position: 'remind', domain: PLACEHOLDER, commits: [{ commit: A_SHA, author: placeholder('round'), committer: null }] }, 'expected string, received undefined'],
  ])('refuses %s', (_, carried, why) => {
    const parsed = machine.PLACEHOLDER_COMMITS.safeParse(carried)
    expect(parsed.success).toBe(false)
    expect(parsed.error?.issues.map((issue) => issue.message).join('; ')).toContain(why)
  })
})

describe('the merge tool carries the commits on the integrated step, and sends the step again without them only to an office older than the field', () => {
  let t: TestDb
  let machine: typeof import('../src/server/lib/merge-state-machine.ts')
  beforeAll(async () => {
    t = await freshDb()
    machine = await import('../src/server/lib/merge-state-machine.ts')
  })
  afterAll(() => t?.close())

  const ENTRY = 'synthetic-entry'
  const A_SHA = 'a'.repeat(40)
  const B_SHA = 'b'.repeat(40)
  /** A key no step declares. */
  const UNDECLARED = 'aKeyNoStepDeclares'
  const CARRIED = {
    position: 'remind',
    domain: PLACEHOLDER,
    commits: [{ commit: A_SHA, author: placeholder('round'), committer: null }, { commit: B_SHA, author: null, committer: placeholder('queue') }],
    log: '/synthetic/checks/commit-addresses.json',
  }
  const A_STEP = { result: A_SHA, mainAt: B_SHA, files: {} }
  const WITH_THE_COMMITS = { ...A_STEP, placeholderCommits: CARRIED }

  type ARefusal = { status: number; words: string }
  /** What this tree's step door answers for the integrated step's facts: null when it takes them. */
  const theDoorsAnswer = (facts: Record<string, unknown>): ARefusal | null => {
    expect(machine.parseTheFacts).toBeTypeOf('function')
    try {
      machine.parseTheFacts('integrated', facts)
      return null
    } catch (error) {
      if (!(error instanceof Error) || typeof (error as { status?: unknown }).status !== 'number') throw error
      return { status: (error as Error & { status: number }).status, words: error.message }
    }
  }
  /** The door's refusal of a key it does not declare, and the same refusal as an office without placeholderCommits gives it. */
  const theRefusals = (): { undeclared: ARefusal; older: ARefusal } => {
    const undeclared = theDoorsAnswer({ ...A_STEP, [UNDECLARED]: 1 })
    expect(undeclared).not.toBeNull()
    expect(undeclared!.words.split(`"${UNDECLARED}"`).length, undeclared!.words).toBe(2)
    return { undeclared: undeclared!, older: { status: undeclared!.status, words: undeclared!.words.replace(`"${UNDECLARED}"`, '"placeholderCommits"') } }
  }
  const theGate = async () => (await import('../tools/merge-tool/commit-addresses.mjs')) as Record<string, unknown> as {
    theStepDoorDoesNotKnowTheKey?: (refusal: ARefusal, step: string, key: string) => boolean
  }

  type Sent = { step: string; facts: Record<string, unknown> }
  type AnAnswer = { status: number; body: Record<string, unknown> }
  /**
   * A STAND-IN OFFICE ON A LOOPBACK PORT: it answers each step sent from `answers`, in order, and keeps each; a read of the
   * entry gets a state, as the step function reads one back after a step it took.
   */
  async function aStandInOffice(answers: AnAnswer[]): Promise<{ api: string; sent: Sent[]; close: () => Promise<void> }> {
    const sent: Sent[] = []
    const server = createServer((req, res) => {
      let body = ''
      req.on('data', (chunk: Buffer) => (body += chunk.toString()))
      req.on('end', () => {
        const answer = (status: number, value: unknown) => {
          res.writeHead(status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(value))
        }
        if (req.method === 'POST' && req.url === `/api/merge-queue/${ENTRY}/step`) {
          sent.push(JSON.parse(body) as Sent)
          const next = answers[sent.length - 1]
          return next === undefined ? answer(500, { error: 'Synthetic: the stand-in office was sent more steps than it has answers for.' }) : answer(next.status, next.body)
        }
        if (req.method === 'GET' && req.url === `/api/merge-queue/${ENTRY}`) return answer(200, { entry: { state: 'testing' } })
        return answer(404, { error: `Synthetic: the stand-in office has no door ${String(req.method)} ${String(req.url)}.` })
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    return { api: `http://127.0.0.1:${String(port)}`, sent, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
  }

  /** Process groups this file started and has not seen end. */
  const groups = new Set<number>()
  afterAll(() => {
    for (const group of groups) {
      try {
        process.kill(-group, 'SIGKILL')
      } catch {
        // It ended between its exit and this hook.
      }
    }
  })

  /**
   * THE MERGE TOOL'S OWN STEP FUNCTION, in a process of its own, as the tool runs it. The first argument stands where the
   * tool's script path stands. The database it names is in the scratch folder and does not exist, so no key is read.
   */
  async function theToolSends(api: string, facts: Record<string, unknown>): Promise<{ code: number | null; out: string; log: string }> {
    const workdir = mkdtempSync(join(tmpdir(), 'commit-address-step-'))
    made.push(workdir)
    const code = `const { step } = await import(${JSON.stringify(join(REPO, 'tools', 'merge-tool', 'office-keeper.mjs'))}); await step('integrated', ${JSON.stringify(facts)})`
    const child = spawn(
      process.execPath,
      ['--input-type=module', '-e', code, '--', 'the-step-sender', '--entry', ENTRY, '--session', 'synthetic-session', '--api', api, '--workspace', 'default', '--workdir', workdir, '--office-for', '30'],
      { cwd: REPO, env: { ...process.env, MOLE_OFFICE_API: api, MOLE_OFFICE_DB: join(workdir, 'no-office.db') }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] },
    )
    groups.add(child.pid!)
    let out = ''
    child.stdout!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    child.stderr!.on('data', (chunk: Buffer) => (out += chunk.toString()))
    const ended = await new Promise<number | null>((resolve) => child.on('close', resolve))
    groups.delete(child.pid!)
    const log = join(workdir, 'the-merger.log')
    return { code: ended, out, log: existsSync(log) ? readFileSync(log, 'utf8') : '' }
  }

  // Mutation: let the tool's reading take the words without the status, or a part of them, and a case here goes red.
  it("knows the step door's refusal of a key the integrated step does not declare by the door's own words and status, and nothing looser", async () => {
    const { theStepDoorDoesNotKnowTheKey } = await theGate()
    expect(theStepDoorDoesNotKnowTheKey).toBeTypeOf('function')
    const { undeclared } = theRefusals()
    expect(theStepDoorDoesNotKnowTheKey!(undeclared, 'integrated', UNDECLARED)).toBe(true)
    // Another key, another step and another status are not that refusal, and neither are the door's words for a second
    // fault beside the key.
    expect(theStepDoorDoesNotKnowTheKey!(undeclared, 'integrated', 'placeholderCommits')).toBe(false)
    expect(theStepDoorDoesNotKnowTheKey!(undeclared, 'tested', UNDECLARED)).toBe(false)
    expect(theStepDoorDoesNotKnowTheKey!({ ...undeclared, status: undeclared.status + 1 }, 'integrated', UNDECLARED)).toBe(false)
    const two = theDoorsAnswer({ ...A_STEP, result: '', [UNDECLARED]: 1 })
    expect(two?.words).toContain(`"${UNDECLARED}"`)
    expect(theStepDoorDoesNotKnowTheKey!(two!, 'integrated', UNDECLARED)).toBe(false)
    // This tree's door takes the field.
    expect(theDoorsAnswer(WITH_THE_COMMITS)).toBeNull()
  })

  // Mutation: drop placeholderCommits before the first send, and the stand-in is sent the step without them.
  it('sends the integrated step once, with the commits, to an office that takes them', async () => {
    const office = await aStandInOffice([{ status: 200, body: { decided: 'Synthetic: the stand-in took the step.' } }])
    try {
      const ran = await theToolSends(office.api, WITH_THE_COMMITS)
      expect(ran.code, ran.out).toBe(0)
      expect(office.sent).toEqual([{ step: 'integrated', facts: WITH_THE_COMMITS }])
      expect(ran.log).not.toContain('does not take placeholderCommits')
    } finally {
      await office.close()
    }
  })

  // Mutation: take out the second send, or send it with the commits, or leave the log line out.
  it('sends the step again without the commits to an office that refuses them, names each commit and the remind position in its log, and goes on', async () => {
    const { older } = theRefusals()
    const office = await aStandInOffice([{ status: older.status, body: { error: older.words } }, { status: 200, body: { decided: 'Synthetic: the stand-in took the step.' } }])
    try {
      const ran = await theToolSends(office.api, WITH_THE_COMMITS)
      expect(ran.code, ran.out).toBe(0)
      expect(office.sent).toEqual([{ step: 'integrated', facts: WITH_THE_COMMITS }, { step: 'integrated', facts: A_STEP }])
      expect(ran.log).toContain(`The office at ${office.api} does not take placeholderCommits on the integrated step, so the step is sent again without them. It answered: ${older.words}`)
      expect(ran.log).toContain(`MOLE_OFFICE_GATE_PLACEHOLDER_ADDRESSES is at remind, and the entry goes on with 2 commits at the placeholder domain ${PLACEHOLDER}`)
      expect(ran.log).toContain(`${A_SHA}: its author is ${placeholder('round')}, its committer is at another domain`)
      expect(ran.log).toContain(`${B_SHA}: its author is at another domain, its committer is ${placeholder('queue')}`)
      expect(ran.log).toContain(CARRIED.log)
      expect(ran.log).toContain('the office answered: the entry is now testing')
    } finally {
      await office.close()
    }
  })

  // Mutation: send the step again on any refusal, or on the words alone, or go on when the step sent again is refused.
  it('stops on any other refusal of the step: another key refused, the same words at another status, and a refusal of the step sent again', async () => {
    const { undeclared, older } = theRefusals()
    const refusals: Array<[string, AnAnswer[]]> = [
      ['another key', [{ status: undeclared.status, body: { error: undeclared.words } }]],
      ['another status', [{ status: older.status + 1, body: { error: older.words } }]],
      ['the step sent again refused', [{ status: older.status, body: { error: older.words } }, { status: 409, body: { error: 'Synthetic: the stand-in refuses the step sent again.' } }]],
    ]
    for (const [what, answers] of refusals) {
      const office = await aStandInOffice(answers)
      try {
        const ran = await theToolSends(office.api, WITH_THE_COMMITS)
        expect(ran.code, `${what}: ${ran.out}`).not.toBe(0)
        expect(office.sent.length, what).toBe(answers.length)
        const last = answers.at(-1)!
        expect(ran.out, what).toContain(`The office refused the step "integrated" for merge entry ${ENTRY} (${String(last.status)}): ${String(last.body['error'])}`)
      } finally {
        await office.close()
      }
    }
  })
})
