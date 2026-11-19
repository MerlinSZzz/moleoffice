// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE CLEAN COPY A SUPERVISOR RESOLVES A CONFLICT IN. It is tier 2, round B, part 3 of the owner's decision, with
 * wqd6E-wVJHSr and xqGNR20SQ9vO. tools/merge-tool/resolve-a-conflict.mjs makes a new git
 * repository in a folder of the supervisor's own, fetches the entry's pinned commit and the main the conflict met, and
 * replays the one onto the other with the queue's own joins (tools/merge-tool/the-joins.mjs), as the queue's rebase
 * did. It works in its own folder and not in the merge tool's clone, because that clone is the queue's: the merge
 * tool's check of the resolution replays in it again, and a supervisor writing there would change what the check reads.
 *
 * WHAT THIS FILE PROVES:
 * 1. The replay stops where the queue's stopped. Each path git left in conflict is written as the three-way merge of its
 *    three sides, with the ancestor's lines between main's and the entry's (tools/merge-tool/conflicted-file.mjs), even
 *    where the list-join driver refused and git left main's side with no markers at all. A file the joins join is not
 *    left in conflict.
 * 2. It refuses a first stop on a path the conflict step did not name, a replay that does not stop, a pinned ref that points at
 *    another commit, and a folder that is not empty. Each refusal exits 1 and says why. Continuing a copy whose first stop
 *    it refused is refused in one sentence, because no stop is recorded.
 * 3. It continues only when every place is resolved and added, and ends at the resolution: the same number of commits,
 *    with the same messages, on the main the conflict met, and the hand-over to send.
 * 4. A later commit can stop on three further files the queue did not name. Each gets its three-way text, all the
 *    resolved paths' related tests are named, and one final hand-over covers both stops without starting another hour.
 * 5. A stop about a whole file says its kind, and each kind is met as the decision on conflicts says (wave 13u
 *    round 131, item 51 (b)). The same file renamed differently on each side keeps main's name: the copy removes the
 *    other two names and writes main's file as the three-way merge of the three files, and the replay ends with that
 *    one file. Where the two sides' changes do not meet, that merge has no place, and the file is added as it stands.
 *    A file deleted on one side and changed on the other is refused, with the cannot to send, which names the
 *    file and the side. A file renamed on one side and changed on the other, and a file added on both sides, are
 *    conflicts of lines in one file.
 * 6. Where the stop renamed a migration's SQL file differently on each side, main numbers that migration otherwise than
 *    the entry does. A file git merged with no conflict at that stop then follows the queue's renumbering, and nothing
 *    else in it changes (wave 13u round 132, item 51). In each such file the copy gives the lines the entry wrote main's
 *    number in place of the entry's, by the rule the merge tool's renumber at integration follows (withTheNewNumbers),
 *    adds the file and says so. A line main already holds keeps its number. A line that rule cannot read is refused,
 *    with the cannot to send.
 *
 * MUTATION PROOF (control, mutation, restore; the commit message of the code records the runs). Each goes red where named:
 *   - the unnamed-path refusal is taken out: case 2's first refusal;
 *   - the conflicted text is not written, so git's own file stands: cases 1 and 3;
 *   - the clone is not given the joins: cases 1 and 3, where the list file stays in conflict;
 *   - the refusal of a replay that does not stop is taken out: case 2's second refusal;
 *   - the pinned ref is not compared with the commit: case 2's third refusal;
 *   - a file added with a marker line is continued: case 3;
 *   - the refusal of a continue with no recorded stop is taken out: case 2's continue after the first refusal;
 *   - the kind's words are left out of what the copy prints: every case of item 5 but the refusal;
 *   - a whole-file stop is written path by path from the index, as before: item 5's renamed file is refused;
 *   - the deletion's refusal keeps its old words: item 5's refusal;
 *   - a file with no place is listed by its places, as one that has some: item 5's rename whose changes do not meet;
 *   - the copy leaves a file git merged with no conflict as git merged it: item 6's first case;
 *   - main's lines are renumbered too: item 6's first case;
 *   - a line the rule cannot read is left as it is and the rest renumbered: item 6's refusal.
 *
 * Every fixture is synthetic and says so: the git trees are made under the temporary directory, outside every checkout,
 * and removed after. Nothing reaches an office.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { BASE, CLOSE, OPEN, SPLIT } from '../tools/merge-tool/list-join.mjs'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const TOOL = join(REPO, 'tools/merge-tool/resolve-a-conflict.mjs')
