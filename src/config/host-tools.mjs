// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * AN OFFICE'S REGISTERED HOST TOOLS: what a declaration may say, which arguments it takes, the command line it gives,
 * and how its log is masked. The office's door and the host job runner (tools/run-the-host-jobs.mjs) both check
 * with this one module, so the runner never runs what the door would have refused.
 *
 * WHAT A DECLARATION IS. A named program the office may run on the host as the person's own user, with a fixed
 * command line in which only whole placeholders change, arguments of a declared shape, a folder, a time limit, the
 * small files it hands back, the agents (and sandboxes) that may ask it, and, when it needs one, its own recovery
 * step for a lost job. The file holding them is `host-tools.json` beside the office's keys file
 * (./host-tools-file.mjs); only a secretary's door writes it.
 *
 * NO ARGUMENT IS EVER A PATH. Every text value is a plain name or value: no `/`, not `.` or `..`, not starting with
 * `.` or `-`, and no line break or NUL. A tool that needs a file resolves the name under its own fixed folder.
 */
import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, normalize, sep } from 'node:path'
import { maskedAsAPrintedLine } from './inspection-ending.mjs'
import { theSandboxesFolderNow } from './sandbox-folder.mjs'

/** The most a tool may run, in seconds: one day. */
export const AT_MOST_SECONDS = 24 * 60 * 60
/** The most bytes one output may hand back. */
export const AT_MOST_OUTPUT_BYTES = 64 * 1024
/** The most log lines a tool may hand back, and the most characters they may hold together. */
export const AT_MOST_LOG_LINES = 200
export const AT_MOST_LOG_CHARACTERS = 8000
/** The most characters the reason in a runner's answer may hold. */
export const AT_MOST_REASON_CHARACTERS = 2000

/** A tool's name, an argument's name, and an output's file name. */
const A_TOOL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/
const AN_ARGUMENT_NAME = /^[a-z][a-z0-9_]{0,39}$/
const AN_OUTPUT_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/
const A_SHA256 = /^[0-9a-f]{64}$/
/** A placeholder: an argv element that is exactly `{name}`. */
const A_PLACEHOLDER = /^\{([a-z][a-z0-9_]{0,39})\}$/

/**
 * WHAT IS NEVER THE PROGRAM, by the base name of the path and of the file it resolves to. A shell turns one argument
 * into a command line. An interpreter would put the sha256 on the interpreter and not on the script. `env`, `sudo` and
 * the like run another program the declaration does not name, and so do the second line's: a container runner is
 * root on the host, and the others start a program, or a command line, that an argument or a file could name. An
 * agent runtime on the host would run with full permissions outside both a sandbox and the guard. A registered script
 * may still call any of them inside itself, since its own sha256 is what is checked.
 */
const NEVER_THE_PROGRAM = new RegExp(
  '^(?:sh|bash|dash|zsh|ksh|mksh|csh|tcsh|fish|busybox|env|sudo|doas|su|pkexec|setsid|nohup|xargs|ssh|scp|sftp|node|nodejs|deno|bun|claude|codex|opencode|dsh|' +
    'docker|podman|systemd-run|nsenter|unshare|chroot|tmux|screen|script|expect|at|crontab|find|awk|gawk|mawk|make|git|rsync|' +
    '(?:python|pypy|perl|ruby|php|lua|luajit|tclsh|wish|rscript|pwsh|powershell)[0-9.]*)$',
  'i',
)

/**
 * WHY A VALUE IS NOT A PLAIN NAME OR VALUE, or null when it is.
 * @param {string} value
 * @returns {string | null}
 */
