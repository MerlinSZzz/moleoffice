#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * WRITES THE REGISTER'S CLUSTER TABLE FROM THE RECORDS.
 *
 * Criterion P4 of design/planning/ACCEPTANCE.md: every cluster in the register is a trajectory whose
 * planned states are its criteria met, serving a goal; and the register file is generated from the
 * records, so the order is stored once (AbJqm357GekB: the register is generated, not
 * kept by hand).
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES
 * ---------------------------------------------------------------------------------------
 *
 * It fills the marked regions of a document. A region looks like this:
 *
 *     <!-- table:cluster-register -->
 *     …everything here is written by this script…
 *     <!-- end table:cluster-register -->
 *
 * Everything outside a marked region is prose and is never touched. Run it with no arguments to
 * write the document; run it with `--check` to compare without writing. `--check` exits 1 when the
 * document and the records disagree, so the register cannot drift from its source without somebody
 * being told.
 *
 * ---------------------------------------------------------------------------------------
 * WHERE IT READS THE RECORDS
 * ---------------------------------------------------------------------------------------
 *
 * Through the server's own doors, over HTTP: `GET /api/records/<id>` and `GET /api/links`. It never
 * opens the database itself and never parses a design document for a fact a record holds. The one
 * place it reads prose is where it names WHERE a criterion lives — and that is a note on the
 * planned state's own record, not a fact this script invents.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT REFUSES
 * ---------------------------------------------------------------------------------------
 *
 * A generated register that quietly skips a cluster is worse than one that refuses. So a cluster in
 * the pipeline that carries no module, carries more than one module, has no trajectory that plans
 * for its module, has more than one, or serves no goal or more than one, is refused by name and
 * nothing is written. A marker this script does not write, an end marker before its start, a region
 * with no end, and a document with no markers at all are each refused in a plain sentence naming
 * the marker.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

import { whereIsTheApi, whichWorkspace } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

const REPO = dirname(dirname(fileURLToPath(import.meta.url)))
const DEFAULT_DOCUMENT = join(REPO, 'design/PLAN-2026-09-11.md')
/** The pipeline the campaign is: one block per cluster, in order. */
const DEFAULT_PIPELINE = 'HCM2GykcAvDy'

/**
 * EVERY REGION THIS GENERATOR WRITES, NAMED HERE AND NOWHERE ELSE.
 *
 * A region that is missing, one that appears twice, one whose end marker is gone and one this
 * generator does not write are each named and refused, so a table that was deleted cannot pass the
 * check — the same guard `tools/test-audit-table.mjs` grew after a whole region was deleted and the
 * check stayed green.
 */
const REGIONS = ['cluster-register', 'cluster-goals']

const HEADERS = {
  'x-mole-office-workspace': whichWorkspace(),
  // The caller's own key and name when it holds a key; 'tools/cluster-register.mjs' when it holds none.
  ...anAgentsToolHeaders({ withoutAKey: 'tools/cluster-register.mjs' }),
  'x-mole-office-purpose': 'module-work',
  'x-mole-office-trace': 'the-cluster-register',
}

function usage() {
  return [
    'node tools/cluster-register.mjs [--check] [--document <path>] [--pipeline <id>] [--api <url>] [--workspace <id>] [--help]',
    '',
    'Fills the marked regions of design/PLAN-2026-09-11.md from the cluster records in Mole Office.',
    '',
    '  (no flags)           WRITES. Fills every region and saves the document.',
    '  --check               READS ONLY, never writes. Compares the document against the records',
    '                         and says whether they match. Exits 1 when they differ.',
    '  --document <path>     Read and write this file instead of the one in this checkout. --check',
    '                         still governs whether this run writes.',
    '  --pipeline <id>       The pipeline whose blocks are the clusters. Defaults to',
    `                         ${DEFAULT_PIPELINE}.`,
    '  --api <url>           Where the API answers. Defaults to the configured address.',
    '  --workspace <id>      Which project to read. Defaults to the configured project.',
    '  --help, -h            Print this and exit 0. Reads and writes nothing.',
    '',
    'An argument this tool does not know is refused before anything is read or written.',
  ].join('\n')
}

