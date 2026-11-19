// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CHECK ASKS ITS OWN SESSION ONCE FOR THE PACKAGE POINTS A VERDICT LEFT OUT.
 *
 * WHAT IS REAL AND WHAT IS NOT. The tool is the real one, run --on-the-host against tests/inspector-tool-fixture.ts, a
 * labelled stand-in office. Its prompt door lists the packages this file makes up. Its verdict door is a fake that keeps
 * each post and takes it. The model is a stand-in claude on PATH, labelled in its own first lines, which runs no model: it
 * keeps each prompt and the arguments it was started with, and gives the answers this file lists, in order. Every package,
 * point, task, session and record id here is made up.
 *
 * WHAT GOES RED WHEN THE CODE IS REMOVED, proved in the round's report with a control run first:
 *   - The block skips its second ask: the first, second, third and fifth cases go red.
 *   - The tool posts the first verdict after the second ask, without the obtained points: the first and third go red.
 *   - The tool posts when the second answer still lacks a point: the second goes red.
 *   - The tool keeps a point given twice in the second answer: the third goes red.
 *   - The tool asks a check of handed-back packages again for decision judgments, which its prompt no longer asks for:
 *     the sixth goes red.
 */
import { chmodSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ThePackagesARunHandedBack } from '../src/server/lib/delegation.ts'
import { AGENT_AUTHORITIES } from '../src/shared/kinds.ts'
import { aJudgedPoint } from '../src/shared/the-verdict-door.ts'
import { aMadeUpCheckSession, inspectorFixture } from './inspector-tool-fixture.ts'

type Fixture = Awaited<ReturnType<typeof inspectorFixture>>
let fixture: Fixture | null = null
afterEach(async () => {
  await fixture?.close()
  fixture = null
})

const SESSION = 'the-checks-own-session-a-test-made-up'

/** The two packages the check was handed: the first has two points, the second one. */
const A_POINT = (pointId: string) => ({ pointId, says: `Synthetic: the point ${pointId}.`, outcome: 'done' as const, words: `Synthetic: ${pointId} was built.` })
const PACKAGE_A = { task: 'syntheticTaskA', title: 'A made-up first package', points: [A_POINT('syntheticPointA1'), A_POINT('syntheticPointA2')] }
const PACKAGE_B = { task: 'syntheticTaskB', title: 'A made-up second package', points: [A_POINT('syntheticPointB1')] }
const PACKAGES: ThePackagesARunHandedBack = { packages: [PACKAGE_A, PACKAGE_B], unread: [] }

/** A judgment of one point, as the verdict door takes it. */
const JUDGED = (pointId: string) => ({ pointId, judged: 'done' as const, holds: true, why: `Synthetic: ${pointId} was found done.`, rulesKept: true })
const A1 = JUDGED(PACKAGE_A.points[0]!.pointId)
const A2 = JUDGED(PACKAGE_A.points[1]!.pointId)
const B1 = JUDGED(PACKAGE_B.points[0]!.pointId)

/** A first answer the tool reads as a verdict, with `packages` when one is given, and its session or none. */
function aVerdict(packages?: Record<string, unknown>[], session: string | null = SESSION): Record<string, unknown> {
  return {
    ...(session === null ? {} : { session_id: session }),
    result: JSON.stringify({ verdict: 'released', check: 'Synthetic: read the made-up packages and the made-up change.', ...(packages === undefined ? {} : { packages }) }),
  }
}

/** A second answer, which gives only the packages and points it names. */
function thePackages(packages: Record<string, unknown>[]): Record<string, unknown> {
  return { session_id: SESSION, result: JSON.stringify({ packages }) }
}

/**
 * A STAND-IN claude: gives `answers` in order, one to each run, and the last again once they run out. Each run's prompt
 * and arguments are kept, one file each, in the order run.
 */
