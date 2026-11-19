// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * tools/the-merger.mjs AND THE SUITE IT RUNS: what the suite reads, how many workers it has, when one suite tests two
 * entries, and when a change needs no suite at all.
 *
 * These cases were in tests/the-merger.test.ts until wave 13p's round D split that file, so that each part runs well
 * inside the 590 seconds an agent's command may take. They run the real tool against a real office on its own port,
 * as that file's header says, and the set-up they share is in tests/the-merger-fixture.ts.
 *
 * WHAT IS PROVED, each by running the real tool:
 *
 *   1. A suite run keeps every document it read for the tree that landed, and no other.
 *   2. A documentation change that no test reads lands in its own lane with no suite.
 *   3. An entry's own suite workers, and the related tests first.
 *   4. Two judged entries of one lane are tested in one suite, and the second borrows the first's result.
 */
import { randomUUID } from 'node:crypto'
import { withoutInheritedEffort } from './without-inherited-effort.ts'
import { THE_TEST_OFFICES_OWNER } from './a-page-of-a-test-office.ts'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { MERGE_WORKERS_BOUNDS } from '../src/config/settings.mjs'
import { clockStamp, stampInZone, parseStoredStamp } from '../src/shared/time.ts'
import { LANDED_KEEP_PREFIX, retainedLandings } from '../src/shared/merge/landed-history.mjs'
import {
  REPO, SUITE_WORKERS, app, t, base, repositoryOf, asWorker, asPerson, git, scratch, write, PASSING_TEST, mainCheckout,
  workerClone, sealedRun, submitGit, stateOf, released, detailOf, readingOf, sandboxFolderOf, sandboxCallsOf,
  startTheTool, runTheTool, runTheTakeBack, stepsOf, factsOf, aRealOfficeForTheMerger, theProxySaysTheOfficeRunsFrom,
} from './the-merger-fixture.ts'

aRealOfficeForTheMerger('tests/the-merger-suite.test.ts')

// ============================================================================ 7c. what the suite reads