export function whyNotAPlainValue(value) {
  if (value === '') return 'it is empty'
  if (value.includes('/')) return 'it holds a "/", and no argument is a path'
  if (value === '.' || value === '..') return `it is "${value}", and no argument is a path`
  if (value.startsWith('.')) return 'it starts with ".", and no argument is a path or a hidden name'
  if (value.startsWith('-')) return 'it starts with "-", which the tool would read as an option'
  if (/[\n\r\0]/.test(value)) return 'it holds a line break or a NUL'
  return null
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** @param {unknown} value @param {number} least @param {number} most @returns {value is number} */
function aWholeNumberFrom(value, least, most) {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= least && value <= most
}

/** @param {unknown} value @returns {value is string} */
function anAbsolutePath(value) {
  return typeof value === 'string' && isAbsolute(value) && normalize(value) === value && !value.endsWith(sep)
}

/**
 * WHY ONE ARGUMENT'S SHAPE IS REFUSED, or null. A shape is exactly one of `text` ({pattern, maxLength}, the pattern
 * anchored at both ends), `wholeNumber` ({min, max}, never below 0, since "-1" reads as an option) and `oneOf`
 * (a list of plain values).
 * @param {string} name
 * @param {unknown} shape
 * @returns {string | null}
 */
function whyTheShapeIsRefused(name, shape) {
  if (!isObject(shape)) return `the argument "${name}" has no shape`
  const kinds = Object.keys(shape)
  if (kinds.length !== 1 || !['text', 'wholeNumber', 'oneOf'].includes(kinds[0] ?? '')) {
    return `the argument "${name}" must have exactly one of text, wholeNumber and oneOf; it has ${kinds.length === 0 ? 'none' : kinds.join(', ')}`
  }
  const text = shape['text']
  if (text !== undefined) {
    if (!isObject(text) || Object.keys(text).some((key) => key !== 'pattern' && key !== 'maxLength')) return `the text argument "${name}" takes only {pattern, maxLength}`
    const { pattern, maxLength } = text
    if (typeof pattern !== 'string' || !pattern.startsWith('^') || !pattern.endsWith('$') || pattern.endsWith('\\$')) {
      return `the pattern of "${name}" must be anchored, starting with ^ and ending with $`
    }
    try {
      new RegExp(pattern)
    } catch {
      return `the pattern of "${name}" is not a pattern JavaScript reads`
    }
    if (!aWholeNumberFrom(maxLength, 1, 200)) return `the maxLength of "${name}" must be a whole number from 1 to 200`
    return null
  }
  const number = shape['wholeNumber']
  if (number !== undefined) {
    if (!isObject(number) || Object.keys(number).some((key) => key !== 'min' && key !== 'max')) return `the whole number argument "${name}" takes only {min, max}`
    const { min, max } = number
    if (!aWholeNumberFrom(min, 0, Number.MAX_SAFE_INTEGER) || !aWholeNumberFrom(max, 0, Number.MAX_SAFE_INTEGER) || min > max) {
      return `the whole number argument "${name}" needs a min and a max, from 0 up, with min at most max`
    }
    return null
  }
  const values = shape['oneOf']
  if (!Array.isArray(values) || values.length === 0 || values.length > 50) return `the oneOf of "${name}" must list from 1 to 50 values`
  for (const value of values) {
    if (typeof value !== 'string') return `the oneOf of "${name}" lists something that is not text`
    const why = whyNotAPlainValue(value)
    if (why !== null) return `the oneOf of "${name}" lists "${value}", and ${why}`
  }
  return null
}

/** The keys a declaration has, and no other, read by the door's refusal and by the test that holds it. */
export const DECLARATION_KEYS = ['name', 'what', 'program', 'argv', 'arguments', 'folder', 'timeLimitSeconds', 'outputs', 'logLines', 'mayAsk', 'recovery']

/**
 * WHY A DECLARATION IS REFUSED, or null when its words are right. It reads nothing on disk but where the sandboxes
 * folder resolves: `theProgramOnDisk` reads the program. The door uses this on every read of the file, so a tool written there by hand is checked too.
 * @param {unknown} declaration
 * @returns {string | null}
 */
export function whyADeclarationIsRefused(declaration) {
  if (!isObject(declaration)) return 'a declaration is an object'
  const extra = Object.keys(declaration).filter((key) => !DECLARATION_KEYS.includes(key))
  if (extra.length > 0) return `a declaration has only ${DECLARATION_KEYS.join(', ')}; it also has ${extra.join(', ')}`
  const { name, what, program, argv, arguments: shapes, folder, timeLimitSeconds, outputs, logLines, mayAsk, recovery } = declaration
  if (typeof name !== 'string' || !A_TOOL_NAME.test(name)) return 'its name must be 1 to 40 small letters, digits and "-", starting with a letter or digit'
  if (typeof what !== 'string' || what.trim() === '' || what.length > 300 || /[\n\r]/.test(what)) return 'its "what" must be one line of at most 300 characters saying what the tool does'
  if (!isObject(program) || Object.keys(program).length !== 2 || !anAbsolutePath(program['path']) || typeof program['sha256'] !== 'string' || !A_SHA256.test(program['sha256'])) {
    return 'its program must be {path, sha256}: an absolute path written plainly, and the sha256 of the file in small hex'
  }
  if (NEVER_THE_PROGRAM.test(basename(program['path']))) return WHY_IT_IS_NEVER_THE_PROGRAM.itIs(basename(program['path']))
  if (insideTheSandboxesFolder(program['path'])) return 'its program is inside the sandboxes folder, where a sandboxed agent could change it'
  if (!isObject(shapes) || Object.keys(shapes).length > 20) return 'its arguments must be an object of at most 20 named shapes'
  for (const [argument, shape] of Object.entries(shapes)) {
    if (!AN_ARGUMENT_NAME.test(argument)) return `the argument name "${argument}" must be 1 to 40 small letters, digits and "_", starting with a letter`
    const why = whyTheShapeIsRefused(argument, shape)
    if (why !== null) return why
  }
  if (!Array.isArray(argv) || argv.length > 64) return 'its argv must be a list of at most 64 strings'
  const placed = new Set()
  for (const element of argv) {
    if (typeof element !== 'string' || /[\n\r\0]/.test(element)) return 'its argv must hold only strings of one line'
    const placeholder = A_PLACEHOLDER.exec(element)
    if (placeholder !== null) {
      const argument = /** @type {string} */ (placeholder[1])
      if (!Object.hasOwn(shapes, argument)) return `its argv names {${argument}}, which is not one of its arguments`
      placed.add(argument)
    } else if (element.includes('{') || element.includes('}')) {
      return `its argv element "${element}" holds a brace and is not a whole placeholder; an argument may only be a whole argv element`
    }
  }
  const unplaced = Object.keys(shapes).filter((argument) => !placed.has(argument))
  if (unplaced.length > 0) return `its argv never places ${unplaced.map((argument) => `{${argument}}`).join(', ')}`
  if (!anAbsolutePath(folder)) return 'its folder must be an absolute path written plainly'
  if (insideTheSandboxesFolder(folder)) return 'its folder is inside the sandboxes folder, where a sandboxed agent could write what the tool reads'
  if (!aWholeNumberFrom(timeLimitSeconds, 1, AT_MOST_SECONDS)) return `its timeLimitSeconds must be a whole number from 1 to ${AT_MOST_SECONDS}`
  if (!Array.isArray(outputs) || outputs.length > 8) return 'its outputs must be a list of at most 8'
  const names = new Set()
  for (const output of outputs) {
    if (!isObject(output) || Object.keys(output).length !== 2 || typeof output['name'] !== 'string' || !AN_OUTPUT_NAME.test(output['name']) || whyNotAPlainValue(output['name']) !== null) {
      return 'each output must be {name, maxBytes}, its name a plain file name'
    }
    if (!aWholeNumberFrom(output['maxBytes'], 1, AT_MOST_OUTPUT_BYTES)) return `the maxBytes of ${output['name']} must be a whole number from 1 to ${AT_MOST_OUTPUT_BYTES}`
    if (names.has(output['name'])) return `the output ${output['name']} is declared twice`
    names.add(output['name'])
  }
  if (!aWholeNumberFrom(logLines, 0, AT_MOST_LOG_LINES)) return `its logLines must be a whole number from 0 to ${AT_MOST_LOG_LINES}`
  if (!isObject(mayAsk) || Object.keys(mayAsk).some((key) => key !== 'agents' && key !== 'sandboxes')) return 'its mayAsk must be {agents, sandboxes?}'
  const { agents, sandboxes } = mayAsk
  if (!Array.isArray(agents) || agents.length === 0 || agents.some((agent) => typeof agent !== 'string' || agent.trim() === '')) {
    return 'its mayAsk.agents must name at least one agent by its id in this office, so a sandbox alone never lets every run in it ask'
  }
  if (sandboxes !== undefined && (!Array.isArray(sandboxes) || sandboxes.length === 0 || sandboxes.some((one) => typeof one !== 'string' || whyNotAPlainValue(one) !== null))) {
    return 'its mayAsk.sandboxes, when given, must name at least one sandbox by its plain name'
  }
  // A TOOL MAY NAME ITS OWN RECOVERY STEP. The runner calls it, with the job's id and nothing else,
  // only after a lost job's scope has stopped. It runs the same checks as the tool's own program.
  if (recovery !== undefined) {
    if (!isObject(recovery) || Object.keys(recovery).some((key) => key !== 'program' && key !== 'argv')) {
      return 'its recovery, when given, must be {program, argv}'
    }
    const recoveryProgram = recovery['program']
    if (!isObject(recoveryProgram) || Object.keys(recoveryProgram).length !== 2 || !anAbsolutePath(recoveryProgram['path']) || typeof recoveryProgram['sha256'] !== 'string' || !A_SHA256.test(recoveryProgram['sha256'])) {
      return 'its recovery program must be {path, sha256}: an absolute path written plainly, and the sha256 of the file in small hex'
    }
    if (NEVER_THE_PROGRAM.test(basename(recoveryProgram['path']))) return WHY_IT_IS_NEVER_THE_PROGRAM.itIs(basename(recoveryProgram['path']))
    if (insideTheSandboxesFolder(recoveryProgram['path'])) return 'its recovery program is inside the sandboxes folder, where a sandboxed agent could change it'
    const recoveryArgv = recovery['argv']
    if (!Array.isArray(recoveryArgv) || recoveryArgv.length === 0 || recoveryArgv.length > 16) return 'its recovery argv must be a list of from 1 to 16 strings'
    let jobs = 0
    for (const element of recoveryArgv) {
      if (typeof element !== 'string' || /[\n\r\0]/.test(element)) return 'its recovery argv must hold only strings of one line'
      if (element === '{job}') jobs += 1
      else if (element.includes('{') || element.includes('}')) return `its recovery argv element "${element}" is not a whole placeholder; the recovery step takes the job's id as {job} and nothing else`
    }
    if (jobs !== 1) return 'its recovery argv must place {job} exactly once, and nothing else'
  }
  return null
}

const WHY_NEVER_THE_PROGRAM =
  'a shell, an interpreter, env, sudo, ssh, a program that starts other programs or an agent runtime is never the ' +
  'program: a shell makes one argument a command line, an interpreter would carry the sha256 instead of the script, ' +
  'a program such as docker, make, git, find or awk runs what the declaration does not name, and an agent runtime on ' +
  'the host is outside both a sandbox and the guard. Name the script itself; it runs through its own first line.'

/** WHY A PROGRAM IS NEVER RUN, by the name the declaration gives it and by the name it resolves to on disk. */
export const WHY_IT_IS_NEVER_THE_PROGRAM = {
  /** @param {string} name */
  itIs: (name) => `its program is ${name}, and ${WHY_NEVER_THE_PROGRAM}`,
  /** @param {string} name */
  itResolvesTo: (name) => `its program resolves to ${name}, and ${WHY_NEVER_THE_PROGRAM}`,
}

/**
 * Whether a path is the sandboxes folder or inside it, as it is named and as it resolves, so a home reached through a
 * link does not hide it.
 * @param {string} path @returns {boolean}
 */
function insideTheSandboxesFolder(path) {
  const named = theSandboxesFolderNow()
  let resolved = named
  try {
    resolved = realpathSync(named)
  } catch {
    // Not made on this machine yet: the folder as it is named is the only one.
  }
  return [named, resolved].some((folder) => path === folder || path.startsWith(folder + sep))
}

const ANOTHER_OWNER = 'is owned by another user than the one the office runs as'

/**
 * WHY A PROGRAM ON DISK IS REFUSED, in the words theProgramOnDisk hands back: the door's refusal and a job's why that
 * could not start. A mode is its octal digits, as "775".
 */
export const WHY_A_PROGRAM_ON_DISK_IS_REFUSED = {
  /** @param {string} program @param {string} why */
  itsFile: (program, why) => `its program ${program} ${why}, so another could change it after it was checked`,
  /** @param {string} folder @param {string} why */
  itsFolder: (folder, why) => `the folder of its program, ${folder}, ${why}, so another could put a different file there`,
  /** @param {string} folder @param {string} why */
  aFolderAbove: (folder, why) => `the folder ${folder} above its program ${why}, so another could put a different folder in its place`,
  anotherOwner: ANOTHER_OWNER,
  anotherOwnerNotRoot: `${ANOTHER_OWNER}, and not by root`,
  /** @param {string} mode */
  othersMayWrite: (mode) => `may be written by others (mode ${mode})`,
  /** @param {string} mode @param {string} why */
  ownGroupNotKnown: (mode, why) => `may be written by its group (mode ${mode}), and the office user's own group is not known: ${why}`,
  /** @param {number} gid @param {string} mode */
  anotherGroup: (gid, mode) => `may be written by its group, number ${gid}, which is not the office user's own (mode ${mode})`,
  /** @param {string} mode @param {string} why */
  ownGroupNotAlone: (mode, why) => `may be written by its group (mode ${mode}), the office user's own, and ${why}`,
  /** @param {string} now @param {string} registered */
  itsSha256Changed: (now, registered) => `its program's sha256 is now ${now}, not the ${registered} it was registered with, so it is not run until it is registered again`,
}

/** WHY ANOTHER USER MAY BE IN THE OFFICE USER'S OWN GROUP, in theUsersOwnGroup's words. */
export const WHY_ANOTHER_MAY_BE_IN_THE_GROUP = {
  noNumbers: 'this system gives its users no numbers that could be read',
  /** @param {string} file @param {string} code */
  unreadable: (file, code) => `${file} could not be read (${code})`,
  /** @param {number} uid */
  notInPasswd: (uid) => `the office's user, number ${uid}, is not in /etc/passwd`,
  /** @param {string} name */
  theirsToo: (name) => `/etc/passwd gives the user ${name} that group as theirs too`,
  /** @param {string} name */
  aMember: (name) => `/etc/group names the user ${name} in that group`,
}

/**
 * Who else may write a file or folder, or null when nobody may: others may not, and its group may only when that group
 * is the office user's own and nobody else is in it (theUsersOwnGroup, read only when the group may write it). A
 * umask of 0002 makes every file and folder a user makes writable by that group.
 * @param {import('node:fs').Stats} stat
 * @param {() => TheOwnGroup} ownGroup
 * @returns {string | null}
 */
function whoElseMayWriteIt(stat, ownGroup) {
  const mode = (stat.mode & 0o777).toString(8)
  if ((stat.mode & 0o002) !== 0) return WHY_A_PROGRAM_ON_DISK_IS_REFUSED.othersMayWrite(mode)
  if ((stat.mode & 0o020) === 0) return null
  const own = ownGroup()
  if (own.gid === null) return WHY_A_PROGRAM_ON_DISK_IS_REFUSED.ownGroupNotKnown(mode, own.notAlone)
  if (stat.gid !== own.gid) return WHY_A_PROGRAM_ON_DISK_IS_REFUSED.anotherGroup(stat.gid, mode)
  if (own.notAlone !== null) return WHY_A_PROGRAM_ON_DISK_IS_REFUSED.ownGroupNotAlone(mode, own.notAlone)
  return null
}

/**
 * Why a file or folder is not this user's alone, or null when it is: it must be owned by the user the office runs as,
 * and nobody else may write it (whoElseMayWriteIt), so nobody else can change or swap the program after it was
 * checked. Until wave 13q round 64 its group could not write it either, whoever was in that group.
 * @param {import('node:fs').Stats} stat
 * @param {() => TheOwnGroup} ownGroup
 * @returns {string | null}
 */
function whyNotTheUsersAlone(stat, ownGroup) {
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid()) return ANOTHER_OWNER
  return whoElseMayWriteIt(stat, ownGroup)
}

