// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE OWNER'S CONTENT IS READ FROM ONE FILE OUTSIDE THE REPOSITORY, BY ONE READER: tests/the-owners-content-list.ts.
 *
 *   1. a file of every kind is read with its flags, and a comment or a blank line is no entry;
 *   2. a file not in the format is refused, naming the setting and the line;
 *   3. the setting not set, or set empty, is an answer: no file is read, and the reading says why;
 *   4. a file that is missing, a folder, empty, not UTF-8 or not in the format, and a path that is not absolute, are
 *      refused, naming the setting and never the path;
 *   5. imported, the module reads the file the setting names in its own environment, refuses a missing one, and takes
 *      out a case that needs the real content when none was read.
 *
 * Every name, handle, word, account, machine and port here is invented. The owner's real file is never read here: each
 * case that reads a file writes its own, in a folder of its own, and names it in its own environment.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import { readTheOwnersContent, THE_OWNERS_CONTENT_SETTING, theOwnersContentIn } from './the-owners-content-list.ts'

const REPO = fileURLToPath(new URL('..', import.meta.url))
const SETTING = 'MOLE_OFFICE_OWNER_CONTENT_LIST'

/** An invented file of every kind, with every flag, a comment and a blank line. */
const INVENTED = [
  "# The owner's content, invented for a test.",
  '# kind: name',
  'wrenfield',
  'tallowmere -- merge gate only',
  '',
  '# kind: real name',
  'vantorp -- inside longer words',
  'quillane',
  '# kind: handle',
  'kestrelbot',
  'siskinbot -- merge gate only',
  '# kind: research word',
  'gr[iy]ndle(s)? -- inside longer words',
  'lantern drum -- own sense: the drum this product draws; it is not the research drum',
  'fernwhistle -- inside longer words; own sense: a word of its own',
  'marrowpick',
  '# kind: account name',
  'wrenfield',
  '# kind: account email',
  'wren@example.invalid',
  '# kind: machine',
  'heronbox',
  'stiltbox',
  '# kind: port',
  '4719',
  '',
].join('\n')

const folders: string[] = []
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true })
})

/** A folder of this test's own, with a name a refusal is checked not to repeat. */
function aFolder(): string {
  const folder = mkdtempSync(join(tmpdir(), 'an-invented-owners-content-'))
  folders.push(folder)
  return folder
}

/** A file of this test's own holding `text`, or `bytes` when given. */
function aFile(text: string | Buffer): string {
  const file = join(aFolder(), 'the-invented-list.txt')
  writeFileSync(file, text)
  return file
}

/** The refusal reading `env` throws, checked to name the setting and never the file's path or name. */
function theRefusalOf(env: Record<string, string>): string {
  let said = ''
  try {
    readTheOwnersContent(env)
  } catch (error) {
    said = (error as Error).message
  }
  expect(said, 'reading this file threw nothing').not.toBe('')
  expect(said.startsWith(`${SETTING} `)).toBe(true)
  expect(said).not.toContain('an-invented-owners-content-')
  expect(said).not.toContain('the-invented-list')
  return said
}

/** The invented file with the lines of one kind, header and entries, replaced by `lines`. */
function withTheKind(kind: string, lines: readonly string[]): string {
  const all = INVENTED.split('\n')
  const start = all.indexOf(`# kind: ${kind}`)
  let end = start + 1
  while (end < all.length && !(all[end] ?? '').startsWith('# kind:')) end++
  return [...all.slice(0, start), ...lines, ...all.slice(end)].join('\n')
}

/**
 * Run `body` in a child node with the setting set to `value` in its own environment, as an ES module that has imported
 * the reader as `reader`. What the body prints, and how the child ended.
 */
function inAChild(value: string, body: string): { status: number | null; stdout: string; stderr: string } {
  const env: Record<string, string | undefined> = { ...process.env, [SETTING]: value }
  const script = `const reader = await import(${JSON.stringify(join(REPO, 'tests/the-owners-content-list.ts'))});\n${body}`
  const ran = spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: REPO, env, encoding: 'utf8', timeout: 20_000 })
  return { status: ran.status, stdout: ran.stdout, stderr: ran.stderr }
}