const made: string[] = []
afterAll(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }) })

const ENTRY = 'synthEntry01'
const REF = `refs/mole-office/queue/${ENTRY}`
const CODE = 'src/synthetic.ts'
const LIST = 'src/shared/ops-list.ts'
const OTHER = 'work/other.txt'
const FURTHER = ['src/further-b.ts', 'src/further-c.ts', 'src/further-d.ts']
const IDENTITY = { GIT_AUTHOR_NAME: 'Synthetic clean copy', GIT_AUTHOR_EMAIL: 'fixture@example.invalid', GIT_COMMITTER_NAME: 'Synthetic clean copy', GIT_COMMITTER_EMAIL: 'fixture@example.invalid' }

function scratch(prefix: string) {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), `clean-copy-${prefix}-`)))
  made.push(dir)
  return dir
}
function git(dir: string, ...args: string[]) {
  const ran = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY, HOME: dir } })
  if (ran.status !== 0) throw Error(`git ${args.join(' ')}: ${ran.stderr}`)
  return ran.stdout.trim()
}
function write(dir: string, path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true })
  writeFileSync(join(dir, path), text)
}
const code = (line: string) => `// A synthetic code file.\nexport const FIRST = 1\nexport const SAID = '${line}'\nexport const LAST = 2\n`
const list = (...names: string[]) => `export const SYNTHETIC_OPS = [\n${names.map((name) => `  '${name}',\n`).join('')}] as const\n`

/**
 * A SYNTHETIC REPOSITORY: an ancestor, main's commit that changes the code file's line and adds a name to the list, and
 * the entry's two commits, the first of which changes the same line and adds another name at the same place. The entry
 * is pinned at its ref, as the queue pins it.
 */
function aRepository(laterStop = false) {
  const root = scratch('root')
  git(root, 'init', '-q', '-b', 'main')
  write(root, CODE, code('the ancestor')); write(root, LIST, list('a', 'b')); write(root, OTHER, 'one\n')
  if (laterStop) for (const path of FURTHER) write(root, path, code('the ancestor'))
  if (laterStop) {
    for (const [n, path] of [CODE, ...FURTHER].entries()) {
      write(root, `tests/resolved-${String(n)}.test.ts`, `import { SAID } from '../${path}'\nvoid SAID\n`)
    }
  }
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  write(root, CODE, code('the entry')); write(root, LIST, list('a', 'b', 'fromTheEntry'))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its line and its name')
  write(root, OTHER, 'one\ntwo\n'); git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic entry: a second commit')
  if (laterStop) {
    for (const path of FURTHER) write(root, path, code('the entry'))
    git(root, 'add', '.'); git(root, 'commit', '-q', '--amend', '--no-edit')
  }
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  write(root, CODE, code('main')); write(root, LIST, list('a', 'b', 'fromMain'))
  if (laterStop) for (const path of FURTHER) write(root, path, code('main'))
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic main')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', REF, commit)
  return { root, ancestor, commit, mainAt }
}

function tool(...args: string[]) {
  const ran = spawnSync(process.execPath, [TOOL, ...args], { encoding: 'utf8', env: { ...process.env, ...IDENTITY }, timeout: 120_000 })
  return { status: ran.status, out: ran.stdout, err: ran.stderr }
}
const start = (repo: ReturnType<typeof aRepository>, into: string, more: { files?: string[]; mainAt?: string; commit?: string } = {}) =>
  tool('--entry', ENTRY, '--repository', repo.root, '--ref', REF, '--commit', more.commit ?? repo.commit, '--main-at', more.mainAt ?? repo.mainAt, '--files', (more.files ?? [CODE, LIST]).join(','), '--into', into)
const leftInConflict = (into: string) => git(into, 'diff', '--name-only', '--diff-filter=U').split('\n').filter((one) => one !== '')

