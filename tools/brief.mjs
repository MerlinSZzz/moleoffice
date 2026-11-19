#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE BRIEF, FROM A SHELL. One command, one reply, everything an arriving agent has to be told.
 *
 * `node tools/brief.mjs` prints `GET /api/brief` as sentences a person or an agent can read
 * straight out of a terminal. `--json` prints the reply itself, unchanged, for anything that
 * wants to parse it. `--head` prints only the opening — what the project is, the work at the top
 * of the attention rule's order, and the size — which is what a session-start hook has room for.
 *
 * IT PRINTS WHAT THE SERVER SAID AND NOTHING ELSE. There is no local reconstruction of the brief
 * here, no cached copy and no default when the server does not answer. A server that cannot be
 * reached prints one sentence saying so, and exits non-zero, because an agent that reads a brief
 * assembled by a script rather than by the product has read something nobody can point at.
 *
 * Usage:
 *   node tools/brief.mjs [--json] [--head] [--workspace <id>] [--api <url>]
 */
import { settings } from '../src/config/settings.mjs'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/brief.mjs [--json] [--head] [--workspace <id>] [--api <url>]',
      '',
      '  --json       print the reply as it arrived, unchanged',
      '  --head       print only the opening: the project, the top of the order, and the size',
      '  --workspace  which project to be briefed on. Default: the one this checkout is set to',
      '  --api        which server to ask. Default: the one this checkout is set to',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function readArguments(argv) {
  const chosen = { json: false, head: false, workspace: null, api: null }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--json') chosen.json = true
    else if (word === '--head') chosen.head = true
    else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
    else if (word === '--api') chosen.api = argv[(i += 1)]
    else usage(`I do not know the option ${word}.`)
  }
  return chosen
}

/**
 * THE WHOLE BRIEF AS SENTENCES: every module, every decision, every open loop.
 *
 * This is the long form, for a person reading the whole thing in a terminal. The SHORT form is not
 * built here — `--head` prints the `head` the server wrote, which is the same opening the
 * session-start hook prints and the same one written into a run's rules file.
 */
function asSentences(brief) {
  const lines = []
  const project = brief.project
  lines.push(
    project === null
      ? 'Mole Office holds no project by that name, and this brief is about nothing.'
      : `${project.title} — ${String(project.modules)} modules, briefed at the size below.`,
  )
  lines.push('')

  const loops = brief.openWork.loops
  const showLoops = loops
  lines.push(`OPEN WORK — ${String(loops.length)} carried, in the order the attention rule puts them.`)
  for (const loop of showLoops) {
    const place = loop.rank === null ? 'not ranked' : `#${String(loop.rank)}`
    lines.push(`  ${place}  ${loop.kind}  ${loop.id}  ${loop.says}`)
    if (loop.whoseMove !== null && loop.whoseMove !== undefined) lines.push(`         whose move: ${String(loop.whoseMove)}`)
  }
  if (showLoops.length < loops.length) lines.push(`  … and ${String(loops.length - showLoops.length)} more.`)
  lines.push('')

  {
    lines.push(`MODULES — ${String(brief.modules.length)}, each with its first curated sentence. ${brief.modulesSecondLevel.ask.oneModule} reads the whole of one.`)
    for (const module of brief.modules) {
      lines.push(`  ${module.id}  ${module.title}`)
      lines.push(
        module.line === null
          ? '         This module has no summary and no written block in its long form.'
          : `         ${module.line}`,
      )
    }
    lines.push('')

    lines.push(`DECISIONS — the last ${String(brief.decisions.length)}, newest first.`)
    for (const decision of brief.decisions) {
      lines.push(`  ${decision.id}  ${decision.title}`)
      if (decision.onThePersonsWords !== null) {
        lines.push(`         on the person's words: "${decision.onThePersonsWords.warrant.words.replace(/\s+/g, ' ').slice(0, 200)}"`)
      }
    }
    lines.push('')
  }

  const words = brief.hisWords.words
  const showWords = words
  lines.push(`WHAT THE PERSON HAS SAID THAT STILL GOVERNS — ${String(words.length)}.`)
  for (const one of showWords) {
    lines.push(`  ${one.at}  (${one.where})`)
    lines.push(`         ${one.words.replace(/\s+/g, ' ').slice(0, 300)}`)
  }
  if (showWords.length < words.length) lines.push(`  … and ${String(words.length - showWords.length)} more.`)
  lines.push('')

  {
    lines.push('HOW TO WRITE HERE.')
    lines.push(`  Say which project: ${brief.writing.headers.whichProject}`)
    lines.push(
      `  Say who you are: ${brief.writing.headers.whoIsWriting.type}, ${brief.writing.headers.whoIsWriting.id}, ${brief.writing.headers.whoIsWriting.session}`,
    )
    lines.push(`  Only a person may write: ${brief.writing.kindsOnlyAPersonMayWrite.join(', ')}`)
    lines.push(`  ${brief.writing.readTheShapesFrom}`)
    lines.push('')
  }

  if (brief.leftOut.length > 0) {
    lines.push('WHAT THIS BRIEF LEFT OUT, AND WHERE TO GET IT.')
    for (const gone of brief.leftOut) lines.push(`  ${gone.what} (${String(gone.howMany)}) — ${gone.ask}`)
    lines.push('')
  } else {
    lines.push('Nothing was left out of this brief to make it fit.')
  }

  const size = brief.size
  lines.push(
    `SIZE — ${String(size.characters)} characters, about ${String(size.tokensEstimated)} tokens against a budget of ` +
      `${String(size.budgetTokensEstimated)}. ${size.fits ? 'It fits.' : 'It does not fit, and everything above that could be dropped has been.'}`,
  )
  lines.push(size.tokensAreAnEstimate)
  return lines.join('\n')
}

const chosen = readArguments(process.argv.slice(2))
const config = settings()
// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address (problem JQ3yaANBi1JC); --api always wins.
const api = whereIsTheApiForACommand(chosen.api)
const workspace = chosen.workspace ?? config.workspace
let reply
try {
  reply = await fetch(`${api}/api/brief`, {
    headers: {
      'x-mole-office-workspace': workspace,
      // The caller's own key and name when it holds a key; 'mole-office/brief.mjs' when it holds none.
      ...anAgentsToolHeaders({ withoutAKey: 'mole-office/brief.mjs' }),
    },
  })
} catch (problem) {
  process.stderr.write(
    `Mole Office at ${api} did not answer, so there is no brief to print: ${String(problem)}\n` +
      'Nothing was printed. This command has no copy of the brief of its own.\n',
  )
  process.exit(1)
}
const text = await reply.text()
if (!reply.ok) {
  process.stderr.write(`Mole Office at ${api} answered ${String(reply.status)} and there is no brief to print:\n${text}\n`)
  process.exit(1)
}
if (chosen.json) {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
} else if (chosen.head) {
  // THE SERVER'S OWN OPENING, printed unchanged. It is the same paragraphs the session-start hook
  // prints and the same ones written into a run's rules file, and it is built once, in the route.
  const reply = JSON.parse(text)
  process.stdout.write(`${String(reply.head)}\n`)
} else {
  process.stdout.write(`${asSentences(JSON.parse(text))}\n`)
}
