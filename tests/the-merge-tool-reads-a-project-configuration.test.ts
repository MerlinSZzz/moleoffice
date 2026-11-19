// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A PROJECT'S MERGE-TOOL CONFIGURATION IS READ, AND ITS REFUSALS NAME THE FILE AND THE KEY.
 *
 * What this file proves. The reader takes the text of one project's configuration and returns every
 * value in the same shape, with a relative repository resolved against the file's own folder. It
 * refuses an unknown key at each level, a missing test.runIn, a container runIn, a project's
 * sandbox runIn unless the configuration is the office's, a missing trunk, a test.suite that is a
 * string, a land.how that pushes, an unknown report, a landing folder not written with a trailing
 * slash, a gates.areas written as a folder, a gates.markers entry that is not a folder, and a
 * gates.areas that climbs out of the repository. The office's own configuration passes the same
 * reader with forTheOffice true, keeps the commit email it was given, and theGitIdentityOf puts
 * that address in both git variables.
 *
 * The fixture's commands and most of its paths are made up for these cases: the reader is generic,
 * so it copies no value the office may change. Two paths in the path-shape cases are the office's own
 * values, `.mole-office/protected.json` and `drizzle/`, because the shape cases must show the office's
 * own paths pass as well. The reports and the landing the reader takes are read from
 * tools/merge-tool/config.mjs.
 *
 * The red before the code, before tools/merge-tool/config.mjs existed, failed at the import of
 * this file. The control, the green run on the finished code, read the same file without a
 * failure.
 *
 * Mutation proof, 2026-11-10. I broke one guarded line in tools/merge-tool/config.mjs: onlyKeys
 * let every unknown key pass. The unknown-key case, with its six checks, went red; the other seven
 * cases that existed then stayed green. I restored the line and the whole file was green again.
 *
 * Mutation proof, 2026-11-10, the folder guards. I removed the trailing-slash test from the
 * folder-path check in tools/merge-tool/config.mjs, so a folder path without "/" was accepted. The
 * landing-folder case and the marker case went red; the other nine cases stayed green. I restored
 * the line byte for byte and all eleven cases were green again.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import {
  CONTAINER_NOT_BUILT,
  NOT_FAST_FORWARD,
  SANDBOX_IS_THE_OFFICES,
  THE_ONLY_LANDING,
  THE_REPORTS_THE_TOOL_READS,
  UNKNOWN_KEY,
  UNKNOWN_REPORT,
  readTheConfiguration,
  readTheConfigurationFile,
  theGitIdentityOf,
  theOfficeConfiguration,
} from '../tools/merge-tool/config.mjs'

const folders: string[] = []

/** A made-up folder under the system temp folder, removed after the file. */
function aFolder(name: string): string {
  const folder = mkdtempSync(join(tmpdir(), `mole-office-configuration-${name}-`))
  folders.push(folder)
  return folder
}

afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

/** A complete project configuration, made up for these cases. */
function aProject(): Record<string, unknown> {
  return {
    repository: '.',
    trunk: 'main',
    test: {
      build: ['make', 'build'],
      suite: ['prove', 'it'],
      report: THE_REPORTS_THE_TOOL_READS[0],
      runIn: 'host',
    },
    land: {
      how: THE_ONLY_LANDING,
      before: [['prepare']],
      after: [{ whenAPathIsUnder: 'db/', run: ['migrate'] }],
      healthy: null,
    },
    gates: {
      areas: 'gates/protected.json',
      markers: ['app/'],
      tests: true,
    },
    commitAs: { name: 'Example merge queue', email: 'merge-queue@example.invalid' },
  }
}

