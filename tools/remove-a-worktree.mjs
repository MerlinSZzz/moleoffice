#!/usr/bin/env node
// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Remove a worktree after asking which records name files inside it.
 * Usage: node tools/remove-a-worktree.mjs <worktree> [--answer <file>] [--even-so "<because>"]
 * Exit codes: 0 removed, 1 refused or failed, 2 kept because records name files inside.
 * Exit 1 is also a worktree no record names, kept because no branch, keep ref or main contains its HEAD.
 *
 * THE TOOL ASKS THE OFFICE ONLY WITH THE RUN'S KEY (wave 13s round 118). A shell with no key gives --answer <file>
 * instead, and a shell with a key may not. With neither, the tool refuses before it sends any request: a request with no
 * key would be answered as nobody, and in a sandbox the address it goes to may be another copy's office.
 *
 * A WORKTREE WITH WORK OUTSIDE ITS COMMIT IS REFUSED BY THIS TOOL'S OWN READING. Git's own check is a
 * status, which runs any filter the repository's config names, and a sandboxed run can write that
 * config. So this tool reads the worktree as the seal does (src/config/outside-the-commit.mjs): a
 * changed, missing, staged or untracked file, or a submodule checked out inside, keeps it. Then git
 * removes it with one --force, which skips only that status; a locked worktree is still refused.
 *
 * A FILE THIS TOOL COULD NOT COMPARE KEEPS THE WORKTREE TOO. Git converts some files on checkout, by an
 * attribute that names a filter, eol=crlf, ident or a working-tree-encoding. When such a file holds
 * other bytes than its commit, only running that conversion could tell whether it holds work, and
 * this tool does not run it. So the tool keeps the worktree, names each such file, and exits 1. No
 * flag lets one through: --even-so answers for records that name files inside, never for work.
 *
 * A WORKTREE THAT RECORDS NAME GOES ONLY WHILE A BRANCH HOLDS ITS COMMIT, AND ONLY WHEN NO RECORD NAMES A FILE THE
 * COMMIT DOES NOT HOLD (wave 13s round 115, item 25). The owner's rule, as they changed it in point 1 of a decision, is
 * that a worktree whose branch or keep ref holds every tracked file may be removed even when a record names it, and a
 * record naming an untracked or ignored file inside still keeps it.
 * The office compares each record with the worktree's HEAD and puts it in a class
 * (src/shared/what-a-record-names-inside.ts). So a named worktree is kept, exit 2, with --even-so too: when the answer
 * carries no comparison; when any record, readable or not, names an untracked, ignored or uncompared path; when HEAD is
 * no longer the commit the office compared; and when no branch, ref under refs/keep/ or main contains HEAD
 * (Q-F7VhosndpR; 8yiywJNWF1Fw). Tags and remote refs do not count. Otherwise --even-so is still asked for, and the
 * check of work outside the commit still comes after it. After a removal the tool names the records that name a path no
 * longer there. Before round 115 a because let a named worktree go whatever held its commit.
 *
 * A WORKTREE NO RECORD NAMES IS KEPT TOO WHILE NO BRANCH, KEEP REF OR MAIN CONTAINS ITS HEAD, with --even-so too (wave
 * 13s round 116, qVdARm06Ryrk). A removal leaves that commit on no ref whether or not a record names the folder.
 * The tool says the same sentence a named worktree gets and exits 1, because exit 2 says that records name files inside.
 * Before round 116 a worktree no record names went whatever held its commit.
 */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { join } from 'node:path'
import { whatTheIndexHoldsApart } from '../src/config/outside-the-commit.mjs'
import { guardedGit, guardedGitBytes, guardedGitRun, outsideTheCommit } from './sandbox-git.mjs'
import { theAgentKey } from './sandbox-common.mjs'
import { apiAddressForThisProcess, theEnvironmentsAddressIsForAnotherCopy } from '../src/config/settings.mjs'
import { clockStamp } from '../src/shared/time.ts'
import { WHAT_A_RECORD_NAMES_INSIDE } from '../src/shared/what-a-record-names-inside.ts'
import { askWhatNamesFilesInside, isTheNamedInsideAnswer, whatARecordNamesInside, whatNamesFilesInside, whatTheHiddenRecordsName, whyTheAnswerKeepsIt } from './what-names-files-inside.mjs'

/** Ask the same office as the isolated-world cleanup, with the sandbox check first. */
function theApi() {
  const refused = theEnvironmentsAddressIsForAnotherCopy(process.env)
  if (refused !== null) throw new Error(refused)
  return apiAddressForThisProcess().replace(/\/+$/, '')
}

