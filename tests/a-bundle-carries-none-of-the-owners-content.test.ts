// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * Read neutral and planted built bytes with the content scanner. Two real bundle commands prove
 * the green build and the pre-stamp refusal; a copy of the prepared green bundle proves the reset.
 * Every scanner value is made up, and no case reads the owner's own content. A made checkout that
 * carries the clean version's mark shows that there the ids design/ cites are not asked for, and
 * that the pass says so.
 */

import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, constants, gzipSync } from 'node:zlib'
import { afterAll, describe, expect, it } from 'vitest'

import { aFindingSaid, ownerContentIn, ownerContentInAFile, theIdsDesignCites, theOwnerContentRefusal, theUncheckedSaid, THE_ENTRIES } from '../scripts/no-owner-content.mjs'
import { thePatterns } from '../tools/merge-tool/owner-content.mjs'
import { isTheCleanVersion, whyThisIsNotTheCleanVersion } from '../scripts/the-clean-version-mark.mjs'
import { TEST_DATABASE_PREFIX } from './a-test-folder.ts'
import { THE_CLEAN_VERSION_MARK } from './the-copyright-line.ts'
import { THE_OWNERS_CONTENT_SETTING } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))

/**
 * The patterns made from invented people and places: an owner called Wrenfield, a real name Vantorp, an agent
 * Kestrelbot, a machine pipitbox, an office on port 6143, and the research words quernstone and sallow moth.
 */
const MADE_UP = thePatterns({ names: ['wrenfield'], realName: /\bvantorp\b/i, handles: ['kestrelbot'], machines: ['pipitbox'], ports: [6143], researchWords: ['quernstone', 'sallow ?moth'] })

/** The patterns made from no list, as the scanner's own are when no file of the owner's content was read. */
const NONE = thePatterns({ names: [], realName: null, handles: [], machines: [], ports: [], researchWords: [], notReadBecause: 'No invented list was given.' })

/** An invented id that design/ is said to cite. */
const A_CITED_ID = ['Qx7v', 'T2mL', 'p9Rw'].join('')
const CITED = new Set([A_CITED_ID])

/** An invented peer on the private network, on the one line of this file that tools/merge-tool/addresses-allowed.mjs lets through. */
const A_PEER = '100.101.12.34'

/** An invented research word, which MADE_UP's P7 finds. */
const A_RESEARCH_WORD = 'quernstone'

const RULE_FILE_ENTRY = THE_ENTRIES.find(entry => entry.key.startsWith('until the rule-file rewrite lands'))!.key

const folders: string[] = []
const aFolder = (name: string): string => {
  const dir = mkdtempSync(`${TEST_DATABASE_PREFIX}${name}-`)
  folders.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of folders) rmSync(dir, { recursive: true, force: true })
})

function write(dir: string, files: Record<string, string | Buffer>): void {
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), text)
  }
}

/** A made folder much as a bundle is: built code with esbuild's module marks, the page's JSON, a copied text, a picture. */
const NEUTRAL: Record<string, string | Buffer> = {
  'server.mjs': [
    "import { createRequire as __bundleRequire } from 'node:module';",
    '',
    '// src/server/lib/a.ts',
    "var greeting = 'Good morning, the person';",
    '',
    '// node_modules/some-package/index.js',
    'var other = 1;',
    '',
  ].join('\n'),
  'dist/web/office-map/rooms.json': '{\n  "name": "The reading room",\n  "zh": "阅览室"\n}\n',
  'dist/web/avatars/README.md': '# Avatars\n\nEach picture is drawn for the example project.\n',
  'dist/web/avatars/a.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d]),
}

/** What one file carries, with the invented patterns and id. */
const inAFile = (file: string, text: string | null) => ownerContentInAFile({ file, text, cited: CITED, root: REPO, patterns: MADE_UP, modulesFrom: REPO })

