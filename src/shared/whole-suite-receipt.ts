// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { FieldSpec, ShapeSpec, ValidationError } from './kinds.ts'
import type { MainSuiteFix } from './main-suite-fix.ts'
import { STAMP_GRAMMAR } from './time.ts'
import { SHORT_FORMS_FIELD } from './zoom.ts'

/** One file red in the whole run, run alone afterwards on the same box, commit and build (version 2). */
export interface WholeSuiteAloneRun {
  file: string
  outcome: 'green' | 'red' | 'no result' | 'not run'
  exitCode?: number
  because?: string
  artifacts: { name: 'log' | 'report'; path: string; sha256Base64: string }[]
}

/**
 * Evidence from one build and, when the build succeeded, one whole-suite run. Version 2 adds, after a red whole run,
 * what each red file did when it was run alone, and the errors vitest counted outside the tests.
 */
export interface WholeSuiteReceipt {
  version: 1 | 2
  repository: string
  clone: string
  commit: string
  tree: string
  startedAt: string
  endedAt: string
  where: 'cloud box'
  buildExitCode: number
  suiteExitCode?: number
  failedFiles?: string[]
  failedTests?: { file: string; name: string }[]
  workerCrashes?: { file: string; unfinishedTests: number }[]
  skippedCases?: { count: number; cases?: { file: string; name: string }[]; notListed?: number }
  coverage?: { expectedCount: number; observedCount: number; missing: string[]; unexpected: string[] }
  artifacts: { name: 'log' | 'report' | 'manifest' | 'reads'; path: string; sha256Base64: string }[]
  errorsOutsideTests?: number
  aloneRuns?: WholeSuiteAloneRun[]
}

const ARTIFACT_NAMES = ['log', 'report', 'manifest', 'reads'] as const
const ALONE_ARTIFACT_NAMES = ['log', 'report'] as const
const ALONE_OUTCOMES = ['green', 'red', 'no result', 'not run'] as const
const VERSION_2_FIELDS = ['errorsOutsideTests', 'aloneRuns'] as const
const MADE_UP_DIGEST = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
const field = (key: string, type: string, required: boolean, description: string, example: unknown): FieldSpec =>
  ({ key, type, required, description, example })

/** The kind publishes these same declarations; it has no second receipt field list. */
export const WHOLE_SUITE_RECEIPT_FIELDS: FieldSpec[] = [
  field('version', 'number', true, 'The receipt format version, the integer 1 or 2. Version 2 is a red whole run whose red files were each run alone afterwards; only it carries aloneRuns and errorsOutsideTests.', 1),
  field('repository', 'string', true, 'The absolute development checkout used for this run.', '/srv/example/development'),
  field('clone', 'string', true, 'The actual absolute root of the checkout clone used for the suite. Never inferred from artifact folder names.', '/srv/example/cloud-clone'),
  field('commit', 'string', true, 'The exact commit tested, as a full lowercase 40- or 64-character Git hash.', 'a'.repeat(40)),
  field('tree', 'string', true, 'The tree of that commit, as a full lowercase 40- or 64-character Git hash.', 'b'.repeat(40)),
  field('startedAt', 'string', true, 'When the run started, as local wall time YYYY-MM-DD HH:MM:SS.', '2026-10-13 09:00:00'),
  field('endedAt', 'string', true, 'When the run ended, in the same local wall-clock form.', '2026-10-13 09:20:00'),
  field('where', "'cloud box'", true, 'The machine on which the build and suite ran: cloud box.', 'cloud box'),
  field('buildExitCode', 'number', true, 'The build exit code, an integer from 0 to 255.', 0),
  field('suiteExitCode', 'number', false, 'The suite exit code, an integer from 0 to 255. Absent when it was not observed.', 0),
  field('failedFiles', 'string[]', false, 'Unique safe repository-relative paths of failing files. Absent when not observed; empty means observed with none failing.', []),
  field('failedTests', 'WholeSuiteFailedTest[]', false, 'Unique failing file and test-name pairs. Absent when not observed; empty means observed with none failing.', []),
  field('workerCrashes', 'WholeSuiteWorkerCrash[]', false, 'Files with pending assertions explaining the exact test-count gap and Vitest\'s unhandled Worker exited unexpectedly error. Each count says how many tests never finished; these are not failed assertions. Absent when none were observed or the older office did not declare this field.', [{ file: 'tests/example.test.ts', unfinishedTests: 1 }]),
  field('skippedCases', 'WholeSuiteSkippedCases', false, 'How many test cases the suite skipped, the first 200 by file and name, and how many more were only counted. Absent on a failed build and on receipts filed before the field.', { count: 0 }),
  field('coverage', 'WholeSuiteCoverage', false, 'Counts and exact differences of the manifest and report test-file sets. Full sets remain in the hashed artifacts.', { expectedCount: 1, observedCount: 1, missing: [], unexpected: [] }),
  field('artifacts', 'WholeSuiteArtifact[]', true, 'Artifacts actually kept, with unique kinds, absolute paths and base64 SHA-256 digests. Missing artifacts are not fabricated.', [{ name: 'log', path: '/srv/example/receipts/log.txt', sha256Base64: MADE_UP_DIGEST }]),
  field('errorsOutsideTests', 'number', false, 'Version 2 only: the errors the whole run\'s summary counted outside the tests, a nonnegative safe integer. Absent when the summary could not be read.', 0),
  field('aloneRuns', 'WholeSuiteAloneRun[]', false, 'Version 2 only: what each failed file did when run alone after the whole run, one for each entry of failedFiles, in the same order. The whole run\'s facts above are unchanged by it.', [{ file: 'tests/example.test.ts', outcome: 'green', exitCode: 0, artifacts: [{ name: 'log', path: '/srv/example/receipts/alone/1/run.log', sha256Base64: MADE_UP_DIGEST }, { name: 'report', path: '/srv/example/receipts/alone/1/report.json', sha256Base64: MADE_UP_DIGEST }] }]),
]