/** @typedef {{ gid: null, notAlone: string } | { gid: number, notAlone: string | null }} TheOwnGroup */

/**
 * THE OFFICE USER'S OWN GROUP, AND WHY ANOTHER MAY BE IN IT. A umask of 0002 makes every folder a user makes writable
 * by the user's primary group, which on most Linux machines is the user's alone. It is the user's alone when
 * /etc/passwd gives no other user it as theirs, and /etc/group names no member of it but this user. Members that
 * another source than those two files gives, as a directory service can, are not seen.
 * @param {(path: string) => string} readFile
 * @returns {TheOwnGroup} the group's number, null when it is not known, and why
 *   another user may be in it, null when nobody else is
 */
function theUsersOwnGroup(readFile) {
  if (typeof process.getuid !== 'function') return { gid: null, notAlone: WHY_ANOTHER_MAY_BE_IN_THE_GROUP.noNumbers }
  const uid = process.getuid()
  /** @param {string} file @returns {string[][] | string} the file's rows, or why it could not be read */
  const rowsOf = (file) => {
    try {
      return readFile(file).split('\n').map((line) => line.split(':'))
    } catch (error) {
      return WHY_ANOTHER_MAY_BE_IN_THE_GROUP.unreadable(file, /** @type {NodeJS.ErrnoException} */ (error).code ?? String(error))
    }
  }
  const users = rowsOf('/etc/passwd')
  if (typeof users === 'string') return { gid: null, notAlone: users }
  const me = users.find((row) => row.length >= 4 && row[2] !== '' && Number(row[2]) === uid)
  const gid = me === undefined || me[3] === '' ? Number.NaN : Number(me[3])
  if (me === undefined || !Number.isInteger(gid)) return { gid: null, notAlone: WHY_ANOTHER_MAY_BE_IN_THE_GROUP.notInPasswd(uid) }
  const another = users.find((row) => row.length >= 4 && row[0] !== me[0] && row[3] !== '' && Number(row[3]) === gid)
  if (another !== undefined) return { gid, notAlone: WHY_ANOTHER_MAY_BE_IN_THE_GROUP.theirsToo(String(another[0])) }
  const groups = rowsOf('/etc/group')
  if (typeof groups === 'string') return { gid, notAlone: groups }
  const itsRow = groups.find((row) => row.length >= 4 && row[2] !== '' && Number(row[2]) === gid)
  const member = (itsRow?.[3] ?? '').split(',').map((name) => name.trim()).find((name) => name !== '' && name !== me[0])
  if (member !== undefined) return { gid, notAlone: WHY_ANOTHER_MAY_BE_IN_THE_GROUP.aMember(member) }
  return { gid, notAlone: null }
}

