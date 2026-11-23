#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * FILE THE SESSION RECORD FOR A RUN YOU ARE ABOUT TO START, so the office's check can run on it.
 *
 * Problem `LSsiTg0XZfKq` is on a decision. The step that starts a worker writes servingAgent,
 * the workspace and the worktree's HEAD into the session record, so the check can run.
 * A worker registered with node tools/register-a-started-agent.mjs but whose run is filed by hand,
 * or not filed with the keys the check needs, reads at finish as a check nobody can ask: GET
 * /api/checks/<run> answers "No check was asked for" for good, and the work ends unchecked. Measured
 * on 11 September 2026: 1,386 of 1,475 runs that said finished were never released, because the
 * check could not be asked (the steward's report jDwkhne4tDWR, finding 2).
 *
 * RUN IT ONCE per run you are about to start, after registering the agent and before starting the
 * process, and the run arrives with everything the check reads. The tool reads the worktree's HEAD
 * itself and writes only what the check needs; it invents nothing.
 *
 * IT PRINTS THE RECORD ID ON ITS OWN LINE, which is what you hand the started agent and its
 * finisher as its run id.
 *
 * IT SENDS THE STARTER'S OWN KEY, AND A RUN'S KEY GOES ONLY TO A FILE. Filing a run is the starter's
 * own write, so it carries the starter's name and, when the starter holds one, the starter's own key:
 * MOLE_AGENT_KEY, through anAgentsToolHeaders in tools/sandbox-common.mjs, the one place an agent's
 * tool builds them, since a decision says that every agent's tool sends its own key. A
 * create proved by the key of the served agent's registered starter is answered a key of that agent
 * for this run; a worker with no key of its own also needs --asked-by naming a live run of that starter and --brief
 * naming its brief (P83 point 5, the starter's half built in wave 13m, message jKNPTdCvc5zy). That key is
 * written only to the file --run-key-file names, made new with mode 0600, and never to the standard
 * output, the error output or a log (the launcher side of P83 point 5 in the keys-wave brief,
 * message wQauRuWT8HCn). With no --run-key-file it is not kept, and it dies with the run.
 *
 * WITH NO --model, THE MODEL COMES FROM THE CASTING TABLE (选角表), under two
 * decisions. A role may have several castings, and in each group one carries
 * the mark "The tools take this one". The tool asks GET /api/casting/for/<the agent's role card>?project=<workspace>,
 * which answers that marked casting: the project's own if the project has castings of the role, else the every-project
 * one. The tool files that casting's model when its program is the --runtime given, and prints one line naming the
 * casting and the decision behind the model. When the table marks no casting, or the marked one names no model or names
 * it for another program, nothing is written and the refusal says so: the tool never invents a model. A --model given
 * always wins, and the table is then not asked. The casting's effort is not recorded on the run, because this tool
 * starts no program and cannot pass an effort to one; it prints one line saying so.
 *
 * --parent names the supervisor's run apart from the filer's own --session (problem c3p75p8aALd2;
 * LuJPs2otqWJN and Rp9Zn_WIAHPA). Only parentAttachment changes; attribution stays with
 * the filer. The office decides which parent a caller may name (problem NlOyicZP_Jjt): a session the caller has a
 * part in. It also files the run only for an agent the caller may file for: the agent itself, an agent above it in
 * its chain of starters, its recorded leader, the person with their key, or the office; a run for the inspector
 * may also be filed by a secretary or by the submitter of the merge entry it checks. A refusal comes back as the
 * office's own sentence.
 *
 * A RUN ON ANOTHER COMPUTER IS FILED WITH --machine <name> INSTEAD OF --worktree (wave 13t round 22, agreed in
 * message Mtt-iDulvWDc). Its checkout is on that computer, so no git is run here and the run claims no worktree and no
 * tip: it is filed with `machine` and nothing else about a folder. The name is checked by the rule the owner's machine
 * table stores names by (src/shared/machine-name.ts), and the office takes only this computer's own name or a name the
 * owner gave in that table. Such a run is read as elsewhere: the sweeps leave it alone, and the office refuses to seal or
 * check its code here (a records submission is still sealed). Its code comes in as a branch a run on this computer takes
 * in. --run-key-file is refused with it: a key in a file on this computer is no use to an agent on another one, which acts
 * with its own key.
 *
 * WITH --asked-by, --cut-from still records the run's fork point and does not choose a second ask cut. A preflight's
 * stored cut is reused; with none, filing records the asking run's HEAD and the actual worktree as it stands.
 *
 * Usage:
 *   node tools/register-a-run.mjs --handle <agent handle> (--worktree <absolute directory> | --machine <name>)
 *       --cut-from <branch> --runtime <word> [--model <provider/model>] --as <your handle>
 *       --session <your session record id> [--parent <run id> | --asked-by <run id> --brief <path>] --workspace <project> [--title "..."]
 *       [--doing <line>] [--sandbox-template <name> --sandbox-container <ledger row id> [--sandbox-folder <instance folder>]]
 *       [--continues <run id>] [--flow <flow record id>]
 */
import { settings, settingValue } from '../src/config/settings.mjs'
import { whereIsTheApiForACommand } from './where-is-the-api.mjs'
import { labelOneRecord } from './label-a-record.mjs'
import { A_RUN_GIVEN_NO_TITLE, anAgentsToolHeaders } from './sandbox-common.mjs'
import { guardedGitRun } from './sandbox-git.mjs'
import { AGENT_RUNTIMES } from '../src/shared/participants.ts'
import { theNameAsStored } from '../src/shared/machine-name.ts'
import { clockStamp } from '../src/shared/time.ts'
import { checkpointRunFields } from '../src/shared/worker-delivery/contract.mjs'
import { aCutFromCommitHasItsShape, A_CUT_FROM_COMMIT_IS } from '../src/shared/kind-fields/session-wave-13n.ts'
import { closeSync, existsSync, openSync, writeSync } from 'node:fs'
import { dirname, isAbsolute } from 'node:path'

/**
 * THE RUNTIME WORDS THE OFFICE KNOWS are AGENT_RUNTIMES in src/shared/participants.ts, imported here
 * rather than copied, so a word added there is a word this tool takes. Node 22 reads the TypeScript
 * file itself. The word is written twice on the run: as `runtime`, the free word, and as
 * `adaptedTool`, the declared tool the usage page counts, when the office declares that field, as problem
 * uh6-H72Zik9H and a decision record. Both come from the one checked
 * word, so they
 * cannot disagree.
 */

// A timeout that could not be read stops this tool by the setting's name, before it waits at all.
const TIMEOUT_SECONDS = (() => {
  try { return Number(settingValue('MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS')) } catch (err) {
    refused(`${err instanceof Error ? err.message : String(err)} Nothing was filed.`)
  }
})()

function usage(problem) {
  process.stderr.write(
    [
      problem,
      '',
      'node tools/register-a-run.mjs --handle <agent handle> (--worktree <absolute directory> | --machine <name>) \\',
      '    --cut-from <branch> --runtime <word> [--model <provider/model>] --as <your handle> \\',
      '    --session <your session record id> [--parent <run id> | --asked-by <run id> --brief <path>] --workspace <project> [--run-key-file <path>]',
      '    [--doing <line>]',
      '',
      '  --handle     the handle of the agent this run serves, already registered with',
      '               node tools/register-a-started-agent.mjs. Required.',
      '  --worktree   the absolute directory the run will work in, a git checkout. Required, unless --machine.',
      '               Its current HEAD is recorded at filing. A git or mixed seal uses HEAD at',
      '               finish and stores it as the run\'s tip. If that finish sends a tip, the seal',
      '               refuses it when it differs from HEAD.',
      '  --machine <name>',
      '               the run works on another computer, named as the owner named it under Machine names on the',
      '               Settings page. Instead of --worktree, and never with it or with --run-key-file. No git is run',
      '               here; the run is filed with machine and no working directory and no tip, and the office will',
      '               not seal or check its code here: its code comes in as a branch a run on this computer takes in.',
      '  --cut-from   the branch it was cut from, which is what the check reads its fork point',
      '               against. Required.',
      '  --runtime    which runtime will serve the run. Required; a word the office does not know',
      '               is refused. It is written as the run\'s runtime, and as its declared adaptedTool',
      '               when the office declares that field; when it does not, one line says so.',
      '  --model      which model the run was given, in the word the tool was passed. Without it, the',
      '               model of the casting the tools take for the agent\'s role card on this --runtime, in this',
      '               --workspace, and one line says so; when the table names none, nothing is written.',
      '  --as         your own handle, which files the record and answers for the run. Required.',
      '  --session    your own session record id, sent on the request for attribution. Required.',
      '  --parent <run id>',
      '               the supervisor run this run belongs to, written as parentAttachment.',
      '               Without it, parentAttachment is --session. Attribution stays with --session.',
      '  --asked-by <run id> --brief <path>',
      '               a live asking run of the registered starter and its brief, required for a noKey hand start.',
      '               The office records the asking run as parent and keeps its full workerRuns entry.',
      '               A preflight cut is reused; without one the asking HEAD is recorded and the actual worktree',
      '               is used as it stands. --cut-from still records the fork point of the filed run.',
      '  --workspace  which project the run is filed in. Default: the one this checkout is set to.',
      `  --title      what a reader sees. Default: "${A_RUN_GIVEN_NO_TITLE}".`,
      '  --doing      what the run is doing, in one line. It is written into the create body\'s data when it is',
      '               given and is not empty after trimming; without it the run is filed as before.',
      '  --api        which server to ask. Default: the one this checkout is set to.',
      '  --sandbox-template <name> --sandbox-container <ledger row id> [--sandbox-folder <instance folder>]',
      '               the run happens in a sandbox: the template it was made from, and the id of the',
      '               container\'s row in the “Running on this machine” list. Both or neither. With them, and only',
      '               with them, the instance folder as an absolute path: a files seal reads it to say',
      '               where the run could not have written. They are written as the run\'s sandbox',
      '               field. tools/sandbox-start.mjs passes all three; leave them out for a run on the host.',
      '  --continues <run id>',
      '               this run is a second round of that run: the same agent, the same worktree, the same',
      '               conversation. The new run is filed with a derived_from link to it, in the same request,',
      '               so the office refuses both together when that run is not there.',
      '  --flow <flow record id>',
      '               the flow this run follows. It is written as the run\'s flow field, and the flow run the',
      '               office files beside the run then names that flow and the revision it was at. Without it the',
      '               run is filed as before, and its flow run says no flow was named; nothing refuses that.',
      '  --run-key-file <path>',
      '               where the run\'s own key goes when the office answers one: a file made new here with',
      '               mode 0600, never one that is already there, and nowhere else. The office answers one',
      '               when this create carries the registered starter\'s key; noKey also needs --asked-by and --brief.',
      '               Without this option a key the office answers is not kept.',
      '',
      'It refuses, with a plain sentence and nothing written, when the directory is not a git',
      'checkout, when the handle is not a registered agent, when the runtime word is not one the',
      'office knows, when a sandbox is named only in part, or when Mole Office refuses the record —',
      'then its sentence is printed as it came. It never prints a key: the starter\'s own key is read',
      'only from MOLE_AGENT_KEY and sent on its header, and a run\'s key goes only to --run-key-file.',
      '',
      `Waits ${String(TIMEOUT_SECONDS)} seconds for Mole Office to answer before giving up;`,
      'MOLE_OFFICE_REGISTER_TIMEOUT_SECONDS in .env sets it.',
    ].join('\n') + '\n',
  )
  process.exit(2)
}

function refused(problem) {
  process.stderr.write(`${problem}\n`)
  process.exit(2)
}

function readArguments(argv) {
  const chosen = {
    handle: null,
    worktree: null,
    cutFrom: null,
    cutFromCommit: null,
    runtime: null,
    model: null,
    as: null,
    session: null,
    parent: null,
    askedBy: null,
    brief: null,
    doing: null,
    workspace: null,
    api: null,
    title: null,
    sandboxTemplate: null,
    sandboxContainer: null,
    sandboxFolder: null,
    continues: null,
    flow: null,
    runKeyFile: null,
    machine: null,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const word = argv[i]
    if (word === '--help' || word === '-h') usage('')
    else if (word === '--handle') chosen.handle = argv[(i += 1)]
    else if (word === '--worktree') chosen.worktree = argv[(i += 1)]
    else if (word === '--cut-from') chosen.cutFrom = argv[(i += 1)]
    else if (word === '--cut-from-commit') chosen.cutFromCommit = argv[(i += 1)]
    else if (word === '--runtime') chosen.runtime = argv[(i += 1)]
    else if (word === '--model') chosen.model = argv[(i += 1)]
    else if (word === '--as') chosen.as = argv[(i += 1)]
    else if (word === '--session') chosen.session = argv[(i += 1)]
    else if (word === '--asked-by') chosen.askedBy = argv[(i += 1)]
    else if (word === '--brief') chosen.brief = argv[(i += 1)]
    else if (word === '--doing') chosen.doing = argv[(i += 1)] ?? null
    else if (word === '--parent') {
      chosen.parent = argv[(i += 1)]
      if (typeof chosen.parent !== 'string' || chosen.parent.trim() === '' || chosen.parent.startsWith('--')) usage('--parent needs a run id.')
    }
    else if (word === '--workspace') chosen.workspace = argv[(i += 1)]
    else if (word === '--api') chosen.api = argv[(i += 1)]
    else if (word === '--title') chosen.title = argv[(i += 1)]
    else if (word === '--sandbox-template') chosen.sandboxTemplate = argv[(i += 1)]
    else if (word === '--sandbox-container') chosen.sandboxContainer = argv[(i += 1)]
    else if (word === '--sandbox-folder') chosen.sandboxFolder = argv[(i += 1)]
    else if (word === '--continues') chosen.continues = argv[(i += 1)]
    else if (word === '--flow') chosen.flow = argv[(i += 1)]
    else if (word === '--run-key-file') chosen.runKeyFile = argv[(i += 1)]
    else if (word === '--machine') chosen.machine = argv[(i += 1)]
    else usage(`I do not know the option ${word}.`)
  }
  return chosen
}

function askedFor(values) {
  const missing = Object.entries(values).find(([, v]) => v === null || v === undefined || v === '')
  if (missing !== undefined) usage(`Say ${missing[0]}. Every one of ${Object.keys(values).join(' ')} is required.`)
}

const chosen = readArguments(process.argv.slice(2))
if (chosen.askedBy !== null && chosen.parent !== null) usage('--asked-by and --parent do not go together; --asked-by names the parent run.')
// A RUN ON ANOTHER COMPUTER NAMES THE COMPUTER INSTEAD OF A WORKTREE (see the header). Both, or --machine with a key
// file, is refused before anything else is read.
if (chosen.machine !== null) {
  if (chosen.worktree !== null) {
    refused('--machine and --worktree do not go together: a run on another computer has its worktree there, and nothing here can read it. Nothing was written.')
  }
  if (chosen.runKeyFile !== null) {
    refused(
      "--machine and --run-key-file do not go together: a run's key kept in a file on this computer is no use to an agent on " +
        'another one, which acts with its own key from its own key file. Nothing was written.',
    )
  }
  const named = typeof chosen.machine === 'string' ? theNameAsStored(chosen.machine) : { why: 'No name followed it.' }
  if (!('name' in named)) refused(`--machine takes the name of the computer the run works on. ${named.why} Nothing was written.`)
  chosen.machine = named.name
}
askedFor({
  '--handle': chosen.handle,
  ...(chosen.machine === null ? { '--worktree': chosen.worktree } : {}),
  '--cut-from': chosen.cutFrom,
  '--runtime': chosen.runtime,
  '--as': chosen.as,
  '--session': chosen.session,
})
let recordedCut = null
if (chosen.cutFromCommit !== null) {
  try { recordedCut = JSON.parse(chosen.cutFromCommit) } catch { refused(`${A_CUT_FROM_COMMIT_IS} Nothing was written.`) }
  if (!aCutFromCommitHasItsShape(recordedCut)) refused(`${A_CUT_FROM_COMMIT_IS} Nothing was written.`)
  if (recordedCut.named !== chosen.cutFrom) refused('The recorded cut name differs from --cut-from. Nothing was written.')
  if (recordedCut.named.startsWith('-')) refused('A recorded cut name may not start with -. Nothing was written.')
  if (chosen.machine !== null) refused('A recorded cut needs a local worktree. Nothing was written.')
}
const config = settings()
// THE OFFICE THIS COMMAND MEANS, through the one reader, which asks whether this copy may take the environment's
// address (problem JQ3yaANBi1JC); --api always wins.
const api = whereIsTheApiForACommand(chosen.api)
const workspace = chosen.workspace ?? config.workspace

// THE DIRECTORY THE RUN WILL WORK IN must be an absolute path to a git checkout. The tip is read
// once, here, and it is the same tip the office reads back from disk when the check is asked
// (recordedHead in src/server/lib/check-tip.ts). A directory behind no checkout has no tip, so a
// run filed about it could never be checked and is refused now rather than at finish.
if (chosen.machine === null && !isAbsolute(chosen.worktree)) {
  refused(`--worktree must be an absolute path; "${chosen.worktree}" is not.`)
}
if (chosen.cutFrom.trim() === '' || chosen.runtime.trim() === '' || (chosen.model !== null && (typeof chosen.model !== 'string' || chosen.model.trim() === ''))) {
  refused('--cut-from, --runtime and --model take a value, not an empty one.')
}
if (!AGENT_RUNTIMES.includes(chosen.runtime)) {
  refused(
    `The office does not know the runtime "${chosen.runtime}". The words it knows: ${AGENT_RUNTIMES.join(', ')}.` +
      ` The word goes on the run's record as the tool the run declares, and the usage page counts runs by it,` +
      ` so it must be a tool Mole Office adapts. Nothing was written.`,
  )
}
// NO GIT FOR A RUN ON ANOTHER COMPUTER: its checkout is there, and a tip read here would be this computer's.
// The checkout may be one a sandbox writes, so git reads it with the guard (src/config/guarded-git.mjs).
let tip = null
let cutFromCommit = null
if (chosen.machine === null) {
  const head = guardedGitRun(chosen.worktree, ['rev-parse', 'HEAD'])
  if (head.status !== 0 || !/^[0-9a-f]{40}$/.test(head.stdout.trim())) {
    refused(
      `"${chosen.worktree}" is not a git checkout, or its tip could not be read: ${String(head.stderr).trim() || 'git said nothing'}.` +
        ` A run filed about a directory with no checkout has no submitted tip, so the office's check cannot be asked for it. Nothing was written.`,
    )
  }
  tip = head.stdout.trim()
  const base = guardedGitRun(chosen.worktree, ['rev-parse', '--verify', '--quiet', '--end-of-options', (recordedCut?.commit ?? chosen.cutFrom) + '^{commit}'])
  if (base.status === 0 && /^[0-9a-f]{40}$/.test(base.stdout.trim()) && (recordedCut === null || base.stdout.trim() === recordedCut.commit)) {
    cutFromCommit = recordedCut ?? { named: chosen.cutFrom, commit: base.stdout.trim() }
  } else if (recordedCut !== null) {
    refused('The recorded cut commit is not in the worktree repository. Nothing was written.')
  } else {
    process.stderr.write(`The base ${chosen.cutFrom} could not be resolved in ${chosen.worktree}; the run will be filed without its base commit.\n`)
  }
}

if (chosen.as.trim() === '' || chosen.session.trim() === '' || chosen.handle.trim() === '') {
  refused('--as, --session and --handle take a name, not an empty one.')
}

// THE SANDBOX THE RUN HAPPENS IN, when it does not happen on the host. Both halves or neither: a
// template with no ledger row, or a row with no template, is half a fact, and the field would then
// say something about the run that nobody could check. Absent means the run is on the host.
const sandboxHalves = [chosen.sandboxTemplate, chosen.sandboxContainer].filter((v) => typeof v === 'string' && v.trim() !== '')
if (sandboxHalves.length === 1 || [chosen.sandboxTemplate, chosen.sandboxContainer].some((v) => v !== null && (v === undefined || v.trim() === ''))) {
  refused(
    '--sandbox-template and --sandbox-container go together, each with a value: the template the sandbox was made ' +
      "from and the id of its container's row in the “Running on this machine” list. Nothing was written.",
  )
}
// THE INSTANCE FOLDER GOES WITH THEM when the launcher names it: a files seal reads it to say where the run
// could not have written, which is A2 of a decision. Written here, by the
// starter, before the run exists.
// Only with both halves, and only absolute: a folder with no sandbox would be dropped without a word, and a
// relative one would be written and then count as no folder at all when the seal reads it.
if (chosen.sandboxFolder !== null && (sandboxHalves.length !== 2 || typeof chosen.sandboxFolder !== 'string' || !isAbsolute(chosen.sandboxFolder.trim()))) {
  refused(
    '--sandbox-folder names the instance folder of the sandbox the run happens in, as an absolute path, and goes ' +
      'with --sandbox-template and --sandbox-container. Nothing was written.',
  )
}
const sandbox =
  sandboxHalves.length === 2
    ? {
        template: chosen.sandboxTemplate.trim(),
        container: chosen.sandboxContainer.trim(),
        ...(typeof chosen.sandboxFolder === 'string' && chosen.sandboxFolder.trim() !== '' ? { folder: chosen.sandboxFolder.trim() } : {}),
      }
    : null

// THE RUN THIS ONE CONTINUES, for a second round: a record id, or nothing. A value that is there but empty is refused
// rather than read as no round at all.
if (chosen.continues !== null && (typeof chosen.continues !== 'string' || chosen.continues.trim() === '')) {
  refused('--continues takes the record id of the run this one continues. Nothing was written.')
}

// THE FLOW THE RUN FOLLOWS: a flow record id, or nothing. A value that is there but empty is refused rather than read
// as no flow; a run without the option is filed as before.
if (chosen.flow !== null && (typeof chosen.flow !== 'string' || chosen.flow.trim() === '' || chosen.flow.startsWith('--'))) {
  refused('--flow takes the record id of the flow this run follows. Nothing was written.')
}

// WHERE THE RUN'S KEY GOES, checked before anything is written. The office answers a run's key once and keeps only its
// SHA-256, so a key answered for a run just filed must have a file to go into: one this tool makes new, in a folder
// that is there.
if (chosen.runKeyFile !== null) {
  if (typeof chosen.runKeyFile !== 'string' || !isAbsolute(chosen.runKeyFile)) {
    refused('--run-key-file takes an absolute path. Nothing was written.')
  }
  if (existsSync(chosen.runKeyFile)) {
    refused(`--run-key-file ${chosen.runKeyFile} is already there, and a run's key goes only into a file made new for it. Nothing was written.`)
  }
  if (!existsSync(dirname(chosen.runKeyFile))) {
    refused(`--run-key-file ${chosen.runKeyFile} is in a folder that is not there. Nothing was written.`)
  }
}

const headers = {
  'content-type': 'application/json',
  'x-mole-office-workspace': workspace,
  // THE STARTER'S NAME, AND ITS OWN KEY WHEN IT HOLDS ONE (see the header).
  ...anAgentsToolHeaders({ self: chosen.as, withoutAKey: chosen.as }),
  'x-mole-office-session': chosen.session,
  'x-mole-office-purpose': 'normal',
}

// THE HANDLE MUST BE SOMEBODY the registry holds, and this is read rather than assumed: the same
// read that answers "is it registered" is answered by the office itself, not by a tip off a page.
let roster
try {
  const participantPages = []
  const participantPaths = new Set()
  let participantNext = '/api/participants'
  while (participantNext !== null) {
    const n = participantPages.length + 1
    if (participantPaths.has(participantNext)) throw new Error(`The participant roster read stopped at page ${String(n)}: the office named a page that was already read. No rows were used.`)
    if (participantPages.length >= 200) throw new Error(`The participant roster read stopped at page ${String(n)}: it reads at most ${String(200)} pages. No rows were used.`)
    participantPaths.add(participantNext)
    const response = await fetch(`${api}${participantNext}`, { headers: { 'x-mole-office-workspace': workspace }, signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000) })
    const participantAnswer = { ok: response.ok, body: response.ok ? await response.json() : null }
    if (!participantAnswer.ok || participantAnswer.body === null) throw new Error(`The participant roster read stopped at page ${String(n)}: the office refused that page. No rows were used.`)
    participantPages.push(participantAnswer.body)
    participantNext = participantAnswer.body.next ?? null
  }
  roster = participantPages.flatMap(page => page.agents ?? [])
} catch (why) {
  const timedOut = why instanceof Error && why.name === 'TimeoutError'
  process.stderr.write(
    (timedOut
      ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
      : `Mole Office at ${api} did not answer.`) + ` Nothing was written: ${String(why)}\n`,
  )
  process.exit(1)
}
// WHICH AGENT THIS RUN SERVES, IN THE OFFICE'S OWN ORDER. This is a script and cannot call the
// server's resolver, so it applies the same order to the roster it has already fetched: an exact
// id wins, then the one LIVE agent bearing the handle, and a string that would name one agent by
// id and a different live agent by handle is refused rather than guessed at. A retired agent is
// never chosen, because no run may serve one.
const reference = chosen.handle.trim()
const byId = roster.find((one) => one.id === reference) ?? null
const liveByHandle = roster.find((one) => one.handle === reference && one.retired !== true) ?? null
if (byId !== null && liveByHandle !== null && byId.id !== liveByHandle.id) {
  refused(
    `"${reference}" names two agents, so nobody can tell which one this run serves. It is the id of ` +
      `${byId.name}. It is the handle of ${liveByHandle.name}. Send the id ${liveByHandle.id} to mean ` +
      `${liveByHandle.name}. Nothing was written.`,
  )
}
const served = byId ?? liveByHandle
if (served === null) {
  const retired = roster.find((one) => one.handle === reference && one.retired === true) ?? null
  refused(
    retired === null
      ? `No agent in the registry answers to the handle "${chosen.handle}", so nothing can say who this run serves.` +
          ` Register it first: node tools/register-a-started-agent.mjs --handle "${chosen.handle}" --name "<name>" --area <path> --key-file "$TMPDIR/${chosen.handle}.key".` +
          ` GET /api/participants is where every handle is listed. Nothing was written.`
      : `"${reference}" is the handle of ${retired.name}, which is retired, so no run may serve it.` +
          ` A retired agent is given no new work. Nothing was written.`,
  )
}
if (served.retired === true) {
  refused(
    `"${reference}" is the id of ${served.name}, which is retired, so no run may serve it.` +
      ` A retired agent is given no new work. Nothing was written.`,
  )
}
// THE BINDING NAMES THE AGENT RECORD, not the handle. `agentForRecord` in the office reads the id
// of the record of kind agent out of `ranAs.agentId`, and a handle there answers to no record —
// a run bound that way reads as a run whose identity nobody knows, and its check is held back for
// want of it. The office itself answers which record the row is, so it is read and never guessed.
const recordId = typeof served.record === 'string' ? served.record : null
if (recordId === null) {
  refused(
    `The registry row for "${chosen.handle}" names no agent record in ${workspace}, so the run cannot be bound to it:` +
      ` the binding the check reads (ranAs) has to carry that record's id. Once it was registered in this project` +
      ` the row answers with it on GET /api/participants; if the agent was registered elsewhere, register it in ${workspace} first.` +
      ` Nothing was written.`,
  )
}

// THE MODEL, WHEN NONE WAS NAMED, in the order every tool that starts or files a run follows (message
// MqebF8x7juih, 30 September 2026): the agent's own model on its profile (criterion U2), then the model of the
// casting the tools take for this agent's role card, then a refusal. The
// role is the card the office reads the agent's row as. A model named for another program than --runtime is not
// used, because a model name means something only to the program it was written for. Nothing is written when the
// office cannot say whether the agent has its own model, when the table cannot answer, marks no casting, or its
// marked casting names no model this run can use.
let model = chosen.model
if (model === null) {
  // THE AGENT'S OWN MODEL, as the office's run-models door answers it for --runtime: `from` is `the agent`. The door
  // is the one tools/sandbox-common.mjs asks for the launcher, so the tools read the profile the same way.
  let own
  const path = `/api/office/run-models/for/${encodeURIComponent(served.id)}?place=builder&runtime=${encodeURIComponent(chosen.runtime)}`
  try {
    const asked = await fetch(`${api}${path}`, { headers, signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000) })
    if (!asked.ok) {
      process.stderr.write(`No --model was given, and Mole Office at ${api} answered ${String(asked.status)} to GET ${path}, so nobody can say whether the agent has its own model: ${await asked.text()}\nNothing was written.\n`)
      process.exit(1)
    }
    own = await asked.json()
  } catch (why) {
    const timedOut = why instanceof Error && why.name === 'TimeoutError'
    process.stderr.write(
      (timedOut
        ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
        : `Mole Office at ${api} did not answer.`) + ` No --model was given, so it was asked whether the agent has its own model. Nothing was written: ${String(why)}\n`,
    )
    process.exit(1)
  }
  if (own?.from === 'the agent' && typeof own.model === 'string' && own.model !== '') {
    model = own.model
    process.stderr.write(`The model ${model} is the agent's own model on its profile, which comes before the Casting table. The office says: ${String(own.says ?? '')}\n`)
  }
}
if (model === null) {
  const role = typeof served.roleReadAs === 'string' && served.roleReadAs !== '' ? served.roleReadAs : null
  if (role === null) {
    refused(`No --model was given, and the office names no role card for "${chosen.handle}", so the Casting table cannot be asked. Give --model <model>. Nothing was written.`)
  }
  let cast
  try {
    const asked = await fetch(`${api}/api/casting/for/${encodeURIComponent(role)}?project=${encodeURIComponent(workspace)}`, {
      headers: { 'x-mole-office-workspace': workspace },
      signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
    })
    if (!asked.ok) {
      process.stderr.write(`No --model was given, and Mole Office at ${api} answered ${String(asked.status)} to GET /api/casting/for/${role}: ${await asked.text()}\nNothing was written.\n`)
      process.exit(1)
    }
    cast = await asked.json()
  } catch (why) {
    const timedOut = why instanceof Error && why.name === 'TimeoutError'
    process.stderr.write(
      (timedOut
        ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
        : `Mole Office at ${api} did not answer.`) + ` No --model was given, so the Casting table was asked. Nothing was written: ${String(why)}\n`,
    )
    process.exit(1)
  }
  const castingId = typeof cast?.casting?.id === 'number' ? cast.casting.id : null
  if (castingId === null) {
    refused(`No --model was given, and the Casting table marks no casting for ${role} in ${workspace}, so the tools have no casting to take. Give --model <model>, or ask the person to mark a casting for ${role} on the Casting page. Nothing was written.`)
  }
  if (typeof cast.model !== 'string' || cast.model === '') {
    refused(`No --model was given, and casting ${String(castingId)}, the one the tools take for ${role} in ${workspace}, names no model. Give --model <model>. Nothing was written.`)
  }
  if (cast.program !== chosen.runtime) {
    refused(
      `No --model was given, and casting ${String(castingId)}, the one the tools take for ${role} in ${workspace}, names ${cast.model} on ${cast.program ?? 'no program'}, ` +
        `while this run is on ${chosen.runtime}, so that model is not used. Give --model <model>. Nothing was written.`,
    )
  }
  model = cast.model
  const decision = cast.cells?.model?.from?.decision?.id ?? null
  process.stderr.write(
    `The model ${model} came from casting ${String(castingId)} of the Casting table, the one the tools take for ${role} in ${workspace}` +
      (cast.scope === 'every project' ? ' (an every-project casting)' : ' (a casting of this project)') +
      (decision === null ? '. No decision is named for its model.' : `, from decision ${decision}.`) +
      '\n',
  )
  if (typeof cast.effort === 'string' && cast.effort !== '') {
    process.stderr.write(`Casting ${String(castingId)} also names the effort ${cast.effort}. This tool starts no program, so it passes no effort and records none on the run.\n`)
  }
}

