// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MANY PLACES IN `src/web` ASK EACH DETAIL SURFACE HOW MUCH TO SAY.
 *
 *     node tools/detail-readers.mjs           # writes the generated file
 *     node tools/detail-readers.mjs --print   # prints the counts and writes nothing
 *
 * WHAT THE NUMBER IS FOR. `settings-and-governance.md` §3.4 asks for the fact `readers` to be drawn
 * on the Settings row — how many places in the built product ask this surface how much to say — and
 * `graph.md:215` asks for it in the same words. Before this, the row could say *nothing reads this
 * yet* from a hand-kept list and could not say *four things read this*. The list is a claim; this
 * is a count.
 *
 * WHAT THE NUMBER IS NOT, AND THIS IS THE WHOLE REASON IT IS SAFE TO DRAW. §3.4: *"a working
 * control would vanish, the person's stored choice would become unreachable from the page, and the
 * whole suite would stay green."* This scan reads TEXT and matches TWO literals. There are four
 * literal call sites in all of `src/web` today, and `src/web/lib/detailchoice.ts` reaches every
 * surface through a variable and is excluded here by name. So the day somebody wires a surface up
 * through a prop, a constant or a loop, this reads `0` for a control that works.
 * Before matching, TypeScript's scanner replaces comment text with spaces. A comment that quotes
 * a call therefore adds no reader. Text inside strings stays in the scan, so `//` in a URL does
 * not start a comment. This is still a text scan, with the same blind spot for indirect calls.
 *
 * THEREFORE: `0` IS A DIAGNOSTIC AND NEVER A REASON TO HIDE A ROW OR DIM A CELL. The row draws its
 * full radio group whatever this says, and `tests/detail-readers-are-current.test.ts` has a test
 * whose whole job is to go red if `0` is ever wired to hiding anything.
 *
 * AND IT DOES NOT REPLACE THE SECOND OPINION. `DETAIL_SURFACES_EXPECTED_UNREAD` in
 * `src/shared/detail.ts` stays, and the run-time scan in `tests/how-much-each-thing-says.test.ts`
 * stays. §3.4: *"The first version deleted the second opinion and called the result a cache; that
 * was the wrong choice of the three."* This file is a third opinion. Three readings that can
 * disagree out loud is the point.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import * as ts from 'typescript/unstable/ast'

const root = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(root, 'src/shared/detail-readers.generated.ts')

/** Every `.ts` and `.tsx` under `src/web`, except the one file that reaches every surface. */
export function webFiles() {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (path.endsWith('.ts') || path.endsWith('.tsx')) files.push(path)
    }
  }
  walk(join(root, 'src/web'))
  return files.filter((file) => !file.endsWith('detailchoice.ts')).sort()
}