/** One nested object of the fixture, so a case can change one value and keep the rest whole. */
function objectOf(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key]
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The fixture holds no object at "${key}".`)
  }
  return value as Record<string, unknown>
}

/** The first landing step of the fixture, so a case can put an unknown key inside one. */
function firstLandingStep(record: Record<string, unknown>): Record<string, unknown> {
  const after = objectOf(record, 'land').after
  if (!Array.isArray(after) || after.length === 0 || typeof after[0] !== 'object' || after[0] === null) {
    throw new Error('The fixture holds no first landing step.')
  }
  return after[0] as Record<string, unknown>
}

/** The sentence the reader said, or a failure when it accepted what it had to refuse. */
function theRefusal(text: string, where: string, options: { forTheOffice?: boolean } = {}): string {
  try {
    readTheConfiguration(text, where, options)
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`The reader accepted a configuration it had to refuse: ${text}`)
}

/** Refuse one configuration and check that the sentence names the file and the key. */
function expectRefusal(text: string, where: string, key: string, words?: string): void {
  const said = theRefusal(text, where)
  expect(said).toContain(where)
  expect(said).toContain(key)
  if (words !== undefined) expect(said).toContain(words)
}

describe("a project's merge-tool configuration", () => {
  it('reads a complete file, resolves its repository, and accepts every report it names', () => {
    const folder = aFolder('complete')
    const file = join(folder, 'merge-tool.json')
    const project = aProject()
    writeFileSync(file, JSON.stringify(project))

    const configuration = readTheConfigurationFile(file)
    expect(configuration).toEqual({ ...project, repository: resolve(folder, String(project.repository)) })
    expect(Object.isFrozen(configuration)).toBe(true)
    expect(Object.isFrozen(configuration.test)).toBe(true)
    expect(Object.isFrozen(configuration.land.after[0])).toBe(true)

    const byText = readTheConfiguration(JSON.stringify(project), file)
    expect(byText).toEqual(configuration)

    for (const report of THE_REPORTS_THE_TOOL_READS) {
      const withReport = aProject()
      objectOf(withReport, 'test').report = report
      const read = readTheConfiguration(JSON.stringify(withReport), file)
      expect(read.test.report).toBe(report)
      expect(read.test.runIn).toBe('host')
    }
  })

  it('refuses an unknown key at the top level and inside test, land and gates', () => {
    const where = join(aFolder('unknown-keys'), 'merge-tool.json')

    const top = aProject()
    top.surprise = true
    expectRefusal(JSON.stringify(top), where, 'surprise', UNKNOWN_KEY)

    const inTest = aProject()
    objectOf(inTest, 'test').surprise = true
    expectRefusal(JSON.stringify(inTest), where, 'surprise', UNKNOWN_KEY)

    const inLand = aProject()
    objectOf(inLand, 'land').surprise = true
    expectRefusal(JSON.stringify(inLand), where, 'surprise', UNKNOWN_KEY)

    const inGates = aProject()
    objectOf(inGates, 'gates').surprise = true
    expectRefusal(JSON.stringify(inGates), where, 'surprise', UNKNOWN_KEY)

    const inCommitAs = aProject()
    objectOf(inCommitAs, 'commitAs').surprise = true
    expectRefusal(JSON.stringify(inCommitAs), where, 'surprise', UNKNOWN_KEY)

    const inAfter = aProject()
    firstLandingStep(inAfter).surprise = true
    expectRefusal(JSON.stringify(inAfter), where, 'surprise', UNKNOWN_KEY)
  })

  it('refuses a test object that does not say where its tests run', () => {
    const where = join(aFolder('no-run-in'), 'merge-tool.json')
    const project = aProject()
    delete objectOf(project, 'test').runIn
    expectRefusal(JSON.stringify(project), where, 'runIn')
  })

  it('refuses a container runIn with the words saying a container is not built', () => {
    const where = join(aFolder('container'), 'merge-tool.json')
    const project = aProject()
    objectOf(project, 'test').runIn = { container: ['node:22'] }
    expectRefusal(JSON.stringify(project), where, 'container', CONTAINER_NOT_BUILT)
  })

  it('refuses a project a sandbox runIn, and accepts the same value for the office', () => {
    const where = join(aFolder('sandbox'), 'merge-tool.json')
    const project = aProject()
    objectOf(project, 'test').runIn = { sandbox: 'tools/sandbox.mjs' }
    expectRefusal(JSON.stringify(project), where, 'sandbox', SANDBOX_IS_THE_OFFICES)

    const office = readTheConfiguration(JSON.stringify(project), where, { forTheOffice: true })
    expect(office.test.runIn).toEqual({ sandbox: 'tools/sandbox.mjs' })
  })

  it('refuses a missing trunk, a written suite and a landing that pushes', () => {
    const where = join(aFolder('broken-values'), 'merge-tool.json')

    const noTrunk = aProject()
    delete noTrunk.trunk
    expectRefusal(JSON.stringify(noTrunk), where, 'trunk')

    const writtenSuite = aProject()
    objectOf(writtenSuite, 'test').suite = 'npm test'
    expectRefusal(JSON.stringify(writtenSuite), where, 'suite')

    const push = aProject()
    objectOf(push, 'land').how = 'push'
    expectRefusal(JSON.stringify(push), where, 'how', NOT_FAST_FORWARD)
  })

  it('refuses an unknown report and a gates area that climbs out', () => {
    const where = join(aFolder('unknown-report'), 'merge-tool.json')

    const report = aProject()
    objectOf(report, 'test').report = 'junit'
    expectRefusal(JSON.stringify(report), where, 'report', UNKNOWN_REPORT)

    const areas = aProject()
    objectOf(areas, 'gates').areas = '../outside/protected.json'
    expectRefusal(JSON.stringify(areas), where, 'areas')
  })

  it('refuses a landing folder without its trailing slash, and accepts one with it', () => {
    const where = join(aFolder('landing-folder'), 'merge-tool.json')

    const notAFolder = aProject()
    firstLandingStep(notAFolder).whenAPathIsUnder = 'drizzle'
    expectRefusal(JSON.stringify(notAFolder), where, 'whenAPathIsUnder', JSON.stringify('drizzle'))

    const aFolderPath = aProject()
    firstLandingStep(aFolderPath).whenAPathIsUnder = 'drizzle/'
    const read = readTheConfiguration(JSON.stringify(aFolderPath), where)
    expect(read.land.after[0]?.whenAPathIsUnder).toBe('drizzle/')
  })

  it('refuses a gates area written as a folder, and accepts it written as a file', () => {
    const where = join(aFolder('gates-area'), 'merge-tool.json')

    const asAFolder = aProject()
    objectOf(asAFolder, 'gates').areas = '.mole-office/protected.json/'
    expectRefusal(JSON.stringify(asAFolder), where, 'areas', JSON.stringify('.mole-office/protected.json/'))

    const asAFile = aProject()
    objectOf(asAFile, 'gates').areas = '.mole-office/protected.json'
    const read = readTheConfiguration(JSON.stringify(asAFile), where)
    expect(read.gates.areas).toBe('.mole-office/protected.json')
  })

  it('refuses a gates marker that is not written as a folder', () => {
    const where = join(aFolder('gates-marker'), 'merge-tool.json')

    const marker = aProject()
    objectOf(marker, 'gates').markers = ['app']
    expectRefusal(JSON.stringify(marker), where, 'markers', JSON.stringify('app'))
  })

  it('reads the office configuration with the address it was given', () => {
    const folder = aFolder('office')
    const email = 'made-up-merge-queue@example.invalid'
    const office = theOfficeConfiguration({ repository: folder, commitEmail: email })

    const read = readTheConfiguration(JSON.stringify(office), join(folder, 'the-office.json'), { forTheOffice: true })
    expect(read).toEqual(office)
    expect(read.commitAs.email).toBe(email)
    expect(Object.isFrozen(office)).toBe(true)

    const identity = theGitIdentityOf(read)
    expect(identity.GIT_AUTHOR_EMAIL).toBe(email)
    expect(identity.GIT_COMMITTER_EMAIL).toBe(email)
    expect(identity.GIT_AUTHOR_NAME).toBe(read.commitAs.name)
    expect(identity.GIT_COMMITTER_NAME).toBe(read.commitAs.name)
  })
})