/** The file the two sides disagree about as a whole: its name in the ancestor, the names main and the entry give it, and a file both add. */
const ANCESTORS_NAME = 'work/numbered-04.txt'
const MAINS_NAME = 'work/numbered-09.txt'
const ENTRYS_NAME = 'work/numbered-06.txt'
const ADDED = 'work/added.txt'
/** Ten lines, long enough that git finds the file renamed with one or two of them changed to be the same file. */
const NUMBERED = Array.from({ length: 10 }, (_, n) => `Synthetic line ${String(n + 1)} of the numbered file, as the ancestor has it.`)
/** The ten lines, with each line numbered in `said` (from 1) said otherwise. */
const numbered = (said: Record<number, string> = {}) => NUMBERED.map((line, at) => `${said[at + 1] ?? line}\n`).join('')
const MAINS_LINE = 'Synthetic line, as main has it.'
const ENTRYS_LINE = 'Synthetic line, as the entry has it.'
const ENTRYS_LAST = 'Synthetic last line, as the entry has it.'

/** What one side does to the numbered file, in the repository's work tree. */
type Side = (root: string) => void
const renamedTo = (to: string, said: Record<number, string>): Side => (root) => { git(root, 'mv', ANCESTORS_NAME, to); write(root, to, numbered(said)) }
const deletedThere: Side = (root) => { git(root, 'rm', '-q', ANCESTORS_NAME) }
const changedThere = (said: Record<number, string>): Side => (root) => write(root, ANCESTORS_NAME, numbered(said))
const addedThere = (words: string): Side => (root) => write(root, ADDED, words)

/**
 * A SYNTHETIC REPOSITORY WHOSE CONFLICT IS ABOUT A WHOLE FILE: the ancestor holds the numbered file, and main's commit and
 * the entry's one commit each do their side to it. The entry is pinned at its ref, as the queue pins it.
 */
function aWholeFileRepository(mains: Side, entrys: Side) {
  const root = scratch('root')
  git(root, 'init', '-q', '-b', 'main')
  write(root, ANCESTORS_NAME, numbered()); write(root, OTHER, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  entrys(root); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its side of the numbered file')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  mains(root); git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic main: its side of the numbered file')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', REF, commit)
  return { root, ancestor, commit, mainAt }
}

/**
 * A MIGRATION THE QUEUE RENUMBERED (wave 13u round 132, item 51). The ancestor holds its SQL file as 0304, main as 0309
 * and the entry as 0306, each by a rename with its lines unchanged, so the stop is about the whole file and the merge of
 * the three files has no place. The entry's commit also writes lines naming the migration in a file git merges with no
 * conflict, where main changed another line and already holds a line that says 0306 about something else.
 */
const MIGRATION = 'synthetic_categories'
const MIGRATIONS = { ancestor: `drizzle/0304_${MIGRATION}.sql`, main: `drizzle/0309_${MIGRATION}.sql`, entry: `drizzle/0306_${MIGRATION}.sql` }
const NAMING = 'src/synthetic-schema.ts'
const SQL = Array.from({ length: 10 }, (_, n) => `-- Synthetic line ${String(n + 1)} of a made-up migration.\n`).join('')
/** The file that names the migration: its first line, the lines the entry adds, and the number main's own line says. */
const naming = (first: string, added: readonly string[] = [], mains = '0306') =>
  `// A synthetic schema file${first}.\n// Synthetic: main already says ${mains} here, about another made-up thing.\nexport const FIRST = 1\n${added.map((line) => `${line}\n`).join('')}export const LAST = 2\n`
const THE_ENTRYS_LINES = ['// Migration 0306_synthetic_categories adds the made-up categories.', "export const MIGRATION = '0306'"] as const
const IN_MAINS_NUMBERS = ['// Migration 0309_synthetic_categories adds the made-up categories.', "export const MIGRATION = '0309'"] as const