/** @returns {{ bad: string } | { bad?: undefined, check: boolean, document: string, pipeline: string, api: string | null, workspace: string | null, help: boolean }} */
function readArguments(argv) {
  const chosen = {
    check: false,
    document: DEFAULT_DOCUMENT,
    pipeline: DEFAULT_PIPELINE,
    api: null,
    workspace: null,
    help: false,
  }
  // A VALUE IS REFUSED ONLY WHEN THERE IS NONE, OR WHEN IT IS ONE OF THIS TOOL'S OWN FLAGS, which is what a
  // forgotten value looks like: --pipeline takes a record id, and one in 4,096 begins with `--` (acceptance
  // finding 49, report EnJvvsDTF_Dx).
  const theFlags = ['--help', '-h', '--check', '--document', '--pipeline', '--api', '--workspace']
  const valueAfter = (i, name) => {
    const value = argv[i + 1]
    if (value === undefined || theFlags.includes(value)) return { bad: `${name} needs a value after it. Nothing was read and nothing was written.` }
    return { value }
  }
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help' || arg === '-h') chosen.help = true
    else if (arg === '--check') chosen.check = true
    else if (arg === '--document' || arg === '--pipeline' || arg === '--api' || arg === '--workspace') {
      const read = valueAfter(i, arg)
      if ('bad' in read) return { bad: read.bad }
      if (arg === '--document') chosen.document = read.value
      if (arg === '--pipeline') chosen.pipeline = read.value
      if (arg === '--api') chosen.api = read.value
      if (arg === '--workspace') chosen.workspace = read.value
      i += 1
    } else {
      return {
        bad:
          `I do not know the argument "${arg}". This tool takes --check, --document <path>, --pipeline <id>, ` +
          '--api <url>, --workspace <id> and --help. Nothing was read and nothing was written.',
      }
    }
  }
  return chosen
}

const args = readArguments(process.argv.slice(2))
if (args.bad !== undefined) {
  console.error(args.bad)
  console.error('')
  console.error(usage())
  process.exit(1)
}
if (args.help) {
  console.log(usage())
  process.exit(0)
}

const API = whereIsTheApi(args.api ?? undefined)
const WORKSPACE = args.workspace ?? whichWorkspace()
const headers = { ...HEADERS, 'x-mole-office-workspace': WORKSPACE }
const document = resolve(args.document)
const shortName = document.startsWith(REPO + '/') ? document.replace(REPO + '/', '') : document

/** One GET through the server's own door, with the workspace named. A failure says what it asked. */
async function getJson(path) {
  let answer
  try {
    answer = await fetch(`${API}${path}`, { headers })
  } catch (err) {
    throw new Error(
      `GET ${API}${path} could not be reached (${err instanceof Error ? err.message : String(err)}). The records ` +
        'could not be read, so nothing was written. Start the API or say where it is with --api.',
    )
  }
  if (!answer.ok) {
    const said = await answer.text()
    throw new Error(`GET ${API}${path} answered ${String(answer.status)}: ${said.slice(0, 300)}`)
  }
  return answer.json()
}

/** The words of one cell, refused rather than mangled when a table cannot carry them. */
function cell(what, where) {
  if (/[|\r\n]/.test(what)) {
    throw new Error(
      `${where} holds a pipe or a newline, which a markdown table cell cannot carry without shifting every ` +
        'column after it. Nothing was written.',
    )
  }
  return what
}

/**
 * THE CLUSTERS, IN THE PIPELINE'S OWN ORDER, with everything the register needs.
 *
 * A cluster is a block that carries a module record — the pipeline's own reading of "each cluster is
 * also a module record" (design/CURRENT-CAMPAIGN.md). A block that carries no module is not a
 * cluster and is not written; a block whose title begins "Cluster " but carries none is refused,
 * because that is a cluster the register would otherwise drop without saying so.
 */