/**
 * What in the worktree at `folder` is not its commit, or null when nothing is. `lines` are as
 * `git status --porcelain` gives them, with a submodule checked out inside said too: removing it would
 * remove its work. `notCompared` holds the files git converts on checkout whose bytes are not the commit's.
 * @param {string} folder
 * @param {string} head
 */
function theWorkOutsideTheCommit(folder, head) {
  const { submodules } = whatTheIndexHoldsApart(folder, head, (args, options) => guardedGitBytes(folder, args, options ?? {}))
  const outside = outsideTheCommit(folder, head)
  const lines = [
    ...outside.lines,
    ...submodules.filter((path) => existsSync(join(folder, path, '.git'))).map((path) => `a submodule is checked out at ${path}`),
  ]
  return lines.length === 0 && outside.notCompared.length === 0 ? null : { head, lines, notCompared: outside.notCompared }
}

/** The worktree's HEAD commit, in full. */
function theHead(folder) {
  return guardedGit(folder, ['rev-parse', '--verify', 'HEAD^{commit}'])
}

/**
 * Why a removal would leave HEAD on no ref, or null. A branch, a ref under refs/keep/ or main must contain it; a tag or a
 * remote ref does not count. Asked for every worktree, named or not.
 */
function whyNoRefHoldsIt(folder, head) {
  const holding = guardedGit(folder, ['for-each-ref', '--contains', head, '--format=%(refname)', 'refs/heads/', 'refs/keep/'])
  return holding === '' ? `Its HEAD ${head.slice(0, 12)} is on no branch, keep ref or main; put a branch on it first.` : null
}

/**
 * Why git keeps a named worktree the office's answer lets go, one sentence each, or none. The office compared the
 * records with one commit, so HEAD must still be it, and a ref must hold it.
 */
function whyGitKeepsIt(folder, head, comparedWith) {
  if (comparedWith !== head) return [`The office compared the records with commit ${comparedWith.slice(0, 12)}, but HEAD is now ${head.slice(0, 12)}; ask again.`]
  const unheld = whyNoRefHoldsIt(folder, head)
  return unheld === null ? [] : [unheld]
}

/** At most 20 of `lines`, one a line, then how many more there are. */
function atMostTwenty(lines) {
  const shown = lines.slice(0, 20)
  return `${shown.join('\n')}${lines.length > shown.length ? `\nand ${lines.length - shown.length} more.` : ''}`
}

/** Read the office's JSON body, with the folder and the office's own time checked before removal. */
function answerFromFile(file, folder) {
  let answer
  try {
    answer = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(`The answer file ${file} could not be read as JSON: ${String(error?.message ?? error)}`)
  }
  if (answer?.folder !== folder) {
    throw new Error(`The answer in ${file} was for ${String(answer?.folder ?? 'no folder')}. The folder asked to be removed is ${folder}. Ask the office about this folder.`)
  }
  if (!isTheNamedInsideAnswer(answer, folder)) {
    throw new Error(`The file ${file} did not give the named-inside answer for ${folder}.`)
  }
  if (answer.answeredAt === undefined) {
    throw new Error(`The answer in ${file} predates the door saying when it answered. The door must be asked again.`)
  }
  let answered
  try {
    if (typeof answer.answeredAt !== 'string') throw new Error('The time is not a string.')
    answered = clockStamp(() => answer.answeredAt)
  } catch {
    throw new Error(`The answer in ${file} has no readable time with an offset in answeredAt. The door must be asked again.`)
  }
  const age = Date.now() - Date.parse(answered.instant)
  if (age < 0) {
    throw new Error(`The answer in ${file} was stamped later than now (${answer.answeredAt}). The door must be asked again.`)
  }
  if (age >= 5 * 60_000) {
    throw new Error(`The answer in ${file} is ${(age / 60_000).toFixed(2)} minutes old. Answers must be less than 5 minutes old. The door must be asked again.`)
  }
  console.log(`Answer from file ${file}. The office answered at ${answer.answeredAt}.`)
  return answer
}