describe("a bundle carries none of the owner's content", () => {
  it('finds nothing in a folder of neutral files, and says how many it read and how many were not text', () => {
    const out = aFolder('owner-content-control')
    write(out, NEUTRAL)
    const seen = ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO })
    expect(seen.found).toEqual([])
    expect(seen.read).toBe(3)
    expect(seen.notText).toEqual(['dist/web/avatars/a.png'])
  })

  it.each([
    [1, 'P7', 'dist/web/avatars/README.md', `Drawn for the ${A_RESEARCH_WORD} study.`, A_RESEARCH_WORD],
    [2, 'P10', 'server.mjs', `var first = '${A_CITED_ID}';`, A_CITED_ID],
    [2, 'P11', 'server.mjs', "var session = '5f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f';", '5f1c2d3e-4b5a-4c6d-9e8f-0a1b2c3d4e5f'],
    [3, 'P8', 'dist/web/avatars/README.md', '画得慢一点', '画得慢一点'],
    [3, 'P9', 'server.mjs', "var why = 'as the owner wrote in his reply';", 'the owner wrote'],
    [3, 'P10', 'dist/web/avatars/README.md', `Drawn as decision ${A_CITED_ID} asks.`, A_CITED_ID],
    [4, 'P1', 'server.mjs', "var by = 'wrenfield';", 'wrenfield'],
    [4, 'P2', 'dist/web/office-map/rooms.json', '  "folder": "/home/fixture-user/rooms",', '/home/fixture-user'],
    [4, 'P3', 'dist/web/avatars/README.md', 'Ask tern@corvidmail.net for more.', 'tern@corvidmail.net'],
    [4, 'P4', 'server.mjs', `var peer = '${A_PEER}';`, A_PEER],
    [4, 'P4', 'server.mjs', "var host = 'pipitbox';", 'pipitbox'],
    [4, 'P5', 'server.mjs', 'var port = 6143;', '6143'],
    [4, 'P6', 'dist/web/avatars/README.md', 'Kestrelbot drew these.', 'Kestrelbot'],
  ] as const)('finds class %i (%s) planted in %s by its file, line and class, and nothing once it is taken out', (theClass, pattern, file, line, words) => {
    const out = aFolder('owner-content-plant')
    write(out, NEUTRAL)
    const before = String(NEUTRAL[file])
    const lines = before.split('\n')
    const at = file === 'server.mjs' ? 4 : 2
    write(out, { [file]: [...lines.slice(0, at), line, ...lines.slice(at)].join('\n') })
    const planted = ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO })
    expect(planted.found).toEqual([
      expect.objectContaining({ file, line: at + 1, class: theClass, pattern, words, from: file === 'server.mjs' ? 'src/server/lib/a.ts' : file }),
    ])
    const said = theOwnerContentRefusal('The bundle', planted.found)
    expect(said).toContain(`${file} line ${String(at + 1)}`)
    expect(said).toContain(`class ${String(theClass)} (`)
    expect(said).toContain(`${pattern}: "${words}"`)

    write(out, { [file]: before })
    expect(ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO }).found).toEqual([])
  })

  it('counts a brotli or gzip copy beside the file it unpacks to as not text, and refuses a copy that unpacks to anything else', () => {
    const out = aFolder('owner-content-copies')
    write(out, NEUTRAL)
    // A small brotli copy can hold no NUL byte, and this one holds none, so the 8 KB rule alone would read it as text.
    const script = "// src/web/lib/a.ts\nvar room = 'The reading room';\nvar other = 1;\n"
    const br = brotliCompressSync(script, { params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY } })
    expect(br.includes(0)).toBe(false)
    write(out, { 'dist/web/assets/a.js': script, 'dist/web/assets/a.js.br': br, 'dist/web/assets/a.js.gz': gzipSync(script) })
    const seen = ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO })
    expect(seen.found).toEqual([])
    expect(seen.read).toBe(4)
    expect(seen.notText).toEqual(['dist/web/assets/a.js.br', 'dist/web/assets/a.js.gz', 'dist/web/avatars/a.png'])

    write(out, { 'dist/web/assets/a.js.br': brotliCompressSync("var room = 'Another room';\n") })
    expect(() => ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO })).toThrow(/dist\/web\/assets\/a\.js\.br/)
  })

  it("reads Chinese in comments, copied texts and JSON values, and not in a string of code or on a \"zh\" line", () => {
    const code = ["var said = '早上好';", '/* 他说的 */ var a = [1, /* 他写的 */ 2];', 'var css = `.a { color: red; /* 他选的 */ }`;'].join('\n')
    expect(inAFile('dist/web/assets/a.js', code).found.map((one) => [one.line, one.words])).toEqual([
      [2, '他说的'],
      [2, '他写的'],
      [3, '他选的'],
    ])
    expect(inAFile('dist/web/a.json', '{\n  "zh": "早上好",\n  "note": "他说的"\n}').found.map((one) => [one.line, one.words])).toEqual([[3, '他说的']])
    expect(inAFile('dist/web/a.txt', '早上好').found.map((one) => one.words)).toEqual(['早上好'])
  })

  it("lets another package's code through by name, and says which of our files a found line came from", () => {
    const code = ['// node_modules/some-package/index.js', "var by = 'wrenfield';", '// src/server/lib/b.ts', "var by = 'wrenfield';"].join('\n')
    const seen = inAFile('server.mjs', code)
    expect(seen.found).toEqual([expect.objectContaining({ line: 4, from: 'src/server/lib/b.ts', pattern: 'P1' })])
    expect([...seen.let]).toEqual([["other packages' code and notices", 1]])
    expect(seen.found.map(aFindingSaid)).toEqual([expect.stringContaining('server.mjs line 4 (from src/server/lib/b.ts), class 4 (')])
  })

  it('reads the licence notices esbuild gathers at the end of a built file as the packages they name', () => {
    const notice = '   * @copyright 2026 A Maker <a.maker@makers.dev>'
    const code = [
      '// src/server/index.ts',
      "var greeting = 'Good morning, the person';",
      '/*! Bundled license information:',
      '',
      'some-package/dist/index.cjs:',
      '  (**',
      notice,
      '   *)',
      '*/',
      '',
    ].join('\n')
    const seen = inAFile('server.mjs', code)
    expect(seen.found).toEqual([])
    expect([...seen.let]).toEqual([["other packages' code and notices", 1]])
    // THE CONTROL: the same line in a comment of ours, before the block, is found and said with our file.
    const ours = inAFile('server.mjs', code.replace("var greeting = 'Good morning, the person';", `/*\n${notice}\n */`))
    expect(ours.found).toEqual([expect.objectContaining({ line: 3, from: 'src/server/index.ts', pattern: 'P3' })])
  })

  it('lets the rule files through by their named entry and nothing else, and reads every file name', () => {
    expect(THE_ENTRIES.map((entry) => entry.key)).toContain(RULE_FILE_ENTRY)
    const line = '# Rules\n\nAsk Kestrelbot, as the owner wrote.\n'
    for (const file of ['src/config/rules/CODE.md', 'src/config/roles.json', '.claude/skills/mole-office/SKILL.md', 'for-agents/README.md']) {
      const seen = inAFile(file, line)
      expect(seen.found, file).toEqual([])
      expect([...seen.let], file).toEqual([[RULE_FILE_ENTRY, 2]])
    }
    expect(inAFile('src/config/other.md', line).found.map((one) => one.pattern)).toEqual(['P6', 'P9'])
    const named = inAFile('dist/web/avatars/generated/kestrelbot.png', null).found
    expect(named).toEqual([expect.objectContaining({ file: 'dist/web/avatars/generated/kestrelbot.png', line: 0, class: 4, pattern: 'P6' })])
    expect(named.map(aFindingSaid)).toEqual([expect.stringContaining('kestrelbot.png in its name, class 4 (')])
  })

  it('with no list, still finds the shapes that need no names, and says which named patterns it did not look for', () => {
    const out = aFolder('owner-content-none')
    const lines = String(NEUTRAL['server.mjs']).split('\n')
    const plant = "var by = 'wrenfield'; var host = 'pipitbox:6143'; var about = 'the quernstone'; var at = '/home/fixture-user';"
    write(out, { ...NEUTRAL, 'server.mjs': [...lines.slice(0, 4), plant, ...lines.slice(4)].join('\n') })
    const none = ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: NONE, modulesFrom: REPO })
    expect(none.found.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(['P2 /home/fixture-user'])
    expect(none.unchecked.map(({ pattern, what }) => `${pattern} ${what}`)).toEqual([
      "P1 the owner's names",
      "P1 the owner's real name",
      "P4 the owner's machine names",
      "P5 the port of the owner's own office",
      'P6 the agent handles',
      "P7 the owner's research words",
      "P9 the owner's words or decisions told with the owner's name",
    ])
    expect(theUncheckedSaid(none.unchecked)).toBe(
      "Not looked for, so not passed: the owner's names (P1), the owner's real name (P1), the owner's machine names (P4), the port of the owner's own office (P5), the agent handles (P6), the owner's research words (P7) and the owner's words or decisions told with the owner's name (P9). No invented list was given.",
    )
    // The same folder, with a list of each kind: each invented name is found, and nothing is left unchecked.
    const made = ownerContentIn({ folder: out, root: REPO, cited: CITED, patterns: MADE_UP, modulesFrom: REPO })
    expect(made.unchecked).toEqual([])
    expect(theUncheckedSaid(made.unchecked)).toBeNull()
    expect(made.found.map(({ pattern, words }) => `${pattern} ${words}`)).toEqual(['P1 wrenfield', 'P2 /home/fixture-user', 'P4 pipitbox', 'P5 6143', 'P7 quernstone'])
  })

  it('in a checkout marked as the clean version, asks no design/ for ids, says so beside the pass, and still finds a citation', () => {
    // No list was read, as in the clean version, whatever this test run read.
    const noList = { notRead: `${THE_OWNERS_CONTENT_SETTING} is not set, so no file of the owner's content was read.`, content: null }
    const marked = aFolder('owner-content-marked')
    write(marked, { [THE_CLEAN_VERSION_MARK]: '{}\n' })
    const out = aFolder('owner-content-marked-bundle')
    write(out, NEUTRAL)
    const seen = ownerContentIn({ folder: out, root: marked, patterns: NONE, modulesFrom: REPO, ownersContent: noList })
    expect(seen.found).toEqual([])
    const why = 'This checkout is the clean version: it carries the clean version\'s mark and has no design/ folder to read them from. An id right after a citing word such as "decision" was still looked for.'
    expect(seen.unchecked.filter((one) => one.pattern === 'P10')).toEqual([{ pattern: 'P10', what: "the owner's record ids that design/ cites", why }])
    expect(theUncheckedSaid(seen.unchecked)).toContain(`the owner's record ids that design/ cites (P10). ${why}`)

    // An id with no citing word before it is not asked about there, and one right after "decision" still is.
    const lines = String(NEUTRAL['dist/web/avatars/README.md']).split('\n')
    write(out, { 'dist/web/avatars/README.md': [...lines.slice(0, 2), `Drawn as decision ${A_CITED_ID} asks, beside ${A_CITED_ID}.`, ...lines.slice(2)].join('\n') })
    const cited = ownerContentIn({ folder: out, root: marked, patterns: NONE, modulesFrom: REPO, ownersContent: noList })
    expect(cited.found.map(({ pattern, class: theClass, words }) => `${pattern} ${String(theClass)} ${words}`)).toEqual([`P10 3 ${A_CITED_ID}`])

    // THE CONTROLS: an unmarked checkout without design/ is refused as before, and a marked one that holds design/ in the one sentence.
    expect(() => ownerContentIn({ folder: out, root: aFolder('owner-content-unmarked'), patterns: NONE, modulesFrom: REPO, ownersContent: noList })).toThrow(
      /The ids design\/ cites could not be read/,
    )
    const markedWithDesign = aFolder('owner-content-marked-design')
    write(markedWithDesign, { [THE_CLEAN_VERSION_MARK]: '{}\n', 'design/a-note.md': '# A note\n' })
    const refusal = whyThisIsNotTheCleanVersion(markedWithDesign, noList)
    expect(refusal).not.toBeNull()
    expect(() => ownerContentIn({ folder: out, root: markedWithDesign, patterns: NONE, modulesFrom: REPO, ownersContent: noList })).toThrow(String(refusal))
  })

  it('reads the ids design/ cites from design/', (context) => {
    if (isTheCleanVersion(REPO)) {
      const reason =
        "This checkout is the clean version: it carries the clean version's mark and holds no design/ folder, so there are " +
        'no ids design/ cites to read. The case beside this one shows that the bundle asks design/ for none here.'
      context.task.meta.takenOut = reason
      context.skip(`taken out: ${reason}`)
      return
    }
    expect(theIdsDesignCites(REPO).size).toBeGreaterThan(0)
  })

  it('fails loudly when asked for the ids design/ cites in a checkout without design/', () => {
    expect(() => theIdsDesignCites(aFolder('owner-content-no-design'))).toThrow(/could not be read/)
  })

  it('passes a real bundle, refuses one with a planted file and leaves no stamp, and passes again in an emptied folder', () => {
    const out = join(aFolder('owner-content-bundle'), 'bundle')
    const bundle = () => spawnSync(process.execPath, [join(REPO, 'scripts', 'bundle.mjs'), '--out', out], { cwd: REPO, encoding: 'utf8', timeout: 300_000 })

    const first = bundle()
    expect(first.status, `${first.stdout}\n${first.stderr}`).toBe(0)
    expect(first.stdout).toContain("The bundle carries none of the owner's content")
    expect(first.stdout).toContain(RULE_FILE_ENTRY)
    expect(existsSync(join(out, 'drizzle', 'meta', '_journal.json'))).toBe(true)
    expect(readdirSync(join(out, 'drizzle', 'meta')).filter((name) => name.endsWith('_snapshot.json'))).toEqual([])

    const prepared = join(aFolder('owner-content-prepared'), 'bundle')
    cpSync(out, prepared, { recursive: true })

    // A home folder, which the bundle refuses whether or not the owner's content was read.
    write(out, { 'dist/web/planted.md': '# Planted\n\nA note kept in /home/fixture-user/notes.\n' })
    const second = bundle()
    expect(second.status, `${second.stdout}\n${second.stderr}`).toBe(1)
    expect(second.stderr).toContain(`dist/web/planted.md line 3, class 4 (`)
    expect(second.stderr).toContain('No bundle was made')
    expect(existsSync(join(out, 'build-stamp.json'))).toBe(false)

    rmSync(out, { recursive: true, force: true })
    cpSync(prepared, out, { recursive: true })
    expect(existsSync(join(out, 'dist/web/planted.md'))).toBe(false)
    expect(existsSync(join(out, 'build-stamp.json'))).toBe(true)
    // ONLY THE STAMP IS SCANNED AGAIN. Every other byte of this copy is one the first bundle's own scan read,
    // and the bundle writes its stamp after that scan, so this is the only scan that reads the stamp. It is
    // scanned with the bundle's own call, in a folder that holds it alone under the name it has in the bundle.
    const theStampAlone = aFolder('owner-content-stamp')
    cpSync(join(out, 'build-stamp.json'), join(theStampAlone, 'build-stamp.json'))
    expect(ownerContentIn({ folder: theStampAlone, root: REPO }).found).toEqual([])
  }, 900_000)
})