/**
 * Why a folder above the program's folder is refused, or null. Whoever may write a folder may rename what is in it and
 * put a folder of their own in its place, so the program's path would lead to another program. So the folder must be
 * owned by the user the office runs as or by root, and nobody else may write it, unless it is sticky, as /tmp is: in a
 * sticky folder only a thing's owner may rename it. Its group may write it when that group is the office user's own,
 * and nobody else is in it (whoElseMayWriteIt).
 * @param {import('node:fs').Stats} stat
 * @param {() => TheOwnGroup} ownGroup
 * @returns {string | null}
 */
function whyAFolderAboveIsRefused(stat, ownGroup) {
  if (typeof process.getuid === 'function' && stat.uid !== process.getuid() && stat.uid !== 0) {
    return WHY_A_PROGRAM_ON_DISK_IS_REFUSED.anotherOwnerNotRoot
  }
  if ((stat.mode & 0o1000) !== 0) return null
  return whoElseMayWriteIt(stat, ownGroup)
}

/**
 * The sha256 of a file, in small hex.
 * @param {string} path
 * @returns {string}
 */
export function theSha256Of(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * THE PROGRAM AND ITS FOLDER AS THEY ARE ON DISK, or why they are refused. The program must be a regular file (a link
 * is followed, and the file it resolves to is checked by the same names), outside the sandboxes folder, owned by this
 * user in a folder owned by this user, written by nobody else but this user's own group when nobody else is in it
 * (whyNotTheUsersAlone), and have the declared sha256. Every folder above that folder, up to /, is this user's or
 * root's and written by nobody else unless it is sticky, or by this user's own group alone (whyAFolderAboveIsRefused).
 * A program changed since it was registered is not run until it is registered again. The folder must be a folder that
 * resolves outside the sandboxes folder. The runner starts the real paths handed back, so a link changed after this
 * check starts nothing else.
 * @param {{ program: { path: string, sha256: string }, folder: string }} declaration
 * @param {(path: string) => import('node:fs').Stats} [statOf] how a path is read: statSync, unless a test hands in its
 *   own, since no folder on a test machine is another user's
 * @param {(path: string) => string} [readFile] how /etc/passwd and /etc/group are read, for the same reason
 * @returns {{ refused: string } | { program: string, folder: string }}
 */
export function theProgramOnDisk(declaration, statOf = statSync, readFile = (path) => readFileSync(path, 'utf8')) {
  const { path, sha256 } = declaration.program
  let real
  try {
    real = realpathSync(path)
  } catch {
    return { refused: `its program ${path} is not there` }
  }
  if (NEVER_THE_PROGRAM.test(basename(real))) return { refused: WHY_IT_IS_NEVER_THE_PROGRAM.itResolvesTo(basename(real)) }
  if (insideTheSandboxesFolder(real)) return { refused: 'its program resolves to a file inside the sandboxes folder, where a sandboxed agent could change it' }
  const file = statOf(real)
  if (!file.isFile()) return { refused: `its program ${path} is not a regular file` }
  /** @type {TheOwnGroup | undefined} */
  let own
  const ownGroup = () => (own ??= theUsersOwnGroup(readFile))
  const notTheFile = whyNotTheUsersAlone(file, ownGroup)
  if (notTheFile !== null) return { refused: WHY_A_PROGRAM_ON_DISK_IS_REFUSED.itsFile(real, notTheFile) }
  const notTheFolder = whyNotTheUsersAlone(statOf(dirname(real)), ownGroup)
  if (notTheFolder !== null) return { refused: WHY_A_PROGRAM_ON_DISK_IS_REFUSED.itsFolder(dirname(real), notTheFolder) }
  for (let above = dirname(dirname(real)); ; above = dirname(above)) {
    const notAbove = whyAFolderAboveIsRefused(statOf(above), ownGroup)
    if (notAbove !== null) return { refused: WHY_A_PROGRAM_ON_DISK_IS_REFUSED.aFolderAbove(above, notAbove) }
    if (dirname(above) === above) break
  }
  const now = theSha256Of(real)
  if (now !== sha256) return { refused: WHY_A_PROGRAM_ON_DISK_IS_REFUSED.itsSha256Changed(now, sha256) }
  let folder
  try {
    if (!lstatSync(declaration.folder).isDirectory()) return { refused: `its folder ${declaration.folder} is not a folder` }
    folder = realpathSync(declaration.folder)
  } catch {
    return { refused: `its folder ${declaration.folder} is not there` }
  }
  if (insideTheSandboxesFolder(folder)) return { refused: 'its folder resolves to a folder inside the sandboxes folder, where a sandboxed agent could write what the tool reads' }
  return { program: real, folder }
}

/**
 * THE SHAPE A TOOL'S ARGUMENTS MUST HAVE, in words, for the refusal that says it.
 * @param {{ name: string, arguments: Record<string, Record<string, unknown>> }} declaration
 * @returns {string}
 */
export function theShapeWanted(declaration) {
  const parts = Object.entries(declaration.arguments).map(([name, shape]) => {
    const text = /** @type {{ pattern: string, maxLength: number } | undefined} */ (shape['text'])
    if (text !== undefined) return `${name}: text matching ${text.pattern}, at most ${text.maxLength} characters`
    const number = /** @type {{ min: number, max: number } | undefined} */ (shape['wholeNumber'])
    if (number !== undefined) return `${name}: a whole number from ${number.min} to ${number.max}`
    return `${name}: one of ${/** @type {string[]} */ (shape['oneOf']).map((value) => `"${value}"`).join(', ')}`
  })
  return parts.length === 0
    ? `The tool ${declaration.name} takes no arguments, so "arguments" is {}.`
    : `The tool ${declaration.name} takes exactly {${parts.join('; ')}}. Every text is a plain value: no "/", not "." or "..", not starting with "." or "-", and no line break.`
}

/**
 * WHY THESE ARGUMENTS ARE REFUSED FOR THIS TOOL, or null. Every declared argument is given, nothing else is, and each
 * value has its declared shape and is a plain value whatever the pattern says.
 * @param {{ arguments: Record<string, Record<string, unknown>> }} declaration
 * @param {unknown} given
 * @returns {string | null}
 */
export function whyTheArgumentsAreRefused(declaration, given) {
  if (!isObject(given)) return '"arguments" must be an object of named values'
  const declared = Object.keys(declaration.arguments)
  const unknown = Object.keys(given).filter((name) => !declared.includes(name))
  if (unknown.length > 0) return `it takes no argument named ${unknown.map((name) => `"${name}"`).join(', ')}`
  const missing = declared.filter((name) => !Object.hasOwn(given, name))
  if (missing.length > 0) return `${missing.map((name) => `"${name}"`).join(', ')} ${missing.length === 1 ? 'is' : 'are'} missing`
  for (const [name, shape] of Object.entries(declaration.arguments)) {
    const value = given[name]
    const text = /** @type {{ pattern: string, maxLength: number } | undefined} */ (shape['text'])
    const number = /** @type {{ min: number, max: number } | undefined} */ (shape['wholeNumber'])
    if (text !== undefined) {
      if (typeof value !== 'string') return `"${name}" must be text`
      if (value.length > text.maxLength) return `"${name}" is ${value.length} characters, more than ${text.maxLength}`
      const why = whyNotAPlainValue(value)
      if (why !== null) return `"${name}" is refused because ${why}`
      if (!new RegExp(text.pattern).test(value)) return `"${name}" does not match ${text.pattern}`
    } else if (number !== undefined) {
      if (!aWholeNumberFrom(value, number.min, number.max)) return `"${name}" must be a whole number from ${number.min} to ${number.max}`
    } else if (typeof value !== 'string' || !/** @type {string[]} */ (shape['oneOf']).includes(value)) {
      return `"${name}" must be one of ${/** @type {string[]} */ (shape['oneOf']).map((one) => `"${one}"`).join(', ')}`
    }
  }
  return null
}

/**
 * THE COMMAND LINE FOR ONE JOB: the declared argv, with each placeholder element replaced by its argument's value as
 * one whole element. Nothing else is put anywhere. Call it only with arguments `whyTheArgumentsAreRefused` passed.
 * @param {{ argv: string[] }} declaration
 * @param {Record<string, string | number>} given
 * @returns {string[]}
 */
export function theArgv(declaration, given) {
  return declaration.argv.map((element) => {
    const placeholder = A_PLACEHOLDER.exec(element)
    return placeholder === null ? element : String(given[/** @type {string} */ (placeholder[1])])
  })
}

/**
 * WHAT A FILE OF HOST TOOLS SAYS, or why it is not used. The file must be a regular file owned by this user and
 * readable and writable by nobody else; otherwise it is refused whole. A missing file is an office with no tools.
 * Each declaration is checked, and one that is refused is listed with why, and never asked.
 * @param {string} file
 * @returns {{ refused: string } | { tools: Record<string, unknown>[], refusedTools: { name: string, why: string }[] }}
 */
export function readTheHostTools(file) {
  let stat
  try {
    stat = lstatSync(file)
  } catch {
    return { tools: [], refusedTools: [] }
  }
  if (!stat.isFile()) return { refused: `${HOST_TOOLS_IN_WORDS} is not a regular file, so no host tool is used.` }
  const me = typeof process.getuid === 'function' ? process.getuid() : null
  if (me !== null && stat.uid !== me) return { refused: `${HOST_TOOLS_IN_WORDS} is owned by another user, so no host tool is used.` }
  if ((stat.mode & 0o077) !== 0) return { refused: `${HOST_TOOLS_IN_WORDS} may be read or written by others (mode ${(stat.mode & 0o777).toString(8)}), so no host tool is used. It must be mode 600.` }
  let parsed
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { refused: `${HOST_TOOLS_IN_WORDS} is not JSON, so no host tool is used.` }
  }
  if (!isObject(parsed) || !Array.isArray(parsed['tools'])) return { refused: `${HOST_TOOLS_IN_WORDS} is not {tools: [...]}, so no host tool is used.` }
  /** @type {Record<string, unknown>[]} */
  const tools = []
  /** @type {{ name: string, why: string }[]} */
  const refusedTools = []
  for (const entry of parsed['tools']) {
    const declaration = isObject(entry) ? entry['declaration'] : undefined
    const name = isObject(declaration) && typeof declaration['name'] === 'string' ? declaration['name'] : '(no name)'
    const why = isObject(entry) && isObject(entry['registered']) ? whyADeclarationIsRefused(declaration) : 'it carries no "registered" part saying who registered it'
    if (why === null) tools.push(/** @type {Record<string, unknown>} */ (entry))
    else refusedTools.push({ name, why })
  }
  return { tools, refusedTools }
}