// DOES THIS OFFICE KNOW THE DECLARED FIELD? `adaptedTool` came with problem uh6-H72Zik9H, and the office this
// files with may run older code than this checkout: its record door refuses a key its session kind does not
// declare, and every run would then be refused. So the office is asked, through the same read an agent uses
// for a shape (GET /api/kinds/session). A field it declares is sent. A field it does not declare is left out,
// and one line says so, because the run is then counted as "not declared". A read that fails writes nothing.
let officeKnowsTheField
let officeKnowsTheBaseCommit
try {
  const asked = await fetch(`${api}/api/kinds/session`, {
    headers: { 'x-mole-office-workspace': workspace },
    signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
  })
  if (!asked.ok) {
    process.stderr.write(`Mole Office at ${api} answered ${String(asked.status)} to GET /api/kinds/session; nothing was written.\n`)
    process.exit(1)
  }
  const fields = (await asked.json())?.kind?.fields
  if (!Array.isArray(fields)) {
    process.stderr.write(`Mole Office at ${api} answered GET /api/kinds/session with no list of fields; nothing was written.\n`)
    process.exit(1)
  }
  const declared = new Set(fields.map((field) => field?.key))
  officeKnowsTheField = declared.has('adaptedTool')
  officeKnowsTheBaseCommit = declared.has('cutFromCommit')
} catch (why) {
  const timedOut = why instanceof Error && why.name === 'TimeoutError'
  process.stderr.write(
    (timedOut
      ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
      : `Mole Office at ${api} did not answer.`) + ` Nothing was written: ${String(why)}\n`,
  )
  process.exit(1)
}