export const WHOLE_SUITE_RECEIPT_SHAPES: Record<string, ShapeSpec> = {
  WholeSuiteWorkerCrash: {
    name: 'WholeSuiteWorkerCrash', description: 'One file affected by an unhandled worker exit, and the tests in it that never finished.',
    fields: [field('file', 'string', true, 'The safe repository-relative path, also in failedFiles.', 'tests/example.test.ts'), field('unfinishedTests', 'number', true, 'The positive safe integer count of pending assertions that explain the missing tests.', 1)],
  },
  WholeSuiteFailedTest: {
    name: 'WholeSuiteFailedTest', description: 'One failing test: the repository-relative file and its nonblank test name.',
    fields: [field('file', 'string', true, 'The safe repository-relative file path.', 'tests/example.test.ts'), field('name', 'string', true, 'The full nonblank test name reported by the suite.', 'example suite > example test')],
  },
  WholeSuiteSkippedCases: {
    name: 'WholeSuiteSkippedCases', description: 'The test cases a whole suite skipped, with at most the first 200 named by file and name.',
    fields: [
      field('count', 'number', true, 'The number of skipped test cases, a nonnegative safe integer.', 0),
      field('cases', 'WholeSuiteSkippedCase[]', false, 'At most the first 200 skipped cases, in file and then name order. Absent when none were skipped.', []),
      field('notListed', 'number', false, 'The positive number of skipped cases beyond the first 200 that were only counted. Absent when at most 200 were skipped.', 50),
    ],
  },
  WholeSuiteSkippedCase: {
    name: 'WholeSuiteSkippedCase', description: 'One skipped test: the repository-relative file and its nonblank test name.',
    fields: [field('file', 'string', true, 'The safe repository-relative file path.', 'tests/example.test.ts'), field('name', 'string', true, 'The full nonblank test name reported by the suite.', 'example suite > example test')],
  },
  WholeSuiteCoverage: {
    name: 'WholeSuiteCoverage', description: 'The exact coverage result computed from the manifest and report sets. Difference lists contain unique safe repository-relative paths.',
    fields: [
      field('expectedCount', 'number', true, 'The expected file count, a nonnegative safe integer.', 1),
      field('observedCount', 'number', true, 'The observed file count, a nonnegative safe integer.', 1),
      field('missing', 'string[]', true, 'Expected paths absent from the report.', []),
      field('unexpected', 'string[]', true, 'Observed paths absent from the manifest.', []),
    ],
  },
  WholeSuiteArtifact: {
    name: 'WholeSuiteArtifact', description: 'One kept artifact, identified by its kind, absolute file path and base64 SHA-256 digest.',
    fields: [field('name', ARTIFACT_NAMES.map((name) => `'${name}'`).join(' | '), true, 'Which evidence this artifact holds.', 'log'), field('path', 'string', true, 'The absolute path of the kept artifact.', '/srv/example/receipts/log.txt'), field('sha256Base64', 'string', true, 'A canonical base64 encoding of a 32-byte SHA-256 digest.', MADE_UP_DIGEST)],
  },
  WholeSuiteAloneRun: {
    name: 'WholeSuiteAloneRun', description: 'One failed file run alone after the whole run, on the same box, commit and build, and what that run gave.',
    fields: [
      field('file', 'string', true, 'The safe repository-relative path, as it is in failedFiles.', 'tests/example.test.ts'),
      field('outcome', ALONE_OUTCOMES.map((name) => `'${name}'`).join(' | '), true, 'green: it exited 0 and its report names the file, passed. red: its report names the file, not passed. no result: it gave no readable result. not run: a limit stopped it before it started.', 'green'),
      field('exitCode', 'number', false, 'The exit code of the run alone, an integer from 0 to 255. Absent only when it was not run.', 0),
      field('because', 'string', false, 'Why it gave no result, or why it was not run. Absent for green and red.', 'the time limit for runs alone was reached'),
      field('artifacts', 'WholeSuiteAloneArtifact[]', true, 'The log and report of the run alone that were actually kept. Green needs both and red needs the report; not run has none.', []),
    ],
  },
  WholeSuiteAloneArtifact: {
    name: 'WholeSuiteAloneArtifact', description: 'One kept file of a run alone, identified by its kind, absolute file path and base64 SHA-256 digest.',
    fields: [field('name', ALONE_ARTIFACT_NAMES.map((name) => `'${name}'`).join(' | '), true, 'Which evidence this artifact holds.', 'log'), field('path', 'string', true, 'The absolute path of the kept artifact.', '/srv/example/receipts/alone/1/run.log'), field('sha256Base64', 'string', true, 'A canonical base64 encoding of a 32-byte SHA-256 digest.', MADE_UP_DIGEST)],
  },
}

