// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE MERGE QUEUE'S GATE AGAINST NEW OWNER CONTENT IN WHAT SHIPS (wave 13v round 30): tools/merge-tool/owner-content.mjs,
 * with its allow-list in tools/merge-tool/owner-content-allowed.mjs.
 *
 * Each case makes a throwaway repository with a main and an entry on it, and screens main...entry as integrate does:
 *
 *   1. each refusing pattern (P1 to P5, and P7) on an added line is refused, by file, line, pattern and words, for an
 *      invented name of each kind: a name, a real name, a machine, a port and a research word;
 *   2. a remind-only pattern is named and never refused, in a sentence and as facts of their own (round 31);
 *   4. a new file under public/ or src/config/rules/ is refused unless the list of new files names it;
 *   5. a line already on main never blocks, even in a file the entry changes;
 *   6. a path that does not ship never blocks;
 *   7. the files the gate's lists come from, and tests/the-owners-content-patterns.ts, which makes the patterns from
 *      them, are the merge queue's own code (round 31); the gate and its allow-list import none of the lists, so only
 *      the patterns module reads the office setting that names the file of the owner's content;
 *   8. integrate runs the gate after the mutation-marker guard and before the regeneration, the build and the suite,
 *      with the patterns arguments.mjs loads from that module, and sends its reminders on the integrated step;
 *   9. patterns made from no list, as the gate's are when no file of the owner's content was read, still refuse the
 *      shapes that need no names, and the gate says which named patterns it did not look for, and why. A caller that
 *      gives no patterns gets the same, and the reason names the module that makes them. Where it refuses nothing, its
 *      verdict still says what it did not look for, so "0 refused" never stands alone.
 *
 * Every name, handle, machine, port, research word, address and domain here is made up, and appears nowhere else in the
 * repository; an address that must pass is in the documentation ranges. The owner's own content is read, through
 * tests/neutral-names.ts, only to show that the patterns tests/the-owners-content-patterns.ts makes come from it; none
 * of it is written here. The cases that read it are taken out, and say why, when no file of the owner's content was
 * read.
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { screenTheAddedLines, theHitsOn, thePatterns, theRefusalSaid, theRemindersFacts, theRemindersSaid, theScreenSaid } from '../tools/merge-tool/owner-content.mjs'
import { AGENT_HANDLES, OWNER_NAMES } from './neutral-names.ts'
import { COPYRIGHT_LINE } from './the-owners-copyright-line.ts'
import { takenOutWithoutTheOwnersContent } from './the-owners-content-list.ts'
import { THE_PATTERNS } from './the-owners-content-patterns.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * The patterns made from invented people and places: an owner called Wrenfield, a real name Vantorp, an agent
 * Kestrelbot, a machine pipitbox, an office on port 6143, and the research words quernstone and sallow moth.
 */
const MADE_UP = thePatterns({ names: ['wrenfield'], realName: /\bvantorp\b/i, handles: ['kestrelbot'], machines: ['pipitbox'], ports: [6143], researchWords: ['quernstone', 'sallow ?moth'] })

/** The patterns made from no list, as the gate's own are when no file of the owner's content was read. */
const NONE = thePatterns({ names: [], realName: null, handles: [], machines: [], ports: [], researchWords: [], notReadBecause: 'No invented list was given.' })

/**
 * The shared range's own address, as reach.ts writes it, and two invented peers on that range. They are written out on
 * this one line, which tools/merge-tool/addresses-allowed.mjs lets through; the address gate refuses an address
 * written out anywhere else in this file.
 */
const [THE_RANGE, A_PEER, ANOTHER_PEER] = ['100.64.0.0', '100.101.12.34', '100.101.12.35'] as const

const made: string[] = []
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true })
})

/** Git in a fixture, with no system or user settings and an invented author. */
function git(dir: string, ...args: string[]): string {
  return execFileSync('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', '-C', dir, ...args], {
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' },
  }).trim()
}