// THE RECORD THE CHECK READS. Exactly the keys the check needs and nothing invented: what it says
// it is doing, who serves it, where the work is and which branch it was cut from, and the one
// moment the run began. parentAttachment is left to the caller to name (criterion P11): this tool
// writes the run you said you are starting with.
// THE START IS WRITTEN TWICE: `startedAt` is the time in words a person reads, and `startedTime` is the
// instant with its offset, which the seal compares. The words alone repeat when the clocks go back.
const startedTime = clockStamp()
const startedAt = startedTime.stamp
const body = {
  kind: 'session',
  ...(chosen.askedBy === null ? {} : { askedBy: chosen.askedBy, ...(chosen.brief === null ? {} : { brief: chosen.brief }) }),
  title: chosen.title ?? A_RUN_GIVEN_NO_TITLE,
  data: {
    state: 'running',
    runtime: chosen.runtime,
    // THE DECLARED TOOL, checked against AGENT_RUNTIMES above: the field the usage page counts. Sent only to an
    // office that declares it (see above).
    ...(officeKnowsTheField ? { adaptedTool: chosen.runtime } : {}),
    model,
    servingAgent: chosen.handle,
    // THE ID BESIDE THE HANDLE, agreed for the whole wave: `servingAgent` stays the handle the run
    // was filed under, and this is the registry id of the agent it serves. A reader that only has
    // the handle can tell which agent it was even when another agent takes the name later.
    servingAgentId: served.id,
    ranAs: [{ workspaceId: workspace, agentId: recordId }],
    ...(chosen.machine === null ? { workingDirectory: chosen.worktree, tip } : { machine: chosen.machine }),
    cutFrom: chosen.cutFrom,
    ...(officeKnowsTheBaseCommit && cutFromCommit !== null ? { cutFromCommit } : {}),
    startedAt,
    startedTime,
    ...(typeof chosen.doing === 'string' && chosen.doing.trim() !== '' ? { doing: chosen.doing } : {}),
    parentAttachment: chosen.askedBy ?? chosen.parent ?? chosen.session,
    ...(sandbox === null ? {} : { sandbox, ...checkpointRunFields(chosen.runtime) }),
    ...(chosen.flow === null ? {} : { flow: chosen.flow.trim() }),
  },
  // A SECOND ROUND POINTS AT THE RUN IT CONTINUES: this run is derived from that one. It is written in the same
  // request as the record, so a run that is not there refuses both together.
  ...(chosen.continues === null ? {} : { links: [{ type: 'derived_from', toId: chosen.continues.trim() }] }),
}

