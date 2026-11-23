// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * A FINISH KEEPS EXACTLY THE FIELDS OF A REVISION THAT THE CHECK'S LOOP READS.
 *
 * `theCheckEligibilityFactsOf` in src/server/lib/inspection.ts reads each revision of a run in one loop, to say whether
 * an inspector ever served the run or wrote it. Inside a finishing write the loop is not handed each revision whole:
 * `theRevisionsTheCheckReads` keeps only the fields named in `THE_FIELDS_THE_CHECK_READS`, and of `extra` only the
 * fields named in `THE_FIELDS_OF_EXTRA_THE_CHECK_READS`. A field the loop reads that its list leaves out is absent inside
 * a finish, and the run's check can then be decided wrongly. Case B of
 * tests/a-finish-reads-its-runs-revisions-once.test.ts sees that only for the revisions it builds.
 *
 * WHAT THIS FILE PROVES. Read from the source, the fields of a revision's data that the loop reads are the fields of
 * `THE_FIELDS_THE_CHECK_READS`, and the fields of its `extra` that the loop reads are the fields of
 * `THE_FIELDS_OF_EXTRA_THE_CHECK_READS`. It compares both ways: the loop reads no field a list leaves out, and a list
 * holds no field nothing reads. `extra` itself is in neither list, because a finish builds it from the second one.
 *
 * HOW IT READS THE SOURCE. It parses the files with `parseSync` of rolldown/utils, the parser Vite builds the page with,
 * because the TypeScript package here has no parser API. It starts from the name the loop gives each revision's data
 * (`snapshot` in `for (const { snapshot, writer } of snapshots)`) and reads every use of that name:
 *   - `snapshot['x']`, `snapshot.x` and `Object.hasOwn(snapshot, 'x')` read the field x. The value of `extra` is
 *     followed on, through a branch of a conditional and the `const` that keeps it, and each field read of it is a
 *     field of `extra`. A finish keeps every other field whole, so what is done with its value is not followed.
 *   - `typeof`, `===`, `!==` and `Array.isArray` read no field.
 *   - Data handed to a function is followed into it, whether as an argument or as a property of an object built for
 *     the call. The function is found by its name, declared in the same file or imported from a file of this
 *     repository, and its parameter in that place is read by these same rules. A property of the built object other
 *     than the one that holds the data reads nothing of the revision.
 *   - Any other use is named with its file and line, as one this test cannot follow, and the test fails.
 * It follows four functions today. The test fails if that set changes, so this list stays true:
 *   - `isObject` in inspection.ts, which only asks what kind of value it is handed;
 *   - `theAgentOfARunAmong` in inspection.ts, which the loop hands `{ data: snapshot }`;
 *   - `howARunNamesItsAgent` in inspection.ts, which `theAgentOfARunAmong` hands the same object; it reads
 *     servingAgentId, servingAgent and ranAs;
 *   - `theAgentARunServes` in src/server/lib/the-agent-a-run-serves.ts, which `howARunNamesItsAgent` hands the data; it
 *     reads servingAgentId and servingAgent.
 * A read in a followed function counts on every branch, including a branch the loop never reaches.
 * `howARunNamesItsAgent` reads ranAs only for a run that names its project, and the loop's object names none. A read
 * counted this way can only ask for one more field in a list, and that costs a finish one more column.
 *
 * IT FAILS LOUDLY WHEN IT CANNOT FIND WHAT IT READS. If `theCheckEligibilityFactsOf`, its loop over
 * `{ snapshot, writer }`, either list, or a function the loop hands the data to cannot be found, or a list is not a
 * list of quoted names, the test fails and says what it could not find. It never compares an empty set.
 *
 * THE MUTATIONS THAT MUST TURN THIS RED:
 * 1. A new `snapshot['x']` read in the loop, with no 'x' in THE_FIELDS_THE_CHECK_READS.
 * 2. 'deliveringMessage' taken out of THE_FIELDS_THE_CHECK_READS, while the loop still reads it.
 * 3. 'x' added to THE_FIELDS_THE_CHECK_READS, which nothing reads; or `extra['purpose']` taken out of the loop, while
 *    'purpose' stays in THE_FIELDS_OF_EXTRA_THE_CHECK_READS.
 * 4. A new field read through `theAgentOfARunAmong`: `run.data['x']` in `howARunNamesItsAgent`, or `data['x']` in
 *    `theAgentARunServes`.
 * 5. The data handed whole to something this test cannot follow, such as `Object.keys(snapshot)` or `{ ...snapshot }`.
 * 6. `theCheckEligibilityFactsOf` or either list renamed, or the loop no longer taking `snapshot` from each revision.
 *
 * It reads source files only. It opens no database and starts nothing.
 */