async function readTheClusters() {
  const pipelineAnswer = await getJson(`/api/records/${encodeURIComponent(args.pipeline)}`)
  const pipeline = pipelineAnswer.record
  if (pipeline === undefined || pipeline.kind !== 'pipeline') {
    throw new Error(`${args.pipeline} is not a pipeline record, so its blocks cannot be the register. Nothing was written.`)
  }
  const blockEntries = pipelineAnswer.blocks?.blocks ?? []
  const byId = new Map(blockEntries.map((block) => [block.id, block]))
  const order = Array.isArray(pipeline.data?.blockIds) ? pipeline.data.blockIds : []
  if (order.length === 0) {
    throw new Error(`The pipeline ${args.pipeline} holds no blocks, so there is no register to write.`)
  }

  const linksAnswer = await getJson('/api/links')
  const links = linksAnswer.links ?? []
  const linksOf = (type, end, id) => links.filter((link) => link.type === type && link[end] === id)

  const clusters = []
  for (const blockId of order) {
    const block = byId.get(blockId)
    if (block === undefined) {
      throw new Error(
        `The pipeline ${args.pipeline} lists the block ${blockId} and no block record answers to it. Nothing was written.`,
      )
    }
    const name = block.title
    const moduleIds = Array.isArray(block.moduleIds) ? block.moduleIds : []
    const looksLikeACluster = moduleIds.length > 0 || String(name).startsWith('Cluster ')
    if (!looksLikeACluster) continue
    if (moduleIds.length === 0) {
      throw new Error(`The cluster "${name}" carries no module record, so no trajectory can plan for it. Nothing was written.`)
    }
    if (moduleIds.length > 1) {
      throw new Error(
        `The cluster "${name}" carries ${String(moduleIds.length)} module records (${moduleIds.join(', ')}), and the ` +
          'register does not know which one it is. Nothing was written.',
      )
    }
    const moduleId = moduleIds[0]

    const planning = linksOf('plans_for', 'toId', moduleId)
    if (planning.length === 0) {
      throw new Error(
        `The cluster "${name}" has no trajectory that plans for its module ${moduleId}, so its criteria are not ` +
          'records. File the trajectory first. Nothing was written.',
      )
    }
    if (planning.length > 1) {
      throw new Error(
        `The cluster "${name}" has ${String(planning.length)} trajectories planning for its module ${moduleId}. A ` +
          'planned future plans for exactly one subject and one subject has one future here. Nothing was written.',
      )
    }
    const trajectoryId = planning[0].fromId
    const trajectoryAnswer = await getJson(`/api/records/${encodeURIComponent(trajectoryId)}`)
    const trajectory = trajectoryAnswer.record
    if (trajectory === undefined || trajectory.kind !== 'trajectory') {
      throw new Error(`${trajectoryId} is not a trajectory record, so it cannot be the cluster's plan. Nothing was written.`)
    }
    const stateIds = Array.isArray(trajectory.data?.plannedStateIds) ? trajectory.data.plannedStateIds : []
    const states = []
    for (const stateId of stateIds) {
      const stateAnswer = await getJson(`/api/records/${encodeURIComponent(stateId)}`)
      const state = stateAnswer.record
      if (state === undefined || state.kind !== 'planned_state') {
        throw new Error(`${stateId} is not a planned_state record. Nothing was written.`)
      }
      states.push({ id: stateId, what: cell(state.data?.what ?? state.title, `The planned state ${stateId}`) })
    }

    const serving = linksOf('serves', 'fromId', trajectoryId)
    if (serving.length === 0) {
      throw new Error(
        `The cluster "${name}" serves no goal: its trajectory ${trajectoryId} has no serving link. Nothing was written.`,
      )
    }
    if (serving.length > 1) {
      throw new Error(
        `The cluster "${name}" serves ${String(serving.length)} goals, and a trajectory serves one. Nothing was written.`,
      )
    }
    const goalId = serving[0].toId
    const goalAnswer = await getJson(`/api/records/${encodeURIComponent(goalId)}`)
    const goal = goalAnswer.record
    if (goal === undefined || goal.kind !== 'goal') {
      throw new Error(`${goalId} is not a goal record, so the cluster's serving link points at nothing. Nothing was written.`)
    }

    clusters.push({
      order: clusters.length + 1,
      title: cell(name, `The cluster "${name}" title`),
      state: String(block.state ?? ''),
      trajectoryId,
      goal: {
        id: goalId,
        title: cell(goal.title, `The goal ${goalId}`),
        horizon: String(goal.data?.horizon ?? ''),
        what: cell(goal.data?.what ?? goal.title, `The goal ${goalId}`),
      },
      states,
    })
  }

  if (clusters.length === 0) {
    throw new Error(
      `The pipeline ${args.pipeline} holds no block that carries a module, so there is no register to write.`,
    )
  }
  return clusters
}

/** The table: one row per cluster, its criteria as an ordered list inside the last cell. */
function registerTable(clusters) {
  const lines = [
    '| # | Cluster | State | Serves the goal | The criteria it must meet |',
    '|---:|---|---|---|---|',
  ]
  for (const cluster of clusters) {
    const criteria = cluster.states.map((state, i) => `${String(i + 1)}. ${state.what}`).join('<br>')
    lines.push(
      `| ${String(cluster.order)} | **${cluster.title}** | ${cluster.state} | ${cluster.goal.title} | ` +
        `${criteria === '' ? '—' : criteria} |`,
    )
  }
  return lines.join('\n')
}

/** The goals the register works toward, one row each, with the clusters that serve them. */
function goalTable(clusters) {
  const goals = new Map()
  for (const cluster of clusters) {
    const held = goals.get(cluster.goal.id) ?? { ...cluster.goal, clusters: [] }
    held.clusters.push(cluster.order)
    goals.set(cluster.goal.id, held)
  }
  const lines = ['| Horizon | The goal | Served by |', '|---|---|---|']
  for (const goal of goals.values()) {
    const count = goal.clusters.length
    const servedBy = count === clusters.length ? `all ${String(count)} clusters` : `clusters ${goal.clusters.join(', ')}`
    lines.push(`| ${goal.horizon} | **${goal.title}** — ${goal.what} | ${servedBy} |`)
  }
  return lines.join('\n')
}