let reply
try {
  reply = await fetch(`${api}/api/records`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_SECONDS * 1000),
  })
} catch (why) {
  const timedOut = why instanceof Error && why.name === 'TimeoutError'
  process.stderr.write(
    (timedOut
      ? `Waited ${String(TIMEOUT_SECONDS)} seconds for Mole Office at ${api} to answer, and it did not.`
      : `Mole Office at ${api} did not answer.`) + ` Nothing was written: ${String(why)}\n`,
  )
  process.exit(1)
}
const said = await reply.text()
if (!reply.ok) {
  // THE OFFICE'S OWN SENTENCE, VERBATIM. A run filed with a body the schema refused would leave a
  // caller holding a printed id for a record that does not exist, which is the shape of a fake
  // success; the refusal is what tells the caller what actually happened.
  process.stderr.write(`Mole Office refused the run record (${String(reply.status)}), so nothing was written:\n${said}\n`)
  process.exit(1)
}

const answer = JSON.parse(said)
if (typeof answer?.record?.id !== 'string' || answer.record.id === '') {
  process.stderr.write(`Mole Office answered ${String(reply.status)} but named no record id, so the run cannot be said to be filed:\n${said}\n`)
  process.exit(1)
}
// ITS LABEL, WRITTEN BY WHOEVER FILED IT. Chapter 10 rule 3 asks every record for one, and this
// record is the office's, not the agent's: the worker that runs under it never wrote it and is
// refused for it anyway (a check refused a run three times over this on 22 September
// 2026). Two to five words, from what is known here. A label that cannot be written is one line on
// the error channel: the run is filed either way, and the caller is already holding its id.
const labelled = await labelOneRecord(api, headers, answer.record.id, `Run of ${chosen.handle}`)
if (!labelled.endsWith(`"Run of ${chosen.handle}".`)) process.stderr.write(`${labelled}\n`)