function aRenumberedRepository(entrysLines: readonly string[] = THE_ENTRYS_LINES) {
  const root = scratch('root')
  git(root, 'init', '-q', '-b', 'main')
  write(root, MIGRATIONS.ancestor, SQL); write(root, NAMING, naming('')); write(root, OTHER, 'one\n')
  git(root, 'add', '.'); git(root, 'commit', '-q', '-m', 'Synthetic ancestor')
  const ancestor = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', '-c', 'entry')
  git(root, 'mv', MIGRATIONS.ancestor, MIGRATIONS.entry); write(root, NAMING, naming('', entrysLines))
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic entry: its migration and the lines naming it')
  const commit = git(root, 'rev-parse', 'HEAD')
  git(root, 'switch', '-q', 'main')
  git(root, 'mv', MIGRATIONS.ancestor, MIGRATIONS.main); write(root, NAMING, naming(', as main has it'))
  git(root, 'add', '-A'); git(root, 'commit', '-q', '-m', 'Synthetic main: the migration renumbered')
  const mainAt = git(root, 'rev-parse', 'HEAD')
  git(root, 'update-ref', REF, commit)
  return { root, ancestor, commit, mainAt }
}

describe('the clean copy, at the stop', () => {
  it("stops where the queue's rebase stopped and writes each path left in conflict with the ancestor's lines", () => {
    const repo = aRepository()
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into)
    expect(r.status, r.err).toBe(0)
    // THE LIST FILE IS JOINED by the queue's own driver, so only the code file is left to the supervisor.
    expect(leftInConflict(into)).toEqual([CODE])
    expect(readFileSync(join(into, LIST), 'utf8')).toBe(list('a', 'b', 'fromMain', 'fromTheEntry'))
    // THE DRIVER REFUSED THE CODE FILE'S HUNK, so git left main's side with no markers; the clean copy writes the three.
    expect(readFileSync(join(into, CODE), 'utf8')).toBe(
      `// A synthetic code file.\nexport const FIRST = 1\n${OPEN} main\nexport const SAID = 'main'\n${BASE} ancestor\nexport const SAID = 'the ancestor'\n${SPLIT}\nexport const SAID = 'the entry'\n${CLOSE} entry\nexport const LAST = 2\n`,
    )
    expect(git(into, 'rev-parse', 'REBASE_HEAD')).toBe(git(repo.root, 'rev-parse', `${repo.commit}~1`))
    expect(r.out).toContain(`The replay of merge entry ${ENTRY} stopped at its commit ${git(repo.root, 'rev-parse', `${repo.commit}~1`).slice(0, 12)} (Synthetic entry: its line and its name).`)
    expect(r.out).toContain(`  ${CODE}: 1 place, at line 3`)
    expect(r.out).toContain([
      'Keep both sides in each place. If keeping both would change what one side meant, say so and stop:',
      `  POST /api/merge-queue/${ENTRY}/resolution {"cannot": "<one sentence>", "changesWhatOneSideMeant": true}`,
      'If it cannot be resolved for another reason, say why and stop:',
      `  POST /api/merge-queue/${ENTRY}/resolution {"cannot": "<one sentence>"}`,
    ].join('\n'))
    expect(r.out).toContain('What the joins refused at this commit:')
  })
})