/** Keep the text scan while removing comments with TypeScript's lexer. */
function withoutComments(text) {
  const characters = text.split('')
  const scanner = ts.createScanner(false, ts.LanguageVariant.JSX, text)
  const templateExpressions = []
  const regexMayStartAfter = new Set([
    ts.SyntaxKind.OpenParenToken,
    ts.SyntaxKind.OpenBracketToken,
    ts.SyntaxKind.OpenBraceToken,
    ts.SyntaxKind.CommaToken,
    ts.SyntaxKind.SemicolonToken,
    ts.SyntaxKind.ColonToken,
    ts.SyntaxKind.QuestionToken,
    ts.SyntaxKind.QuestionQuestionToken,
    ts.SyntaxKind.EqualsToken,
    ts.SyntaxKind.PlusEqualsToken,
    ts.SyntaxKind.MinusEqualsToken,
    ts.SyntaxKind.AsteriskEqualsToken,
    ts.SyntaxKind.AsteriskAsteriskEqualsToken,
    ts.SyntaxKind.SlashEqualsToken,
    ts.SyntaxKind.PercentEqualsToken,
    ts.SyntaxKind.AmpersandEqualsToken,
    ts.SyntaxKind.BarEqualsToken,
    ts.SyntaxKind.CaretEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandEqualsToken,
    ts.SyntaxKind.BarBarEqualsToken,
    ts.SyntaxKind.QuestionQuestionEqualsToken,
    ts.SyntaxKind.PlusToken,
    ts.SyntaxKind.MinusToken,
    ts.SyntaxKind.AsteriskToken,
    ts.SyntaxKind.AsteriskAsteriskToken,
    ts.SyntaxKind.PercentToken,
    ts.SyntaxKind.AmpersandToken,
    ts.SyntaxKind.BarToken,
    ts.SyntaxKind.CaretToken,
    ts.SyntaxKind.ExclamationToken,
    ts.SyntaxKind.TildeToken,
    ts.SyntaxKind.LessThanToken,
    ts.SyntaxKind.GreaterThanToken,
    ts.SyntaxKind.LessThanEqualsToken,
    ts.SyntaxKind.GreaterThanEqualsToken,
    ts.SyntaxKind.EqualsEqualsToken,
    ts.SyntaxKind.EqualsEqualsEqualsToken,
    ts.SyntaxKind.ExclamationEqualsToken,
    ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ts.SyntaxKind.AmpersandAmpersandToken,
    ts.SyntaxKind.BarBarToken,
    ts.SyntaxKind.EqualsGreaterThanToken,
    ts.SyntaxKind.ReturnKeyword,
    ts.SyntaxKind.ThrowKeyword,
    ts.SyntaxKind.CaseKeyword,
    ts.SyntaxKind.DeleteKeyword,
    ts.SyntaxKind.VoidKeyword,
    ts.SyntaxKind.TypeOfKeyword,
    ts.SyntaxKind.YieldKeyword,
    ts.SyntaxKind.AwaitKeyword,
    ts.SyntaxKind.InKeyword,
    ts.SyntaxKind.InstanceOfKeyword,
    ts.SyntaxKind.ElseKeyword,
    ts.SyntaxKind.DoKeyword,
  ])
  let previousToken
  while (true) {
    let token = scanner.scan()
    if (token === ts.SyntaxKind.EndOfFile) break
    if (token === ts.SyntaxKind.SingleLineCommentTrivia || token === ts.SyntaxKind.MultiLineCommentTrivia) {
      for (let at = scanner.getTokenStart(); at < scanner.getTokenEnd(); at += 1) {
        if (characters[at] !== '\n' && characters[at] !== '\r') characters[at] = ' '
      }
      continue
    }
    if ((token === ts.SyntaxKind.SlashToken || token === ts.SyntaxKind.SlashEqualsToken) &&
        (previousToken === undefined || regexMayStartAfter.has(previousToken))) {
      token = scanner.reScanSlashToken()
    }
    if (token === ts.SyntaxKind.WhitespaceTrivia || token === ts.SyntaxKind.NewLineTrivia) continue
    if (token === ts.SyntaxKind.TemplateHead) templateExpressions.push(0)
    else if (token === ts.SyntaxKind.OpenBraceToken && templateExpressions.length > 0) {
      templateExpressions[templateExpressions.length - 1] += 1
    } else if (token === ts.SyntaxKind.CloseBraceToken && templateExpressions.length > 0) {
      const last = templateExpressions.length - 1
      if (templateExpressions[last] > 0) templateExpressions[last] -= 1
      else {
        const templateToken = scanner.reScanTemplateToken(false)
        if (templateToken === ts.SyntaxKind.TemplateTail) templateExpressions.pop()
      }
    }
    previousToken = token
  }
  return characters.join('')
}