function standInModel(home: string, answers: Record<string, unknown>[]): { bin: string; runs: string } {
  const bin = join(home, 'bin')
  const runs = join(home, 'runs-of-the-model')
  mkdirSync(bin)
  mkdirSync(runs)
  const file = join(home, 'answers.json')
  writeFileSync(file, JSON.stringify(answers))
  writeFileSync(
    join(bin, 'claude'),
    [
      `#!${process.execPath}`,
      '// A stand-in for claude, written by a test. It runs no model: it keeps what it was given and answers from a file.',
      "import { readFileSync, readdirSync, writeFileSync } from 'node:fs'",
      'let prompt = ""',
      'process.stdin.on("data", (part) => { prompt += String(part) })',
      "process.stdin.on('end', () => {",
      `  const n = readdirSync(${JSON.stringify(runs)}).length`,
      `  writeFileSync(${JSON.stringify(runs)} + '/' + n + '.json', JSON.stringify({ argv: process.argv.slice(2), prompt }))`,
      `  const answers = JSON.parse(readFileSync(${JSON.stringify(file)}, 'utf8'))`,
      '  process.stdout.write(JSON.stringify(answers[Math.min(n, answers.length - 1)]))',
      '})',
    ].join('\n'),
  )
  chmodSync(join(bin, 'claude'), 0o755)
  return { bin, runs }
}

/** Each run of the stand-in model, in the order run. */
function theRuns(runs: string): { argv: string[]; prompt: string }[] {
  return readdirSync(runs).sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
    .map((file) => JSON.parse(readFileSync(join(runs, file), 'utf8')) as { argv: string[]; prompt: string })
}

/** The arguments after --resume, or none. */
const resumed = (argv: string[]) => (argv.includes('--resume') ? argv.slice(argv.indexOf('--resume'), argv.indexOf('--resume') + 2) : [])

/**
 * A FAKE VERDICT DOOR on the fixture office: each post is kept and answered by `answer`. The reading of the run names the
 * agent it serves, so a verdict has somebody to go to, and says the run saved no round chapters, which is not this file's
 * question.
 */
function aFakeDoor(f: Fixture, answer: (body: Record<string, any>) => { status: number; error?: string }): Record<string, any>[] {
  const posts: Record<string, any>[] = []
  f.state.onRequest = (request, reply) => {
    if (request.method !== 'POST' || request.url !== `/api/checks/${f.run}`) return false
    let raw = ''
    request.on('data', (part) => { raw += String(part) })
    request.on('end', () => {
      const body = JSON.parse(raw) as Record<string, any>
      posts.push(body)
      const said = answer(body)
      reply.statusCode = said.status
      reply.setHeader('content-type', 'application/json')
      reply.end(JSON.stringify(said.error === undefined
        ? { verdict: body['verdict'], toTheWorker: 'Synthetic.', toTheStarter: '', group: null }
        : { error: said.error }))
    })
    return true
  }
  f.state.reading = {
    agent: { id: 'theWorkersId', handle: 'the-worker', startedBy: { kind: 'agent', id: 'theStartersId' } },
    savedChapters: null,
  } as never
  return posts
}
const taken = () => ({ status: 201 })

async function inspect(f: Fixture, bin: string, check: string) {
  return f.inspect(['--check', check], { HOME: f.home, PATH: `${bin}:${process.env['PATH'] ?? ''}` }, true)
}

/** Every point id in the posted packages, in order. */
const thePointIds = (packages: { points: { pointId: string }[] }[]) => packages.flatMap((one) => one.points.map((point) => point.pointId))