describe('the clean copy refuses', () => {
  it('a stop on a path the conflict step did not name', () => {
    const repo = aRepository()
    const r = start(repo, join(scratch('into'), 'copy'), { files: [LIST] })
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: The replay stopped on ${CODE}, which the conflict step did not name: it named ${LIST}. The clean copy resolves only the conflict the queue met, so it stops here. Report this to whoever runs the merge queue.\n`)
  })

  it('to continue a copy whose first stop it refused, in one sentence', () => {
    const repo = aRepository()
    const into = join(scratch('into'), 'copy')
    expect(start(repo, into, { files: [LIST] }).status).toBe(1)
    // THE REPLAY IS STILL STOPPED, with no stop recorded: a supervisor who resolves and adds the file anyway is refused by name.
    expect(leftInConflict(into)).toEqual([CODE])
    write(into, CODE, code('main and the entry'))
    git(into, 'add', '--', CODE)
    const r = tool('--continue', '--into', into)
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: The clean copy in ${into} recorded no stop, because it refused the first one, so there is nothing to continue.\n`)
    expect(git(into, 'rev-parse', 'REBASE_HEAD')).toBe(git(repo.root, 'rev-parse', `${repo.commit}~1`))
  })

  it('a replay that does not stop', () => {
    const repo = aRepository()
    const r = start(repo, join(scratch('into'), 'copy'), { mainAt: repo.ancestor })
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: The pinned commit ${repo.commit} replays onto main ${repo.ancestor} with the joins and does not stop, so there is no conflict to resolve here. The conflict step named ${CODE}, ${LIST}. Report this to whoever runs the merge queue.\n`)
  })

  it('a pinned ref that points at another commit than the one named', () => {
    const repo = aRepository()
    const named = git(repo.root, 'rev-parse', `${repo.commit}~1`)
    const r = start(repo, join(scratch('into'), 'copy'), { commit: named })
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: ${REF} in ${repo.root} points at ${repo.commit}, not at ${named}, so the entry was pinned again after this command was written. Ask for the entry again.\n`)
  })

  it('a folder that is not empty', () => {
    const repo = aRepository()
    const into = scratch('into')
    writeFileSync(join(into, 'left-from-other-work.txt'), 'synthetic\n')
    const r = start(repo, into)
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: ${into} is not empty. The clean copy is made in a new or empty folder, so that nothing in it is left from other work.\n`)
  })
})

describe('the clean copy, continued', () => {
  it('resolves the queue stop and three further files at a later stop in one hand-over', () => {
    const repo = aRepository(true)
    const into = join(scratch('later-stop'), 'copy')
    const first = start(repo, into, { files: [CODE] })
    expect(first.status, first.err).toBe(0)
    expect(leftInConflict(into)).toEqual([CODE])
    expect(git(into, 'rev-parse', 'REBASE_HEAD')).toBe(git(repo.root, 'rev-parse', `${repo.commit}~1`))
    expect(first.out).toContain(`  ${CODE}: 1 place, at line 3`)
    for (const path of FURTHER) expect(first.out).not.toContain(path)
    expect(first.out).not.toContain('Hand it over,')
    write(into, CODE, code('main and the entry'))
    git(into, 'add', '--', CODE)

    const later = tool('--continue', '--into', into)
    expect(later.status, later.err).toBe(0)
    expect(git(into, 'rev-parse', 'REBASE_HEAD')).toBe(repo.commit)
    expect(leftInConflict(into)).toEqual(FURTHER)
    expect(later.out).toContain(`The queue met only the first stop, so it did not name ${FURTHER.join(', ')}. They are in conflict at this later commit of the same entry; resolve them here in the same way. Nothing starts a new hour.`)
    expect(later.out).not.toContain('Hand it over,')
    const kept = JSON.parse(readFileSync(join(into, '.git', 'mole-office-clean-copy.json'), 'utf8'))
    expect(kept.stops).toMatchObject([
      { commit: git(repo.root, 'rev-parse', `${repo.commit}~1`), paths: [CODE], further: [] },
      { commit: repo.commit, paths: FURTHER, further: FURTHER },
    ])
    for (const path of FURTHER) {
      expect(later.out).toContain(`  ${path}: 1 place, at line 3`)
      expect(readFileSync(join(into, path), 'utf8')).toBe(
        `// A synthetic code file.\nexport const FIRST = 1\n${OPEN} main\nexport const SAID = 'main'\n${BASE} ancestor\nexport const SAID = 'the ancestor'\n${SPLIT}\nexport const SAID = 'the entry'\n${CLOSE} entry\nexport const LAST = 2\n`,
      )
      write(into, path, code('main and the entry'))
    }
    git(into, 'add', '--', ...FURTHER)
    const done = tool('--continue', '--into', into)
    expect(done.status, done.err).toBe(0)
    const head = git(into, 'rev-parse', 'HEAD')
    expect(git(into, 'rev-list', '--count', `${repo.mainAt}..${head}`)).toBe('2')
    expect(git(into, 'log', '--format=%s', `${repo.mainAt}..${head}`)).toBe(git(repo.root, 'log', '--format=%s', `${repo.ancestor}..${repo.commit}`))
    expect(done.out).toContain(`The replay of merge entry ${ENTRY} is done. The resolution is commit ${head}, in ${into}.`)
    expect(done.out).toContain(`Resolved by hand at the queue's stop: ${CODE}.`)
    expect(done.out).toContain(`Resolved by hand at later stops: ${FURTHER.join(', ')}.`)
    expect(done.out).toContain('node tools/run-named-tests.mjs tests/resolved-0.test.ts tests/resolved-1.test.ts tests/resolved-2.test.ts tests/resolved-3.test.ts')
    expect(done.out.match(/POST \/api\/merge-queue\/[^/]+\/resolution/gu)).toHaveLength(1)
    expect(done.out).toContain(`"workingDirectory": "${into}", "tests": {"commit": "${head}"`)
  }, 120_000)

  it('continues only when every place is resolved and added, and ends at the resolution with the hand-over', () => {
    const repo = aRepository()
    const into = join(scratch('into'), 'copy')
    expect(start(repo, into).status).toBe(0)
    const again = () => tool('--continue', '--into', into)

    const unresolved = again()
    expect(unresolved.status).toBe(1)
    expect(unresolved.err).toBe(`resolve-a-conflict: ${CODE} is still in conflict. Resolve it, run git add, and continue.\n`)

    git(into, 'add', '--', CODE)
    const withAMarker = again()
    expect(withAMarker.status).toBe(1)
    expect(withAMarker.err).toBe(`resolve-a-conflict: ${CODE} as added still holds a marker line, at line 3. Resolve that place, run git add, and continue.\n`)

    write(into, CODE, `// A synthetic code file.\nexport const FIRST = 1\nexport const SAID = 'main and the entry'\nexport const LAST = 2\n`)
    git(into, 'add', '--', CODE)
    const done = again()
    expect(done.status, done.err).toBe(0)
    const head = git(into, 'rev-parse', 'HEAD')
    // THE SAME NUMBER OF COMMITS, WITH THE SAME MESSAGES, on the main the conflict met.
    expect(git(into, 'log', '--format=%s', `${repo.mainAt}..${head}`).split('\n')).toEqual(git(repo.root, 'log', '--format=%s', `${repo.ancestor}..${repo.commit}`).split('\n'))
    expect(git(into, 'merge-base', '--is-ancestor', repo.mainAt, head)).toBe('')
    expect(done.out).toContain(`The replay of merge entry ${ENTRY} is done. The resolution is commit ${head}, in ${into}.`)
    expect(done.out).toContain(`Resolved by hand: ${CODE}.`)
    expect(done.out).toContain(`The conflict step also named ${LIST}, and this replay did not stop on it. What the joins joined:`)
    expect(done.out).toContain(`  POST /api/merge-queue/${ENTRY}/resolution {"workingDirectory": "${into}", "tests": {"commit": "${head}"`)
    expect(done.out).toContain(`Keep the HEAD of ${into} at ${head} until the entry ends: the merge tool fetches the resolution from there.`)
  })
})