import { readFileSync } from 'node:fs'
import { join, posix } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSync } from 'rolldown/utils'
import { expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const INSPECTION = 'src/server/lib/inspection.ts'
const THE_FACTS = 'theCheckEligibilityFactsOf'

/** A node of the syntax tree the parser gives: its type, where it starts and ends, and its other fields. */
type Node = { type: string; start: number; end: number; [field: string]: unknown }

/** A file of this repository, parsed, with the parent of each node and the field of the parent that holds it. */
type AFile = { path: string; text: string; program: Node; parentOf: Map<Node, { parent: Node; field: string }> }

/**
 * WHAT A VALUE HOLDS OF THE REVISION: its data, the `extra` of its data, or an object built for a call whose property
 * `property` holds one of these.
 */
type Holds = 'data' | 'extra' | { property: string; holding: Holds }

/** What the loop was found to read, where, and through which functions. */
type TheReads = {
  data: Map<string, string[]>
  extra: Map<string, string[]>
  followed: Set<string>
  cannotFollow: string[]
  /** Each function already followed with what it was handed, so none is read twice. */
  seen: Set<string>
}

/** The fields of a node that hold only types, which name no value. */
const TYPES_ONLY = new Set(['typeAnnotation', 'returnType', 'typeParameters', 'typeArguments'])

it('a finish keeps exactly the fields of a revision that the check\'s loop reads', () => {
  const inspection = theFile(INSPECTION)
  const kept = {
    data: theListNamed(inspection, 'THE_FIELDS_THE_CHECK_READS'),
    extra: theListNamed(inspection, 'THE_FIELDS_OF_EXTRA_THE_CHECK_READS'),
  }
  const reads = theFieldsTheLoopReads(inspection)
  const read = { data: [...reads.data.keys()].filter((field) => field !== 'extra'), extra: [...reads.extra.keys()] }
  const whereRead = (field: string, at: Map<string, string[]>): string => `${field}, read at ${(at.get(field) ?? []).join(', ')}`
  // EVERYTHING IS FOUND BEFORE ANYTHING IS JUDGED, so a red run names each difference and not only the first.
  expect({
    followed: [...reads.followed].sort(),
    cannotFollow: reads.cannotFollow,
    readButNotKept: {
      data: read.data.filter((field) => !kept.data.includes(field)).map((field) => whereRead(field, reads.data)),
      extra: read.extra.filter((field) => !kept.extra.includes(field)).map((field) => whereRead(field, reads.extra)),
    },
    keptButNotRead: {
      data: kept.data.filter((field) => !read.data.includes(field)),
      extra: kept.extra.filter((field) => !read.extra.includes(field)),
    },
  }).toEqual({
    followed: [
      `howARunNamesItsAgent in ${INSPECTION}`,
      `isObject in ${INSPECTION}`,
      'theAgentARunServes in src/server/lib/the-agent-a-run-serves.ts',
      `theAgentOfARunAmong in ${INSPECTION}`,
    ],
    cannotFollow: [],
    readButNotKept: { data: [], extra: [] },
    keptButNotRead: { data: [], extra: [] },
  })
})

// ============================================================ the files and their trees

const files = new Map<string, AFile>()

/** The file at `path` under the repository, parsed once. */
function theFile(path: string): AFile {
  const known = files.get(path)
  if (known !== undefined) return known
  const text = readFileSync(join(ROOT, path), 'utf8')
  const parsed = parseSync(path, text)
  if (parsed.errors.length > 0) throw new Error(`${path} does not parse, so this test cannot read it: ${parsed.errors.map((one) => one.message).join('; ')}`)
  const program = parsed.program as unknown as Node
  const parentOf = new Map<Node, { parent: Node; field: string }>()
  for (const parent of everything(program)) {
    for (const { node, field } of under(parent)) parentOf.set(node, { parent, field })
  }
  const file = { path, text, program, parentOf }
  files.set(path, file)
  return file
}

function isNode(value: unknown): value is Node {
  return typeof value === 'object' && value !== null && typeof (value as { type?: unknown }).type === 'string'
}

/** The node in the field `field` of `node`, or null. */
function child(node: Node, field: string): Node | null {
  const value = node[field]
  return isNode(value) ? value : null
}

/** The nodes in the list in the field `field` of `node`. */
function children(node: Node, field: string): Node[] {
  const value = node[field]
  return Array.isArray(value) ? value.filter(isNode) : []
}

/**
 * The nodes directly under `node`, each with the field that holds it, leaving out the fields that hold only types. The
 * value of a shorthand property `{ data }` is its own node, and the field is said to be `value`.
 */
function under(node: Node): { node: Node; field: string }[] {
  return Object.entries(node).flatMap(([field, value]) => {
    if (field === 'parent' || TYPES_ONLY.has(field)) return []
    const values: unknown[] = Array.isArray(value) ? value : [value]
    return values.filter(isNode).map((one) => ({ node: one, field }))
  })
}

/** `root` and every node under it, in the order they start. */
function everything(root: Node): Node[] {
  const found: Node[] = []
  const seen = new Set<Node>([root])
  const waiting = [root]
  for (let node = waiting.pop(); node !== undefined; node = waiting.pop()) {
    found.push(node)
    for (const { node: one } of under(node)) {
      if (!seen.has(one)) {
        seen.add(one)
        waiting.push(one)
      }
    }
  }
  return found.sort((a, b) => a.start - b.start)
}

/** The file and line where `node` starts. */
function where(file: AFile, node: Node): string {
  return `${file.path}:${String(file.text.slice(0, node.start).split('\n').length)}`
}

/** The source of `node` on one line, cut to 160 characters. */
function textOf(file: AFile, node: Node): string {
  return file.text.slice(node.start, node.end).replace(/\s+/g, ' ').slice(0, 160)
}

/** The text of a quoted string, or null. */
function theStringOf(node: unknown): string | null {
  if (!isNode(node) || node.type !== 'Literal') return null
  const value = node['value']
  return typeof value === 'string' ? value : null
}

/**
 * The name a member expression reads (`property`), a property is written under (`key`) or an import takes from its file
 * (`imported`), or null where it is worked out when the code runs.
 */
function theNameIn(node: Node, field: 'property' | 'key' | 'imported'): string | null {
  const name = child(node, field)
  if (node['computed'] !== true && name?.type === 'Identifier') return String(name['name'])
  return theStringOf(name)
}

// ============================================================ the lists, the loop and the functions

/** The quoted names in the list `name` that `file` declares. It throws where there is not one such list of names. */
function theListNamed(file: AFile, name: string): string[] {
  const found = children(file.program, 'body').flatMap((statement) => {
    const declared = statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement
    return declared?.type === 'VariableDeclaration' ? children(declared, 'declarations').filter((one) => child(one, 'id')?.['name'] === name) : []
  })
  const [declarator] = found
  if (found.length !== 1 || declarator === undefined) {
    throw new Error(`${file.path} declares ${String(found.length)} lists named ${name}, not one, so this test cannot read which fields a finish keeps`)
  }
  const value = child(declarator, 'init')
  const list = value?.type === 'TSAsExpression' ? child(value, 'expression') : value
  const elements = list?.type === 'ArrayExpression' ? list['elements'] : null
  const names = Array.isArray(elements) ? elements.map(theStringOf) : []
  if (names.length === 0 || names.includes(null)) {
    throw new Error(`${name} in ${file.path} is not a list of quoted field names, so this test cannot read it: ${textOf(file, declarator)}`)
  }
  return names as string[]
}

/** The function named `name` in `file`: declared there, or imported into it from a file of this repository. */
function theFunctionNamed(file: AFile, name: string): { file: AFile; fn: Node; name: string } | string {
  for (const statement of children(file.program, 'body')) {
    const declared = statement.type === 'ExportNamedDeclaration' ? child(statement, 'declaration') : statement
    if (declared?.type === 'FunctionDeclaration' && child(declared, 'id')?.['name'] === name && child(declared, 'body') !== null) {
      return { file, fn: declared, name }
    }
    if (statement.type !== 'ImportDeclaration') continue
    for (const specifier of children(statement, 'specifiers')) {
      if (specifier.type !== 'ImportSpecifier' || child(specifier, 'local')?.['name'] !== name) continue
      const from = theStringOf(statement['source'])
      const imported = theNameIn(specifier, 'imported')
      if (from === null || imported === null || !from.startsWith('.')) return `${name} is imported from ${String(from)}, which this test does not read`
      return theFunctionNamed(theFile(posix.join(posix.dirname(file.path), from)), imported)
    }
  }
  return `no function ${name} is declared in ${file.path} or imported into it`
}

/** Every field of a revision the loop of `theCheckEligibilityFactsOf` reads, itself and through the functions it calls. */
function theFieldsTheLoopReads(file: AFile): TheReads {
  const facts = theFunctionNamed(file, THE_FACTS)
  if (typeof facts === 'string') throw new Error(`${facts}, so this test cannot find the loop that reads a run's revisions`)
  const loops: { loop: Node; binding: Node }[] = []
  for (const node of everything(facts.fn)) {
    const declaration = node.type === 'ForOfStatement' ? child(node, 'left') : null
    for (const declarator of declaration === null ? [] : children(declaration, 'declarations')) {
      const pattern = child(declarator, 'id')
      for (const property of pattern?.type === 'ObjectPattern' ? children(pattern, 'properties') : []) {
        const binding = child(property, 'value')
        if (theNameIn(property, 'key') === 'snapshot' && binding !== null && binding.type === 'Identifier') loops.push({ loop: node, binding })
      }
    }
  }
  const [only] = loops
  if (loops.length !== 1 || only === undefined) {
    throw new Error(`${THE_FACTS} in ${file.path} has ${String(loops.length)} loops over { snapshot, writer }, not one, so this test cannot find the fields it reads`)
  }
  const reads: TheReads = { data: new Map(), extra: new Map(), followed: new Set(), cannotFollow: [], seen: new Set() }
  theNameFollowed(reads, file, String(only.binding['name']), only.binding, only.loop, 'data', `the loop of ${THE_FACTS}`)
  return reads
}

// ============================================================ reading the uses

/** Every use of `name` inside `region`, where it holds `holds`. `binding` is where it is declared. */
function theNameFollowed(reads: TheReads, file: AFile, name: string, binding: Node, region: Node, holds: Holds, inside: string): void {
  for (const node of everything(region)) {
    if (node === binding || node.type !== 'Identifier' || node['name'] !== name) continue
    const how = howANameIsUsed(file, node)
    if (how === 'used') theUseOf(reads, file, node, holds, inside)
    else if (how === 'declared') reads.cannotFollow.push(`${where(file, node)} in ${inside}: ${name} is declared again here, so this test cannot tell its uses apart`)
  }
}

/** Whether an identifier uses a value, declares one, or only names a property. */
function howANameIsUsed(file: AFile, identifier: Node): 'used' | 'declared' | 'a property name' {
  const up = file.parentOf.get(identifier)
  if (up === undefined) return 'used'
  const { parent, field } = up
  if ((parent.type === 'MemberExpression' && field === 'property') || field === 'key') return parent['computed'] === true ? 'used' : 'a property name'
  if (parent.type === 'Property' && field === 'value' && file.parentOf.get(parent)?.parent.type === 'ObjectPattern') return 'declared'
  if ((parent.type === 'VariableDeclarator' && field === 'id') || field === 'params' || (field === 'id' && parent.type.startsWith('Function'))) return 'declared'
  return 'used'
}

/** One use of `node`, an expression that holds `holds`, read by the rules in the head comment of this file. */
function theUseOf(reads: TheReads, file: AFile, node: Node, holds: Holds, inside: string): void {
  const at = `${where(file, node)} in ${inside}`
  const up = file.parentOf.get(node)
  const parent = up?.parent
  const field = up?.field
  // A FIELD READ BY ITS NAME. The value of `extra` is followed on; a finish keeps any other field whole.
  if (parent?.type === 'MemberExpression' && field === 'object') {
    const name = theNameIn(parent, 'property')
    if (name !== null) {
      const read = aFieldRead(reads, holds, name, at)
      if (read !== null) theUseOf(reads, file, parent, read, inside)
      return
    }
  }
  // HANDED TO A CALL.
  if (parent?.type === 'CallExpression' && field === 'arguments' && theCallFollowed(reads, file, parent, node, holds, at)) return
  // PUT IN AN OBJECT BUILT FOR A CALL, as in `{ data: snapshot }`.
  if (parent?.type === 'Property' && field === 'value') {
    const object = file.parentOf.get(parent)?.parent
    const name = theNameIn(parent, 'key')
    if (object?.type === 'ObjectExpression' && name !== null) {
      theUseOf(reads, file, object, { property: name, holding: holds }, inside)
      return
    }
  }
  // ONE BRANCH OF A CONDITIONAL, so the conditional may hold it.
  if (parent?.type === 'ConditionalExpression' && field !== 'test') {
    theUseOf(reads, file, parent, holds, inside)
    return
  }
  // KEPT IN A CONST, which is followed through the block that declares it.
  if (parent?.type === 'VariableDeclarator' && field === 'init') {
    const id = child(parent, 'id')
    const block = theBlockAround(file, parent)
    if (id !== null && id.type === 'Identifier' && file.parentOf.get(parent)?.parent['kind'] === 'const' && block !== null) {
      theNameFollowed(reads, file, String(id['name']), id, block, holds, inside)
      return
    }
  }
  // ASKED ITS TYPE, OR COMPARED: no field is read.
  if (parent?.type === 'UnaryExpression' && parent['operator'] === 'typeof') return
  if (parent?.type === 'BinaryExpression' && (parent['operator'] === '===' || parent['operator'] === '!==')) return
  reads.cannotFollow.push(`${at}: ${textOf(file, parent ?? node)}`)
}

/**
 * The field `name` read of a value that holds `holds`. A read of the data or of its `extra` is counted. The answer is
 * what the value read holds of the revision, or null where it holds nothing this test follows.
 */
function aFieldRead(reads: TheReads, holds: Holds, name: string, at: string): Holds | null {
  if (holds === 'data' || holds === 'extra') {
    const counted = reads[holds]
    counted.set(name, [...(counted.get(name) ?? []), at])
    return holds === 'data' && name === 'extra' ? 'extra' : null
  }
  return name === holds.property ? holds.holding : null
}

/**
 * Whether the call reads its argument `node` in a way this test follows. `Array.isArray` reads no field,
 * `Object.hasOwn` reads the field it names, and a function named in this repository is followed.
 */
function theCallFollowed(reads: TheReads, file: AFile, call: Node, node: Node, holds: Holds, at: string): boolean {
  const callee = child(call, 'callee')
  const handed = children(call, 'arguments')
  const index = handed.indexOf(node)
  if (callee === null || index < 0) return false
  const calling = callee.type === 'MemberExpression' ? `${String(child(callee, 'object')?.['name'])}.${String(theNameIn(callee, 'property'))}` : null
  if (calling === 'Array.isArray' && index === 0) return true
  if (calling === 'Object.hasOwn' && index === 0) {
    const name = theStringOf(handed[1])
    if (name !== null) aFieldRead(reads, holds, name, at)
    return name !== null
  }
  if (callee.type !== 'Identifier') return false
  const found = theFunctionNamed(file, String(callee['name']))
  if (typeof found === 'string') {
    reads.cannotFollow.push(`${at}: ${found}`)
    return true
  }
  const parameter = children(found.fn, 'params')[index]
  if (parameter === undefined || parameter.type !== 'Identifier') {
    reads.cannotFollow.push(`${at}: ${found.name} takes it as its parameter ${String(index + 1)}, which is not one plain name`)
    return true
  }
  reads.followed.add(`${found.name} in ${found.file.path}`)
  const once = `${found.file.path} ${String(found.fn.start)} ${String(index)} ${JSON.stringify(holds)}`
  if (!reads.seen.has(once)) {
    reads.seen.add(once)
    theNameFollowed(reads, found.file, String(parameter['name']), parameter, found.fn, holds, found.name)
  }
  return true
}

/** The block a declaration is in, or null. */
function theBlockAround(file: AFile, node: Node): Node | null {
  for (let up = file.parentOf.get(node); up !== undefined; up = file.parentOf.get(up.parent)) {
    if (up.parent.type === 'BlockStatement') return up.parent
  }
  return null
}