export const WHOLE_SUITE_RECEIPT_RULES = [
  'Timestamps are valid local wall-clock strings. They do not establish elapsed-time order during a repeated hour.',
  'Suite fields require buildExitCode 0. Failed builds carry only log artifacts and no suite fields. Missing evidence stays absent.',
  'An exit-zero suite cannot claim failing files or tests. Failing tests must belong to failedFiles when present, cannot be missing from coverage, and require a positive observed count when coverage is present.',
  'Coverage difference lists are disjoint and fit their respective counts. Subtracting each difference list from its count gives the same common-file count. Full observed membership is verified against the hashed report.',
  'Paths, failure pairs and artifact kinds are unique. Paths are safe and digests are canonical base64 SHA-256 values.',
  'workerCrashes names unique failed files with a positive safe integer unfinished-test count, only after a successful build and a nonzero suite exit. It does not replace failedTests, change errorsOutsideTests or authorize green.',
  'skippedCases is only after a successful build with a suite exit. Its count is the number of cases listed plus notListed, at most 200 cases are listed, and it does not make a receipt red, incomplete or green.',
  'Green is derived: build and suite exit 0, present empty failure lists, positive equal coverage counts with empty missing and unexpected lists, and log, report, manifest and reads artifacts. No green field is stored.',
  'Version 2 is a red whole run with each failed file run alone afterwards. aloneRuns names every entry of failedFiles once, in the same order, and failedFiles is not empty. A version 1 receipt carries neither aloneRuns nor errorsOutsideTests.',
  'A run alone that is green exited 0 and keeps its log and report; red keeps its exit code and report; no result keeps its exit code and says why; not run says why, with no exit code and no artifacts.',
  'Version 2 is green only when the build exited 0, the suite exited 1, every file run alone was green, errorsOutsideTests is 0, failedTests is present, coverage is complete and all four artifacts are kept. Its failedFiles, failedTests and suiteExitCode stay the whole run\'s.',
]

