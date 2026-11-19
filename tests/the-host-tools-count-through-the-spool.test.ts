// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FIVE TOOLS THAT RUN ONLY ON THE HOST COUNT THEIR GATES THROUGH THE GATE-COUNT SPOOL (wave 13r round AC, item 10f).
 *
 * Seven checks of round H's table get gate rows, each with the class and the one position the owner's table gives it,
 * and each counted from the spool: CK-20 a-models-login-outlasts-the-check, CK-23 a-check-reads-its-own-worktree,
 * RG-49 profiles-in-use-are-never-written, OS-04 a-start-refusal-stops-the-retries, OS-13 the-office-starts-once, and
 * the two limits of OS-03. RG-49's installer also runs from inside a sandbox, where the host reads nothing, so its row
 * waits on GATES_THE_SPOOL_WAITS_FOR with the reason the other such rows have, and nothing writes its line. The office
 * that reads the spool counts a row only once it runs a version with that row. Until then each such line goes to the
 * rejects file, so each counted row's words say that.
 *
 * Every site calls the one writer, spoolAGateMet in src/config/gate-count-spool.mjs, with no path of its own. This file
 * holds the rows and their words, the writer, and CK-20's site, which runs in this process. serve-dev's sites are in tests/serve-dev-counts-its-gates-in-the-spool.test.ts, the inspector's
 * worktree site in tests/a-check-that-finds-its-worktree-taken-is-counted.test.ts, and the service command's in
 * tests/the-mole-office-command.test.ts and tests/a-host-tool-under-test-counts-into-its-own-spool.test.ts.
 *
 * WHERE THE SPOOL IS HERE. The writer works out the spool from the home, as the office's reader does. The setup file
 * gives this test file a home of its own, so every line here lands under that home. The first case asks that, before
 * anything is written.
 *
 * WHAT THIS FILE DOES NOT SEE: that the writer appends its line in one write. Two writes of one line give the same file
 * here. Only two writers at once could tell them apart, and then not every time.
 *
 * MUTATIONS, each planted alone after a control run:
 *   - give a row another class, group, position, default, setting or counter, or drop its group: the rows case;
 *   - take the sentence that the count begins with the reading office's version off a counted row's words: the rows case;
 *   - take RG-49 off the waiting list, give it another reason, or put a site for it in a tool: the RG-49 case;
 *   - open the day file without O_APPEND, or at 0644, make the folder at 0755, or name the file after another day:
 *     the writer case;
 *   - write `.world`: the writer case;
 *   - let a line the reader would refuse be written: the refusal case;
 *   - follow a link at the day file's name, let the failure throw, or say nothing on stderr: the failure case;
 *   - take CK-20's call out, give it null for the sandbox, or move it before the check of the token: the CK-20 cases.
 */
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GATE_COUNT_SPOOL, GATES_COUNTED_FROM_INSIDE, GATES_THE_SPOOL_WAITS_FOR, spoolAGateMet, THE_GATE_COUNT_SPOOL_FOLDER } from '../src/config/gate-count-spool.mjs'
import { SETTING_WORDS } from '../src/config/word-sources.mjs'
import { aLoginForTheModel } from '../tools/inspector-sandbox.mjs'
import { aStampOf, emptyATestsOwnSpool, theLinesIn, theModeOf, theRealSpools, theSpoolUnder } from './the-gate-count-spool-under-a-home.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/** The six rows a tool counts, and the one file that holds each one's site. */
const SITES: Record<string, string> = {
  'a-models-login-outlasts-the-check': 'tools/inspector-sandbox.mjs',
  'a-check-reads-its-own-worktree': 'tools/the-inspector.mjs',
  'a-start-refusal-stops-the-retries': 'tools/serve-dev.mjs',
  'the-office-starts-once': 'src/config/the-service-command.mjs',
  'a-new-server-has-to-answer-within': 'tools/serve-dev.mjs',
  'migrations-have-to-finish-within': 'tools/serve-dev.mjs',
}
const RG_49 = 'profiles-in-use-are-never-written'

/** Every file under tools/ and src/config/ that could call the writer, with its text. */
function theWritersFiles(): {file: string; text: string}[] {
  const found: {file: string; text: string}[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(join(REPO, dir), {withFileTypes: true})) {
      const path = `${dir}/${entry.name}`
      if (entry.isDirectory()) walk(path)
      else if (/\.(mjs|js|ts)$/.test(entry.name)) found.push({file: path, text: readFileSync(join(REPO, path), 'utf8')})
    }
  }
  walk('tools')
  walk('src/config')
  return found
}
/** The files that call the writer for this gate. */
function theSitesOf(gate: string): string[] {
  const call = new RegExp(`spoolAGateMet\\(\\s*'${gate}'`)
  return theWritersFiles().filter(({text}) => call.test(text)).map(({file}) => file)
}

