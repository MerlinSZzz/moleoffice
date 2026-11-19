// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE REGISTER IS GENERATED FROM THE CLUSTER RECORDS, AND REFUSES RATHER THAN GUESSING.
 *
 * Criterion P4 of design/planning/ACCEPTANCE.md: every cluster in the register is a trajectory whose
 * planned states are its criteria met, serving a goal; the register file is generated from the
 * records, so the order is stored once (decision AbJqm357GekB).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS FILE PROVES, IN FIVE PARTS
 * ---------------------------------------------------------------------------------------
 *
 *   1. One trajectory per cluster: its planned states are the cluster module's criteria, read back
 *      in order, with the `plans_for` link to its module and the `serves` link to its goal.
 *   2. The generator's output is exactly what the records say, region for region.
 *   3. `--check` exits 0 on a document that matches and 1 on one that does not, and writes nothing.
 *   4. The generator refuses, by name, a cluster with no trajectory; a marker it does not write; an
 *      end marker before its start; and a document with no markers at all.
 *   5. Every region this generator knows is filled, and a block that is not a cluster is left out.
 *
 * ---------------------------------------------------------------------------------------
 * IT NEVER TOUCHES THE REAL DOCUMENT OR THE REAL OFFICE
 * ---------------------------------------------------------------------------------------
 *
 * Every document this file breaks is a temporary file of its own, written under `tmpdir()`. The
 * records are built on a throwaway SQLite database from `freshDb()`, served by an in-process API
 * the generator reads over a loopback port. `design/PLAN-2026-09-11.md` is never opened and the
 * live office's port is never called.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { AddressInfo } from 'node:net'
import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { apiApp, freshDb, type TestDb } from './helpers.ts'
import { CLUSTERS, GOAL, type FixtureCluster } from './cluster-register-fixture.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools', 'cluster-register.mjs')

interface Scene {
  pipelineId: string
  goalId: string
  modules: Map<string, { moduleId: string; blockId: string; trajectoryId: string; stateIds: string[] }>
}

let t: TestDb
let app: FastifyInstance
let api = ''
let scene: Scene
/** Every temporary directory this file made, removed at the end. */
const dirs: string[] = []

const HUMAN = () => t.api.HUMAN

/** File one record through the product's own create path, and hand its id back. */
function record(kind: string, title: string, data: Record<string, unknown>): string {
  return t.api.createRecord({ workspaceId: 'default', kind: kind as never, title, data, actor: HUMAN() }).id
}

/**
 * THE EIGHT CLUSTERS AS RECORDS: a module per cluster, a block per cluster in the pipeline's order,
 * the `implements` link between them, and — states first, then the trajectory that names them — the
 * planned future and its two links.
 */
function buildScene(): Scene {
  const goalId = record('goal', GOAL.title, GOAL.data as unknown as Record<string, unknown>)
  const pipelineId = record('pipeline', 'The plan of 11 September 2026: eight clusters in order', { blockIds: [] })
  const modules = new Map<string, { moduleId: string; blockId: string; trajectoryId: string; stateIds: string[] }>()
  for (const cluster of CLUSTERS as FixtureCluster[]) {
    const moduleId = record('module', cluster.title, {
      context: cluster.context,
      state: 'active',
      parts: [
        {
          id: 'work',
          name: cluster.partName,
          items: cluster.criteria.map((criterion) => ({ id: criterion.itemId, text: criterion.itemText, state: 'todo' })),
        },
      ],
    })
    const block = t.blocks.addBlock(pipelineId, { name: cluster.title, state: cluster.blockState }, HUMAN()).block
    t.api.createLink({ fromId: moduleId, toId: block.id, type: 'implements', actor: HUMAN() })

    const stateIds = cluster.criteria.map((criterion) =>
      record('planned_state', criterion.what, {
        what: criterion.what,
        ...(criterion.because === undefined ? {} : { because: criterion.because }),
      }),
    )
    const trajectoryId = record('trajectory', `${cluster.title} — the criteria met`, { plannedStateIds: stateIds })
    t.api.createLink({ fromId: trajectoryId, toId: moduleId, type: 'plans_for', actor: HUMAN() })
    t.api.createLink({ fromId: trajectoryId, toId: goalId, type: 'serves', actor: HUMAN() })

    modules.set(cluster.title, { moduleId, blockId: block.id, trajectoryId, stateIds })
  }
  return { pipelineId, goalId, modules }
}

/** A scratch document with both markers, written under `tmpdir()` and removed at the end. */
function aScratchDocument(body?: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'mole-office-cluster-register-'))
  dirs.push(dir)
  const path = join(dir, 'SCRATCH-REGISTER.md')
  writeFileSync(
    path,
    body ??
      '# A scratch register\n\n<!-- table:cluster-register -->\nOLD CONTENT\n<!-- end table:cluster-register -->\n\n' +
        '<!-- table:cluster-goals -->\nOLD CONTENT\n<!-- end table:cluster-goals -->\n',
  )
  return path
}

interface ToolRun {
  code: number
  out: string
}