/** Made-up documentation data. This example is never a real observation. */
export const WHOLE_SUITE_RECEIPT_EXAMPLE: WholeSuiteReceipt = {
  version: 1, repository: '/srv/example/development', clone: '/srv/example/cloud-clone', commit: 'a'.repeat(40), tree: 'b'.repeat(40),
  startedAt: '2026-10-13 09:00:00', endedAt: '2026-10-13 09:20:00', where: 'cloud box',
  buildExitCode: 0, suiteExitCode: 0, failedFiles: [], failedTests: [],
  coverage: { expectedCount: 1, observedCount: 1, missing: [], unexpected: [] },
  artifacts: ARTIFACT_NAMES.map((name) => ({ name, path: `/srv/example/receipts/${name}.txt`, sha256Base64: MADE_UP_DIGEST })),
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
}

function safePath(value: unknown, absolute: boolean): value is string {
  if (typeof value !== 'string' || value.length === 0 || /[\\\u0000-\u001f\u007f:]/.test(value) || value.startsWith('/') !== absolute) return false
  return (absolute ? value.slice(1) : value).split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

const STAMP = new RegExp(`^${STAMP_GRAMMAR}$`)
function wallStamp(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = STAMP.exec(value)
  if (!match) return false
  const [, year, month, day, hour, minute, second] = match
  if (hour === undefined || minute === undefined || second === undefined || value !== `${year}-${month}-${day} ${hour}:${minute}:${second}`) return false
  const y = Number(year), m = Number(month), d = Number(day)
  const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1]! && Number(hour) < 24 && Number(minute) < 60 && Number(second) < 60
}