describe('a check that left out a package point is asked once for it', () => {
  it('asks the same session once, names every left-out point, and posts both packages with each point once', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    const model = standInModel(f.home, [
      aVerdict([{ task: PACKAGE_A.task, points: [A1] }]),
      thePackages([
        { task: PACKAGE_A.task, points: [A2] },
        { task: PACKAGE_B.task, points: [B1] },
      ]),
    ])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.err).toBe(0)

    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])
    for (const id of [PACKAGE_A.task, PACKAGE_B.task, A2.pointId, B1.pointId]) expect(runs[1]!.prompt).toContain(id)
    for (const word of [...Object.keys(aJudgedPoint.shape), ...aJudgedPoint.shape.judged.options]) {
      expect(runs[1]!.prompt).toMatch(new RegExp(`\\b${word}\\b`))
    }

    expect(posts).toHaveLength(1)
    const posted = posts[0]!['packages'] as { task: string; points: { pointId: string }[] }[]
    expect(posted).toEqual([
      { task: PACKAGE_A.task, points: [A1, A2] },
      { task: PACKAGE_B.task, points: [B1] },
    ])
    const ids = thePointIds(posted)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('posts no verdict and exits 1 when the second answer still leaves a point out', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    const model = standInModel(f.home, [
      aVerdict([{ task: PACKAGE_A.task, points: [A1] }]),
      thePackages([{ task: PACKAGE_A.task, points: [A2] }]),
    ])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.out + ran.err).toBe(1)
    expect(posts).toEqual([])
    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])
  })

  it('keeps a point given twice in the second answer only once', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    const model = standInModel(f.home, [
      aVerdict([{ task: PACKAGE_A.task, points: [A1] }]),
      thePackages([
        { task: PACKAGE_A.task, points: [A2, A2] },
        { task: PACKAGE_B.task, points: [B1] },
      ]),
    ])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.err).toBe(0)

    const runs = theRuns(model.runs)
    expect(runs).toHaveLength(2)
    expect(resumed(runs[1]!.argv)).toEqual(['--resume', SESSION])
    expect(posts).toHaveLength(1)
    const posted = posts[0]!['packages'] as { task: string; points: { pointId: string }[] }[]
    expect(posted).toEqual([
      { task: PACKAGE_A.task, points: [A1, A2] },
      { task: PACKAGE_B.task, points: [B1] },
    ])
    const ids = thePointIds(posted)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('asks nothing more when the first verdict judges every point, and posts it as the check wrote it', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    const everyPoint = [
      { task: PACKAGE_A.task, points: [A1, A2] },
      { task: PACKAGE_B.task, points: [B1] },
    ]
    const model = standInModel(f.home, [aVerdict(everyPoint)])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.err).toBe(0)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(posts[0]!['packages']).toEqual(everyPoint)
  })

  it('posts no verdict and exits 1 when a point is left out and the answer names no session', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    const model = standInModel(f.home, [aVerdict([{ task: PACKAGE_A.task, points: [A1] }], null)])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.out + ran.err).toBe(1)
    expect(posts).toEqual([])
    expect(theRuns(model.runs)).toHaveLength(1)
  })

  it('asks a check of handed-back packages nothing more for the run’s decisions, and posts its verdict', async () => {
    fixture = await inspectorFixture()
    const f = fixture
    f.state.packages = PACKAGES
    const posts = aFakeDoor(f, taken)
    ;(f.state.reading as Record<string, unknown>)['decisions'] = [{
      id: 'syntheticDecision1', kind: 'decision', title: 'A made-up decision of the run', decided_by: 'the-worker',
      authority: AGENT_AUTHORITIES.at(-1), because: 'Synthetic: a made-up reason.', foundBy: ['session'],
    }]
    const everyPoint = [
      { task: PACKAGE_A.task, points: [A1, A2] },
      { task: PACKAGE_B.task, points: [B1] },
    ]
    const model = standInModel(f.home, [aVerdict(everyPoint)])
    const ran = await inspect(f, model.bin, aMadeUpCheckSession())
    expect(ran.code, ran.out + ran.err).toBe(0)
    expect(theRuns(model.runs)).toHaveLength(1)
    expect(posts).toHaveLength(1)
    expect(posts[0]!['packages']).toEqual(everyPoint)
    expect(posts[0]!['decisions']).toBeUndefined()
  })
})