describe('what a suite run reads', () => {
  // A DOCUMENTATION CHANGE THAT NO TEST READS LANDS BY ITSELF, and which files the tests read is recorded as the suite
  // runs, in its node processes, in node children, and in the paths given to children that are not node (
  // messages GIxHaLdp_dyo and pZyM8RwgmfdN). The names here are built as the test runs, so the floor of named paths
  // cannot hold them: only the recorder can.
  // MUTATION PROOF, 23 September 2026, each alone: the suite run without the recorder, and this goes red where no
  // record is kept; children that are not node left unrecorded, and it goes red on the file cat read; a shell line read
  // whole as before (any $ reads the working folder), and it goes red on the folder read whole.
  it('keeps, for the tree that landed, every document the suite read, and not one it did not', async () => {
    const main = mainCheckout('reads')
    const READS = `import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
// SYNTHETIC: three documents read three ways, by names built as the test runs, and two shell lines: one that only
// manages a process, which reads nothing, and a watchdog wrapper whose command reads a fourth document.
const doc = (...words: string[]) => join('notes', \`\${words.join('-')}.md\`)
it('reads documents three ways', () => {
  expect(readFileSync(doc('read', 'by', 'a', 'test'), 'utf8')).toContain('text')
  execFileSync(process.execPath, [join('tools', 'reads-a-note.mjs'), doc('read', 'by', 'a', 'child')])
  execFileSync('cat', [doc('read', 'by', 'cat')])
  execFileSync('sh', ['-c', 'sleep 0 & echo $!'])
  execFileSync('sh', ['-c', '(true) & exec "$0" "$@"', 'cat', doc('read', 'through', 'a', 'wrapper')])
})
`
    write(main, {
      'tools/record-what-tests-read.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read.mjs'), 'utf8'),
      'tools/record-what-tests-read-hooks.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read-hooks.mjs'), 'utf8'),
      'tools/reads-a-note.mjs': "import { readFileSync } from 'node:fs'\nreadFileSync(process.argv[2], 'utf8')\n",
      'notes/read-by-a-test.md': 'text\n',
      'notes/read-by-a-child.md': 'text\n',
      'notes/read-by-cat.md': 'text\n',
      'notes/read-through-a-wrapper.md': 'text\n',
      'notes/read-by-nobody.md': 'text\n',
    })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries the recorder and four notes')
    const { entry } = await submitGit(main, 'reads', (dir) => write(dir, { 'tests/reads.test.ts': READS }))
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
    const run = await runTheTool(entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stateOf(entry)).toBe('merged')
    const kept = JSON.parse(readFileSync(join(base, 'work', 'reads', `${git(main, 'rev-parse', 'HEAD^{tree}')}.json`), 'utf8')) as { files: string[]; folders: string[]; listed: string[]; processes: number; at: string }
    expect(kept.processes).toBeGreaterThan(0)
    // STAMPED IN LOCAL WALL-CLOCK TIME, the one form the office writes (acceptance finding 61): a UTC stamp with its Z is
    // not that form, and a UTC wall clock written without its Z is an hour off now in summer, which the second line sees
    // where the machine's clock is not UTC itself.
    // MUTATION PROOF, 24 September 2026, alone in tools/the-merger.mjs: stamp() back to UTC, and this goes red on the form.
    const keptAt = parseStoredStamp(kept.at)
    expect(keptAt, `the record's time is ${kept.at}`).not.toBeNull()
    expect(Math.abs(keptAt! - Date.now())).toBeLessThan(10 * 60_000)
    expect(kept.files).toEqual(expect.arrayContaining(['notes/read-by-a-test.md', 'notes/read-by-a-child.md', 'notes/read-by-cat.md', 'notes/read-through-a-wrapper.md']))
    expect(kept.files).not.toContain('notes/read-by-nobody.md')
    // THE SHELL LINE THAT ONLY MANAGES A PROCESS READS NOTHING: no folder holding the notes is read whole.
    expect(kept.folders.filter((one) => one === '.' || one === 'notes')).toEqual([])
    expect(Array.isArray(kept.listed)).toBe(true)
    expect(detailOf(entry, 'tested')['reads']).toMatchObject({ files: kept.files.length })
  }, 300_000)

  // THE PROGRAMS A TEST STARTS ARE READ BY THE LIST OF THOSE KNOWN TO READ NOTHING (message SFFuaKWSlVPe): any
  // program not on it reads what it is given, or its working folder, since a list of the programs that read contents
  // could never be complete. Run here straight under the recorder, with no suite around it, so each form is seen alone.
  // MUTATION PROOF, 23 September 2026, each alone: the old list of programs that read contents put back, and this goes
  // red on the note sort reads; the recorder not given back to a child whose environment a test replaced, and it goes
  // red on the note that child reads; a script's first line not looked at, and it goes red on the working folder the
  // node script would read; an assignment before the shell's own read not passed over, and it goes red on the working
  // folder `read` would read; a shell's line reached through "$@" not read again, and it goes red on the nested note.
  // AND THE READING (a) OF "NAMES NO PATH" (message VtCw66ZmGn74): a program given literal words and no path reads
  // nothing and is named on the record, a walker given no path reads its working folder, and a git diff limited to
  // added, deleted or renamed paths lists a tree of names while a name-only diff reads. Mutations, each alone: the
  // walkers not read, and it goes red on the folder find walks; a filtered diff read as any diff, and it goes red on the
  // tree of names; no N line, and it goes red on the program let through. AND AN ARGUMENT GIVEN IN AN ARRAY IS LITERAL
  // (measurement 4, VSmfXm6Bf1D8): a $ or a ? read as a pattern outside a shell line, and it goes red on the
  // working folder grep would read.
  it('counts every program but the few known to read nothing, and follows a child whose environment was replaced', () => {
    const root = scratch('recorder-root')
    const record = join(scratch('recorder-record'), 'record')
    const outside = join(scratch('recorder-outside'), 'elsewhere.md')
    const DRIVER = `import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
// SYNTHETIC: the shapes of the children a suite starts, one after another.
// Programs known to read nothing, as the suite writes them: none of these reads a file.
// The shell line waits on the process id the test passes in, which belongs to a process the test started and saw end.
// Its wait has a limit: past 10 seconds the driver fails and names the id (problem STK5co298AgV).
const waitedOn = process.argv[3] ?? ''
if (!/^[0-9]+$/.test(waitedOn)) throw new Error(\`the process id to wait on is not a number: "\${waitedOn}"\`)
try {
  execFileSync('sh', ['-c', 'sleep 0 & echo $! 2>&1; pid=$!; while kill -0 ' + waitedOn + ' 2>/dev/null; do sleep 0; done; true'], { timeout: 10_000 })
} catch (error) {
  if (error.code !== 'ETIMEDOUT') throw error
  throw new Error(\`kill -0 \${waitedOn} still found a process after 10 seconds: the shell line waited on process id \${waitedOn} and was stopped\`)
}
execFileSync('sh', ['-c', '(true) & exec "$0" "$@"', 'sleep', '0'])
// A program not on the list, given a literal path, reads that path and not its working folder.
execFileSync('sort', ['notes/sorted.md'])
// Given only a path outside the root, it reads that path and nothing of the root.
execFileSync('sort', [process.argv[2]])
// Given a path it cannot see ($1), it reads its working folder: here, folder.
execFileSync('sh', ['-c', 'sort "$1"', 'sh', 'deep/named-by-a-variable.md'], { cwd: join(process.cwd(), 'folder') })
// A file given to < is read, whatever the command.
execFileSync('sh', ['-c', 'while read line; do true; done < notes/read-through-a-redirection.md'])
// A gate that reads a word and runs what follows it, as tools/slot.mjs starts a slot's command: the assignment before
// the shell's own read runs nothing, and the shell line the gate runs through "$@" is read in its turn.
execFileSync('sh', ['-c', 'IFS= read -r word; [ "$word" = go ] || exit 111; exec "$@"', 'gate', 'sh', '-c', 'echo start-$0; sleep 0', 'A'], { input: 'go\\n' })
execFileSync('sh', ['-c', 'exec "$@"', 'gate', 'sh', '-c', 'sort notes/read-through-a-nested-shell.md'])
// A program given literal words and no path reads nothing, and is named on the record.
execFileSync('getconf', ['CLK_TCK'])
// An argument given in an array reaches the program as written, so a $ in it is a character, not a pattern: grep
// reads the note it is given and not its working folder.
execFileSync('grep', ['-c', 'b$', 'notes/sorted.md'])
// A walker given no path reads its working folder: here, walked.
execFileSync('find', ['-name', 'nothing-by-this-name'], { cwd: join(process.cwd(), 'walked') })
// A diff limited to deleted paths lists a tree of names; a name-only diff reads its range.
execFileSync('git', ['init', '-q', 'repo-listed'])
execFileSync('git', ['-C', 'repo-listed', 'diff', '--diff-filter=D', '--name-only'])
execFileSync('git', ['init', '-q', 'repo-read'])
execFileSync('git', ['-C', 'repo-read', 'diff', '--name-only'])
// A node child given an environment of its own still records what it reads.
execFileSync(process.execPath, ['tools/reads-a-note.mjs', 'notes/read-by-a-clean-child.md'], { env: { PATH: '/usr/bin:/bin' } })
// A script that runs under node records for itself, so it reads nothing here, though it names no path.
execFileSync('./tools/a-node-script.mjs', [])
`
    write(root, {
      'notes/sorted.md': 'b\na\n',
      'notes/read-by-a-clean-child.md': 'text\n',
      'notes/read-through-a-redirection.md': 'text\n',
      'notes/read-through-a-nested-shell.md': 'text\n',
      'notes/read-by-nobody.md': 'text\n',
      'folder/deep/named-by-a-variable.md': 'text\n',
      'walked/a-note.md': 'text\n',
      'tools/reads-a-note.mjs': "import { readFileSync } from 'node:fs'\nreadFileSync(process.argv[2], 'utf8')\n",
      'tools/a-node-script.mjs': '#!/usr/bin/env node\n',
      'the-driver.mjs': DRIVER,
    })
    chmodSync(join(root, 'tools', 'a-node-script.mjs'), 0o755)
    writeFileSync(outside, 'text\n')
    // THE ID THE SHELL LINE WAITS ON (problem STK5co298AgV): a fixed id such as 999999 can belong to a live process once
    // a machine's process ids have wrapped round, and the wait then never ends. So the test starts a process, sees it
    // end, and passes its id; no process holds that id unless the machine has given it out again since. The line still
    // shows what it is there to show, a shell that manages a process and reads nothing, and its wait now has a limit.
    // MUTATION PROOF, 27 September 2026: this id replaced by the pid of a sleep 60 the test started (stopped by that
    // pid afterwards), and the test goes red within the driver's 10-second limit, naming the id, instead of hanging.
    const ended = spawnSync('true')
    expect(ended.status, 'the process whose id the shell line waits on ended cleanly').toBe(0)
    const waitedOn = ended.pid
    execFileSync(process.execPath, ['the-driver.mjs', outside, String(waitedOn)], {
      timeout: 50_000,
      cwd: root,
      env: { ...withoutInheritedEffort(), NODE_OPTIONS: `--import=${join(REPO, 'tools', 'record-what-tests-read.mjs')}`, TEST_READ_ROOT: root, TEST_READ_RECORD: record },
    })
    const lines = readdirSync(record).flatMap((file) => readFileSync(join(record, file), 'utf8').split('\n'))
    const read = (kind: string): string[] => [...new Set(lines.filter((one) => one.startsWith(`${kind} `)).map((one) => one.slice(2).split(' :: ')[0] ?? ''))].sort()
    // WHAT THE PROGRAMS READ, and nothing more: no working folder but the one sort was given a variable in.
    expect(read('C')).toEqual(['folder', 'notes/read-through-a-nested-shell.md', 'notes/read-through-a-redirection.md', 'notes/sorted.md', 'repo-read', 'walked'])
    expect(read('T')).toEqual(['repo-listed'])
    // THE ONE PROGRAM LET THROUGH AS READING NOTHING, named: no other program here named no path.
    expect(read('N')).toEqual(['getconf'])
    expect(read('R')).toContain('notes/read-by-a-clean-child.md')
    expect(lines.join('\n')).not.toContain('read-by-nobody')
  }, 60_000)
})