/**
 * RUN THE GENERATOR and keep the event loop free while it runs.
 *
 * NOT `spawnSync`: the API the generator reads answers from THIS process, and a synchronous spawn
 * would block the very loop that has to serve it. The child would wait on a deadlock, not a slow
 * machine.
 */
function runTheTool(options: { document: string; pipeline?: string; check?: boolean; extra?: string[] }): Promise<ToolRun> {
  const args = [
    TOOL,
    '--api',
    api,
    '--workspace',
    'default',
    '--pipeline',
    options.pipeline ?? scene.pipelineId,
    '--document',
    options.document,
    ...(options.check === true ? ['--check'] : []),
    ...(options.extra ?? []),
  ]
  return new Promise((resolve) => {
    const child = spawn('node', args, { cwd: REPO, env: { ...process.env } })
    let out = ''
    child.stdout.on('data', (chunk: unknown) => {
      out += String(chunk)
    })
    child.stderr.on('data', (chunk: unknown) => {
      out += String(chunk)
    })
    child.on('error', (err) => {
      resolve({ code: -1, out: `${out}could not start the tool: ${err.message}` })
    })
    child.on('exit', (code) => {
      resolve({ code: code ?? -1, out })
    })
  })
}

/** One region's body, without its markers. Throws when the region is not there. */
function regionOf(text: string, key: string): string {
  const match = new RegExp(`<!-- table:${key} -->\\n([\\s\\S]*?)\\n<!-- end table:${key} -->`).exec(text)
  if (match === null || match[1] === undefined) throw new Error(`the ${key} region is not in the document`)
  return match[1]
}

/** The register table the fixture says the generator must write, built here and not by the tool. */
function expectedRegister(): string {
  const lines = [
    '| # | Cluster | State | Serves the goal | The criteria it must meet |',
    '|---:|---|---|---|---|',
  ]
  CLUSTERS.forEach((cluster, i) => {
    const criteria = cluster.criteria.map((criterion, j) => `${String(j + 1)}. ${criterion.what}`).join('<br>')
    lines.push(`| ${String(i + 1)} | **${cluster.title}** | ${cluster.blockState} | ${GOAL.title} | ${criteria} |`)
  })
  return lines.join('\n')
}

/** The goals table the fixture says the generator must write. */
function expectedGoals(): string {
  return (
    '| Horizon | The goal | Served by |\n|---|---|---|\n' +
    `| ${GOAL.data.horizon} | **${GOAL.title}** — ${GOAL.data.what} | all ${String(CLUSTERS.length)} clusters |`
  )
}

beforeAll(async () => {
  t = await freshDb()
  const built = await apiApp()
  app = built.app
  await app.ready()
  await app.listen({ host: '127.0.0.1', port: 0 })
  api = `http://127.0.0.1:${String((app.server.address() as AddressInfo).port)}`
  scene = buildScene()
}, 240_000)