describe('the format', () => {
  it('reads a file of every kind with its flags, and a comment or a blank line is no entry', () => {
    expect(THE_OWNERS_CONTENT_SETTING).toBe(SETTING)
    expect(theOwnersContentIn(INVENTED)).toEqual({
      names: [{ word: 'wrenfield', mergeGateOnly: false }, { word: 'tallowmere', mergeGateOnly: true }],
      realNameParts: [{ word: 'vantorp', insideLongerWords: true }, { word: 'quillane', insideLongerWords: false }],
      handles: [{ word: 'kestrelbot', mergeGateOnly: false }, { word: 'siskinbot', mergeGateOnly: true }],
      researchWords: [
        { piece: 'gr[iy]ndle(s)?', insideLongerWords: true },
        { piece: 'lantern drum', theProductsOwnSense: 'the drum this product draws; it is not the research drum' },
        { piece: 'fernwhistle', theProductsOwnSense: 'a word of its own', insideLongerWords: true },
        { piece: 'marrowpick' },
      ],
      account: { name: 'wrenfield', email: 'wren@example.invalid' },
      machines: ['heronbox', 'stiltbox'],
      port: 4719,
    })
  })

  it('reads a file written with Windows line ends the same', () => {
    expect(theOwnersContentIn(INVENTED.replaceAll('\n', '\r\n'))).toEqual(theOwnersContentIn(INVENTED))
  })

  it.each([
    ['an empty file', '', 'names an empty file.'],
    ['a file of blank lines', '\n  \n\n', 'names an empty file.'],
    ['a kind it does not know', withTheKind('machine', ['# kind: nickname', 'heronbox']), 'names the kind "nickname", which is not one of:'],
    ['a kind named twice', `${INVENTED}# kind: machine\nmarshbox\n`, 'names the kind "machine" twice, at lines 21 and 26.'],
    ['an entry before any kind', `wrenfield\n${INVENTED}`, 'line 1 is an entry before any line `# kind: <kind>`.'],
    ['a name of two words', withTheKind('name', ['# kind: name', 'wren field']), ', of the kind "name", is not one word of letters, digits, - and _.'],
    ['a machine with a dot', withTheKind('machine', ['# kind: machine', 'heron.box']), ', of the kind "machine", is not one word of letters, digits, - and _.'],
    ['a flag the kind does not take', withTheKind('name', ['# kind: name', 'wrenfield -- inside longer words']), 'has the flag "inside longer words", which the kind "name" does not take.'],
    ['a flag nobody takes', withTheKind('handle', ['# kind: handle', 'kestrelbot -- quietly']), 'has the flag "quietly", which the kind "handle" does not take.'],
    ['a sense of its own on a name', withTheKind('name', ['# kind: name', 'wrenfield -- own sense: a word']), 'has the flag `own sense:`, which the kind "name" does not take.'],
    ['flags marked and not written', withTheKind('research word', ['# kind: research word', 'marrowpick --']), 'has ` -- ` and no flag after it.'],
    ['a sense of its own with no words', withTheKind('research word', ['# kind: research word', 'marrowpick -- own sense:']), 'has the flag `own sense:` with no prose after it.'],
    ['no value before the flags', withTheKind('machine', ['# kind: machine', '-- merge gate only']), 'has no value before its flags.'],
    ['a research word that is not a regular expression', withTheKind('research word', ['# kind: research word', 'gr(ndle']), ', of the kind "research word", is not a regular expression.'],
    ['a research word that matches no text', withTheKind('research word', ['# kind: research word', '(grindle)?']), ', of the kind "research word", matches no text at all, and so would match every line.'],
    ['an account email that is not one', withTheKind('account email', ['# kind: account email', 'wren at example']), ', of the kind "account email", is not an email address.'],
    ['a port of 0', withTheKind('port', ['# kind: port', '0']), ', of the kind "port", is not a port number.'],
    ['a port above 65535', withTheKind('port', ['# kind: port', '65536']), ', of the kind "port", is not a port number.'],
    ['a port in words', withTheKind('port', ['# kind: port', 'forty']), ', of the kind "port", is not a port number.'],
    ['a kind left out', withTheKind('machine', []), 'names a file with no line `# kind: machine`, so its machine entries are missing.'],
    ['a kind with no entry', withTheKind('handle', ['# kind: handle']), 'names a file whose kind "handle" has no entry.'],
    ['two ports', withTheKind('port', ['# kind: port', '4719', '4720']), 'names a file whose kind "port" has 2 entries, and it takes exactly one.'],
    ['two accounts', withTheKind('account name', ['# kind: account name', 'wrenfield', 'tallowmere']), 'names a file whose kind "account name" has 2 entries, and it takes exactly one.'],
  ])('refuses %s, naming the setting', (_what, text, words) => {
    let said = ''
    try {
      theOwnersContentIn(text)
    } catch (error) {
      said = (error as Error).message
    }
    expect(said.startsWith(`${SETTING} `), said).toBe(true)
    expect(said).toContain(words)
    expect(said).toContain("No gate that refuses the owner's content can run until it is fixed.")
  })
})

