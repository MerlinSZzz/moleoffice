// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/**
 * FILE AN AGENT'S RUN IN A SANDBOX, AND TAKE THE RUN'S OWN KEY WHEN THE OFFICE ANSWERS ONE.
 *
 * THE ONE FILING FUNCTION OF THE LAUNCHER (an ask, message qovE3Wa6z6V7). tools/sandbox.mjs calls it on the host
 * for `exec --agent`, `worker` and `round`, and tools/sandbox-start.mjs calls it inside a sandbox when an agent there
 * starts a run of its own, as a supervisor starts its workers. Both reach tools/register-a-run.mjs only through it.
 * `parent` passes --parent <run id>: the supervisor's run apart from the filer's `session`, which still attributes
 * the request (c3p75p8aALd2; LuJPs2otqWJN and Rp9Zn_WIAHPA). The office checks both the parent (problem
 * NlOyicZP_Jjt) and that the filer may file a run for the agent, as tools/register-a-run.mjs says. This file checks
 * neither; the office's refusal comes back in `says`.
 *
 * WHOEVER RUNS THIS FILES THE RUN, WITH ITS OWN KEY. tools/register-a-run.mjs sends MOLE_AGENT_KEY from this process's
 * environment, under the starter's name. On the host that is the starter's own key. In a sandbox it is the key of the
 * run the starter is in, which is a key of the starter too. When the key proves the served agent's registered starter,
 * the office answers a key of that agent for the new run; a worker with no key of its own also needs askedBy naming
 * a live run of that starter and brief naming its brief (P83 point 5; the starter's half built in wave 13m, message
 * jKNPTdCvc5zy), and it revokes that key in the same write that ends the run.
 *
 * THE RUN'S KEY PASSES THROUGH ONE FILE, AND NOTHING ELSE. register-a-run.mjs makes the file new, with mode 0600, in a
 * folder of mode 0700 made for this one filing. This reads it, deletes the folder with it at once, and answers the key
 * to the caller in memory. It is never on a command line, the standard output, the error output or a log (the launcher
 * side of P83 point 5 in the keys-wave brief, message wQauRuWT8HCn, step 2).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { THE_STARTING_WORDS, THE_STARTING_WORDS_WITHOUT_THE_SWITCH } from './harness-features-off.mjs'
import { askTheOffice, theOfficeSaid } from './sandbox-common.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** A run's key is 64 hexadecimal characters; anything else in the file is not a key and is not answered. */
const A_KEY = /^[0-9a-f]{64}$/

/** The most characters a doing line may hold: a longer one is cut and ends with an ellipsis inside this count. */
export const THE_DOING_LINES_MOST_CHARACTERS = 200

/** The first markdown heading: one to six `#`, a space, and the heading's own words. */
const A_MARKDOWN_HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*$/m

/**
 * One line of single spaces, with no whitespace at either end.
 * @param {unknown} text
 * @returns {string}
 */