/** Missing top-level fields are unfinished; wrong supplied values and contradictions are errors. */
export function wholeSuiteReceiptCrossChecks(data: unknown): ValidationError[] {
  const errors: ValidationError[] = []
  const fail = (path: string, message: string): void => { errors.push({ path, message: `${path}: ${message}` }) }
  const object = (value: unknown, fields: FieldSpec[], path: string, required: boolean): value is Record<string, unknown> => {
    if (!isObject(value)) { fail(path, 'must be an object'); return false }
    for (const key of Object.keys(value)) if (!fields.some((f) => f.key === key) && !(path === 'data' && key === SHORT_FORMS_FIELD)) fail(`${path}.${key}`, 'unknown receipt field')
    if (required) for (const f of fields) if (f.required && value[f.key] === undefined) fail(`${path}.${f.key}`, 'must be present in this object')
    return true
  }
  if (!object(data, WHOLE_SUITE_RECEIPT_FIELDS, 'data', false)) return errors
  // Office labels are record metadata, validated by the generic record door. They are not evidence.
  if (data[SHORT_FORMS_FIELD] !== undefined && !isObject(data[SHORT_FORMS_FIELD])) fail(`data.${SHORT_FORMS_FIELD}`, 'office short forms must be an object')
  const check = (key: string, predicate: (value: unknown) => boolean, message: string): void => {
    if (data[key] !== undefined && !predicate(data[key])) fail(`data.${key}`, message)
  }
  check('version', (value) => value === 1 || value === 2, 'must be version 1 or 2')
  check('repository', (value) => safePath(value, true), 'must be a safe absolute development checkout path')
  check('clone', (value) => safePath(value, true), 'must be a safe absolute checkout clone root')
  for (const key of ['commit', 'tree']) check(key, (value) => typeof value === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(value), 'must be a full lowercase 40- or 64-character Git hash')
  for (const key of ['startedAt', 'endedAt']) check(key, wallStamp, 'must be a valid local wall-clock string YYYY-MM-DD HH:MM:SS')
  check('where', (value) => value === 'cloud box', 'must be cloud box')
  for (const key of ['buildExitCode', 'suiteExitCode']) check(key, (value) => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 255, 'must be an integer exit code from 0 to 255')

  const paths = (value: unknown, path: string): value is string[] => {
    if (!Array.isArray(value)) { fail(path, 'must be an array of paths'); return false }
    let valid = true
    const seen = new Set<string>()
    value.forEach((entry, index) => {
      if (!safePath(entry, false)) { fail(`${path}[${index}]`, 'must be a safe repository-relative path'); valid = false }
      else if (seen.has(entry)) { fail(`${path}[${index}]`, 'duplicates a path'); valid = false }
      else seen.add(entry)
    })
    return valid
  }
  let failedFiles: string[] | undefined
  if (data.failedFiles !== undefined && paths(data.failedFiles, 'data.failedFiles')) failedFiles = data.failedFiles
  let coverage: WholeSuiteReceipt['coverage']
  if (data.coverage !== undefined && object(data.coverage, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteCoverage!.fields, 'data.coverage', true)) {
    let countsValid = true
    for (const key of ['expectedCount', 'observedCount']) {
      const count = data.coverage[key]
      if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0) { fail(`data.coverage.${key}`, 'must be a nonnegative safe integer'); countsValid = false }
    }
    const missing = paths(data.coverage.missing, 'data.coverage.missing')
    const unexpected = paths(data.coverage.unexpected, 'data.coverage.unexpected')
    if (countsValid && missing && unexpected) {
      coverage = data.coverage as WholeSuiteReceipt['coverage']
      if (coverage!.missing.length > coverage!.expectedCount || coverage!.unexpected.length > coverage!.observedCount) fail('data.coverage', 'difference lists cannot exceed their respective counts')
      if (coverage!.missing.some((path) => coverage!.unexpected.includes(path))) fail('data.coverage', 'missing and unexpected paths must be disjoint')
      if (coverage!.expectedCount - coverage!.missing.length !== coverage!.observedCount - coverage!.unexpected.length) fail('data.coverage', 'counts and difference lists must describe the same common-file count')
    }
  }
  if (data.failedTests !== undefined) {
    if (!Array.isArray(data.failedTests)) fail('data.failedTests', 'must be an array of failing tests')
    else {
      const seen = new Set<string>()
      data.failedTests.forEach((test, index) => {
        const path = `data.failedTests[${index}]`
        if (!object(test, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteFailedTest!.fields, path, true)) return
        if (!safePath(test.file, false)) fail(`${path}.file`, 'must be a safe repository-relative path')
        if (typeof test.name !== 'string' || test.name.trim() === '') fail(`${path}.name`, 'must be a nonblank test name')
        const pair = JSON.stringify([test.file, test.name])
        if (seen.has(pair)) fail(path, 'duplicates a failing file and test-name pair')
        seen.add(pair)
        if (failedFiles !== undefined && !failedFiles.includes(test.file as string)) fail(`${path}.file`, 'must appear in failedFiles')
        if (coverage !== undefined && (coverage.observedCount === 0 || coverage.missing.includes(test.file as string))) fail(`${path}.file`, 'cannot claim a failing test in an unobserved file')
      })
    }
  }
  if (data.workerCrashes !== undefined) {
    if (!Array.isArray(data.workerCrashes)) fail('data.workerCrashes', 'must be an array of worker crashes')
    else {
      const seen = new Set<unknown>()
      data.workerCrashes.forEach((crash, index) => {
        const path = `data.workerCrashes[${index}]`
        if (!object(crash, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteWorkerCrash!.fields, path, true)) return
        if (!safePath(crash.file, false)) fail(`${path}.file`, 'must be a safe repository-relative path')
        if (seen.has(crash.file)) fail(`${path}.file`, 'duplicates a crashed file')
        seen.add(crash.file)
        if (!failedFiles?.includes(crash.file as string)) fail('data.failedFiles', 'must include every file in workerCrashes')
        if (coverage !== undefined && (coverage.observedCount === 0 || coverage.missing.includes(crash.file as string))) fail(`${path}.file`, 'cannot claim a crash in an unobserved file')
        if (typeof crash.unfinishedTests !== 'number' || !Number.isSafeInteger(crash.unfinishedTests) || crash.unfinishedTests < 1) fail(`${path}.unfinishedTests`, 'must be a positive safe integer')
      })
    }
    if (data.buildExitCode !== 0) fail('data.buildExitCode', 'workerCrashes requires a successful build')
    if (typeof data.suiteExitCode !== 'number' || data.suiteExitCode === 0) fail('data.suiteExitCode', 'workerCrashes requires a nonzero suite exit')
  }
  if (data.skippedCases !== undefined) {
    const skipped = data.skippedCases
    if (object(skipped, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteSkippedCases!.fields, 'data.skippedCases', true)) {
      const count = skipped.count
      const countIsValid = typeof count === 'number' && Number.isSafeInteger(count) && count >= 0
      if (!countIsValid) fail('data.skippedCases.count', 'must be a nonnegative safe integer')
      let casesAreValid = true
      if (skipped.cases === undefined) {
        if (countIsValid && count !== 0) fail('data.skippedCases.cases', 'must be present when the count is not zero')
      } else if (!Array.isArray(skipped.cases)) {
        fail('data.skippedCases.cases', 'must be an array of skipped cases')
        casesAreValid = false
      } else {
        skipped.cases.forEach((one, index) => {
          const path = `data.skippedCases.cases[${index}]`
          if (!object(one, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteSkippedCase!.fields, path, true)) { casesAreValid = false; return }
          if (!safePath(one.file, false)) { fail(`${path}.file`, 'must be a safe repository-relative path'); casesAreValid = false }
          if (typeof one.name !== 'string' || one.name.trim() === '') { fail(`${path}.name`, 'must be a nonblank test name'); casesAreValid = false }
        })
        if (skipped.cases.length > 200) { fail('data.skippedCases.cases', 'must list at most 200 skipped cases'); casesAreValid = false }
        if (countIsValid && count === 0) { fail('data.skippedCases.cases', 'must be absent when the count is zero'); casesAreValid = false }
      }
      const notListed = skipped.notListed
      if (notListed !== undefined) {
        if (typeof notListed !== 'number' || !Number.isSafeInteger(notListed) || notListed < 1) { fail('data.skippedCases.notListed', 'must be a positive safe integer'); casesAreValid = false }
        if (!Array.isArray(skipped.cases) || skipped.cases.length !== 200) fail('data.skippedCases.notListed', 'is allowed only when 200 cases are listed')
      }
      if (countIsValid && casesAreValid && Array.isArray(skipped.cases)) {
        const notListedCount = typeof notListed === 'number' && Number.isSafeInteger(notListed) && notListed > 0 ? notListed : 0
        if (count !== skipped.cases.length + notListedCount) fail('data.skippedCases', 'count must equal the number of cases listed plus notListed')
      }
    }
    if (data.buildExitCode !== 0) fail('data.buildExitCode', 'skippedCases requires a successful build')
    if (typeof data.suiteExitCode !== 'number') fail('data.suiteExitCode', 'skippedCases requires a suite exit')
  }
  if (data.artifacts !== undefined) {
    if (!Array.isArray(data.artifacts)) fail('data.artifacts', 'must be an array of artifacts')
    else {
      const seen = new Set<unknown>()
      data.artifacts.forEach((artifact, index) => {
        const path = `data.artifacts[${index}]`
        if (!object(artifact, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteArtifact!.fields, path, true)) return
        if (!(ARTIFACT_NAMES as readonly unknown[]).includes(artifact.name)) fail(`${path}.name`, 'must name log, report, manifest or reads')
        if (seen.has(artifact.name)) fail(`${path}.name`, 'duplicates an artifact kind')
        seen.add(artifact.name)
        if (!safePath(artifact.path, true)) fail(`${path}.path`, 'must be a safe absolute artifact path')
        if (typeof artifact.sha256Base64 !== 'string' || !/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(artifact.sha256Base64)) fail(`${path}.sha256Base64`, 'must be a canonical base64 SHA-256 digest')
        if (data.buildExitCode !== undefined && data.buildExitCode !== 0 && artifact.name !== 'log') fail(`${path}.name`, 'a failed build can carry only log evidence')
      })
    }
  }
  check('errorsOutsideTests', (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0, 'must be a nonnegative safe integer')
  // Said at the version: the field is not wrong in itself, the two do not go together.
  if (data.version === 1) for (const key of VERSION_2_FIELDS) if (data[key] !== undefined) fail('data.version', `is 1, and ${key} belongs to version 2 only`)
  if (data.version === 2) {
    if (data.failedFiles === undefined || (Array.isArray(data.failedFiles) && data.failedFiles.length === 0)) fail('data.failedFiles', 'version 2 needs the failed files of a red whole run')
    if (data.aloneRuns === undefined) fail('data.aloneRuns', 'version 2 needs a run alone for each failed file')
  }
  if (data.aloneRuns !== undefined) {
    if (!Array.isArray(data.aloneRuns)) fail('data.aloneRuns', 'must be an array of runs alone')
    else {
      const files = data.aloneRuns.map((run) => (isObject(run) ? run.file : undefined))
      if (failedFiles !== undefined && JSON.stringify(files) !== JSON.stringify(failedFiles)) fail('data.aloneRuns', 'must name every failed file once, in the order of failedFiles')
      data.aloneRuns.forEach((run, index) => {
        const path = `data.aloneRuns[${index}]`
        if (!object(run, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteAloneRun!.fields, path, true)) return
        if (!safePath(run.file, false)) fail(`${path}.file`, 'must be a safe repository-relative path')
        if (!(ALONE_OUTCOMES as readonly unknown[]).includes(run.outcome)) fail(`${path}.outcome`, 'must be green, red, no result or not run')
        const exit = run.exitCode
        if (exit !== undefined && (typeof exit !== 'number' || !Number.isInteger(exit) || exit < 0 || exit > 255)) fail(`${path}.exitCode`, 'must be an integer exit code from 0 to 255')
        const because = run.because
        if (because !== undefined && (typeof because !== 'string' || because.trim() === '')) fail(`${path}.because`, 'must be a nonblank sentence')
        const kept = new Set<unknown>()
        if (!Array.isArray(run.artifacts)) fail(`${path}.artifacts`, 'must be an array of artifacts')
        else run.artifacts.forEach((artifact, at) => {
          const where = `${path}.artifacts[${at}]`
          if (!object(artifact, WHOLE_SUITE_RECEIPT_SHAPES.WholeSuiteAloneArtifact!.fields, where, true)) return
          if (!(ALONE_ARTIFACT_NAMES as readonly unknown[]).includes(artifact.name)) fail(`${where}.name`, 'must name log or report')
          if (kept.has(artifact.name)) fail(`${where}.name`, 'duplicates an artifact kind')
          kept.add(artifact.name)
          if (!safePath(artifact.path, true)) fail(`${where}.path`, 'must be a safe absolute artifact path')
          if (typeof artifact.sha256Base64 !== 'string' || !/^[A-Za-z0-9+/]{42}[AEIMQUYcgkosw048]=$/.test(artifact.sha256Base64)) fail(`${where}.sha256Base64`, 'must be a canonical base64 SHA-256 digest')
        })
        if (run.outcome === 'green' && (exit !== 0 || because !== undefined || !kept.has('log') || !kept.has('report'))) fail(path, 'a green run alone exited 0, keeps its log and report, and gives no reason')
        if (run.outcome === 'red' && (exit === undefined || because !== undefined || !kept.has('report'))) fail(path, 'a red run alone keeps its exit code and report, and gives no reason')
        if (run.outcome === 'no result' && (exit === undefined || because === undefined)) fail(path, 'a run alone with no result keeps its exit code and says why')
        if (run.outcome === 'not run' && (exit !== undefined || because === undefined || kept.size > 0 || (Array.isArray(run.artifacts) && run.artifacts.length > 0))) fail(path, 'a file not run alone says why, with no exit code and no artifacts')
      })
    }
  }
  const suiteFields = ['suiteExitCode', 'failedFiles', 'failedTests', 'coverage']
  if (data.buildExitCode !== 0) for (const key of suiteFields) if (data[key] !== undefined) fail(`data.${key}`, 'suite evidence requires a successful build')
  if (data.suiteExitCode === 0) for (const key of ['failedFiles', 'failedTests']) {
    if (Array.isArray(data[key]) && data[key].length > 0) fail(`data.${key}`, 'an exit-zero suite cannot claim failures')
  }
  return errors
}