function region(clusters, key) {
  switch (key) {
    case 'cluster-register':
      return registerTable(clusters)
    case 'cluster-goals':
      return goalTable(clusters)
    default:
      throw new Error(`No region is written for the marker "${key}"`)
  }
}

/** Replaces every marked region, and refuses if the document has a marker this script cannot fill. */
function fill(text, clusters) {
  const marker = /<!-- table:([a-z0-9:-]+) -->[\s\S]*?<!-- end table:\1 -->/g
  const filled = new Set()
  const out = text.replace(marker, (_whole, key) => {
    filled.add(key)
    return `<!-- table:${key} -->\n${region(clusters, key)}\n<!-- end table:${key} -->`
  })
  if (filled.size === 0) {
    throw new Error('the document has no <!-- table:… --> markers; nothing would be written')
  }
  return { out, filled }
}

/**
 * What is wrong with the document's markers, in plain sentences. An empty list means nothing is.
 *
 * A missing region has nothing to compare, which is exactly how a whole table can be deleted and a
 * check stay green. This runs on both paths: writing a document with a region missing would be the
 * same silence with a success message on it.
 */
function whatIsWrongWithTheRegions(text, filled) {
  const problems = []
  const starts = [...text.matchAll(/<!-- table:([a-z0-9:-]+) -->/g)].map((m) => m[1])
  const ends = [...text.matchAll(/<!-- end table:([a-z0-9:-]+) -->/g)].map((m) => m[1])
  const howMany = (list, key) => list.filter((one) => one === key).length
  for (const key of REGIONS) {
    const opens = howMany(starts, key)
    if (opens === 0) {
      problems.push(`<!-- table:${key} --> is not in the document at all, so the table it holds is missing.`)
      continue
    }
    if (opens > 1) {
      problems.push(`<!-- table:${key} --> appears ${String(opens)} times. Each region is written once.`)
      continue
    }
    if (howMany(ends, key) !== 1) {
      problems.push(`<!-- table:${key} --> has no matching <!-- end table:${key} -->, so nothing knows where that table ends.`)
      continue
    }
    if (!filled.has(key)) {
      problems.push(`<!-- table:${key} --> could not be filled; its end marker is before its start marker.`)
    }
  }
  for (const key of new Set(starts)) {
    if (!REGIONS.includes(key)) {
      problems.push(`<!-- table:${key} --> is not a region this generator writes, so nothing fills it.`)
    }
  }
  return problems
}

/**
 * The whole run, wrapped so a refusal this generator makes on purpose is one plain sentence and
 * exit 1 rather than a stack trace. Anything else is re-thrown, because a fault this script did not
 * plan for must not read like a refusal.
 */
async function main() {
  const clusters = await readTheClusters()
  const before = readFileSync(document, 'utf8')
  const { out, filled } = fill(before, clusters)

  const missing = whatIsWrongWithTheRegions(before, filled)
  if (missing.length > 0) {
    console.error(`${shortName} does not hold every table this generator writes.`)
    for (const problem of missing) console.error(`  ${problem}`)
    console.error(
      `${String(REGIONS.length)} regions are expected and ${String(filled.size)} were filled. Put the marker pair back ` +
        'where the table belongs and run this again; the text between a pair is written by this script, so an empty ' +
        'pair is enough.',
    )
    process.exit(1)
  }

  if (args.check) {
    if (out === before) {
      console.log(
        `The register matches its records: ${String(clusters.length)} clusters from pipeline ${args.pipeline}, ` +
          `all ${String(REGIONS.length)} regions present once and equal.`,
      )
      process.exit(0)
    }
    const beforeLines = before.split('\n')
    const afterLines = out.split('\n')
    let first = 0
    while (first < beforeLines.length && beforeLines[first] === afterLines[first]) first += 1
    console.error('The document does not match the clusters in the records.')
    console.error(`First difference at line ${String(first + 1)} of ${shortName}:`)
    console.error(`  document: ${(beforeLines[first] ?? '(end of file)').slice(0, 200)}`)
    console.error(`  should be: ${(afterLines[first] ?? '(end of file)').slice(0, 200)}`)
    console.error('Run `node tools/cluster-register.mjs` to regenerate and commit the register again.')
    process.exit(1)
  }

  writeFileSync(document, out)
  console.log(`Wrote ${String(filled.size)} regions of ${shortName} from ${String(clusters.length)} clusters.`)
}

await main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