beforeEach(() => {
  emptyATestsOwnSpool(THE_GATE_COUNT_SPOOL_FOLDER)
})

describe('the seven rows', () => {
  // Mutation: take RG-49 off the list, give it the reason 'at-the-runs-end', put it on GATES_COUNTED_FROM_INSIDE, or call the writer for it.
  it('keep RG-49 on the spool\'s waiting list with the reason a check that also runs inside has, and nothing writes its line', () => {
    const waiting = GATES_THE_SPOOL_WAITS_FOR.find((one) => one.gate === RG_49)
    const fromInside = GATES_THE_SPOOL_WAITS_FOR.find((one) => one.gate === 'a-codex-command-is-checked')
    expect(waiting?.why).toBeTypeOf('string')
    expect(waiting?.why).toBe(fromInside?.why)
    expect((GATES_COUNTED_FROM_INSIDE as readonly string[]).includes(RG_49)).toBe(false)
    // Its words end with that reason, so the Gates page says why it is not counted.
    const words = SETTING_WORDS.MOLE_OFFICE_GATE_PROFILES_IN_USE_ARE_NEVER_WRITTEN
    expect(words.endsWith(` ${waiting!.why}`), words).toBe(true)
    expect(theSitesOf(RG_49)).toEqual([])
    // The six others each have their one site and are not waiting.
    for (const [gate, file] of Object.entries(SITES)) {
      expect(theSitesOf(gate), gate).toEqual([file])
      expect(GATES_THE_SPOOL_WAITS_FOR.some((one) => one.gate === gate), gate).toBe(false)
    }
  })
})

describe('the one writer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // The ground the rest stands on: no line written in this file can reach the real spool.
  it('writes under this test file\'s own home', () => {
    expect(THE_GATE_COUNT_SPOOL_FOLDER).toBe(theSpoolUnder(homedir()))
    expect(homedir()).toBe(process.env.HOME)
    for (const real of theRealSpools()) expect(THE_GATE_COUNT_SPOOL_FOLDER, real).not.toBe(real)
  })

  // Mutation: open without O_APPEND, at another mode, make the folder at 0755, name the file after another day, or write .world.
  it('appends one line per meeting to the day file of the line\'s own day, at 0600 in a folder at 0700, and leaves .world alone', () => {
    const before = aStampOf(new Date())
    spoolAGateMet('a-models-login-outlasts-the-check', 'block', 'an-inspectors-sandbox')
    expect(theModeOf(THE_GATE_COUNT_SPOOL_FOLDER)).toBe('0700')
    // The world file only the office's reader writes, there before the next two lines.
    const world = join(THE_GATE_COUNT_SPOOL_FOLDER, GATE_COUNT_SPOOL.world)
    writeFileSync(world, 'a-made-up-world\n', {mode: 0o600})
    utimesSync(world, new Date(2026, 0, 1), new Date(2026, 0, 1))
    const worldWas = statSync(world).mtimeMs
    spoolAGateMet('a-new-server-has-to-answer-within', '60')
    spoolAGateMet('the-office-starts-once', 'block')
    const after = aStampOf(new Date())
    const lines = theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)
    expect(lines.map(({gate, position, sandbox}) => [gate, position, sandbox])).toEqual([
      ['a-models-login-outlasts-the-check', 'block', 'an-inspectors-sandbox'],
      ['a-new-server-has-to-answer-within', '60', null],
      ['the-office-starts-once', 'block', null],
    ])
    for (const line of lines) {
      expect(line.at >= before && line.at <= after, line.at).toBe(true)
      const file = join(THE_GATE_COUNT_SPOOL_FOLDER, `${line.at.slice(0, 10)}.jsonl`)
      expect(theModeOf(file), file).toBe('0600')
    }
    expect(readFileSync(world, 'utf8')).toBe('a-made-up-world\n')
    expect(statSync(world).mtimeMs).toBe(worldWas)
  })

  // Mutation: let aGateCountLine's refusal be caught, or write before the line is made.
  it('throws on a line the office would refuse, and writes nothing', () => {
    expect(() => spoolAGateMet('the-role-cards-file-is-usable', 'block')).toThrow(/would not be counted: This gate is not counted from the spool\./)
    expect(() => spoolAGateMet('a-models-login-outlasts-the-check', 'remind')).toThrow(/would not be counted: This gate does not allow this position\./)
    expect(() => spoolAGateMet('a-new-server-has-to-answer-within', '0')).toThrow(/would not be counted/)
    expect(() => spoolAGateMet('a-check-reads-its-own-worktree', 'block', '')).toThrow(/would not be counted/)
    expect(existsSync(THE_GATE_COUNT_SPOOL_FOLDER)).toBe(false)
  })

  // Mutation: drop O_NOFOLLOW, rethrow the failure, or write nothing to stderr.
  it('says on stderr that a meeting was not counted when its line cannot be written, and returns, following no link', () => {
    const elsewhere = mkdtempSync(join(tmpdir(), 'mole-office-a-file-a-link-points-at-'))
    try {
      const target = join(elsewhere, 'not-the-spool.jsonl')
      writeFileSync(target, '')
      mkdirSync(THE_GATE_COUNT_SPOOL_FOLDER, {recursive: true, mode: 0o700})
      const day = aStampOf(new Date()).slice(0, 10)
      const file = join(THE_GATE_COUNT_SPOOL_FOLDER, `${day}.jsonl`)
      symlinkSync(target, file)
      const said: string[] = []
      vi.spyOn(process.stderr, 'write').mockImplementation((text) => {
        said.push(String(text))
        return true
      })
      expect(() => spoolAGateMet('the-office-starts-once', 'block')).not.toThrow()
      vi.restoreAllMocks()
      expect(said).toHaveLength(1)
      expect(said[0]).toMatch(new RegExp(`^The gate the-office-starts-once was met here and was not counted, because its line could not be written to ${file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}: .+\n$`))
      expect(readFileSync(target, 'utf8')).toBe('')
      expect(lstatSync(file).isSymbolicLink()).toBe(true)
    } finally {
      rmSync(elsewhere, {recursive: true, force: true})
    }
  })
})