// ============================================================================ 7d. documents that no test reads

describe('a documentation change that no test reads', () => {
  // THE RULE AND THE APPROVED DESIGN (GIxHaLdp_dyo,
  // AXACEkwE3AK4): a document no test reads lands at once, even while a code entry is testing, and that entry is not
  // tested again for it. A code entry's suite is held open here by a test that waits for a mark, which is written once
  // the document has landed.
  // MUTATION PROOF, 23 September 2026, each alone in tools/the-merger.mjs: no entry ever found to be documentation, and
  // the lane case goes red where the note waits behind the suite; a move of main by documents treated as any other, and
  // it goes red where the code entry is integrated and tested again.
  it('lands in its own lane while a code entry tests, and the code entry is carried past it with no second suite', async () => {
    const main = mainCheckout('documents')
    write(main, {
      'tools/record-what-tests-read.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read.mjs'), 'utf8'),
      'tools/record-what-tests-read-hooks.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read-hooks.mjs'), 'utf8'),
      'notes/guide.md': 'The guide, as it was.\n',
    })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries the recorder and a guide no test reads')
    // A FIRST CODE LANDING RECORDS WHAT MAIN'S SUITE READS.
    const first = await submitGit(main, 'documents-first', (dir) => write(dir, { 'src/first.txt': 'first\n' }))
    expect((await runTheTool(first.entry)).code).toBe(0)
    await released(first.entry)
    expect((await runTheTool(first.entry)).code).toBe(0)
    expect(stateOf(first.entry)).toBe('merged')
    expect(existsSync(join(base, 'work', 'reads', `${git(main, 'rev-parse', 'HEAD^{tree}')}.json`))).toBe(true)

    const mark = `${main}.the-note-landed`
    const WAITS = `import { existsSync } from 'node:fs'
import { it } from 'vitest'
// SYNTHETIC: the suite of this entry is held open until the mark is written, or a minute has passed.
it('waits for the note to land', async () => {
  const until = Date.now() + 60_000
  while (!existsSync(${JSON.stringify(mark)}) && Date.now() < until) await new Promise((ok) => setTimeout(ok, 200))
}, 90_000)
`
    const code = await submitGit(main, 'documents-code', (dir) => write(dir, { 'src/a.txt': 'a1\na2\na3\na4\n', 'tests/waits-for-a-note.test.ts': WAITS }))
    const note = await submitGit(main, 'documents-note', (dir) => write(dir, { 'notes/guide.md': 'The guide, as it is now.\n' }))
    const pinnedCode = await runTheTool(code.entry)
    expect(factsOf(pinnedCode, 'pinned')!['documents']).toBeUndefined()
    const pinnedNote = await runTheTool(note.entry)
    expect(factsOf(pinnedNote, 'pinned')).toMatchObject({ documents: { files: ['notes/guide.md'] } })
    await released(code.entry)
    await released(note.entry)
    expect(readingOf(note.entry)['lane']).toBe(`${main} documents`)

    const running = startTheTool(code.entry)
    for (let waited = 0; stateOf(code.entry) !== 'testing' && waited < 120; waited += 1) await new Promise((ok) => setTimeout(ok, 500))
    expect(stateOf(code.entry)).toBe('testing')
    const M = git(main, 'rev-parse', 'HEAD')
    const landedNote = await runTheTool(note.entry)
    expect(landedNote.code, landedNote.err + landedNote.out).toBe(0)
    expect(stepsOf(landedNote)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(landedNote, 'tested')!['says']).toContain('A documentation entry')
    expect(stateOf(note.entry)).toBe('merged')
    expect(stateOf(code.entry)).toBe('testing')
    const afterTheNote = git(main, 'rev-parse', 'HEAD')
    expect(git(main, 'rev-parse', 'HEAD^')).toBe(M)
    expect(JSON.parse(readFileSync(join(base, 'work', 'reads', `${git(main, 'rev-parse', 'HEAD^{tree}')}.json`), 'utf8'))).toMatchObject({ carriedBy: note.entry })
    writeFileSync(mark, 'landed\n')

    const done = await running.done
    expect(done.code, done.err + done.out).toBe(0)
    expect(stepsOf(done)).toEqual(['integrating', 'integrated', 'tested', 'moved-past-documents', 'landing', 'landed'])
    expect(factsOf(done, 'moved-past-documents')).toMatchObject({ mainAt: afterTheNote, documents: [note.entry] })
    const suites = sandboxCallsOf(code.entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))
    expect(suites, 'the code entry ran one suite').toHaveLength(1)
    expect(stateOf(code.entry)).toBe('merged')
    expect(() => git(main, 'merge-base', '--is-ancestor', afterTheNote, 'HEAD')).not.toThrow()
    // THE RECORD GOES WITH THE CODE ENTRY TO THE TREE IT LANDED AS (acceptance finding 58, the inspector's note on the
    // documents release): its suite read the tree before the note landed, and the note changed nothing it reads, so
    // main's new tree has a record, and a document can land alone after it.
    expect(JSON.parse(readFileSync(join(base, 'work', 'reads', `${git(main, 'rev-parse', 'HEAD^{tree}')}.json`), 'utf8'))).toMatchObject({ carriedBy: code.entry })
  }, 300_000)
})

// ============================================================================ 7f. an entry's own suite workers, and the related tests first

