// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A RUN SEALED IN A THROWAWAY GIT REPOSITORY, AND A GIT THAT STOPS AT ONE COMMAND UNTIL IT IS LET GO, for the tests of
 * item 2o of the requirement list: tests/the-seal-read-apart-is-the-same-read.test.ts and
 * tests/a-check-door-answers-others-while-it-reads-a-seal.test.ts.
 *
 * THE GIT THAT WAITS is a shell script put first on this process's PATH, labelled as a stand-in in its own first lines.
 * It runs the real git, and before that, once, it waits at the one command a test names: it says it got there with a
 * file, and goes on when the test writes another. Git started on any thread of this process finds it, because the
 * office's git reader passes this process's PATH on (src/config/guarded-git.mjs) and a worker thread starts with a copy
 * of the environment it was started in. So it must be put on PATH before the office starts its seal-read thread.
 *
 * Nothing here is a seam in the product. A test that waits for the file and a door whose read never reaches that git
 * fail with a sentence; a git that is never let go goes on by itself after ten seconds, so a door that held the test's
 * own thread still answers, in the wrong order.
 *
 * IT CAN ALSO HOLD EVERY GIT OF ONE KIND (`holdEach`), each until the test lets that one go, so a test proves every such
 * git ran off the server's thread whatever their number and order. One held on the server's thread holds the test as
 * well, so the test cannot let it go: it goes on by itself after three seconds and says so (`alone`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { expect } from 'vitest'
import { THE_PERSON } from '../src/shared/person.ts'
import { THE_TEST_OFFICES_SECRETARY } from './a-page-of-a-test-office.ts'

export const WORKSPACE = 'default'
export const AS_THE_PERSON = { 'x-mole-office-actor-type': 'human', 'x-mole-office-actor-id': THE_PERSON, 'x-mole-office-workspace': WORKSPACE }
export const asAgent = (id: string): Record<string, string> => ({ 'x-mole-office-actor-type': 'agent', 'x-mole-office-actor-id': id, 'x-mole-office-workspace': WORKSPACE })
/** The inspector the office's checkers are, as `theOfficesCheckers` registers it. */
export const THE_INSPECTOR = 'inspector-one'

/** This file's own git, to make and change a repository. */
export function git(directory: string, ...args: string[]): string {
  return execFileSync('git', ['-C', directory, '-c', 'user.email=a-test@example.invalid', '-c', 'user.name=A Test', ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function register(app: FastifyInstance, headers: Record<string, string>, payload: Record<string, unknown>): Promise<void> {
  const reply = await app.inject({ method: 'POST', url: '/api/agents/started', headers, payload })
  expect(reply.statusCode, reply.body).toBe(201)
}

/** The test office's secretary, who registers each worker, and the inspector that checks them. */
export async function theOfficesCheckers(app: FastifyInstance): Promise<void> {
  await register(app, AS_THE_PERSON, { handle: THE_TEST_OFFICES_SECRETARY.handle, name: THE_TEST_OFFICES_SECRETARY.name, role: 'secretary' })
  await register(app, AS_THE_PERSON, { handle: THE_INSPECTOR, name: 'Inspector One', role: 'inspector' })
}

/** A repository in `folder` with one commit on main: a file in the work area and one outside it. */
export function aRepository(folder: string): string {
  mkdirSync(join(folder, 'work'), { recursive: true })
  git(folder, 'init', '-q', '-b', 'main')
  writeFileSync(join(folder, 'README.md'), 'A throwaway repository of a test.\n')
  writeFileSync(join(folder, 'work', 'kept.txt'), 'kept\n')
  git(folder, 'add', '-A')
  git(folder, 'commit', '-qm', 'The first commit')
  return folder
}

/** A run that changed `work/<name>.txt` in a worktree of `repository` cut from main, filed finished and so sealed. */
export async function aSealedRun(app: FastifyInstance, repository: string, name: string): Promise<{ run: string; directory: string; changed: string[] }> {
  const directory = `${repository}-${name}`
  git(repository, 'worktree', 'add', '-q', '-b', name, directory, 'main')
  const changed = [`work/${name}.txt`]
  writeFileSync(join(directory, changed[0] ?? ''), `The work of ${name}.\n`)
  git(directory, 'add', '-A')
  git(directory, 'commit', '-qm', `The work of ${name}`)
  const handle = `a-worker-${name}`
  await register(app, asAgent(THE_TEST_OFFICES_SECRETARY.handle), { handle, name: `A Worker ${name}`, role: 'worker', workArea: ['work'] })
  const filed = await app.inject({
    method: 'POST',
    url: '/api/records',
    headers: asAgent(handle),
    payload: { kind: 'session', title: `The run ${name}`, data: { state: 'finished', servingAgent: handle, workingDirectory: directory, doing: 'the work under check', cutFrom: 'main' } },
  })
  expect(filed.statusCode, filed.body).toBe(201)
  return { run: (filed.json() as { record: { id: string } }).record.id, directory, changed }
}

export interface AGitThatWaits {
  /** Hold the next git, on any thread, whose arguments include `word`, until `letGo`. */
  holdAt(word: string, occurrence?: number): void
  /**
   * Settles once a held git has started, with the time it started waiting (its file's, on the clock of `Date.now`); fails
   * with a sentence when none has after twenty seconds.
   */
  reached(): Promise<number>
  /** Let the held git go on. */
  letGo(): void
  /**
   * From now until `stopHolding`, hold every git whose arguments include `word`, or every git when `word` is '', each until
   * `letGoOf` names it or for three seconds.
   */
  holdEach(word: string): void
  /** The gits held by `holdEach` that have started waiting and were not let go, oldest first. */
  heldNow(): AHeldGit[]
  /** Whether `one` is still held: not let go and not gone on by itself. */
  stillHeld(one: AHeldGit): boolean
  letGoOf(one: AHeldGit): void
  /** Hold nothing more, let every held git go, and say every git held since `holdEach`, oldest first. */
  stopHolding(): AHeldGit[]
  /** Take the stand-in off PATH. Its folder goes with the caller's. */
  remove(): void
}

/** A git `holdEach` held: its own id, its arguments, when it started waiting, and whether it went on by itself. */
export interface AHeldGit {
  id: string
  args: string[]
  at: number
  alone: boolean
}

/** Put a git that waits first on PATH, in `folder`. Call it before the office starts its seal-read thread. */
export function aGitThatWaits(folder: string): AGitThatWaits {
  const real = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim()
  const bin = join(folder, 'bin')
  const held = join(folder, 'held')
  mkdirSync(bin, { recursive: true })
  mkdirSync(held, { recursive: true })
  writeFileSync(
    join(bin, 'git'),
    [
      '#!/bin/sh',
      '# A STAND-IN FOR GIT, made by a test (tests/a-seal-read-fixture.ts). It runs the real git, and before that, once,',
      '# waits at the command the test named in held/word until the test writes held/go, or for ten seconds.',
      `held='${held}'`,
      '# HOLD EACH: every git whose arguments include held/each (each git when it is empty), until held/each-<id>.go or',
      '# held/each-all, or three seconds; a git that went on by itself says so in held/each-<id>.alone.',
      'if [ -f "$held/each" ]; then',
      '  each=$(cat "$held/each")',
      '  for one in "$@" ""; do',
      '    if [ "$one" = "$each" ]; then',
      '      id="$$-$(date +%s%N)"',
      '      printf \'%s\\n\' "$@" > "$held/each-$id.args"',
      '      : > "$held/each-$id.reached"',
      '      n=0',
      '      while [ ! -f "$held/each-$id.go" ] && [ ! -f "$held/each-all" ] && [ "$n" -lt 300 ]; do sleep 0.01; n=$((n + 1)); done',
      '      [ -f "$held/each-$id.go" ] || [ -f "$held/each-all" ] || : > "$held/each-$id.alone"',
      '      break',
      '    fi',
      '  done',
      'fi',
      'if [ -f "$held/word" ]; then',
      '  word=$(cat "$held/word")',
      '  for one in "$@"; do',
      '    if [ "$one" = "$word" ] && mv "$held/word" "$held/taken" 2>/dev/null; then',
      '      n=$(cat "$held/remaining")',
      '      if [ "$n" -gt 1 ]; then echo $((n - 1)) > "$held/remaining"; mv "$held/taken" "$held/word"; break; fi',
      '      : > "$held/reached"',
      '      n=0',
      '      while [ ! -f "$held/go" ] && [ "$n" -lt 1000 ]; do sleep 0.01; n=$((n + 1)); done',
      '      break',
      '    fi',
      '  done',
      'fi',
      `exec '${real}' "$@"`,
      '',
    ].join('\n'),
    { mode: 0o755 },
  )
  const before = process.env['PATH'] ?? ''
  process.env['PATH'] = `${bin}:${before}`
  let word = ''
  return {
    holdAt(asked, occurrence = 1) {
      for (const one of ['taken', 'reached', 'go']) rmSync(join(held, one), { force: true })
      word = asked
      writeFileSync(join(held, 'remaining'), String(occurrence))
      writeFileSync(join(held, 'word'), asked)
    },
    async reached() {
      for (let waited = 0; !existsSync(join(held, 'reached')); waited += 10) {
        if (waited >= 20_000) throw new Error(`No git held at "${word}" started in twenty seconds, so the read never reached it.`)
        await new Promise((done) => setTimeout(done, 10))
      }
      return statSync(join(held, 'reached')).mtimeMs
    },
    letGo() {
      writeFileSync(join(held, 'go'), '')
    },
    holdEach(asked) {
      for (const one of readdirSync(held)) if (one.startsWith('each')) rmSync(join(held, one), { force: true })
      writeFileSync(join(held, 'each'), asked)
    },
    heldNow() {
      return theHeld(held).filter((one) => !one.alone && !existsSync(join(held, `each-${one.id}.go`)))
    },
    stillHeld(one) {
      return !existsSync(join(held, `each-${one.id}.alone`)) && !existsSync(join(held, `each-${one.id}.go`))
    },
    letGoOf(one) {
      writeFileSync(join(held, `each-${one.id}.go`), '')
    },
    stopHolding() {
      rmSync(join(held, 'each'), { force: true })
      writeFileSync(join(held, 'each-all'), '')
      return theHeld(held)
    },
    remove() {
      process.env['PATH'] = before
    },
  }
}

/** Every git `holdEach` held, from its files, oldest first. */
function theHeld(held: string): AHeldGit[] {
  return readdirSync(held)
    .filter((one) => one.startsWith('each-') && one.endsWith('.reached'))
    .map((one) => {
      const id = one.slice('each-'.length, -'.reached'.length)
      const args = existsSync(join(held, `each-${id}.args`)) ? readFileSync(join(held, `each-${id}.args`), 'utf8').split('\n').slice(0, -1) : []
      return { id, args, at: statSync(join(held, one)).mtimeMs, alone: existsSync(join(held, `each-${id}.alone`)) }
    })
    .sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
}
