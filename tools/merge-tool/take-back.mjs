// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** One independent inverse commit. The office, not this tool, decides whether it is due and exact. */
import './a-library-is-not-a-program.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { guardedGitArguments } from '../../src/config/guarded-git.mjs'
import { inspectionTrunk } from '../../src/config/inspection-base.mjs'
import { startTimeOf } from '../../src/config/session-process.mjs'
import { handBackFacts, takeBackTitle } from '../../src/shared/merge-class.ts'
import { localStamp } from '../../src/shared/time.ts'

function git(root, args, identity = {}) {
  const env = { ...process.env, ...identity }
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX', 'GIT_COMMON_DIR', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[key]
  return execFileSync('git', guardedGitArguments(root, args), { env, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd()
}
function mainAt(root) {
  const trunk = inspectionTrunk({ remoteHead: () => { try { return git(root, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']) } catch { return null } }, localExists: ref => { try { git(root, ['rev-parse', '--verify', `${ref}^{commit}`]); return true } catch { return false } } })
  if (trunk.branch === null) throw new Error(trunk.says)
  return git(root, ['rev-parse', '--verify', `${trunk.branch}^{commit}`])
}

/** Exported git work has no API, clock or authority. Failure leaves no partial clone. */
export function prepareTakeBack({ repository, clone, problem, entry, commits, title, identity, onRemoved = () => {} }) {
  const main = mainAt(repository), branch = `take-back/${problem}`, note = `${clone}.making.json`
  if (existsSync(clone)) {
    if (!existsSync(note)) throw new Error(`The take-back clone ${clone} already exists, but no note names it; nothing was changed.`)
    let maker
    try {
      maker = JSON.parse(readFileSync(note, 'utf8'))
      if (maker === null || !Number.isInteger(maker.pid) || maker.pid <= 0 || typeof maker.startedAt !== 'string' || maker.startedAt === '') throw new Error('The process is not named.')
    } catch { throw new Error(`The note ${note} cannot be read as a take-back maker; nothing was changed.`) }
    if (maker.problem !== problem) throw new Error(`The note ${note} names another problem; nothing was changed.`)
    if (maker.repository !== repository) throw new Error(`The note ${note} names another repository; nothing was changed.`)
    if (maker.clone !== clone) throw new Error(`The note ${note} names another clone path; nothing was changed.`)
    const started = startTimeOf(maker.pid), began = started === null ? null : localStamp(started)
    if (began === maker.startedAt) throw new Error(`The take-back clone ${clone} is still being made by process ${maker.pid}, which began at ${maker.startedAt}; nothing was changed.`)
    const why = began === null ? `process ${maker.pid} is gone` : `process ${maker.pid} is now a process that began at ${began}, not at ${maker.startedAt}`
    // A killed clone may be whole or partial; no check here can tell, so it is removed rather than finished.
    rmSync(clone, { recursive: true, force: true }); rmSync(note, { force: true })
    const says = `Removed the left take-back clone ${clone}, made by process ${maker.pid} that began at ${maker.startedAt}: ${why}.`
    process.stderr.write(`${says}\n`); onRemoved(says)
  }
  for (const commit of commits) {
    const parents = git(repository, ['rev-list', '--parents', '-n', '1', commit]).split(' ')
    if (parents.length !== 2) throw new Error(`Commit ${commit} is a merge or is not a single-parent commit; nothing was reverted.`)
  }
  mkdirSync(dirname(clone), { recursive: true })
  const started = startTimeOf(process.pid)
  if (started === null) throw new Error(`This take-back could not read when its own process ${process.pid} began, so it could not write a maker note; no clone was made.`)
  try {
    const written = `${note}.taking-${process.pid}`
    try {
      writeFileSync(written, `${JSON.stringify({ problem, repository, clone, pid: process.pid, startedAt: localStamp(started) }, null, 2)}\n`)
      renameSync(written, note)
    } finally { rmSync(written, { force: true }) }
    const start = performance.now()
    git(repository, ['clone', '--no-local', '--no-checkout', repository, clone], identity)
    if (!lstatSync(join(clone, '.git')).isDirectory() || existsSync(join(clone, '.git/commondir')) || existsSync(join(clone, '.git/objects/info/alternates'))) throw new Error('The take-back clone has no independent storage.')
    git(clone, ['checkout', '-b', branch, main], identity)
    const cloned = performance.now()
    for (const commit of [...commits].reverse()) {
      try { git(clone, ['revert', '--no-commit', commit], identity) }
      catch {
        let paths = ''
        try { paths = git(clone, ['diff', '--name-only', '--diff-filter=U']).split('\n').filter(Boolean).join(', ') } catch { paths = 'paths could not be read' }
        try { git(clone, ['revert', '--abort'], identity) } catch { /* A one-commit revert may have no sequencer. The clone is removed below. */ }
        throw new Error(`Take-back of commit ${commit} stopped; conflicting paths: ${paths || 'git named no conflict paths'}; the clone was removed and the office was not asked.`)
      }
    }
    git(clone, ['-c', 'commit.gpgSign=false', 'commit', '-m', title, '-m', `Problem ${problem}; handed-back entry ${entry}; reverted commits ${commits.join(', ')}.`], identity)
    if (git(clone, ['status', '--porcelain']) !== '') throw new Error('The take-back clone is not clean.')
    const reverted = performance.now()
    return { timing: { cloneMs: cloned - start, revertMs: reverted - cloned }, clone, branch, base: main, commit: git(clone, ['rev-parse', 'HEAD']), paths: git(clone, ['diff-tree', '-r', '--no-renames', '--name-only', '-z', main, 'HEAD']).split('\0').filter(Boolean) }
  } catch (error) { rmSync(clone, { recursive: true, force: true }); rmSync(note, { force: true }); throw error }
}

/** Read current main in this take-back's sandbox, building when main declares it, then using the shared one-file runner. */
async function runOnMain(facts, tools) {
  const main = mainAt(facts.repository), sandbox = await tools.theSandbox(facts.repository)
  const tree = join(sandbox.folder, 'work', 'take-back-main'), reports = join(sandbox.folder, 'work', 'reports')
  rmSync(tree, { recursive: true, force: true })
  mkdirSync(dirname(tree), { recursive: true }); mkdirSync(reports, { recursive: true })
  git(facts.repository, ['clone', '--quiet', '--shared', '--no-checkout', facts.repository, tree])
  git(tree, ['checkout', '--quiet', '--detach', main])
  tools.linkNodeModules(facts.repository, tree)
  const scripts = tools.packageScripts(tree)
  if (typeof scripts.build === 'string') {
    const build = await tools.runInSandbox(sandbox, 'take-back-main-build', 'npm', ['run', 'build'], { cwd: tree, timeoutMs: tools.buildLimitMs })
    if (build.code !== 0) {
      const why = `main's build did not succeed (log ${build.outFile})`
      return { mainAt: main, files: facts.files.map(file => ({ file, result: 'no result', log: build.outFile })), reasons: facts.files.map(file => `${file}: no result (${why})`) }
    }
  }
  const files = [], reasons = []
  for (const [index, file] of facts.files.entries()) {
    const alone = await tools.runAlone(sandbox, tree, file, `take-back-main-${index + 1}`, reports, { noResult: 'answer' })
    const result = alone.absent ? 'absent' : alone.noResult !== null ? 'no result' : alone.red === true ? 'red' : 'passed'
    files.push({ file, result, log: alone.log })
    if (result === 'absent') reasons.push(`${file}: absent on main`)
    if (result === 'no result') reasons.push(`${file}: no result (${alone.noResult})`)
  }
  return { mainAt: main, files, reasons }
}

/** Every office request uses the existing keeper. The commit is fetched into root before its clone is removed. */
export async function runTakeBack({ chosen, workdir, ask, identity, mainTools }) {
  let facts, made, answer = 'not asked', knownPaths = [], removed = '', onMain = ''
  try {
    const problem = await ask('GET', `/api/records/${encodeURIComponent(chosen.takeBack)}`)
    if (problem.status !== 200) throw new Error(`The problem cannot be read (${problem.status}).`)
    const record = problem.body.record ?? problem.body
    facts = handBackFacts.parse(record.data?.extra?.handBack)
    const entryRead = await ask('GET', `/api/merge-queue/${encodeURIComponent(facts.entry)}`)
    if (entryRead.status !== 200) throw new Error(`The handed-back entry cannot be read (${entryRead.status}).`)
    const entry = entryRead.body.entry ?? entryRead.body
    const checked = await runOnMain(facts, mainTools)
    onMain = `main ${checked.mainAt}; ${checked.files.map(one => `${one.file}: ${one.result}`).join('; ')}; `
    if (checked.files.every(one => one.result === 'passed')) {
      const reply = await ask('POST', `/api/worker/merges/hand-backs/${encodeURIComponent(chosen.takeBack)}/fixed-on-main`, { mainAt: checked.mainAt, files: checked.files.map(({ file, log }) => ({ file, log })) })
      if (reply.status !== 200) {
        answer = `refused (${reply.status}): ${reply.body?.error ?? JSON.stringify(reply.body)}`
        throw new Error(answer)
      }
      answer = `fixed on main: ${reply.body.says}`
      process.stdout.write(`TAKE-BACK: problem ${chosen.takeBack}; entry ${facts.entry}; ${onMain}office ${answer}; nothing was taken back.\n`)
      return true
    }
    if (!checked.files.some(one => one.result === 'red')) throw new Error(`${checked.reasons.join('; ')}; nothing was taken back and the office was not asked.`)
    made = prepareTakeBack({ repository: facts.repository, clone: join(workdir, 'clone'), problem: chosen.takeBack, entry: facts.entry, commits: facts.commits, title: takeBackTitle(entry.title, facts.hours), identity, onRemoved: says => { removed = ` ${says}` } })
    knownPaths = made.paths
    try { git(facts.repository, ['cat-file', '-e', `${made.commit}^{commit}`]) }
    catch { git(facts.repository, ['fetch', '--quiet', '--no-tags', '--no-write-fetch-head', made.clone, made.commit]) }
    const reply = await ask('POST', `/api/worker/merges/hand-backs/${encodeURIComponent(chosen.takeBack)}/take-back`, { workingDirectory: made.clone, branch: made.branch, stillRed: { mainAt: checked.mainAt, files: checked.files } })
    if (reply.status === 200 || reply.status === 201) {
      answer = `accepted entry ${reply.body.entry.id}, run ${reply.body.run}, commit ${reply.body.commit}.`
      process.stdout.write(`TAKE-BACK: problem ${chosen.takeBack}; entry ${facts.entry}; commits ${facts.commits.join(', ')}; paths ${knownPaths.join(', ')}; ${onMain}office ${answer}${removed}\n`)
      return true
    }
    answer = `refused (${reply.status}): ${reply.body?.error ?? JSON.stringify(reply.body)}`
    throw new Error(answer)
  } catch (error) {
    const says = error instanceof Error ? error.message.replace(/\s+/g, ' ') : String(error)
    process.stderr.write(`${says}\n`)
    process.stdout.write(`TAKE-BACK: problem ${chosen.takeBack}; entry ${facts?.entry ?? 'unreadable'}; commits ${facts?.commits.join(', ') ?? 'unreadable'}; paths ${knownPaths.join(', ') || 'unreadable'}; ${onMain}office ${answer}; ${says}${removed}\n`)
    return false
  } finally {
    // pinGit and bus/pair readers fetch only when root lacks the object; it has it before the office is asked.
    // Check readers need the directory, but this office-filed run asks for no check. No later queue reader needs it.
    if (made !== undefined) { rmSync(made.clone, { recursive: true, force: true }); rmSync(`${made.clone}.making.json`, { force: true }) }
  }
}