describe('the clean copy, at a stop about a whole file', () => {
  it("the same file renamed differently on each side: main's name stands, and the entry's changes go into main's file", () => {
    const repo = aWholeFileRepository(renamedTo(MAINS_NAME, { 1: MAINS_LINE }), renamedTo(ENTRYS_NAME, { 1: ENTRYS_LINE, 10: ENTRYS_LAST }))
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: [ANCESTORS_NAME, ENTRYS_NAME, MAINS_NAME] })
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`${ANCESTORS_NAME} was renamed to ${MAINS_NAME} on main and to ${ENTRYS_NAME} by the entry. Main's name stands, so the entry's changes go into ${MAINS_NAME}, and ${ENTRYS_NAME} is not kept.`)
    // ONLY MAIN'S FILE IS LEFT TO RESOLVE. The other two names are gone from the copy, and main's file holds the three-way
    // merge of the ancestor's file, main's file and the entry's file: the place at line 1, and the entry's last line.
    expect(leftInConflict(into)).toEqual([MAINS_NAME])
    expect(git(into, 'ls-files', '--', ANCESTORS_NAME, ENTRYS_NAME)).toBe('')
    expect([ANCESTORS_NAME, ENTRYS_NAME].filter((path) => existsSync(join(into, path)))).toEqual([])
    expect(readFileSync(join(into, MAINS_NAME), 'utf8')).toBe(`${OPEN} main\n${MAINS_LINE}\n${BASE} ancestor\n${NUMBERED[0]!}\n${SPLIT}\n${ENTRYS_LINE}\n${CLOSE} entry\n${NUMBERED.slice(1, 9).join('\n')}\n${ENTRYS_LAST}\n`)
    expect(r.out).toContain(`  ${MAINS_NAME}: 1 place, at line 1`)
    expect(r.out).toContain(`  git -C ${into} add -- ${MAINS_NAME}\n`)
    write(into, MAINS_NAME, numbered({ 1: `${MAINS_LINE}\n${ENTRYS_LINE}`, 10: ENTRYS_LAST }))
    git(into, 'add', '--', MAINS_NAME)
    const done = tool('--continue', '--into', into)
    expect(done.status, done.err).toBe(0)
    const head = git(into, 'rev-parse', 'HEAD')
    expect(git(into, 'ls-tree', '-r', '--name-only', head).split('\n')).toEqual([MAINS_NAME, OTHER])
    expect(done.out).toContain(`Resolved by hand: ${ANCESTORS_NAME}, ${ENTRYS_NAME}, ${MAINS_NAME}.`)
  })

  it("the same file renamed differently on each side, with changes that do not meet: main's file is their merge, with no place", () => {
    // MAIN ONLY RENAMED THE FILE, as the queue renumbers one, and the entry renamed it and changed its last line.
    const repo = aWholeFileRepository(renamedTo(MAINS_NAME, {}), renamedTo(ENTRYS_NAME, { 10: ENTRYS_LAST }))
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: [ANCESTORS_NAME, ENTRYS_NAME, MAINS_NAME] })
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`${ANCESTORS_NAME} was renamed to ${MAINS_NAME} on main and to ${ENTRYS_NAME} by the entry.`)
    expect(leftInConflict(into)).toEqual([MAINS_NAME])
    expect(readFileSync(join(into, MAINS_NAME), 'utf8')).toBe(numbered({ 10: ENTRYS_LAST }))
    expect(r.out).toContain(`  ${MAINS_NAME}: no place, because the three files merge with no conflict of lines; add it as it stands\n`)
    git(into, 'add', '--', MAINS_NAME)
    const done = tool('--continue', '--into', into)
    expect(done.status, done.err).toBe(0)
    const head = git(into, 'rev-parse', 'HEAD')
    expect(git(into, 'ls-tree', '-r', '--name-only', head).split('\n')).toEqual([MAINS_NAME, OTHER])
    expect(git(into, 'show', `${head}:${MAINS_NAME}`)).toBe(numbered({ 10: ENTRYS_LAST }).trimEnd())
  })

  it('deleted on one side and changed on the other: refused, with the cannot to send, which names the file and the side', () => {
    const cases = [
      [deletedThere, changedThere({ 2: ENTRYS_LINE }), 'deleted on main and changed by the entry'],
      [changedThere({ 2: MAINS_LINE }), deletedThere, 'deleted by the entry and changed on main'],
    ] as const
    for (const [mains, entrys, how] of cases) {
      const into = join(scratch('into'), 'copy')
      const r = start(aWholeFileRepository(mains, entrys), into, { files: [ANCESTORS_NAME] })
      const cannot = `${ANCESTORS_NAME} was ${how}, and keeping both would change what one side meant, so the entry has to be cut again from current main.`
      expect(r.status).toBe(1)
      expect(r.err).toBe(`resolve-a-conflict: ${cannot} Say so and stop: POST /api/merge-queue/${ENTRY}/resolution {"cannot": ${JSON.stringify(cannot)}, "changesWhatOneSideMeant": true}\n`)
    }
  })

  it("renamed on main and changed by the entry: the entry's change goes into main's renamed file, as a conflict of lines", () => {
    const repo = aWholeFileRepository(renamedTo(MAINS_NAME, { 2: MAINS_LINE }), changedThere({ 2: ENTRYS_LINE }))
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: [MAINS_NAME] })
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`${MAINS_NAME} was renamed on main and changed by the entry, so the entry's change goes into ${MAINS_NAME}, where git left its lines in conflict.`)
    expect(leftInConflict(into)).toEqual([MAINS_NAME])
    expect(readFileSync(join(into, MAINS_NAME), 'utf8')).toBe(`${NUMBERED[0]!}\n${OPEN} main\n${MAINS_LINE}\n${BASE} ancestor\n${NUMBERED[1]!}\n${SPLIT}\n${ENTRYS_LINE}\n${CLOSE} entry\n${NUMBERED.slice(2).join('\n')}\n`)
    expect(r.out).toContain(`  ${MAINS_NAME}: 1 place, at line 2`)
  })

  it('added on both sides with different contents: an ordinary conflict of lines in that one file', () => {
    const repo = aWholeFileRepository(addedThere('Synthetic: added on main.\n'), addedThere('Synthetic: added by the entry.\n'))
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: [ADDED] })
    expect(r.status, r.err).toBe(0)
    expect(r.out).toContain(`${ADDED} was added on both sides with different contents, so it is a conflict of lines in that one file.`)
    expect(leftInConflict(into)).toEqual([ADDED])
    expect(readFileSync(join(into, ADDED), 'utf8')).toBe(`${OPEN} main\nSynthetic: added on main.\n${BASE} ancestor\n${SPLIT}\nSynthetic: added by the entry.\n${CLOSE} entry\n`)
    expect(r.out).toContain(`  ${ADDED}: 1 place, at line 1`)
  })
})