async function main(args) {
  const usage = 'Usage: node tools/remove-a-worktree.mjs <worktree> [--answer <file>] [--even-so "<because>"]. --answer needs a file. --even-so needs a nonempty because.'
  if (args.length === 0) throw new Error(usage)
  let answerFile = null
  let because = null
  for (let i = 1; i < args.length; i += 2) {
    const value = args[i + 1]
    if (value === undefined || value.trim() === '') throw new Error(usage)
    if (args[i] === '--answer' && answerFile === null) answerFile = value
    else if (args[i] === '--even-so' && because === null) because = value
    else throw new Error(usage)
  }
  if (answerFile !== null && theAgentKey() !== null) {
    throw new Error('An answer file is only for a shell with no key; a shell with a key asks the office itself. A run with a key has no reason to trust a file it could have been handed.')
  }
  if (answerFile === null && theAgentKey() === null) {
    throw new Error("No key is in MOLE_AGENT_KEY, and this tool does not ask the office with no key: pass --answer <file>, or run where the run's key is.")
  }
  const folder = realpathSync(args[0])
  const answer = answerFile === null ? await askWhatNamesFilesInside(theApi(), folder, 'tools/remove-a-worktree.mjs') : answerFromFile(answerFile, folder)
  console.log(answer.says)
  console.log(answer.scope)
  for (const record of answer.records) {
    console.log(`${record.id} (${record.kind}): ${record.title}`)
    for (const path of record.paths) console.log(`  ${path.where}: ${path.path}`)
    const names = whatARecordNamesInside(record)
    if (names !== null) console.log(`  ${names}`)
  }
  const hidden = whatTheHiddenRecordsName(answer)
  if (hidden !== null) console.log(hidden)
  const named = whatNamesFilesInside(answer)
  // The answer is weighed before git is read, so an answer that keeps the worktree starts no git.
  let head = null
  if (named !== null) {
    const kept = whyTheAnswerKeepsIt(answer)
    if (kept.length === 0) {
      head = theHead(folder)
      kept.push(...whyGitKeepsIt(folder, head, answer.comparedWith))
    }
    if (kept.length === 0 && because === null) kept.push('To proceed, give --even-so "<because>".')
    if (kept.length) {
      console.error(`Nothing was removed: ${named} ${kept.join(' ')}`)
      return 2
    }
  } else {
    head = theHead(folder)
    const unheld = whyNoRefHoldsIt(folder, head)
    if (unheld !== null) throw new Error(unheld)
  }
  if (because !== null) console.log(`Removing even so, because: ${because}`)
  const common = guardedGitRun(folder, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (common.error || common.status !== 0) throw new Error(common.error?.message ?? common.stderr)
  const repository = common.stdout.trim()
  const outside = theWorkOutsideTheCommit(folder, head)
  if (outside !== null) {
    const commit = outside.head.slice(0, 12)
    const said = []
    if (outside.lines.length) said.push(`${folder} contains modified or untracked files, which are not in its commit ${commit}:\n${atMostTwenty(outside.lines)}`)
    if (outside.notCompared.length) {
      said.push(`${String(outside.notCompared.length)} file${outside.notCompared.length === 1 ? '' : 's'} in ${folder} could not be compared with its commit ${commit}. ` +
        'Git converts them on checkout, by an attribute that names a filter, eol=crlf, ident or a working-tree-encoding, and their bytes are not the committed ones. ' +
        `This tool does not run that conversion, so it cannot tell whether they hold work, and it keeps the worktree. Look at each yourself:\n${atMostTwenty(outside.notCompared)}`)
    }
    throw new Error(said.join('\n'))
  }
  const removed = guardedGitRun(repository, ['worktree', 'remove', '--force', folder], { before: ['--git-dir', repository] })
  if (removed.stdout) process.stdout.write(removed.stdout)
  if (removed.error || removed.status !== 0) throw new Error(removed.error?.message ?? removed.stderr)
  if (removed.stderr) process.stderr.write(removed.stderr)
  console.log(`Removed worktree ${folder}.`)
  const gone = answer.records.filter((record) => record.names === 'aPathNotThere').map((record) => record.id)
  const goneHidden = answer.hiddenCiters?.aPathNotThere ?? 0
  if (gone.length + goneHidden > 0) {
    const hiddenToo = goneHidden === 0 ? '' : `${gone.length ? ', and ' : ''}${String(goneHidden)} you may not read`
    console.log(`Records that name ${WHAT_A_RECORD_NAMES_INSIDE.aPathNotThere} (aPathNotThere): ${gone.join(', ')}${hiddenToo}.`)
  }
  return 0
}

try {
  process.exitCode = await main(process.argv.slice(2))
} catch (error) {
  console.error(String(error?.message ?? error) + '\nNothing was removed.')
  process.exitCode = 1
}