/** Parse evidence without defaults or coercion. A valid partial suite observation is preserved. */
export function parseWholeSuiteReceipt(data: unknown): WholeSuiteReceipt {
  const errors = wholeSuiteReceiptCrossChecks(data)
  if (errors.length > 0) throw new Error(errors.map((error) => error.message).join('\n'))
  const value = data as Record<string, unknown>
  const missing = WHOLE_SUITE_RECEIPT_FIELDS.filter((f) => f.required && value[f.key] === undefined).map((f) => f.key)
  if (missing.length > 0) throw new Error(`Incomplete whole-suite receipt: ${missing.join(', ')}.`)
  const { [SHORT_FORMS_FIELD]: metadata, ...evidence } = value
  void metadata
  return evidence as unknown as WholeSuiteReceipt
}

/**
 * Complete evidence: the build exited 0, the suite's failed files and tests were read, coverage is whole, and every
 * artifact is there. It says nothing about whether anything failed. Green below asks it first, and a judged receipt
 * (src/shared/receipt-judgement.ts) asks it too, so the two cannot mean different things by complete.
 */
export function wholeSuiteReceiptIsComplete(data: unknown): boolean {
  let receipt: WholeSuiteReceipt
  try { receipt = parseWholeSuiteReceipt(data) } catch { return false }
  return receipt.buildExitCode === 0 &&
    receipt.failedFiles !== undefined && receipt.failedTests !== undefined &&
    receipt.coverage !== undefined && receipt.coverage.expectedCount > 0 &&
    receipt.coverage.expectedCount === receipt.coverage.observedCount &&
    receipt.coverage.missing.length === 0 && receipt.coverage.unexpected.length === 0 &&
    ARTIFACT_NAMES.every((name) => receipt.artifacts.some((artifact) => artifact.name === name))
}