/** Count the two literal call forms in one source file after comments have been removed. */
export function countReadersInText(text, surfaces) {
  const code = withoutComments(text)
  const counts = Object.fromEntries(surfaces.map((surface) => [surface, 0]))
  for (const surface of surfaces) {
    for (const literal of [`useDetail('${surface}'`, `detailFor('${surface}'`]) {
      let at = code.indexOf(literal)
      while (at !== -1) {
        counts[surface] += 1
        at = code.indexOf(literal, at + literal.length)
      }
    }
  }
  return counts
}

/**
 * The two literals a reader is written as. A variable call site is invisible here, by design.
 *
 * NEITHER LITERAL CARRIES THE CLOSING BRACKET, because both functions take more than the surface:
 * `useDetail(surface, kind)` gained the kind of record being drawn on 3 September 2026, and a
 * pattern ending in `')` read zero for every reader the moment it did.
 */
export function countReaders(surfaces) {
  const files = webFiles()
  const counts = Object.fromEntries(surfaces.map((surface) => [surface, 0]))
  for (const file of files) {
    const fileCounts = countReadersInText(readFileSync(file, 'utf8'), surfaces)
    for (const surface of surfaces) counts[surface] += fileCounts[surface]
  }
  return counts
}

/** The file's whole text, so the test can compare without writing anything. */
export function generatedText(counts) {
  const rows = Object.entries(counts)
    .map(([surface, readers]) => `  ${surface}: ${readers},`)
    .join('\n')
  return `/**
 * HOW MANY PLACES IN \`src/web\` ASK EACH SURFACE HOW MUCH TO SAY. GENERATED — DO NOT EDIT.
 *
 * Written by \`node tools/detail-readers.mjs\`. \`tests/detail-readers-are-current.test.ts\` fails
 * the build when this file and \`src/web\` disagree, so a new reader lands with a regeneration in
 * the same commit.
 *
 * WHAT THE NUMBER MEANS AND WHAT IT DOES NOT. It is a text scan for two literals, and it cannot
 * see a call site reached through a prop, a constant or a loop. \`0\` here means "this scan found
 * none", never "this control does nothing" — \`settings-and-governance.md\` §3.4 measured exactly
 * that case and said what it costs to confuse them: a working control would vanish and the
 * person's stored choice would become unreachable from the page. The Settings row draws its full
 * radio group whatever this file says. TypeScript's scanner removes comment text before matching,
 * so prose that quotes a call adds no reader. Strings stay in the scan, including \`//\` in a URL.
 *
 * The second opinion is \`DETAIL_SURFACES_EXPECTED_UNREAD\` in \`src/shared/detail.ts\`, held
 * honest by a behaviour test rather than by this scan. This is a third opinion, not a cache.
 */

/** How many places in the built product ask each surface how much to say. */
export const DETAIL_READERS: Readonly<Record<string, number>> = {
${rows}
}
`
}

/**
 * The ten surface names, read out of `DETAIL_DRAWS` in `src/shared/detail.ts`. That table is
 * `satisfies Record<DetailSurface, DetailDraws>`, so it is total by the type checker — a new
 * surface cannot be added without a row in it, and this scan cannot silently miss one.
 */
const surfacesFromShared = () => {
  const text = readFileSync(join(root, 'src/shared/detail.ts'), 'utf8')
  const m = text.match(/export const DETAIL_DRAWS = \{([\s\S]*?)\} as const satisfies/)
  if (m === null) throw new Error('DETAIL_DRAWS not found in src/shared/detail.ts')
  return [...m[1].matchAll(/^\s{2}([a-zA-Z]+):/gm)].map((one) => one[1])
}

export function currentText() {
  return generatedText(countReaders(surfacesFromShared()))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const counts = countReaders(surfacesFromShared())
  if (process.argv.includes('--print')) {
    for (const [surface, readers] of Object.entries(counts)) console.log(`${surface}: ${readers}`)
    console.log(`total: ${Object.values(counts).reduce((a, b) => a + b, 0)}`)
  } else {
    writeFileSync(OUT, generatedText(counts))
    console.log(`wrote ${OUT}`)
  }
}