// These tests cite a decision.
describe("an entry's own suite workers, and the related tests first", () => {
  // PART A: the person, or the agent holding the secretary card, may name an entry's suite workers when it is submitted,
  // within MERGE_WORKERS_BOUNDS. The suite runs at that count, says so, and the entry is never on a bus, as lead or rider.
  // PART B: before the whole suite the tool runs the test files `run-named-tests --list related` names for the change
  // from main. A file red there, red alone and not red on main, bounces the entry at once and the whole suite is not
  // run. On a bus it bounces only the entries it belongs to. A list that is refused leaves it to the whole suite.
  // MUTATION PROOF, 10 October 2026, each alone after a control run (5 passed), logs in the round's .scratch/r17/mut:
  // the office taking a count from anybody registered, and the first case goes red; aBusFor not sending such a lead
  // alone, or board() taking such a rider, or the suite run at the setting and not the entry's count, and the second
  // goes red; the related tests never run first, and the last three go red; the bus allowed to decide a rider green
  // when only the related tests ran, and the bus case goes red. Restore: the whole file, 78 passed.
  // Round 17b, 10 October 2026, after a control run (6 passed), logs in .scratch/r17b/mut: the whole suite told to
  // leave out nothing, and the guard against a file run twice stops the tool; the carried files not added to the
  // count, and the green case reads 10 and not 12; a rider's related red bouncing the lead, and the rider case goes
  // red; a red related file carried as passed, and the rider case goes red; the related tests' reads not kept with
  // the whole suite's, and the green case misses the note. Restore: the whole file, 79 passed.
  // Round 17c: PART B IS OFF UNTIL THE OFFICE'S SETTING IS SWITCHED ON (GET /api/office/related-tests-first), and when on,
  // a related file whose longest recorded time is over the setting's bound runs in the whole suite instead. The B cases
  // switch it on first; the case after Part A's runs with nobody having chosen.
  /** A main whose list script names one whole-tree file, with enough test files that one related file fits the quarter bound. */
  const WITH_LISTS: Record<string, string> = {
    'tests/the-test-lists.ts': "if (process.argv[2] === 'whole-tree') console.log('tests/one.test.ts')\n",
    'src/thing.ts': 'export const answer = 1\n',
    'tests/thing.test.ts': "import { expect, it } from 'vitest'\nimport { answer } from '../src/thing.ts'\nit('answers', () => { expect(answer).toBe(1) })\n",
    ...Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`tests/plain-${String(i + 1)}.test.ts`, PASSING_TEST])),
  }
  const breaksTheThing = (dir: string) => write(dir, { 'src/thing.ts': 'export const answer = 2\n' })
  const suitesOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).some((word) => word.startsWith('--maxWorkers=')))
  const testFile = (word: string) => word.slice(word.lastIndexOf('/tests/') + 1)
  const filesNamed = (call: Record<string, any>) => (call['command'] as string[]).filter((word, i, all) => word.endsWith('.test.ts') && all[i - 1] !== '--exclude').map(testFile)
  const leftOutOf = (call: Record<string, any>) => (call['command'] as string[]).filter((_, i, all) => all[i - 1] === '--exclude').map(testFile).sort()
  const filesIn = (report: string) => (JSON.parse(readFileSync(report, 'utf8')).testResults as { name: string }[]).map((one) => testFile(one.name)).sort()
  async function relatedTestsFirst(on: boolean | null): Promise<void> {
    const r = await app.inject({ method: 'POST', url: '/api/office/related-tests-first', headers: asPerson, payload: { on } })
    expect(r.statusCode, r.body).toBe(200)
    expect(r.json().on).toBe(on === true)
  }
  // THE SETTING IS GIVEN BACK TO NOBODY'S CHOICE, so the cases after this block run as the office does by default.
  afterAll(async () => {
    await relatedTestsFirst(null)
  })

  async function submitAs(headers: Record<string, string>, main: string, name: string, edit: (dir: string) => void, suiteWorkers?: unknown) {
    const run = await sealedRun(workerClone(main, name, edit))
    return app.inject({
      method: 'POST',
      url: '/api/merge-queue',
      headers,
      payload: { run, changeset: { adapter: 'git', repository: repositoryOf.get(main)!, branch: 'work' }, ...(suiteWorkers === undefined ? {} : { suiteWorkers }) },
    })
  }
  async function judged(entry: string): Promise<void> {
    expect((await runTheTool(entry)).code).toBe(0)
    await released(entry)
  }
  async function submittedByThePerson(main: string, name: string, edit: (dir: string) => void, suiteWorkers: number): Promise<string> {
    const r = await submitAs(asPerson, main, name, edit, suiteWorkers)
    expect(r.statusCode, r.body).toBe(201)
    return String(r.json().entry.id)
  }

  it('takes a count only from the person or the secretary, within its bounds, and keeps who named it', async () => {
    const main = mainCheckout('own-workers-doors')
    const byTheWorker = await submitAs(asWorker, main, 'own-workers-worker', (dir) => write(dir, { 'src/w.txt': 'w\n' }), 12)
    expect(byTheWorker.statusCode, byTheWorker.body).toBe(403)
    expect(byTheWorker.body).toContain('Only the person or the agent holding the secretary card may name')
    for (const count of [MERGE_WORKERS_BOUNDS.most + 1, 0, 1.5, '12']) {
      const wrong = await submitAs(asPerson, main, `own-workers-${String(count)}`, (dir) => write(dir, { 'src/w.txt': 'w\n' }), count)
      expect(wrong.statusCode, `${String(count)}: ${wrong.body}`).toBe(400)
    }
    const entry = await submittedByThePerson(main, 'own-workers-person', (dir) => write(dir, { 'src/w.txt': 'w\n' }), 12)
    expect(readingOf(entry)['suiteWorkers']).toEqual({ count: 12, by: { kind: 'person', id: THE_TEST_OFFICES_OWNER.id } })
  }, 300_000)

  it('runs such an entry alone at its count, says so, and never takes it on a bus as lead or rider', async () => {
    const main = mainCheckout('own-workers-runs')
    // As the lead: it names its count, and an ordinary entry waits judged behind it.
    const lead = await submittedByThePerson(main, 'own-workers-lead', (dir) => write(dir, { 'src/lead.txt': 'lead\n' }), 12)
    const after = await submitGit(main, 'own-workers-after', (dir) => write(dir, { 'src/after.txt': 'after\n' }))
    for (const one of [lead, after.entry]) await judged(one)
    const first = await runTheTool(lead)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stateOf(lead)).toBe('merged')
    expect(suitesOf(lead).flatMap((one) => (one['command'] as string[]).filter((word) => word.startsWith('--maxWorkers=')))).toEqual(['--maxWorkers=12'])
    expect(factsOf(first, 'tested')!['testedWith']).toBeUndefined()
    expect(factsOf(first, 'tested')!['says']).toContain(`Merge entry ${lead} names its own 12 suite workers`)
    expect(readFileSync(first.log, 'utf8')).toContain('this entry names its own 12 suite workers, so it is tested alone')
    expect((await runTheTool(after.entry)).code).toBe(0)
    expect(stateOf(after.entry)).toBe('merged')
    // As a rider: an ordinary entry leads, and the one that names its count waits judged behind it.
    const plain = await submitGit(main, 'own-workers-plain', (dir) => write(dir, { 'src/plain.txt': 'plain\n' }))
    const rider = await submittedByThePerson(main, 'own-workers-rider', (dir) => write(dir, { 'src/rider.txt': 'rider\n' }), 12)
    for (const one of [plain.entry, rider]) await judged(one)
    const ordinary = await runTheTool(plain.entry)
    expect(ordinary.code, ordinary.err + ordinary.out).toBe(0)
    expect(factsOf(ordinary, 'tested')!['testedWith']).toBeUndefined()
    expect(suitesOf(plain.entry).flatMap((one) => (one['command'] as string[]).filter((word) => word.startsWith('--maxWorkers=')))).toEqual([`--maxWorkers=${SUITE_WORKERS}`])
    expect(readFileSync(ordinary.log, 'utf8')).toContain(`${rider} names its own 12 suite workers, so it is tested alone`)
    expect((await runTheTool(rider)).code).toBe(0)
    expect(stateOf(rider)).toBe('merged')
    expect(suitesOf(rider)).toHaveLength(1)
  }, 600_000)

  it('runs only the whole suite while nobody has switched the related tests first on', async () => {
    const main = mainCheckout('related-off', WITH_LISTS)
    const { entry } = await submitGit(main, 'related-off', breaksTheThing)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    // THE CONTROL: the same change bounces at once on its related tests in the case below, with the setting on.
    expect(stateOf(entry)).toBe('bounced')
    expect(suitesOf(entry).map(filesNamed), 'only the whole suite ran').toEqual([[]])
    expect(leftOutOf(suitesOf(entry)[0]!)).toEqual([])
    expect(readFileSync(done.log, 'utf8')).toContain("the related tests are not run first, because the office's setting is off: Off: nobody has switched it on.")
    expect(detailOf(entry, 'tested')['ran']['related']).toMatchObject({ off: true })
  }, 300_000)

  it('bounces an entry at once on a related test that fails alone and not on main, without the whole suite', async () => {
    await relatedTestsFirst(true)
    const main = mainCheckout('related-red', WITH_LISTS)
    const { entry } = await submitGit(main, 'related-red', breaksTheThing)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(entry)).toBe('bounced')
    const suites = suitesOf(entry)
    expect(suites, 'only the related tests ran').toHaveLength(1)
    expect(filesNamed(suites[0]!).sort()).toEqual(['tests/one.test.ts', 'tests/thing.test.ts'])
    const tested = factsOf(done, 'tested')!
    expect(tested['green']).toBe(false)
    expect(tested['redTests']).toEqual(['tests/thing.test.ts'])
    expect(tested['says']).toContain('So the whole suite was not run for it (the related-tests rule)')
  }, 300_000)

  // Class one is observed from main, while the default office setting keeps the ordinary red bounce.
  // The merge queue runs this case; workers leave this file unrun.
  it('names plain H red from main and expects class one while the default block bounces it', async () => {
    await relatedTestsFirst(true)
    const main = mainCheckout('plain-house-rule-red', {
      ...WITH_LISTS,
      'tests/house-rules.mjs': "export const HOUSE_RULES = {\n  'tests/thing.test.ts': { class: 'H', kind: 'wording' },\n}\n",
    })
    const { entry } = await submitGit(main, 'plain-house-rule-red', breaksTheThing)
    await judged(entry)
    const done = await runTheTool(entry)
    expect(done.code, done.err + done.out).toBe(0)
    expect(stateOf(entry)).toBe('bounced')
    expect(readingOf(entry).machine['bounced']).toMatchObject({ reason: 'red', redTests: ['tests/thing.test.ts'] })
    const facts = factsOf(done, 'tested')!
    expect(facts['green']).toBe(false)
    expect(facts['houseRules']).toMatchObject({ mainAt: git(main, 'rev-parse', 'HEAD'), list: { state: 'read' }, class: 1, files: [{ file: 'tests/thing.test.ts', class: 'H', kind: 'wording' }] })
    expect((facts['houseRules'] as { files: Record<string, unknown>[] }).files[0]).not.toHaveProperty('mark')
    expect(readFileSync(done.log, 'utf8')).toContain('HOUSE-RULES: tests/thing.test.ts: class H, no mark; expects class 1. The office decides by its own setting.')
  }, 300_000)

  // Workers leave this end-to-end case unrun; the supervisor and queue run it.
  it('expects a few feature reds as class two and bounces at the default block', async () => {
    await relatedTestsFirst(true)
    const main = mainCheckout('few-feature-reds', { ...WITH_LISTS, 'tests/house-rules.mjs': 'export const HOUSE_RULES = {\n}\n' })
    const { entry } = await submitGit(main, 'few-feature-reds', breaksTheThing)
    const { agentByHandle } = await import('../src/server/lib/participants.ts')
    const { theAgentOfARun } = await import('../src/server/lib/inspection.ts')
    const run = t.api.getRecord(readingOf(entry).run)!
    const author = theAgentOfARun(run)!
    const started = await app.inject({ method: 'POST', url: '/api/agents/started', headers: asPerson,
      payload: { handle: randomUUID(), name: 'A synthetic round starter', role: 'supervisor', workArea: ['tests'] } })
    expect(started.statusCode, started.body).toBe(201)
    const starter = agentByHandle(started.json().agent.handle)!
    const round = t.api.createRecord({ kind: 'session', title: 'A synthetic live round', workspaceId: 'default', actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id }, data: { state: 'running', servingAgentId: starter.id } }).id
    const { registerResource } = await import('../src/server/lib/resources.ts')
    registerResource({ workspaceId: 'default', sessionRecordId: round, type: 'process', key: String(process.pid), actor: { type: 'human', id: THE_TEST_OFFICES_OWNER.id } })
    t.client.sqlite.prepare("UPDATE agents SET started_by_kind = 'agent', started_by_id = ? WHERE id = ?").run(starter.id, author.id)
    try {
      await judged(entry)
      const done = await runTheTool(entry)
      expect(done.code, done.err + done.out).toBe(0)
      expect(stateOf(entry)).toBe('bounced')
      expect(readingOf(entry).machine.bounced).toMatchObject({ reason: 'red', redTests: ['tests/thing.test.ts'] })
      expect(readingOf(entry).machine.bounced.says).toContain('1 feature test file is red; this is class 2. MOLE_OFFICE_GATE_FEW_FEATURE_REDS is at block.')
      expect(factsOf(done, 'tested')).toMatchObject({ green: false, build: { passed: true } })
      expect(readFileSync(done.log, 'utf8')).toContain('MERGE-CLASS: feature files (1): tests/thing.test.ts; build passed; database paths: none; expects class 2 if the office allows the count and its line has a round open. The office decides by its own settings.')
    } finally {
      t.client.sqlite.prepare('UPDATE agents SET started_by_kind = ?, started_by_id = ? WHERE id = ?').run(author.startedBy?.kind ?? null, author.startedBy?.id ?? null, author.id)
      t.api.patchRecord(round, { dataPatch: { state: 'crashed' } }, { type: 'human', id: THE_TEST_OFFICES_OWNER.id })
    }
  }, 300_000)

  // Workers run only this case, alone; the merge queue runs the rest.
  it('lands a class-three entry at remind and files one problem for the build sheriff', async () => {
    const savedWide = process.env.MOLE_OFFICE_GATE_WIDE_RED, savedFew = process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS
    process.env.MOLE_OFFICE_GATE_WIDE_RED = 'remind'; process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = 'remind'
    try {
      await relatedTestsFirst(true)
      const main = mainCheckout('wide-red', { ...WITH_LISTS, 'tests/house-rules.mjs': 'export const HOUSE_RULES = {\n}\n' })
      const { entry, worker } = await submitGit(main, 'wide-red', breaksTheThing)
      const submittedCommit = git(worker, 'rev-parse', 'HEAD')
      const title = t.api.getRecord(entry)!.title
      await judged(entry)
      const done = await runTheTool(entry)
      expect(done.code, done.err + done.out).toBe(0); expect(stateOf(entry)).toBe('merged')
      expect(git(main, 'rev-parse', 'HEAD')).toBe(readingOf(entry).machine.integrated.mainAfter)
      // One landing commit on the main it was tested on, naming the submitted commit, which the entry's own ref keeps.
      expect(retainedLandings((args: string[]) => git(main, ...args), 'HEAD')).toEqual([
        expect.objectContaining({ entry, tip: submittedCommit, landed: readingOf(entry).machine.integrated.mainAfter, parent: readingOf(entry).machine.integrated.mainBefore }),
      ])
      expect(git(main, 'rev-parse', `${LANDED_KEEP_PREFIX}${entry}`)).toBe(submittedCommit)
      expect(readingOf(entry).machine.tested.mergeClass).toMatchObject({ class: 3, cause: 8 })
      const filed = t.api.listRecords({ workspaceId: 'default', kind: 'problem' }).filter(p => p.title === `Landed with a wide red: ${title}`)
      expect(filed).toHaveLength(1); expect(filed[0]!.data.seen_in).toEqual(['tests/thing.test.ts'])
    } finally {
      if (savedWide === undefined) delete process.env.MOLE_OFFICE_GATE_WIDE_RED; else process.env.MOLE_OFFICE_GATE_WIDE_RED = savedWide
      if (savedFew === undefined) delete process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS; else process.env.MOLE_OFFICE_GATE_FEW_FEATURE_REDS = savedFew
    }
  }, 300_000)

  // The problem is synthetic and filed by this test. Only the supervisor and queue run this case.
  it('takes an overdue hand-back out through an office-filed run and lands green without a check', async () => {
    // The take-back runs its file on main in a test-batches seat, and this test's office gives no new seat while this
    // machine's load or its free space is past that pool's limits. Both are set past anything this machine reaches, as in
    // tests/a-late-hand-back-is-taken-back-with-nobody-pressing.test.ts, so a busy machine does not hold the take-back.
    const savedLoad = process.env.MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT, savedFree = process.env.MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT
    process.env.MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT = '1000'; process.env.MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT = '1'
    try {
      const main = mainCheckout('overdue-hand-back', { ...WITH_LISTS })
      const { entry } = await submitGit(main, 'overdue-hand-back', dir => write(dir, { 'work/take-back.txt': 'synthetic landed content\n' }))
      await judged(entry)
      const landed = await runTheTool(entry); expect(landed.code, landed.err + landed.out).toBe(0); expect(stateOf(entry)).toBe('merged')
      const original = t.api.getRecord(entry)!, integrated = original.data.integrated as { mainBefore: string; mainAfter: string }
      const commits = git(main, 'rev-list', '--reverse', `${integrated.mainBefore}..${integrated.mainAfter}`).split('\n')
      const paths = git(main, 'diff-tree', '-r', '--no-renames', '--name-only', integrated.mainBefore, integrated.mainAfter).split('\n')
      // A take-back is filed only while a handed-back file is still red on main. Main moves on, on no path the landing
      // changed, with a test that is red while the landed file is there; the take-back is what makes it green.
      const STILL_RED = `import { existsSync } from 'node:fs'
  import { expect, it } from 'vitest'
  // SYNTHETIC: red while the landed file is on main.
  it('is red while the landed file is there', () => { expect(existsSync('work/take-back.txt')).toBe(false) })
  `
      write(main, { 'tests/take-back.test.ts': STILL_RED })
      execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: main })
      git(main, 'add', '-A')
      git(main, 'commit', '-q', '-m', 'Main carries a test that is red while the landed file is there')
      const mainNow = git(main, 'rev-parse', 'HEAD')
      const { THE_OFFICE, theAgentOfARun } = await import('../src/server/lib/inspection.ts')
      const { handBackFacts } = await import('../src/shared/merge-class.ts')
      const agent = theAgentOfARun(t.api.getRecord(readingOf(entry).run)!)!, clock = clockStamp()
      const facts = handBackFacts.parse({ entry, repository: main, files: ['tests/take-back.test.ts'], commits,
        line: { agent: agent.id, starter: agent.startedBy?.id ?? agent.id, run: readingOf(entry).run },
        hours: 1, landedAt: clock.stamp, deadline: stampInZone(Date.now() - 3_600_000, clock.timeZone), timeZone: clock.timeZone })
      const problem = t.api.createRecord({ kind: 'problem', title: `Handed back: merge entry ${entry}`, workspaceId: 'default', actor: THE_OFFICE,
        data: { state: 'open', whose_move: 'agent', symptom: 'Synthetic overdue hand-back for this end-to-end case.', seen_in: facts.files, found_by: 'synthetic test', extra: { redOnMainFamily: true, handBack: facts } } })
      const before = new Set(t.api.listRecords({ workspaceId: 'default', kind: 'merge_entry' }).map(r => r.id))
      const made = await runTheTakeBack(problem.id); expect(made.code, made.err + made.out).toBe(0)
      const entries = t.api.listRecords({ workspaceId: 'default', kind: 'merge_entry' }).filter(r => !before.has(r.id)); expect(entries).toHaveLength(1)
      const taken = entries[0]!, run = t.api.getRecord(String(taken.data.run))!, commit = (taken.data.changeset as { commit: string }).commit
      expect(made.out).toContain(`TAKE-BACK: problem ${problem.id}; entry ${entry}; commits ${commits.join(', ')}; paths ${paths.join(', ')}; main ${mainNow}; tests/take-back.test.ts: red; office accepted entry ${taken.id}, run ${run.id}, commit ${commit}.`)
      expect((t.api.getRecord(problem.id)!.data.extra as { takeBack: { stillRed: unknown } }).takeBack.stillRed).toMatchObject({ mainAt: mainNow, files: [{ file: 'tests/take-back.test.ts', result: 'red' }] })
      expect(taken.data.fixRound).toEqual({ problem: problem.id, kind: 'takeout', reason: 'not fixed in time' })
      expect(taken.title).toBe(`Taken back: ${original.title}, not fixed in 1 hour`)
      expect(run.data).toMatchObject({ servingAgentId: agent.id, needsNoCheck: { rule: 'a-take-back-returns-main-to-a-checked-state' } })
      const done = await runTheTool(taken.id); expect(done.code, done.err + done.out).toBe(0); expect(stateOf(taken.id)).toBe('merged')
      const receipt = t.api.getRecord(taken.id)!.data.integrated as { mainAfter: string }
      expect(t.api.getRecord(problem.id)!.data).toMatchObject({ state: 'fixed', fix: `Taken back by merge entry ${taken.id}, landed commit ${receipt.mainAfter}.` })
      for (const path of paths) expect(git(main, 'ls-tree', 'HEAD', '--', path)).toBe(git(main, 'ls-tree', integrated.mainBefore, '--', path))
    } finally {
      if (savedLoad === undefined) delete process.env.MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT; else process.env.MOLE_OFFICE_TEST_BATCH_LOAD_LIMIT = savedLoad
      if (savedFree === undefined) delete process.env.MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT; else process.env.MOLE_OFFICE_TEST_BATCH_FREE_GB_LIMIT = savedFree
    }
  }, 300_000)

  it('goes on to the whole suite when the related tests are green, and when the list is refused', async () => {
    await relatedTestsFirst(true)
    // This main carries the recorder of what tests read, and the related test reads a note by a name built as it runs.
    const listed = mainCheckout('related-green', {
      ...WITH_LISTS,
      'tools/record-what-tests-read.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read.mjs'), 'utf8'),
      'tools/record-what-tests-read-hooks.mjs': readFileSync(join(REPO, 'tools', 'record-what-tests-read-hooks.mjs'), 'utf8'),
      'notes/read-by-the-related-tests.md': 'text\n',
    })
    const READS_A_NOTE = `import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { answer } from '../src/thing.ts'
it('answers', () => {
  expect(answer).toBe(2)
  expect(readFileSync(join('notes', ['read', 'by', 'the', 'related', 'tests'].join('-') + '.md'), 'utf8')).toContain('text')
})
`
    const green = await submitGit(listed, 'related-green', (dir) => write(dir, { 'src/thing.ts': 'export const answer = 2\n', 'tests/thing.test.ts': READS_A_NOTE }))
    await judged(green.entry)
    const landed = await runTheTool(green.entry)
    expect(landed.code, landed.err + landed.out).toBe(0)
    expect(stateOf(green.entry)).toBe('merged')
    const [related, whole] = suitesOf(green.entry)
    expect(suitesOf(green.entry).map(filesNamed)).toEqual([['tests/one.test.ts', 'tests/thing.test.ts'], []])
    // The two files the related tests passed are not run again, and are counted once, from that run (round 17b).
    expect(leftOutOf(whole!)).toEqual(['tests/one.test.ts', 'tests/thing.test.ts'])
    expect(leftOutOf(related!)).toEqual([])
    const suite = detailOf(green.entry, 'tested')['ran']['test']
    expect(filesIn(suite.report)).toEqual(Array.from({ length: 10 }, (_, i) => `tests/plain-${String(i + 1)}.test.ts`).sort())
    expect(suite.carried).toMatchObject({ files: 2, tests: 2, passed: 2, log: detailOf(green.entry, 'tested')['ran']['related']['log'] })
    const tested = factsOf(landed, 'tested')!
    expect([tested['ran'], tested['passed']], 'every one of the 12 test files counted once').toEqual([12, 12])
    expect(tested['says']).toContain('12 files passed')
    expect(tested['says']).toContain('2 test files, with 2 tests, passed in the related tests just before, on the same tree, and were not run again')
    // What the carried file read is in main's record of what the suite read, though it did not run in the whole suite.
    const kept = JSON.parse(readFileSync(join(base, 'work', 'reads', `${git(listed, 'rev-parse', 'HEAD^{tree}')}.json`), 'utf8')) as { files: string[] }
    expect(kept.files).toContain('notes/read-by-the-related-tests.md')
    // A main with no list script: run-named-tests refuses the list, and only the whole suite runs, as before.
    const unlisted = mainCheckout('related-refused')
    const refused = await submitGit(unlisted, 'related-refused', (dir) => write(dir, { 'src/refused.txt': 'refused\n' }))
    await judged(refused.entry)
    const run = await runTheTool(refused.entry)
    expect(run.code, run.err + run.out).toBe(0)
    expect(stateOf(refused.entry)).toBe('merged')
    expect(suitesOf(refused.entry).map(filesNamed)).toEqual([[]])
    expect(readFileSync(run.log, 'utf8')).toContain('the related tests are not run first: run-named-tests refused it')
  }, 600_000)

  it('on a bus, leaves the lead alone when a related red belongs to the rider, and only the rider bounces', async () => {
    await relatedTestsFirst(true)
    const main = mainCheckout('related-rider', WITH_LISTS)
    const lead = await submitGit(main, 'related-rider-lead', (dir) => write(dir, { 'src/lead.txt': 'lead\n' }))
    const rider = await submitGit(main, 'related-rider-breaker', breaksTheThing)
    for (const one of [lead, rider]) await judged(one.entry)
    const first = await runTheTool(lead.entry)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stateOf(lead.entry)).toBe('merged')
    // The related red is the rider's, so the bus runs its whole suite. The file red in the related tests runs in it again,
    // and the one they passed is carried.
    const [related, whole] = suitesOf(lead.entry)
    expect(filesNamed(related!).sort()).toEqual(['tests/one.test.ts', 'tests/thing.test.ts'])
    expect(leftOutOf(whole!)).toEqual(['tests/one.test.ts'])
    expect(readFileSync(first.log, 'utf8')).toContain('the files still red in the related tests on the bus\'s tree are not this entry\'s')
    const tested = factsOf(first, 'tested')!
    expect(tested['green']).toBe(true)
    expect(tested['testedWith']).toMatchObject({ entry: rider.entry })
    const second = await runTheTool(rider.entry)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stateOf(rider.entry)).toBe('bounced')
    expect(factsOf(second, 'tested')!['redTests']).toEqual(['tests/thing.test.ts'])
  }, 600_000)

})

