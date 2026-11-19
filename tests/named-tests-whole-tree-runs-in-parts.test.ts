// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WHOLE-TREE LIST RUNS IN STABLE PARTS THAT FIT ONE COMMAND.
 *
 * Each case runs tools/run-named-tests.mjs over its own small checkout. The list script names made-up test files,
 * and the stand-in vitest records its arguments and writes the report the tool checks. A report in the fixture's
 * .logs folder gives every listed file a known time, so the parts and their order are predictable.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const REPO = join(import.meta.dirname, '..')
const TOOL = join(REPO, 'tools', 'run-named-tests.mjs')
const PART_COUNT = 4

let root = ''
let tag = ''
let listed: string[] = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'named-tests-whole-tree-parts-'))
  tag = basename(root).replace(/[^a-zA-Z0-9]/g, '')
  mkdirSync(join(root, 'tests'), { recursive: true })
  listed = Array.from({ length: 8 }, (_, index) => {
    const name = `whole-tree-part-${tag}-${String(index + 1).padStart(2, '0')}.test.ts`
    writeFileSync(join(root, 'tests', name), "test('fixture', () => {})\n")
    return join(root, 'tests', name)
  })
  writeFileSync(
    join(root, 'tests', 'the-test-lists.ts'),
    `if (process.argv[2] === 'whole-tree') console.log(${JSON.stringify(listed.map((file) => `tests/${basename(file)}`).join('\n'))})\n`,
  )
  mkdirSync(join(root, '.logs'), { recursive: true })
  writeTimes(100_000)
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeTimes(milliseconds: number): void {
  writeFileSync(
    join(root, '.logs', 'named-tests-seed.json'),
    JSON.stringify({
      testResults: listed.map((name) => ({ name, startTime: 0, endTime: milliseconds })),
    }),
  )
}

function tool(args: string[]) {
  const ran = spawnSync(process.execPath, [TOOL, '--root', root, ...args], { cwd: root, encoding: 'utf8' })
  return { code: ran.status, out: ran.stdout, err: ran.stderr, said: `${ran.stdout}${ran.stderr}` }
}

function printedFiles(output: string): string[] {
  return output.split(/\r?\n/).filter((line) => line !== '')
}

function partFiles(number: number, name?: string): string[] {
  const run = tool([...(name === undefined ? [] : [name]), '--list', 'whole-tree', '--print', '--part', String(number)])
  expect(run.code, run.said).toBe(0)
  return printedFiles(run.out)
}

function standIn(reportNames: string[]): string {
  const entry = join(root, 'stand-in-vitest.mjs')
  const seen = join(root, 'seen.jsonl')
  writeFileSync(
    entry,
    `import { appendFileSync, writeFileSync } from 'node:fs'
appendFileSync(${JSON.stringify(seen)}, JSON.stringify({ argv: process.argv.slice(2) }) + '\\n')
const output = process.argv.find((word) => word.startsWith('--outputFile.json='))
const names = ${JSON.stringify(reportNames)}
writeFileSync(output.slice('--outputFile.json='.length), JSON.stringify({ testResults: names.map((name) => ({ name, startTime: 0, endTime: 1 })) }))
`,
  )
  return entry
}

describe('--list whole-tree', () => {
  it('prints each file once and says how many parts there are', () => {
    const run = tool(['--list', 'whole-tree', '--print'])
    expect(run.code, run.said).toBe(0)
    expect(printedFiles(run.out)).toEqual(listed)
    expect(run.err).toContain(`--list whole-tree: ${PART_COUNT} parts`)
    expect(run.err).toContain(`--list whole-tree: every part, ${listed.length} files.`)
  })

  it('prints one requested part, and the parts cover the list exactly once', () => {
    const allParts = Array.from({ length: PART_COUNT }, (_, index) => partFiles(index + 1))
    expect(allParts[1]).toEqual(listed.slice(2, 4))
    expect(allParts.flat().sort()).toEqual([...listed].sort())
    expect(allParts.flat()).toHaveLength(listed.length)
  })

  it('puts a file named beside the list in exactly one part', () => {
    tool(['--list', 'whole-tree', '--print'])
    const beside = join(root, 'tests', `whole-tree-part-${tag}-zz-beside.test.ts`)
    writeFileSync(beside, "test('beside', () => {})\n")
    const allParts = Array.from({ length: PART_COUNT }, (_, index) => partFiles(index + 1, beside))
    expect(allParts.flat().sort()).toEqual([...listed, beside].sort())
    expect(allParts.flat().filter((file) => file === beside)).toHaveLength(1)
    expect(readdirSync(join(root, '.logs')).filter((file) => /^whole-tree-parts-.*\.json$/.test(file))).toHaveLength(2)
  })

  it('names the whole-tree list and its part count when a part is missing', () => {
    const run = tool(['--list', 'whole-tree', '--print', '--part', String(PART_COUNT + 1)])
    expect(run.code).toBe(2)
    expect(run.err).toContain(`--list whole-tree has ${PART_COUNT} parts`)
  })

  it('refuses a part unless one of the two part lists was asked for', () => {
    const run = tool(['--print', '--part', '1'])
    expect(run.code).toBe(2)
    expect(run.err).toContain('--list related or --list whole-tree')
  })

  it('keeps part assignments when a later report changes the times', () => {
    const before = tool(['--list', 'whole-tree', '--print', '--part', '2'])
    expect(before.code, before.said).toBe(0)
    const original = printedFiles(before.out)
    writeTimes(1_000)
    const after = tool(['--list', 'whole-tree', '--print', '--part', '2'])
    expect(after.code, after.said).toBe(0)
    expect(printedFiles(after.out)).toEqual(original)
    expect(after.err).toContain('the parts are the ones worked out at')
  })

  it('runs the requested part once with exactly that part\'s files', () => {
    const expected = listed.slice(0, 2)
    const run = tool(['--list', 'whole-tree', '--part', '1', '--vitest', standIn(expected)])
    expect(run.code, run.said).toBe(0)
    const seen = readFileSync(join(root, 'seen.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line)) as { argv: string[] }[]
    expect(seen).toHaveLength(1)
    expect(seen[0]?.argv.slice(-expected.length)).toEqual(expected)
  })
})