function singleSpaced(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * THE LINE THAT SAYS WHAT A RUN IS DOING, from the agent's handle, the run's title, and the brief's own first heading
 * when a brief is there. The launchers put the starting words, a `---` line and then the real brief in the file, so the
 * starting words' own heading is taken off first and only the brief's heading is used. A brief that cannot be read is
 * no heading and no error: the line still names the run.
 *
 * The handle comes first, then a colon and the title, then an em dash and the heading when there is one that adds to
 * the title. Every run of whitespace is one space, and a line past THE_DOING_LINES_MOST_CHARACTERS is cut and ends
 * with an ellipsis. The run id is never here: the line is made before the record exists.
 *
 * @param {string} handle the agent the run serves
 * @param {string} title what a reader sees for the run
 * @param {string} [brief] the brief file's path, when one was given
 * @returns {string}
 */
export function theDoingLineOfARun(handle, title, brief) {
  let text = ''
  if (typeof brief === 'string' && brief !== '') {
    try {
      text = readFileSync(brief, 'utf8')
    } catch {
      text = ''
    }
  }
  for (const startingWords of [THE_STARTING_WORDS, THE_STARTING_WORDS_WITHOUT_THE_SWITCH]) {
    if (text.startsWith(startingWords)) {
      text = text.slice(startingWords.length)
      break
    }
  }
  const found = A_MARKDOWN_HEADING.exec(text)
  const heading = found === null ? '' : singleSpaced(found[2])
  const theTitle = singleSpaced(title)
  const line = singleSpaced(
    `${singleSpaced(handle)}: ${theTitle}${heading === '' || heading === theTitle ? '' : ` — ${heading}`}`,
  )
  return line.length <= THE_DOING_LINES_MOST_CHARACTERS
    ? line
    : `${line.slice(0, THE_DOING_LINES_MOST_CHARACTERS - 1).trimEnd()}…`
}

/**
 * WRITE THE DOING LINE OF A RUN THAT WAS FILED BEFORE ITS HELPER SAW IT, and only when the record holds none. A line
 * the record already holds is kept as it is, so a caller can hand every run to this without asking first. A refused
 * write answers the office's own sentence and changes nothing; the caller says so and goes on, because the run still
 * starts.
 *
 * @param {string} api the office's address
 * @param {string} workspace the project the run is in
 * @param {Record<string, string>} headers the caller's identity headers
 * @param {string} runId
 * @param {Record<string, unknown>} data the run's data as it was just read
 * @param {string} line the doing line to write
 * @returns {Promise<{ written: boolean, kept: boolean, says: string }>}
 */
export async function writeTheDoingLineIfTheRunHasNone(api, workspace, headers, runId, data, line) {
  const doing = data?.doing
  if (typeof doing === 'string' && doing.trim() !== '') {
    return { written: false, kept: true, says: `the run ${runId} already has a doing line, so it was kept.` }
  }
  const answered = await askTheOffice(api, `/api/records/${encodeURIComponent(runId)}`, {
    method: 'PATCH',
    workspace,
    headers,
    body: { dataPatch: { doing: line } },
  })
  if (answered.status !== 200) {
    return { written: false, kept: false, says: `the doing line of run ${runId} was not written: ${theOfficeSaid(answered)}.` }
  }
  return { written: true, kept: false, says: `the doing line of run ${runId} was written.` }
}

/**
 * THE RUN TO FILE. `brief` is the brief file's path: the doing line reads it for the brief's own heading, and it is
 * sent to the office as `brief` only when `askedBy` is given, because that is the only hand start the office asks it of.
 *
 * @typedef {{ template: string, container: string, folder: string }} SandboxField
 * @typedef {{
 *   api: string, workspace: string, as: string, session: string, parent?: string | null, askedBy?: string, brief?: string,
 *   handle: string, worktree: string, cutFrom: string, cutFromCommit?: { named: string, commit: string }, runtime: string, model: string, title: string,
 *   sandbox: SandboxField, continues?: string | null, flow?: string | null, keyFolder?: string,
 * }} TheRunToFile
 * @typedef {{ ok: true, id: string, key: string | null, says: string } | { ok: false, exited: string, says: string }} WhatFilingAnswered
 */

/**
 * File the run and answer its id, and its key when the office answered one. `says` is what register-a-run.mjs wrote
 * on its error output: the office's refusal when it refused (with `exited`, its exit code or signal), and otherwise
 * the lines about the key, which name the file and never the key. `keyFolder` is where the one-filing folder is
 * made; the host gives a folder the sandbox cannot see, and the default is this machine's temporary folder.
 *
 * @param {TheRunToFile} run
 * @returns {WhatFilingAnswered}
 */
export function fileARun(run) {
  const folder = mkdtempSync(join(run.keyFolder ?? tmpdir(), 'run-key-'))
  const keyFile = join(folder, 'key')
  try {
    const filed = spawnSync(
      process.execPath,
      [
        join(HERE, 'register-a-run.mjs'),
        '--handle', run.handle,
        '--worktree', run.worktree,
        '--cut-from', run.cutFrom,
        ...(run.cutFromCommit === undefined ? [] : ['--cut-from-commit', JSON.stringify(run.cutFromCommit)]),
        '--runtime', run.runtime,
        '--model', run.model,
        '--as', run.as,
        '--session', run.session,
        ...(run.parent === undefined || run.parent === null ? [] : ['--parent', run.parent]),
        ...(run.askedBy === undefined ? [] : ['--asked-by', run.askedBy]),
        ...(run.askedBy === undefined || run.brief === undefined ? [] : ['--brief', run.brief]),
        '--doing', theDoingLineOfARun(run.handle, run.title, run.brief),
        '--workspace', run.workspace,
        '--api', run.api,
        '--title', run.title,
        '--sandbox-template', run.sandbox.template,
        '--sandbox-container', run.sandbox.container,
        '--sandbox-folder', run.sandbox.folder,
        ...(run.continues === undefined || run.continues === null ? [] : ['--continues', run.continues]),
        ...(run.flow === undefined || run.flow === null ? [] : ['--flow', run.flow]),
        '--run-key-file', keyFile,
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    )
    const says = String(filed.stderr ?? '').trim()
    const id = filed.status === 0 ? String(filed.stdout).split('\n')[0]?.trim() ?? '' : ''
    if (id === '') {
      return { ok: false, exited: String(filed.status ?? filed.signal), says }
    }
    let key = null
    try {
      const read = readFileSync(keyFile, 'utf8').trim()
      key = A_KEY.test(read) ? read : null
    } catch {
      key = null
    }
    return { ok: true, id, key, says }
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}