/** How the file is named in words. */
const HOST_TOOLS_IN_WORDS = "The office's host tools file"

/** A home on any /home-like mount, such as /home_nfs/<login>, which the printed-line mask does not take. */
const A_HOME_ON_A_MOUNT = /(?<![\w.~/-])\/home[_A-Za-z0-9-]*\/[A-Za-z0-9._-]+/g
/** A host name on a private network: one ending .ts.net or .local. */
const A_PRIVATE_HOST = /(?<![\w.-])[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?:ts\.net|local)(?![\w-])/gi
/** The login of `ssh ... -l <login>`. */
const AN_SSH_LOGIN = /(\bssh\b[^\n]*?\s-l\s*)([^\s'"]+)/g

/** What stands where a key in base64 was. */
export const A_KEY_IN_BASE64 = '<a key in base64, not shown>'
/** The fewest characters a run of base64 has to be read as a key: 20, as 15 bytes are. */
export const A_KEYS_LENGTH = 20
/**
 * A run of the characters of base64 and of base64url, of a key's length at least, and the `=` that pads its end. An `=`
 * is the padding only when no character of a run follows it. One with more after it is no part of the run, so in
 * `API_KEY=…` the name is a run of its own, and a run that ends in `=` ends there.
 */
const A_RUN_OF_BASE64 = new RegExp(`[A-Za-z0-9+/_-]{${A_KEYS_LENGTH},}(?:=+(?![A-Za-z0-9+/_=-]))?`, 'g')
/** The end of base64 that is padded: a character, then one `=` or two. */
const A_PADDED_END = /[^=]={1,2}$/
/** The characters that join the pieces of a run, but for the `=` of its padding. */
const A_JOINING_CHARACTER = /[+/_-]/
/** A run's pieces: its letters and digits between the other characters. */
const A_PIECE = /[A-Za-z0-9]+/g
/** A word: three or more lower-case letters, the first of them perhaps a capital. */
const A_WORDS_SHAPE = '[A-Z]?[a-z]{3,}'
/** A piece that is a word. */
const A_WORD = new RegExp(`^${A_WORDS_SHAPE}$`)
/** A piece that is a word in capitals, as each piece of `OWNER-REVIEW-ROUND-SIX` is. */
const A_WORD_IN_CAPITALS = /^[A-Z]{3,}$/
/** The first folders of a path that are words, with the `/` after them, as `/tmp/` or `/var/lib/`. */
const A_PATHS_FIRST_WORDS = new RegExp(`^(?:/${A_WORDS_SHAPE})+/`)
/** A run is a path when its pieces that are words hold a quarter of its letters and digits or more. */
export const A_PATHS_SHARE_OF_WORDS = 1 / 4
/**
 * A word of a name in camelCase or snake_case: a capital and lower-case letters, or two lower-case letters or more
 * that do not follow another. It counts only when its lower-case letters hold a vowel (`A_VOWEL`). A key has runs of
 * lower-case letters too, and they hold no vowel more often than a word does.
 */
const A_NAMES_WORD = /[A-Z][a-z]+|(?<![a-z])[a-z]{2,}/g
/** The vowels, and y. */
const A_VOWEL = /[aeiouy]/
/** The short words a name is made of whose only vowel is their capital, which count as words too. */
const SHORT_WORDS = new Set(['An', 'And', 'As', 'Ask', 'At', 'End', 'If', 'In', 'Is', 'It', 'Its', 'Of', 'On', 'Or', 'Own', 'Up', 'Us'])
/** A run is a name when the words of names in it hold this share of its letters and digits or more. */
export const A_NAMES_SHARE_OF_WORDS = 6 / 10
/**
 * WHERE A RUN OF BASE64 HOLDS A KEY, or null when it holds none. These rules were measured on thousands of made-up
 * keys, of which none shows 8 characters together, and on the checkout's own code, tests and logs, of which they hide
 * no line. The run is cut into pieces at `+`, `/`, `=`, `_` and `-`. A run whose pieces that are words hold a quarter
 * of its letters and digits or more is a path, and holds no key. Pieces in capitals count as words when there are two
 * or more of them, as in `design/OWNER-REVIEW-ROUND-SIX.md`; one alone is as likely a piece of a key. A run whose words
 * of names hold six in ten of them or more is a name, or names joined, as `out/daysSinceLastChange` is, and holds no
 * key. Otherwise the key is the whole run, but for the first folders of a path that are words: they stay shown, as
 * `/tmp/` before a generated folder name does, while a key that begins with `/` is hidden from that `/`. It is a key
 * when it has a key's length, holds two upper-case and two lower-case letters, and holds a digit or one of `+`, `/`,
 * `_` and `-`. A time such as 2026-10-27T15-02-29 holds one capital, and a hex key has one case and is left to the
 * printed-line mask.
 *
 * TWO RUNS ARE READ AS A KEY WHATEVER THEIR WORDS (wave 13q round 62). Of 957 made-up keys holding a `/`, the words
 * read one as a path or a name, and of 500 keys of 16 bytes, three.
 *   - A run padded as base64 is: its key is a multiple of four characters long and ends in one `=` or two. A path or a
 *     name ends in `=` only where more follows it, and that `=` is no part of the run.
 *   - A run read as a name that holds a `+`, `/`, `_` or `-`, and that the printed-line mask would hide a part of. That
 *     mask hides a part only when the part has the shape of a key, so it is a key joined to more, and the whole run is
 *     hidden. A name standing alone is left to that mask, as before.
 * @param {string} run
 * @returns {{ start: number, length: number } | null}
 */
function theKeyIn(run) {
  const start = (A_PATHS_FIRST_WORDS.exec(run) ?? [''])[0].length
  const key = run.slice(start)
  const aKey = key.length >= A_KEYS_LENGTH && /[A-Z].*[A-Z]/.test(key) && /[a-z].*[a-z]/.test(key) && /[0-9+/_-]/.test(key)
  const padded = A_PADDED_END.test(key) && key.length % 4 === 0
  if (!padded) {
    const pieces = [...run.matchAll(A_PIECE)]
    const characters = pieces.reduce((count, piece) => count + piece[0].length, 0)
    const inCapitals = pieces.filter((piece) => A_WORD_IN_CAPITALS.test(piece[0]))
    const words = pieces.filter((piece) => A_WORD.test(piece[0])).concat(inCapitals.length >= 2 ? inCapitals : [])
    const inWords = words.reduce((count, piece) => count + piece[0].length, 0)
    if (inWords >= A_PATHS_SHARE_OF_WORDS * characters) return null
    const inNamesWords = [...run.matchAll(A_NAMES_WORD)].filter((word) => A_VOWEL.test(word[0].replace(/^[A-Z]/, '')) || SHORT_WORDS.has(word[0])).reduce((count, word) => count + word[0].length, 0)
    const aName = inNamesWords >= A_NAMES_SHARE_OF_WORDS * characters
    if (aName && !(A_JOINING_CHARACTER.test(run) && maskedAsAPrintedLine(run) !== run)) return null
  }
  return aKey ? { start, length: key.length } : null
}

/**
 * A character of Unicode's area for private use that the text does not hold. The printed-line mask leaves it as it is.
 * @param {string} text
 * @returns {string}
 */
function aCharacterNotIn(text) {
  let code = 0xe000
  while (text.includes(String.fromCharCode(code))) code += 1
  return String.fromCharCode(code)
}

/**
 * TEXT A HOST JOB HANDS BACK, MASKED BEFORE IT IS FILED. Agents read the record and send it to their model providers,
 * so it is masked as every printed line is (`maskedAsAPrintedLine`), and then for four things the lab's machines
 * print and that mask does not take. A key in base64 is hidden whole (`theKeyIn`): the printed-line mask stops a run
 * at a `/` and shows the parts of a key on either side. The rest are a home on a /home-like mount, a host name ending
 * .ts.net or .local, and the login of `ssh -l`. Says whether anything changed.
 *
 * THE KEYS ARE FOUND FIRST, in the text as it was handed back. Each key's place is held by a character the text does
 * not hold while the printed-line mask masks the whole text, and the character left is then shown as the marker. A key
 * that is the value of a field the printed-line mask hides, as after `API_KEY=` or `"token": `, is hidden with that
 * value, as on any printed line.
 * @param {string} text
 * @returns {{ text: string, masked: boolean }}
 */
export function maskedForAHostJob(text) {
  const aKeysPlace = aCharacterNotIn(text)
  let withPlaces = ''
  let at = 0
  for (const run of text.matchAll(A_RUN_OF_BASE64)) {
    const key = theKeyIn(run[0])
    if (key === null) continue
    const start = /** @type {number} */ (run.index) + key.start
    withPlaces += text.slice(at, start) + aKeysPlace
    at = start + key.length
  }
  const masked = maskedAsAPrintedLine(withPlaces + text.slice(at))
    .replaceAll(aKeysPlace, A_KEY_IN_BASE64)
    .replace(A_HOME_ON_A_MOUNT, '~')
    .replace(A_PRIVATE_HOST, '<a host, not shown>')
    .replace(AN_SSH_LOGIN, (_, before) => `${before}<a login, not shown>`)
  return { text: masked, masked: masked !== text }
}