describe('the file the setting names', () => {
  it('reads no file when the setting is not set, and says so', () => {
    expect(readTheOwnersContent({})).toEqual({ notRead: `${SETTING} is not set, so no file of the owner's content was read.`, content: null })
  })

  it('reads no file when the setting is set empty, and says that is the same as not set', () => {
    expect(readTheOwnersContent({ [SETTING]: '' })).toEqual({
      notRead: `${SETTING} is set empty, which is the same as not set, so no file of the owner's content was read.`,
      content: null,
    })
  })

  it('reads the file it names', () => {
    expect(readTheOwnersContent({ [SETTING]: aFile(INVENTED) })).toEqual({ notRead: null, content: theOwnersContentIn(INVENTED) })
  })

  it('refuses a file that is not there, naming the setting and not the path', () => {
    expect(theRefusalOf({ [SETTING]: join(aFolder(), 'the-invented-list.txt') })).toContain('names a file that could not be read (ENOENT).')
  })

  it('refuses a folder in place of a file', () => {
    const folder = join(aFolder(), 'the-invented-list')
    mkdirSync(folder)
    expect(theRefusalOf({ [SETTING]: folder })).toContain('names a file that could not be read (EISDIR).')
  })

  it('refuses an empty file', () => {
    expect(theRefusalOf({ [SETTING]: aFile('') })).toContain('names an empty file.')
  })

  it('refuses a file that is not UTF-8', () => {
    expect(theRefusalOf({ [SETTING]: aFile(Buffer.from([0x23, 0x20, 0xff, 0xfe, 0x0a])) })).toContain('names a file that is not UTF-8 text.')
  })

  it('refuses a file not in the format', () => {
    expect(theRefusalOf({ [SETTING]: aFile(withTheKind('port', ['# kind: port', 'forty'])) })).toContain('line 25, of the kind "port", is not a port number.')
  })

  it('refuses a path that is not absolute', () => {
    expect(theRefusalOf({ [SETTING]: 'the-invented-list.txt' })).toContain('is not an absolute path, so no file was read.')
  })
})

describe('the module, imported', () => {
  it('holds the content of the file the setting names in its own environment', () => {
    const ran = inAChild(aFile(INVENTED), 'process.stdout.write(JSON.stringify(reader.THE_OWNERS_CONTENT))')
    expect(ran.stderr).toBe('')
    expect(ran.status).toBe(0)
    expect(JSON.parse(ran.stdout)).toEqual({ notRead: null, content: theOwnersContentIn(INVENTED) })
  })

  it('refuses to be imported when the setting names a file that is not there, naming the setting and not the path', () => {
    const missing = join(aFolder(), 'the-invented-list.txt')
    const ran = inAChild(missing, 'process.stdout.write("imported")')
    expect(ran.status).not.toBe(0)
    expect(ran.stdout).toBe('')
    expect(ran.stderr).toContain(`${SETTING} names a file that could not be read (ENOENT).`)
    expect(ran.stderr).not.toContain(missing)
  })

  it('takes out a case that needs the real content where none was read, in the form the runner reads', () => {
    const ran = inAChild(
      '',
      [
        'const notes = []',
        'const context = { skip: (note) => { notes.push(note) }, task: { meta: {} } }',
        'const answer = reader.takenOutWithoutTheOwnersContent(context)',
        'process.stdout.write(JSON.stringify({ answer, notes, meta: context.task.meta }))',
      ].join('\n'),
    )
    expect(ran.status).toBe(0)
    const reason = `${SETTING} is set empty, which is the same as not set, so no file of the owner's content was read. This case needs the owner's real content.`
    // The second key is the one the verdict on a privacy run reads (scripts/the-owner-content-verdict.mjs), so a case
    // taken out for want of the list is told from a case taken out for another reason.
    expect(JSON.parse(ran.stdout)).toEqual({ answer: true, notes: [`taken out: ${reason}`], meta: { takenOut: reason, takenOutWithoutTheOwnersContent: true } })
  })

  it('leaves a case in where the content was read', () => {
    const ran = inAChild(
      aFile(INVENTED),
      [
        'const notes = []',
        'const context = { skip: (note) => { notes.push(note) }, task: { meta: {} } }',
        'const answer = reader.takenOutWithoutTheOwnersContent(context)',
        'process.stdout.write(JSON.stringify({ answer, notes, meta: context.task.meta }))',
      ].join('\n'),
    )
    expect(ran.status).toBe(0)
    expect(JSON.parse(ran.stdout)).toEqual({ answer: false, notes: [], meta: {} })
  })
})