describe('the clean copy, at a stop that renamed a migration differently on each side', () => {
  const THE_THREE_NAMES = [MIGRATIONS.ancestor, MIGRATIONS.entry, MIGRATIONS.main]

  it("gives the lines the entry wrote main's number in a file git merged with no conflict, adds it and says so", () => {
    const repo = aRenumberedRepository()
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: THE_THREE_NAMES })
    expect(r.status, r.err).toBe(0)
    expect(leftInConflict(into)).toEqual([MIGRATIONS.main])
    // THE ENTRY'S TWO LINES TAKE MAIN'S NUMBER, and main's own line that says 0306 keeps it. The file is added as renumbered.
    const renumbered = naming(', as main has it', IN_MAINS_NUMBERS)
    expect(readFileSync(join(into, NAMING), 'utf8')).toBe(renumbered)
    expect(git(into, 'show', `:${NAMING}`)).toBe(renumbered.trimEnd())
    expect(r.out).toContain([
      `Main numbers a migration of the entry otherwise: 0306_${MIGRATION} is 0309_${MIGRATION} on main.`,
      "In the files git merged with no conflict, this copy gave the lines the entry wrote main's number, as the queue's renumbering at integration does, and added them. Change nothing else in them:",
      `  ${NAMING}: 2 numbers changed`,
    ].join('\n'))
    git(into, 'add', '--', MIGRATIONS.main)
    const done = tool('--continue', '--into', into)
    expect(done.status, done.err).toBe(0)
    const head = git(into, 'rev-parse', 'HEAD')
    expect(git(into, 'ls-tree', '-r', '--name-only', head).split('\n')).toEqual([MIGRATIONS.main, NAMING, OTHER])
    expect(git(into, 'show', `${head}:${NAMING}`)).toBe(renumbered.trimEnd())
    expect(done.out).toContain(`Given main's migration number by this copy: ${NAMING}.`)
  })

  it('refuses a line the rule cannot read, with the cannot to send', () => {
    const repo = aRenumberedRepository([THE_ENTRYS_LINES[0], '// Synthetic: 0306_synthetic_cat stops inside a word.'])
    const into = join(scratch('into'), 'copy')
    const r = start(repo, into, { files: THE_THREE_NAMES })
    const cannot = `Line 5 of ${NAMING} writes \`0306_synthetic_cat\`, which stops inside a word of migration 0306_${MIGRATION}, so whether it names that migration cannot be told, and it was not renumbered. ` +
      `A file git merged with no conflict may change in a clean copy only to take main's number for the entry's migration, so this stop cannot be resolved there.`
    expect(r.status).toBe(1)
    expect(r.err).toBe(`resolve-a-conflict: ${cannot} Say so and stop: POST /api/merge-queue/${ENTRY}/resolution {"cannot": ${JSON.stringify(cannot)}}\n`)
    expect(git(into, 'show', `:${NAMING}`)).toBe(naming(', as main has it', [THE_ENTRYS_LINES[0], '// Synthetic: 0306_synthetic_cat stops inside a word.']).trimEnd())
  })
})