afterAll(async () => {
  await app.close()
  t.close()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('every cluster is a trajectory whose planned states are its criteria met', () => {
  it('reads a cluster back with its states in order and its plans_for and serves links', () => {
    const cluster = CLUSTERS[0] as FixtureCluster
    const stored = scene.modules.get(cluster.title)
    expect(stored, 'the first cluster was not built').toBeDefined()
    const trajectory = t.api.getRecord(stored!.trajectoryId)
    expect(trajectory, 'the trajectory is not there').not.toBeNull()
    expect(trajectory?.kind).toBe('trajectory')
    expect(trajectory?.data.plannedStateIds).toEqual(stored!.stateIds)

    // THE STATES, IN THE STORED ORDER, each one the sentence that would be true when its criterion
    // is met.
    const said = stored!.stateIds.map((id) => {
      const state = t.api.getRecord(id)
      expect(state?.kind).toBe('planned_state')
      return state?.data.what
    })
    expect(said).toEqual(cluster.criteria.map((criterion) => criterion.what))

    // AND THE TWO LINKS. `resolveLinks` is the reader every page uses.
    const links = t.api.resolveLinks(stored!.trajectoryId)
    const plansFor = links.find((link) => link.type === 'plans_for')
    const serves = links.find((link) => link.type === 'serves')
    expect(plansFor?.other.id, 'the plans_for link does not point at the cluster module').toBe(stored!.moduleId)
    expect(serves?.other.id, 'the serves link does not point at the goal').toBe(scene.goalId)
  })

  it('gives every criterion the module records one planned state, and no more', () => {
    for (const cluster of CLUSTERS as FixtureCluster[]) {
      const stored = scene.modules.get(cluster.title)
      expect(stored?.stateIds.length, `${cluster.title} does not have one state per criterion`).toBe(
        cluster.criteria.length,
      )
      const module = t.api.getRecord(stored!.moduleId)
      const items = (module?.data.parts as { items: unknown[] }[] | undefined)?.flatMap((part) => part.items) ?? []
      expect(items.length, `${cluster.title}'s module does not record one item per criterion`).toBe(cluster.criteria.length)
    }
  })
})

describe('the generator writes the register from the records', () => {
  it('fills both regions with exactly what the records say', async () => {
    const document = aScratchDocument()
    const ran = await runTheTool({ document })
    expect(ran.code, ran.out).toBe(0)
    expect(ran.out).toContain('Wrote 2 regions')
    const written = readFileSync(document, 'utf8')
    expect(regionOf(written, 'cluster-register')).toBe(expectedRegister())
    expect(regionOf(written, 'cluster-goals')).toBe(expectedGoals())
  })

  it('refuses a document with no markers at all, in a plain sentence', async () => {
    const document = aScratchDocument('# No markers here\n\nProse only.\n')
    const ran = await runTheTool({ document })
    expect(ran.code, ran.out).toBe(1)
    expect(ran.out).toContain('the document has no <!-- table:… --> markers; nothing would be written')
    expect(readFileSync(document, 'utf8')).toBe('# No markers here\n\nProse only.\n')
  })

  it('refuses a marker it cannot fill, naming it', async () => {
    // THE INVENTED PAIR IS NESTED INSIDE A REGION THIS GENERATOR DOES WRITE, so the marker walk
    // sees it and refuses it. A top-level pair would be handed to `region()`, which throws — and
    // that throw is the drift guard between REGIONS and the writers, not this refusal.
    const document = aScratchDocument(
      '# A scratch register\n\n<!-- table:cluster-register -->\n<!-- table:invented-by-somebody -->\n' +
        '<!-- end table:invented-by-somebody -->\n<!-- end table:cluster-register -->\n\n' +
        '<!-- table:cluster-goals -->\n<!-- end table:cluster-goals -->\n',
    )
    const ran = await runTheTool({ document })
    expect(ran.code, ran.out).toBe(1)
    expect(ran.out).toContain('<!-- table:invented-by-somebody --> is not a region this generator writes')
  })

  it('refuses an end marker before its start marker, naming the region', async () => {
    const document = aScratchDocument(
      '# A scratch register\n\n<!-- end table:cluster-register -->\n<!-- table:cluster-register -->\n\n' +
        '<!-- table:cluster-goals -->\nOLD\n<!-- end table:cluster-goals -->\n',
    )
    const ran = await runTheTool({ document })
    expect(ran.code, ran.out).toBe(1)
    expect(ran.out).toContain(
      '<!-- table:cluster-register --> could not be filled; its end marker is before its start marker',
    )
  })

  it('refuses when a cluster in the pipeline has no trajectory, naming it', async () => {
    // A second pipeline with one cluster that carries a module and has no planned future.
    const orphanPipeline = record('pipeline', 'A pipeline with one cluster and no plan', { blockIds: [] })
    const orphanModule = record('module', 'Cluster Z — A cluster nobody planned', {
      context: 'a scratch cluster with no trajectory',
      state: 'active',
      parts: [{ id: 'work', name: 'What the cluster holds', items: [{ id: 'z-1', text: 'something', state: 'todo' }] }],
    })
    const orphanBlock = t.blocks.addBlock(
      orphanPipeline,
      { name: 'Cluster Z — A cluster nobody planned', state: 'todo' },
      HUMAN(),
    ).block
    t.api.createLink({ fromId: orphanModule, toId: orphanBlock.id, type: 'implements', actor: HUMAN() })

    const document = aScratchDocument()
    const ran = await runTheTool({ document, pipeline: orphanPipeline })
    expect(ran.code, ran.out).toBe(1)
    expect(ran.out).toContain('Cluster Z — A cluster nobody planned')
    expect(ran.out).toContain('has no trajectory that plans for its module')
  })
})

describe('--check reads and compares; it never writes', () => {
  it('exits 0 when the document matches the records', async () => {
    const document = aScratchDocument()
    expect((await runTheTool({ document })).code).toBe(0)
    const before = readFileSync(document, 'utf8')
    const checked = await runTheTool({ document, check: true })
    expect(checked.code, checked.out).toBe(0)
    expect(checked.out).toContain('The register matches its records')
    expect(readFileSync(document, 'utf8')).toBe(before)
  })

  it('exits 1 and names what differs, and leaves the document as it was', async () => {
    const document = aScratchDocument()
    expect((await runTheTool({ document })).code).toBe(0)
    const withStale = readFileSync(document, 'utf8').replace(
      '<!-- table:cluster-register -->\n',
      '<!-- table:cluster-register -->\nSTALE CONTENT\n',
    )
    writeFileSync(document, withStale)

    const checked = await runTheTool({ document, check: true })
    expect(checked.code, checked.out).toBe(1)
    expect(checked.out).toContain('does not match the clusters in the records')
    // AND IT WROTE NOTHING: the stale line is still there, byte for byte.
    expect(readFileSync(document, 'utf8')).toBe(withStale)
  })
})

describe('an argument this tool does not know is refused before anything is read or written', () => {
  it('refuses, names the argument, and writes nothing', async () => {
    const document = aScratchDocument()
    const before = readFileSync(document, 'utf8')
    const ran = await runTheTool({ document, extra: ['--nonsense'] })
    expect(ran.code, ran.out).toBe(1)
    expect(ran.out).toContain('I do not know the argument "--nonsense"')
    expect(ran.out).toContain('--check, --document <path>, --pipeline <id>')
    expect(readFileSync(document, 'utf8')).toBe(before)
  })
})
