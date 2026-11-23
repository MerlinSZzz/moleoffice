// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THIS COMPUTER'S ENTRY AGENT AND ITS KEY: WHERE THEY ARE KEPT, HOW THEY ARE READ, AND WHAT THE SESSION HOOK SAYS
 * ABOUT THEM.
 *
 * The press that puts the entry in place on the Settings page makes one agent for the coding-tool sessions this
 * computer starts, and gives it a key of its own on the person's own press (src/server/lib/an-agents-key-file.ts). Two
 * files hold what the session hook needs to send that key: `entry-agent-key` holds the key, and `entry-agent` holds the
 * agent's registry id. Both are beside the office's key file, in the folder `keysPathFrom` names, because that folder
 * is this office's own and the hook already knows how to find it.
 *
 * A START OUTSIDE THE OFFICE gets a key file of its own too, named by the agent's registry id, in the folder
 * `outside-agent-keys` beside the same two files. Only MOLE_AGENT_KEY_FILE goes on the opener's command line.
 *
 * ONE MODULE NAMES EVERY PATH, so the press, the doors and the hook cannot put a file where another does not look. It
 * is in src/config/ because the server imports it as well as the hook, and plain node on another computer can read a
 * .mjs file. Nothing here writes: the writer is the server's (`writeAPrivateFile` in src/server/lib/keys.ts).
 *
 * WHAT A FILE IS, AS THE HOOK READS IT. Absent means only that the path does not exist (lstat's ENOENT). Every other
 * answer is the file read, or the file refused with a sentence that names the file and never its content. A file that
 * is there and refused never brings the office's key back: the hook's last resort is for a computer with no entry key
 * file at all.
 */
import { lstatSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { aSecretFromTheEnvironment, THE_AGENT_KEY } from './agent-key-reader.mjs'
import { keysPathFrom } from './settings.mjs'

/** The name of the file that holds the entry agent's key. */
export const THE_ENTRYS_KEY_FILE = 'entry-agent-key'
/** The name of the file that holds the entry agent's registry id. */
export const THE_ENTRYS_AGENT_FILE = 'entry-agent'
/** The name of the folder that holds one key file for each agent started outside the office. */
export const THE_OUTSIDE_KEYS_FOLDER = 'outside-agent-keys'

/** A registry id, as a file name and as the content of `entry-agent`. */
const A_REGISTRY_ID = /^[A-Za-z0-9_-]{1,64}$/

/**
 * THE ENTRY AGENT'S REGISTRY ID, as the reader of a secret reads it: one line of one id. It is not a secret, and it is
 * read the same way so that it is judged by the same rules as the key beside it: this user's own file, private, the
 * file itself and not a link. The two variable names are never set anywhere; the reader is handed the path itself.
 * @type {import('./agent-key-reader.mjs').ASecret}
 */
export const THE_ENTRYS_AGENT_ID = {
  value: 'the entry agent',
  file: 'the entry agent file',
  what: 'entry agent',
  shape: /^[A-Za-z0-9_-]{1,64}\n?$/,
  says: "agent's registry id",
}

/** What ends a refusal of a file the hook reads: what the hook did instead. */
const NOT_USED = "So its key was not sent, and neither was the office's."

/**
 * THE TWO ENTRY FILES AND THEIR FOLDER, beside the office's key file at `keysPath`.
 * @param {string} keysPath
 * @returns {{ folder: string, key: string, agent: string }}
 */
export function theEntrysFilesBeside(keysPath) {
  const folder = dirname(keysPath)
  return { folder, key: join(folder, THE_ENTRYS_KEY_FILE), agent: join(folder, THE_ENTRYS_AGENT_FILE) }
}

/**
 * THE TWO ENTRY FILES OF THE OFFICE THIS ENVIRONMENT NAMES, beside its key file (`keysPathFrom`).
 * @param {Record<string, string | undefined>} env
 */
export function theEntrysFiles(env) {
  return theEntrysFilesBeside(keysPathFrom(env))
}

/**
 * THE KEY FILE OF ONE AGENT STARTED OUTSIDE THE OFFICE, named by its registry id, beside the entry files.
 * @param {string} keysPath
 * @param {string} agentId
 * @returns {string}
 */
export function anOutsideAgentsKeyFileBeside(keysPath, agentId) {
  if (!A_REGISTRY_ID.test(agentId)) throw new Error(`"${agentId}" is not a registry id, so no key file is named for it.`)
  return join(dirname(keysPath), THE_OUTSIDE_KEYS_FOLDER, agentId)
}

/**
 * ONE PRIVATE FILE, READ: absent only when the path does not exist, and otherwise held or refused, by the rules of the
 * reader of a secret (`aSecretFromTheEnvironment`), which is handed the path itself.
 * @param {string} path
 * @param {import('./agent-key-reader.mjs').ASecret} secret
 * @param {number | null} [uid]
 * @param {string} [system]
 * @returns {{ is: 'absent' } | { is: 'held', value: string } | { is: 'refused', why: string }}
 */
export function aPrivateFileRead(path, secret, uid = process.getuid?.() ?? null, system = process.platform) {
  try {
    lstatSync(path)
  } catch (why) {
    const code = /** @type {NodeJS.ErrnoException} */ (why).code
    if (code === 'ENOENT') return { is: 'absent' }
    return { is: 'refused', why: `The ${secret.what} file ${path} could not be looked at (${code ?? 'no reason given'}). ${NOT_USED}` }
  }
  try {
    const value = aSecretFromTheEnvironment(secret, { [secret.file]: path }, NOT_USED, uid, system)
    if (value === null) return { is: 'refused', why: `The ${secret.what} file ${path} was not read. ${NOT_USED}` }
    return { is: 'held', value }
  } catch (why) {
    return { is: 'refused', why: why instanceof Error ? why.message : String(why) }
  }
}

/**
 * THIS COMPUTER'S ENTRY FILES, READ: absent when the key file's path does not exist, held when both files are sound,
 * and refused otherwise. A missing `entry-agent` beside a key file is refused, because nothing then says whose key it is.
 * @param {Record<string, string | undefined>} env
 * @param {number | null} [uid]
 * @param {string} [system]
 * @returns {{ is: 'absent', keyFile: string } | { is: 'held', keyFile: string, agent: string, key: string } | { is: 'refused', keyFile: string, why: string }}
 */
export function theEntrysFilesRead(env, uid = process.getuid?.() ?? null, system = process.platform) {
  const files = theEntrysFiles(env)
  const key = aPrivateFileRead(files.key, THE_AGENT_KEY, uid, system)
  if (key.is === 'absent') return { is: 'absent', keyFile: files.key }
  if (key.is === 'refused') return { is: 'refused', keyFile: files.key, why: key.why }
  const agent = aPrivateFileRead(files.agent, THE_ENTRYS_AGENT_ID, uid, system)
  if (agent.is === 'absent') {
    return { is: 'refused', keyFile: files.key, why: `The entry agent file ${files.agent} is missing, so nothing says whose key ${files.key} holds. ${NOT_USED}` }
  }
  if (agent.is === 'refused') return { is: 'refused', keyFile: files.key, why: agent.why }
  return { is: 'held', keyFile: files.key, agent: agent.value, key: key.value }
}

/**
 * THE HOOK'S START LINE FOR AN ENTRY KEY FILE THAT IS THERE AND WAS NOT USED, naming the file and never its content.
 * @param {string} why the reader's sentence
 */
export function theEntrysKeyFileWasNotUsedLine(why) {
  return `This computer's entry key file was not used: ${why}`
}

/**
 * THE HOOK'S START LINE FOR AN ENTRY KEY THE OFFICE REFUSED, naming the file and never its content.
 * @param {string} keyFile
 */
export function theOfficeRefusedTheEntrysKeyLine(keyFile) {
  return `The office refused the key in this computer's entry key file ${keyFile}, so the hook's requests carried no key the office takes, and not the office's key.`
}

/**
 * THE HOOK'S START LINE FOR A SESSION THAT NAMES AN AGENT AND HOLDS NO KEY OF IT, said once. A name alone may file a
 * session while the key window is open, and may never change or end a run (`assertMayChangeARun` in
 * src/server/lib/records/patching.ts), so the line says both.
 * @param {string} agent
 */
export function aNamedAgentWithoutAKeyLine(agent) {
  return `This session names the agent ${JSON.stringify(agent)} and holds no key of it, so the hook sent the name alone. The office lets no name alone stamp or end a session's record, and while the key window is closed it refuses every write under the name.`
}