describe("CK-20, a model's login that ends before the check would", () => {
  const MINUTES = 30
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mole-office-a-login-that-runs-out-'))
  })
  afterEach(() => {
    rmSync(dir, {recursive: true, force: true})
  })

  /** A made-up inspector sandbox and a host home whose Claude login file holds `login`, or none when it is null. */
  function aSandboxAndAHome(login: unknown): {sandbox: {home: string; templateDir: string; checkDir: string; instance: string}; home: string} {
    const sandbox = {home: join(dir, 'sandbox-home'), templateDir: join(dir, 'template'), checkDir: join(dir, 'check'), instance: 'an-inspectors-sandbox'}
    mkdirSync(sandbox.templateDir, {recursive: true})
    // A template that declares no secrets, so the login file is the one way in.
    writeFileSync(join(sandbox.templateDir, 'sandbox.json'), '{"template":"made-up"}\n')
    const home = join(dir, 'host-home')
    mkdirSync(join(home, '.claude'), {recursive: true})
    if (login !== null) writeFileSync(join(home, '.claude', '.credentials.json'), JSON.stringify(login), {mode: 0o600})
    return {sandbox, home}
  }

  // Mutation: take the call out, or give it null for the sandbox.
  it('is refused, and counted once with its sandbox', () => {
    const now = Date.now()
    const {sandbox, home} = aSandboxAndAHome({claudeAiOauth: {accessToken: 'made-up', expiresAt: now + 10 * 60_000}})
    const before = aStampOf(new Date())
    expect(() => aLoginForTheModel(sandbox, {minutes: MINUTES, runtime: 'claude-code', home, now})).toThrow(/is good for 10 more minutes, and this check may take 30/)
    const after = aStampOf(new Date())
    const lines = theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toEqual({gate: 'a-models-login-outlasts-the-check', position: 'block', at: lines[0]!.at, sandbox: 'an-inspectors-sandbox'})
    expect(lines[0]!.at >= before && lines[0]!.at <= after, lines[0]!.at).toBe(true)
  })

  // Mutation: count before the expiry is compared, or count a login the tool cannot read.
  it('is not counted when the login lasts, or when there is no login it can read', () => {
    const now = Date.now()
    const lasts = aSandboxAndAHome({claudeAiOauth: {accessToken: 'made-up', expiresAt: now + 120 * 60_000}})
    expect(aLoginForTheModel(lasts.sandbox, {minutes: MINUTES, runtime: 'claude-code', home: lasts.home, now})).toMatch(/it is good for 120 more minutes/)
    rmSync(dir, {recursive: true, force: true})
    mkdirSync(dir)
    const none = aSandboxAndAHome(null)
    expect(() => aLoginForTheModel(none.sandbox, {minutes: MINUTES, runtime: 'claude-code', home: none.home, now})).toThrow(/There is no Claude login to give the sandbox/)
    rmSync(dir, {recursive: true, force: true})
    mkdirSync(dir)
    const noToken = aSandboxAndAHome({claudeAiOauth: {expiresAt: now + 10 * 60_000}})
    expect(() => aLoginForTheModel(noToken.sandbox, {minutes: MINUTES, runtime: 'claude-code', home: noToken.home, now})).toThrow(/holds no Claude login this tool can read/)
    expect(theLinesIn(THE_GATE_COUNT_SPOOL_FOLDER)).toEqual([])
  })
})