/**
 * Only complete successful evidence is green; no stored flag participates. Version 1 is green when no file failed.
 * Version 2 is green when the whole run's only failures are files that each passed when run alone: its suite exited 1,
 * every run alone was green, and vitest counted no error outside the tests. This is the one rule; every reader of a
 * receipt's verdict calls it.
 */
export function wholeSuiteReceiptIsGreen(data: unknown): boolean {
  if (!wholeSuiteReceiptIsComplete(data)) return false
  const receipt = parseWholeSuiteReceipt(data)
  if (receipt.version === 1) return receipt.suiteExitCode === 0 && receipt.failedFiles!.length === 0 && receipt.failedTests!.length === 0
  return receipt.suiteExitCode === 1 && receipt.errorsOutsideTests === 0 &&
    receipt.aloneRuns !== undefined && receipt.aloneRuns.length > 0 && receipt.aloneRuns.every((run) => run.outcome === 'green')
}

/**
 * A receipt's outcome, in the words a repair's verification stores. This is the one place an outcome is worked out from
 * a receipt; the guard on a repair's verification and the stable upgrade's verifier both call it. Incomplete comes from
 * wholeSuiteReceiptIsComplete, so that complete has one meaning. The last step reads a complete receipt that is not green
 * and has no suite exit other than 0 as incomplete, because red says a failure was seen, and nobody saw one.
 */
export function wholeSuiteReceiptOutcome(data: unknown): NonNullable<NonNullable<MainSuiteFix['verification']>['outcome']> {
  if (isObject(data) && typeof data.buildExitCode === 'number' && data.buildExitCode !== 0) return 'build-failed'
  if (!wholeSuiteReceiptIsComplete(data)) return 'incomplete'
  if (wholeSuiteReceiptIsGreen(data)) return 'green'
  const { suiteExitCode } = parseWholeSuiteReceipt(data)
  if (typeof suiteExitCode === 'number' && suiteExitCode !== 0) return 'red'
  return 'incomplete'
}
