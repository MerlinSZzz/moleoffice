// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE GUARD KEEPS EVERY AGENT ON THE HOST OFF WHAT THE OFFICE MAY RUN THERE. The office runs only the tools in
 * host-tools.json beside its keys file, and its runner sends what it finds in host-jobs/ with the office's key. An agent
 * that could write either could make the office run its own program, or file its own answer. So the guard's rule 3
 * stops writing, moving and deleting them for everybody, a secretary too: a secretary registers a tool through the
 * office's door, never by hand. Reading them is let through.
 *
 * The policy is for-agents/main-world-guard-policy.mjs, handed a made-up home and checkout as in
 * tests/the-main-world-guard-stops-the-accidents.test.ts. Nothing here is run; the policy only reads the command text
 * and the disk.
 *
 * ---------------------------------------------------------------------------------------
 * THE MUTATIONS THIS IS WRITTEN AGAINST, each after a control run, each restored after
 * ---------------------------------------------------------------------------------------
 *
 *   drop the four host tool entries from `theProtectedPaths`        → every row of this office goes red, and the other office's.
 *   drop the two `suffix` entries of them                           → the other office's rows go red.
 */
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { areaReasons, lookAt, theProtectedPaths, type Asker, type World } from '../for-agents/main-world-guard-policy.mjs'
import { aTestDatabaseFolder } from './a-test-folder.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url)).replace(/\/+$/, '')

let scratch = ''
let home = ''
let checkout = ''
let another = ''
let world: World

const SECRETARY: Asker = { exempt: true, role: 'secretary' }
const WORKER = (): Asker => ({ exempt: false, role: 'worker', area: ['src/server', 'tests'], root: checkout })

beforeAll(() => {
  mkdirSync(join(REPO, '.cache'), { recursive: true })
  scratch = aTestDatabaseFolder('guard-host-tools', join(REPO, '.cache'))
  home = join(scratch, 'home', THE_TEST_OFFICES_OWNER.id)
  checkout = join(home, 'PROJECTS', 'mole-office')
  another = join(home, 'PROJECTS', 'another-office')
  for (const dir of ['PROJECTS/mole-office/.git', 'PROJECTS/mole-office/data/host-jobs/a-job', 'PROJECTS/another-office/data/host-jobs', 'PROJECTS/mole-office/tests']) {
    mkdirSync(join(home, dir), { recursive: true })
  }
  for (const file of ['PROJECTS/mole-office/data/keys.json', 'PROJECTS/mole-office/data/host-tools.json', 'PROJECTS/mole-office/data/host-jobs/taken.json', 'PROJECTS/another-office/data/host-tools.json']) {
    writeFileSync(join(home, file), 'made up for this test\n')
  }
  world = {
    home,
    env: { HOME: home, PATH: process.env['PATH'] ?? '/usr/bin' },
    tempRoots: ['/tmp'],
    protectedPaths: theProtectedPaths({
      home,
      keys: join(checkout, 'data', 'keys.json'),
      backups: join(checkout, 'data', 'backups'),
      database: join(checkout, 'data', 'panelx.db'),
    }),
    inContainer: false,
  }
})

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

/** What the policy answers for one call, as the asker it names. */
function verdict(tool: string, input: Record<string, unknown>, asker: Asker): { stopped: boolean; why: string } {
  const look = lookAt({ tool, input, cwd: checkout }, world)
  const reasons = look.reasons.length > 0 ? look.reasons : areaReasons(look.needsTheArea, asker)
  return { stopped: reasons.length > 0, why: reasons.join('\n') }
}

const bash = (command: string, asker: Asker = SECRETARY) => verdict('Bash', { command }, asker)

describe("an office's host tools file and its runner's folder", () => {
  const rows: [string, RegExp][] = [
    ['echo x > data/host-tools.json', /the office's host tools file/],
    ['cp /tmp/mine.json data/host-tools.json', /the office's host tools file/],
    ['mv data/host-tools.json /tmp/', /the office's host tools file/],
    ['rm data/host-tools.json', /the office's host tools file/],
    ['echo {} > data/host-jobs/taken.json', /the office's host job runner's folder/],
    ['rm data/host-jobs/a-job/RESULT.json', /the office's host job runner's folder/],
    ['rm -rf data/host-jobs', /the office's host job runner's folder/],
  ]
  for (const [command, why] of rows) {
    it(`stops ${JSON.stringify(command)}, for a secretary too`, () => {
      for (const asker of [SECRETARY, WORKER()]) {
        const got = bash(command, asker)
        expect(got.stopped, `${command} was let through`).toBe(true)
        expect(got.why).toMatch(why)
      }
    })
  }

  it("stops another office's, found by the last two parts of the path", () => {
    for (const command of [`echo x > ${join(another, 'data', 'host-tools.json')}`, `rm -rf ${join(another, 'data', 'host-jobs')}`]) {
      const got = bash(command)
      expect(got.stopped, `${command} was let through`).toBe(true)
      expect(got.why).toMatch(/an office's host (tools file|job runner's folder)/)
    }
  })

  it('stops the file tools on them as well', () => {
    expect(verdict('Write', { file_path: join(checkout, 'data', 'host-tools.json'), content: '{"tools":[]}' }, SECRETARY).stopped).toBe(true)
    expect(verdict('Edit', { file_path: join(checkout, 'data', 'host-jobs', 'taken.json') }, SECRETARY).stopped).toBe(true)
  })

  it('lets reading them through', () => {
    expect(bash('cat data/host-tools.json').stopped).toBe(false)
    expect(bash('ls data/host-jobs').stopped).toBe(false)
  })
})