// THE RUN'S KEY, when the office answered one (see the header): into the file named for it, made new with mode 0600,
// and nowhere else. What is said about it names the file, never the key. A key that cannot be written is not kept, and
// the run is still filed, so its id is printed below either way.
const runKey = typeof answer?.runKey?.key === 'string' && answer.runKey.key !== '' ? answer.runKey.key : null
if (runKey !== null && chosen.runKeyFile !== null) {
  try {
    const fd = openSync(chosen.runKeyFile, 'wx', 0o600)
    try {
      writeSync(fd, `${runKey}\n`)
    } finally {
      closeSync(fd)
    }
    process.stderr.write(`The office answered a key of ${chosen.handle} for run ${answer.record.id}. It is in ${chosen.runKeyFile}, mode 0600, and nowhere else.\n`)
  } catch (why) {
    process.stderr.write(
      `The office answered a key of ${chosen.handle} for run ${answer.record.id}, and it could not be written to ${chosen.runKeyFile} ` +
        `(${why instanceof Error ? why.message : String(why)}), so it was not kept. The run is filed; it dies with the run.\n`,
    )
  }
} else if (runKey !== null) {
  process.stderr.write(`The office answered a key of ${chosen.handle} for run ${answer.record.id}. No --run-key-file was named, so it was not kept; it dies with the run.\n`)
} else if (chosen.runKeyFile !== null) {
  process.stderr.write(
    `The office answered no key for run ${answer.record.id}, so ${chosen.runKeyFile} was not written. A run is given one when its ` +
      "create carries its registered starter's key; a worker with no key of its own also needs --asked-by and --brief.\n",
  )
}

if (!officeKnowsTheField) {
  process.stderr.write(
    `The office at ${api} does not know the field adaptedTool yet, so run ${answer.record.id} was filed without it` +
      ` and is counted as "not declared" on the usage page.\n`,
  )
}

// THE RECORD ID, on its own line, where a caller takes it from. Nothing is printed but ids.
process.stdout.write(`${answer.record.id}\n`)
process.stdout.write(
  `Filed run ${answer.record.id} for ${chosen.handle}, ${chosen.machine === null ? `in ${chosen.worktree}` : `on the computer ${chosen.machine}`}, cut from ${chosen.cutFrom},` +
    ` started by ${chosen.as}. Hand ${answer.record.id} to the started agent as its run id; ` +
    (chosen.machine === null
      ? 'when it says its work is finished the office asks the check itself.\n'
      : 'it finishes with a records submission, and its code comes in as a branch that a run on this computer takes in.\n'),
)