function write(dir: string, files: Record<string, string | null>): void {
  for (const [path, text] of Object.entries(files)) {
    if (text === null) {
      rmSync(join(dir, path))
      continue
    }
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

/** A repository whose main holds `files`, and an entry on it that changes `changes`. */
function anEntry(files: Record<string, string>, changes: Record<string, string | null>): { dir: string; base: string; head: string } {
  const dir = mkdtempSync(join(tmpdir(), 'owner-content-gate-'))
  made.push(dir)
  git(dir, 'init', '--quiet', '-b', 'main')
  write(dir, { 'README.md': 'A synthetic repository for the owner-content gate.\n', ...files })
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '-m', 'main')
  const base = git(dir, 'rev-parse', 'HEAD')
  git(dir, 'checkout', '--quiet', '-b', 'entry')
  write(dir, changes)
  git(dir, 'add', '-A')
  git(dir, 'commit', '--quiet', '--allow-empty', '-m', 'entry')
  return { dir, base, head: git(dir, 'rev-parse', 'HEAD') }
}

describe("the owner-content gate reads the lines an entry adds to what ships", () => {
  it.each([
    ['P1', 'src/server/a.ts', "export const by = 'wrenfield'\n", 'wrenfield'],
    ['P1', 'src/server/a.ts', '// Vantorp wrote this.\n', 'Vantorp'],
    ['P2', 'for-agents/README.md', 'Keep it in /home/fixture-user/notes.\n', '/home/fixture-user'],
    ['P3', 'src/shared/b.ts', "export const to = 'tern@corvidmail.net'\n", 'tern@corvidmail.net'],
    ['P4', 'src/server/c.ts', `export const peer = '${A_PEER}'\n`, A_PEER],
    ['P4', 'src/server/c.ts', '// on lantern.tail0c0ffe.ts.net\n', 'tail0c0ffe.ts.net'],
    ['P4', 'src/server/c.ts', "export const host = 'pipitbox'\n", 'pipitbox'],
    ['P5', 'drizzle/0999_synthetic.sql', '-- served on 6143\n', '6143'],
    ['P7', '.claude/skills/mole-office/SKILL.md', 'Calibrate the quernstone first.\n', 'quernstone'],
    ['P7', '.claude/skills/mole-office/SKILL.md', 'Watch for the sallow moth.\n', 'sallow moth'],
  ])('refuses %s on an added line of %s, naming the file, the line, the pattern and the words', (pattern, file, line, words) => {
    const { dir, base, head } = anEntry({ [file]: 'the first line\n' }, { [file]: `the first line\n${line}` })
    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP })
    expect(screen.refused).toContainEqual(expect.objectContaining({ file, line: 2, pattern, words }))
    const said = theRefusalSaid(screen)
    expect(said).toContain(`${file} line 2, ${pattern} (`)
    expect(said).toContain(`"${words}"`)
  })

  it('names a remind-only pattern in the reminders and never refuses it', () => {
    const file = 'src/web/d.tsx'
    const { dir, base, head } = anEntry(
      { [file]: 'export const a = 1\n' },
      { [file]: "export const a = 1\n// Asked of kestrelbot in record Ab3dEf6hIj9k.\n// 这一行是注释\nexport const b = '这一行是字符串'\n" },
    )
    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP })
    expect(screen.refused).toEqual([])
    expect(theRefusalSaid(screen)).toBeNull()
    expect(screen.reminded.map(({ line, pattern, words }) => ({ line, pattern, words }))).toEqual([
      { line: 2, pattern: 'P6', words: 'kestrelbot' },
      { line: 2, pattern: 'P10', words: 'Ab3dEf6hIj9k' },
      { line: 3, pattern: 'P8', words: '这一行是注释' },
    ])
    const said = theRemindersSaid(screen, '/synthetic/checks/owner-content.json')
    expect(said).toContain('which never refuse')
    expect(said).toContain(`P6 (an agent handle of the office this product is built in) 1: ${file} line 2 "kestrelbot"`)
    expect(said).toContain('/synthetic/checks/owner-content.json')
    // AS FACTS OF THEIR OWN for the integrated step, which the office keeps to data.integrated (round 31).
    expect(theRemindersFacts(screen, '/synthetic/checks/owner-content.json')).toEqual({ reminded: 3, byPattern: { P6: 1, P10: 1, P8: 1 }, says: said, log: '/synthetic/checks/owner-content.json' })
    expect(theRemindersFacts({ ...screen, reminded: [] }, '/synthetic/checks/owner-content.json')).toEqual({ reminded: 0, byPattern: {}, log: '/synthetic/checks/owner-content.json' })
  })

  it("lets through a hit that lies inside an allow-list entry's text, and says which entry", () => {
    const file = 'src/server/net.ts'
    const allowed = [
      { key: 'made up: another file', file: 'src/server/other.ts', text: `${THE_RANGE}/10`, patterns: ['P4'], why: 'Made up: another file.' },
      { key: "made up: the range's definition", file, text: `${THE_RANGE}/10`, patterns: ['P4'], why: "Made up: the range's own definition." },
    ]
    const { dir, base, head } = anEntry({ [file]: 'export {}\n' }, { [file]: `export {}\n// the range ${THE_RANGE}/10, and the peer ${A_PEER}\n` })
    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP, allowed })
    expect(screen.letThrough).toEqual([expect.objectContaining({ file, line: 2, pattern: 'P4', words: THE_RANGE, key: "made up: the range's definition", why: "Made up: the range's own definition." })])
    // The rest of the same line is still read.
    expect(screen.refused).toEqual([expect.objectContaining({ file, line: 2, pattern: 'P4', words: A_PEER })])
    expect(theScreenSaid(screen)).toContain(`${file} line 2, P4 (a private-network address or a machine name of the owner): "${THE_RANGE}" let through by the entry "made up: the range's definition" of tools/merge-tool/owner-content-allowed.mjs: Made up: the range's own definition.`)
  })

  it('refuses a new file under public/ or src/config/rules/ unless the list of new files names it', () => {
    const { dir, base, head } = anEntry(
      { 'public/kept.txt': 'kept\n', 'notes/moved.txt': 'moved\n' },
      { 'public/kept.txt': 'kept, changed\n', 'public/fresh.txt': 'fresh\n', 'src/config/rules/EXTRA.md': '# Extra\n', 'src/config/fresh.json': '{}\n', 'notes/moved.txt': null, 'public/moved.txt': 'moved\n' },
    )
    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP })
    expect(screen.newFiles.refused).toEqual(['public/fresh.txt', 'public/moved.txt', 'src/config/rules/EXTRA.md'])
    expect(theRefusalSaid(screen)).toContain('not named on the list of new files that may ship: public/fresh.txt, public/moved.txt, src/config/rules/EXTRA.md')
    const named = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP, newFilesThatMayShip: [{ file: 'public/fresh.txt', why: 'Made up: a page the product draws.' }] })
    expect(named.newFiles.refused).toEqual(['public/moved.txt', 'src/config/rules/EXTRA.md'])
    expect(named.newFiles.letThrough).toEqual([{ file: 'public/fresh.txt', why: 'Made up: a page the product draws.' }])
    expect(theScreenSaid(named)).toContain('new file public/fresh.txt let through by its entry on the list of new files that may ship: Made up: a page the product draws.')
  })

  it('never blocks on a line already on main, even in a file the entry changes', () => {
    const file = 'src/server/old.ts'
    const old = "export const port = 6143 // wrenfield's\nexport const a = 1\nexport const b = 2\n"
    const untouched = anEntry({ [file]: old }, { [file]: old.replace('a = 1', 'a = 10').replace("export const b = 2\n", '') })
    const screen = screenTheAddedLines({ repo: untouched.dir, base: untouched.base, head: untouched.head, patterns: MADE_UP })
    expect(screen.read).toMatchObject({ files: 1, lines: 1 })
    expect(screen.refused).toEqual([])
    // The same file, with a new line that says the same: the gate reads the file, and refuses only that line.
    const added = anEntry({ [file]: old }, { [file]: `${old}export const again = 6143\n` })
    expect(screenTheAddedLines({ repo: added.dir, base: added.base, head: added.head, patterns: MADE_UP }).refused).toEqual([
      expect.objectContaining({ file, line: 4, pattern: 'P5', words: '6143' }),
    ])
  })

  it('never blocks on a path that does not ship', () => {
    const line = `export const where = '/home/wrenfield' // 6143 on pipitbox, the quernstone, tern@corvidmail.net, ${A_PEER}\n`
    const { dir, base, head } = anEntry(
      {},
      { 'tests/synthetic.test.ts': line, 'tools/synthetic.mjs': line, 'docs/synthetic.md': line, 'design/synthetic.md': line, 'scripts/synthetic.mjs': line, 'srcx/synthetic.ts': line, 'sub/LICENSE': line },
    )
    const screen = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP })
    expect(screen.read).toEqual({ files: 0, lines: 0, notText: [] })
    expect([...screen.refused, ...screen.reminded, ...screen.newFiles.refused]).toEqual([])
  })

  it('with no list, still refuses the shapes that need no names, and says which named patterns it did not look for', () => {
    const file = 'src/server/e.ts'
    const line = `// wrenfield and Vantorp asked kestrelbot on pipitbox:6143 about the quernstone and the sallow moth, in /home/fixture-user, of tern@corvidmail.net at ${A_PEER}\n`
    const { dir, base, head } = anEntry({ [file]: 'export {}\n' }, { [file]: `export {}\n${line}` })
    const none = screenTheAddedLines({ repo: dir, base, head, patterns: NONE })
    expect(none.refused.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(['P2 /home/fixture-user', 'P3 tern@corvidmail.net', `P4 ${A_PEER}`])
    expect(none.reminded).toEqual([])
    const why = 'No invented list was given.'
    expect(none.unchecked).toEqual([
      { pattern: 'P1', what: "the owner's names", why },
      { pattern: 'P1', what: "the owner's real name", why },
      { pattern: 'P4', what: "the owner's machine names", why },
      { pattern: 'P5', what: "the port of the owner's own office", why },
      { pattern: 'P6', what: 'the agent handles', why },
      { pattern: 'P7', what: "the owner's research words", why },
      { pattern: 'P9', what: "the owner's words or decisions told with the owner's name", why },
    ])
    expect(theScreenSaid(none)).toContain(
      " Not looked for, so not passed: the owner's names (P1), the owner's real name (P1), the owner's machine names (P4), the port of the owner's own office (P5), the agent handles (P6), the owner's research words (P7) and the owner's words or decisions told with the owner's name (P9). No invented list was given.",
    )
    // The same line, with a list of each kind: each invented name is found, and nothing is left unchecked.
    const made = screenTheAddedLines({ repo: dir, base, head, patterns: MADE_UP })
    expect(made.unchecked).toEqual([])
    expect(theScreenSaid(made)).not.toContain('Not looked for')
    expect(made.refused.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(
      expect.arrayContaining(['P1 wrenfield', 'P1 Vantorp', 'P4 pipitbox', 'P5 6143', 'P7 quernstone', 'P7 sallow moth']),
    )
    expect(made.reminded.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(['P6 kestrelbot'])
  })

  it('given no patterns, looks for no named pattern, says so beside its verdict, and names the module that makes them', () => {
    const file = 'src/server/e.ts'
    const line = '// wrenfield asked kestrelbot about the quernstone, in /home/fixture-user\n'
    const { dir, base, head } = anEntry({ [file]: 'export {}\n' }, { [file]: `export {}\n${line}` })
    const without = screenTheAddedLines({ repo: dir, base, head })
    expect(without.refused.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(['P2 /home/fixture-user'])
    expect(without.reminded).toEqual([])
    const parts = (screen: { unchecked: readonly { pattern: string; what: string }[] }) => screen.unchecked.map(({ pattern, what }) => `${pattern} ${what}`)
    expect(parts(without)).toEqual(parts(screenTheAddedLines({ repo: dir, base, head, patterns: NONE })))
    const reasons = [...new Set(without.unchecked.map((one) => one.why))]
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toContain('tests/the-owners-content-patterns.ts')
    expect(theScreenSaid(without)).toMatch(/: 1 refused, 0 reminded, 0 let through\. Not looked for, so not passed: the owner's names \(P1\)/)
    // Only invented names, and nothing else to refuse: the verdict is 0 refused, and the sentence still says what was not looked for.
    const onlyNames = anEntry({ [file]: 'export {}\n' }, { [file]: 'export {}\n// wrenfield asked kestrelbot about the quernstone\n' })
    const clean = screenTheAddedLines({ repo: onlyNames.dir, base: onlyNames.base, head: onlyNames.head })
    expect(theScreenSaid(clean)).toMatch(/: 0 refused, 0 reminded, 0 let through\. Not looked for, so not passed: the owner's names \(P1\)/)
  })
})

describe("the owner-content gate's own lists", () => {

  it('tests/the-owners-content-patterns.ts makes the patterns from tests/neutral-names.ts, so a name or handle added there is found here', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    for (const name of OWNER_NAMES) {
      expect(theHitsOn('src/x.ts', `const by = '${name}'`, { patterns: THE_PATTERNS }).some((one) => one.pattern === 'P1' && one.refuses && one.words.toLowerCase() === name.toLowerCase()), `name ${String(OWNER_NAMES.indexOf(name))}`).toBe(true)
    }
    for (const handle of AGENT_HANDLES) {
      expect(theHitsOn('src/x.ts', `// asked of ${handle}`, { patterns: THE_PATTERNS }).some((one) => one.pattern === 'P6' && !one.refuses), handle).toBe(true)
    }
  })

  it('lets the copyright line through in LICENSE and NOTICE only', (context) => {
    if (takenOutWithoutTheOwnersContent(context)) return
    for (const file of ['LICENSE', 'NOTICE']) {
      const hits = theHitsOn(file, COPYRIGHT_LINE, { patterns: THE_PATTERNS })
      expect(hits.length).toBeGreaterThan(0)
      expect(hits.map((one) => one.allowedBy?.key)).toEqual(hits.map(() => `the copyright line in ${file}`))
    }
    expect(theHitsOn('src/x.ts', COPYRIGHT_LINE, { patterns: THE_PATTERNS }).every((one) => one.refuses && one.allowedBy === null)).toBe(true)
  })

  it('lets the private range through in reach.ts only', () => {
    const reach = 'src/server/lib/reach.ts'
    const lines = readFileSync(join(REPO, reach), 'utf8').split('\n').filter((line) => line.includes(THE_RANGE))
    expect(lines.length).toBeGreaterThanOrEqual(2)
    for (const line of lines) expect(theHitsOn(reach, line).filter((one) => one.pattern === 'P4').every((one) => one.allowedBy !== null), line).toBe(true)
    // The invented address of the same file's example is not on the list.
    expect(theHitsOn(reach, `isPrivate('::ffff:${ANOTHER_PEER}')`).filter((one) => one.refuses && one.allowedBy === null).map((one) => one.words)).toEqual([ANOTHER_PEER])
    expect(theHitsOn('src/server/other.ts', `addSubnet('${THE_RANGE}', 10, 'ipv4')`).some((one) => one.refuses && one.allowedBy === null)).toBe(true)
  })


  it('finds nothing in the documentation address ranges or the example mail domains', () => {
    expect(theHitsOn('src/x.ts', 'peers 192.0.2.10, 198.51.100.7 and 203.0.113.200', { patterns: MADE_UP })).toEqual([])
    expect(theHitsOn('src/x.ts', 'a@example.com b@mail.example.org c@host.invalid d@box.test e@printer.local f@me.localhost', { patterns: MADE_UP })).toEqual([])
  })

  it("reads a home folder written with hyphens as P2, but not a data attribute of the home page", () => {
    const P2 = (line: string) => theHitsOn('src/web/a.tsx', line, { patterns: MADE_UP }).filter((one) => one.pattern === 'P2')
    expect(P2('<p data-home-layout-note="x">')).toEqual([])
    expect(P2('it is kept in -home-someone-work- for now').map(({ words, refuses }) => ({ words, refuses }))).toEqual([{ words: '-home-someone-', refuses: true }])
    expect(P2('<style href="mole-office-home-agent-bars">').map(({ words, refuses }) => ({ words, refuses }))).toEqual([{ words: '-home-agent-', refuses: true }])
  })

  it('reads Chinese only in a comment of code, a Markdown line or a JSON value whose key is not zh', () => {
    const P8 = (file: string, line: string, inAComment = () => false) => theHitsOn(file, line, { patterns: MADE_UP, inAComment }).filter((one) => one.pattern === 'P8').map((one) => one.words)
    expect(P8('src/a.ts', '// 中文', () => true)).toEqual(['中文'])
    expect(P8('src/a.ts', "const a = '中文'")).toEqual([])
    expect(P8('src/a.md', '中文')).toEqual(['中文'])
    expect(P8('src/a.json', '  "en": "中文",')).toEqual(['中文'])
    expect(P8('src/a.json', '  "zh": "中文",')).toEqual([])
    expect(P8('drizzle/0999_a.sql', '-- 中文')).toEqual([])
  })
})


describe('the merge queue runs the gate before the suite', () => {
  it('runs it in integrate after the mutation-marker guard and before the regeneration and the build, sends its reminders on the integrated step, and says them on the tested step', () => {
    const integrate = readFileSync(join(REPO, 'tools/merge-tool/integrate.mjs'), 'utf8')
    const markers = integrate.indexOf('const markers = readMutationMarkers(clone)')
    const gate = integrate.indexOf('const screen = screenTheAddedLines({ repo: clone, base: M, head: Cprime, patterns: await theOwnerContentPatterns() })')
    const regenerated = integrate.indexOf('await regenerateOnTop(clone, M, Cprime')
    expect(markers).toBeGreaterThan(0)
    expect(gate).toBeGreaterThan(markers)
    expect(regenerated).toBeGreaterThan(gate)
    expect(integrate.slice(gate, regenerated)).toMatch(/step\(\s*'guard-failed',\s*\{[^}]*guard: 'owner-content'/)
    // Loaded in the guard, not at the top: the word list it brings costs every other step of the tool 0.2 s at its start.
    expect(integrate.slice(markers, gate)).toContain("await import('./owner-content.mjs')")
    expect(integrate).not.toMatch(/^import .* from '\.\/owner-content\.mjs'/m)
    // The patterns come from arguments.mjs, which may read the office settings, and it loads their module only when asked.
    expect(integrate).toMatch(/^import \{[^}]*\btheOwnerContentPatterns\b[^}]*\} from '\.\/arguments\.mjs'$/m)
    const argumentsSource = readFileSync(join(REPO, 'tools/merge-tool/arguments.mjs'), 'utf8')
    expect(argumentsSource).toMatch(/^export async function theOwnerContentPatterns\(\) \{\n {2}return \(await import\('\.\.\/\.\.\/tests\/the-owners-content-patterns\.ts'\)\)\.THE_PATTERNS\n\}$/m)
    expect(argumentsSource).not.toMatch(/^import .* from '\.\.\/\.\.\/tests\/the-owners-content-patterns\.ts'/m)
    // Field order is not a criterion. The real merger's owner-content case checks the stored reminders.
    expect(integrate).toContain('const reminders = theRemindersFacts(screen, screenLog)')
    expect(integrate.slice(integrate.lastIndexOf("'integrated',"))).toContain('ownerContent: reminders,')
    const testing = readFileSync(join(REPO, 'tools/merge-tool/testing.mjs'), 'utf8')
    expect(testing).toContain('ownerContentSaid: integrated.ownerContent ?? undefined')
    expect(testing).toContain('measured.ownerContentSaid')
    expect(testing).toContain('says: withTheReminders(borrowed.facts.says, integrated.ownerContent)')
    expect(testing).toMatch(/says: withTheReminders\(\s*`A documentation entry: [^`]*`,\s*integrated\.ownerContent,\s*\)/)
  })
})