// ============================================================================ 7b. two entries, one suite (item 4)

describe("two judged entries of one lane, tested in one suite (the coordinator's item 4)", () => {
  // THE APPROVED DESIGN (messages jzDRLhSIXc4C and VnYjaMjoYJxK): the two take the lane one after the other, and
  // only the suite is shared. The second borrows the result only by the same tree, and the office checks that against
  // the first's facts.
  // MUTATION PROOF, 23 September 2026, each alone in tools/the-merger.mjs: never pairing (aPairFor answering none), and
  // the green case goes red on its one shared suite; never borrowing (aResultToBorrow answering null), and the green
  // case goes red where the second runs its own suite; the red files run alone only on main plus the first, and the
  // red-on-both case goes red; the second's result said on the pair's tree when the first bounces, and the red-on-both
  // case goes red where the second finds that tree is not its own and runs its own suite.
  const RED = `import { expect, it } from 'vitest'
it('is red', () => { expect(1).toBe(2) })
`
  const suiteCallsOf = (entry: string) => sandboxCallsOf(entry).filter((one) => one['verb'] === 'exec' && (one['command'] as string[]).includes(`--maxWorkers=${SUITE_WORKERS}`))
  async function twoJudged(main: string, a: [string, (dir: string) => void], b: [string, (dir: string) => void]): Promise<{ A: string; B: string }> {
    const first = await submitGit(main, a[0], a[1])
    const second = await submitGit(main, b[0], b[1])
    for (const one of [first, second]) {
      expect((await runTheTool(one.entry)).code).toBe(0)
      await released(one.entry)
    }
    return { A: first.entry, B: second.entry }
  }

  it('lands the first and lets the second borrow the green, on the tree landing both makes, with one suite', async () => {
    const main = mainCheckout('pair-green')
    const { A, B } = await twoJudged(main, ['pair-green-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })], ['pair-green-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n', 'tests/from-b.test.ts': PASSING_TEST })])
    const first = await runTheTool(A)
    expect(first.code, first.err + first.out).toBe(0)
    expect(stepsOf(first)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    const tested = factsOf(first, 'tested')!
    expect(tested['green']).toBe(true)
    const tree = String(tested['testedWith']['tree'])
    expect(tested['testedWith']).toMatchObject({ entry: B, forTheOther: { tree, green: true } })
    expect(tested['says']).toContain(`run once for this entry and merge entry ${B} together`)
    expect(suiteCallsOf(A).map((one) => one['cwd'])).toEqual([join(sandboxFolderOf(A), 'work', 'pair')])
    expect(stateOf(A)).toBe('merged')

    const second = await runTheTool(B)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated', 'tested', 'landing', 'landed'])
    expect(factsOf(second, 'tested')).toMatchObject({ green: true, borrowedFrom: { entry: A, tree } })
    expect(suiteCallsOf(B), 'the second entry ran no suite').toEqual([])
    expect(git(main, 'rev-parse', 'HEAD^{tree}')).toBe(tree)
    expect(stateOf(B)).toBe('merged')
  }, 300_000)

  it('lands the first on a collision, and the second, which breaks the file by landing after it, borrows that red', async () => {
    // WAVE 13p ROUND 19: a bus finds the entry whose landing turns a file red, in landing order. A file red only with both
    // is red once the second lands after the first, so it is the second's, told on its own tree; it used to run its own
    // suite to find the same.
    const main = mainCheckout('pair-collision')
    const COLLIDE = `import { existsSync } from 'node:fs'
import { expect, it } from 'vitest'
// SYNTHETIC: red only when both entries' files are there.
it('is red only with both', () => { expect(existsSync('src/from-a.txt') && existsSync('src/from-b.txt')).toBe(false) })
`
    write(main, { 'tests/collide.test.ts': COLLIDE })
    execFileSync(process.execPath, ['tools/audit.mjs'], { cwd: main })
    git(main, 'add', '-A')
    git(main, 'commit', '-q', '-m', 'Main carries a test the two entries collide in')
    const { A, B } = await twoJudged(main, ['pair-collision-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })], ['pair-collision-b', (dir) => write(dir, { 'src/from-b.txt': 'b\n' })])
    const first = await runTheTool(A)
    expect(first.code, first.err + first.out).toBe(0)
    const tested = factsOf(first, 'tested')!
    const tree = String(tested['testedWith']['tree'])
    expect(tested).toMatchObject({ green: true, testedWith: { entry: B, forTheOther: { tree, green: false, redTests: ['tests/collide.test.ts'] } } })
    expect(tested['testedWith']['collision']).toBeUndefined()
    expect(stateOf(A)).toBe('merged')

    const second = await runTheTool(B)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated', 'tested'])
    const own = factsOf(second, 'tested')!
    expect(own).toMatchObject({ green: false, redTests: ['tests/collide.test.ts'], borrowedFrom: { entry: A, tree } })
    expect(own['says']).toContain(`red on main plus ${A} and this entry`)
    expect(suiteCallsOf(B), 'the second entry ran no suite').toEqual([])
    expect(stateOf(B)).toBe('bounced')
  }, 300_000)

  it('bounces both when each is red on main plus it alone, and the second is told the file was red on main plus it alone', async () => {
    const main = mainCheckout('pair-both-red')
    const { A, B } = await twoJudged(main, ['pair-both-red-a', (dir) => write(dir, { 'tests/a-red.test.ts': RED })], ['pair-both-red-b', (dir) => write(dir, { 'tests/b-red.test.ts': RED })])
    const first = await runTheTool(A)
    expect(first.code, first.err + first.out).toBe(0)
    const tested = factsOf(first, 'tested')!
    expect(tested).toMatchObject({ green: false, redTests: ['tests/a-red.test.ts'], testedWith: { entry: B, forTheOther: { green: false, redTests: ['tests/b-red.test.ts'] } } })
    const onMainPlusB = String(tested['testedWith']['forTheOther']['tree'])
    expect(onMainPlusB).not.toBe(tested['testedWith']['tree'])
    expect(stateOf(A)).toBe('bounced')

    // THE SENTENCE (message VnYjaMjoYJxK): the second is told the file was red on main plus it alone, so its author
    // is not left to think the first caused it.
    const second = await runTheTool(B)
    expect(second.code, second.err + second.out).toBe(0)
    expect(stepsOf(second)).toEqual(['integrating', 'integrated', 'tested'])
    expect(factsOf(second, 'tested')).toMatchObject({ green: false, redTests: ['tests/b-red.test.ts'], borrowedFrom: { entry: A, tree: onMainPlusB } })
    expect(suiteCallsOf(B)).toEqual([])
    const bounced = readingOf(B)['machine']['bounced']
    expect(bounced['says']).toContain('tests/b-red.test.ts is red on main plus this entry alone')
    expect(bounced['says']).toContain(`not merge entry ${A}'s`)
  }, 300_000)

  // 13u ROUND 66: the other would ride if the office ran from outside the lane, as the bus's cases show.
  it('tests the first alone when the other changes the queue\'s own code and the office runs from the lane', async () => {
    const queueCode = mainCheckout('pair-queue-code')
    const { A: C, B: D } = await twoJudged(queueCode, ['pair-queue-code-a', (dir) => write(dir, { 'src/from-a.txt': 'a\n' })], ['pair-queue-code-b', (dir) => write(dir, { 'tools/the-merger.mjs': '// synthetic\n' })])
    theProxySaysTheOfficeRunsFrom(queueCode)
    try {
      const third = await runTheTool(C)
      expect(third.code, third.err + third.out).toBe(0)
      expect(factsOf(third, 'tested')!['testedWith']).toBeUndefined()
      expect(readFileSync(third.log, 'utf8')).toContain(`${D} changes the queue's own code, and the office runs from ${queueCode}, which a landing on `)
    } finally {
      theProxySaysTheOfficeRunsFrom(null)
    }
  }, 300_000)
})
