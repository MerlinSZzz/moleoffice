// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * ONE USE OF A TOOL, WRITTEN AS ONE LINE ON THE CALLING RUN'S RECORD. Every tool writes its use line here.
 *
 * Decision Vt0GdSlApWce, point d: a use of a tool writes one line on the calling run's record, and a log
 * file. It never makes a record of its own. The line goes through POST /api/toolset/uses, as {tool, said}, with the
 * caller's own headers (officeHeaders in tools/sandbox-common.mjs, which sends MOLE_AGENT_KEY when it is set), and a
 * proof that this tool sent it (src/config/use-line-proof.mjs), so the office can mark a line sent by hand. A named
 * run may send `files` and `tree` beside them: one result for each test file it ran and the tree it ran in
 * (src/shared/toolset.ts). A shell that holds no key writes with its run's own key, read from the run's office tool
 * configuration (writeAUseLine). With no key and no configuration named, nothing is sent. The exact body is printed
 * for the run to send through office_request.
 *
 * Four tools call it: tools/office-copy.mjs (slug data-copy), tools/run-named-tests.mjs (slug named-tests),
 * tools/openrouter.mjs (slug openrouter) and tools/sandbox.mjs worker and round (slug sandbox). Each keeps its own exit
 * code whatever the answer is, and says the answer's words in its own log or on its own screen.
 */

import { askTheOffice, officeHeaders, theAgentKey } from './sandbox-common.mjs'
import { theEnvironmentsAddressIsForAnotherCopy } from '../src/config/settings.mjs'
import { OFFICE_TOOL_CONFIGURATION, theRunsKeyFromItsOfficeToolFile } from '../src/config/run-permissions.mjs'
import { KEY_HEADER } from '../src/config/key-header.mjs'
import { USE_LINE_PROOF_HEADER, aUseLinesProof } from '../src/config/use-line-proof.mjs'

/**
 * THE OFFICE AND THE CALLER, AS THIS PROCESS'S ENVIRONMENT NAMES THEM, and the path of the run's office tool
 * configuration, where its key is when the shell holds none. A tool that removes these variables before it starts a
 * child reads them here first.
 * @returns {{ api: string | undefined, workspace: string | undefined, agent: string | undefined, session: string | undefined, configuration: string | undefined, refused?: string }}
 */
export function theOfficeInThisEnvironment() {
  // THE ADDRESS IS FOR THE SANDBOX'S OWN CHECKOUTS (problem JQ3yaANBi1JC): a copy of this tool elsewhere names no office.
  const refused = theEnvironmentsAddressIsForAnotherCopy(process.env)
  return {
    api: refused === null ? process.env['MOLE_OFFICE_API'] : undefined,
    ...(refused === null ? {} : { refused }),
    workspace: process.env['MOLE_OFFICE_WORKSPACE'],
    agent: process.env['MOLE_OFFICE_AGENT'],
    session: process.env['MOLE_OFFICE_SESSION'],
    configuration: process.env[OFFICE_TOOL_CONFIGURATION],
  }
}

/**
 * WRITE ONE USE LINE, AND ANSWER WHAT HAPPENED. It never throws on a refusal or on an office that does not answer.
 *
 * Nothing is sent when one of the four is missing or blank: the office, the run, the project or the agent. The
 * agent is needed because a use is never written in the person's name. The sentences for a missing one name the
 * environment variable, because the callers that can leave one missing read the four from their environment
 * (theOfficeInThisEnvironment). tools/sandbox.mjs has refused before it gets here when its agent or session is missing.
 *
 * THE KEY. MOLE_AGENT_KEY in this process's environment goes when it is set. A shell that holds none, as a Claude Code
 * run's shell does since the launcher takes the key out of it, writes with its run's own key, read from the run's office
 * tool configuration at the moment of the write (theRunsKeyFromItsOfficeToolFile, the reading the run's hooks use;
 * problems rB33NQrssDEu and 4aX9F5p2XbDx, message I7tf4M-nNaER). The file is `office.configuration`, or the one
 * this process's MOLE_OFFICE_TOOL_CONFIGURATION names. A file that is named but is not the run's own, or that others may
 * read, gives no key: nothing is sent, and the words say which check failed. With no key and no file named, nothing is
 * sent. The answer holds the exact body, and the words say how the run sends it through office_request. The line is
 * still the run's own word and goes on the run that sends it.
 *
 * Answers `{ written, why, words, body? }`. `written` is true only when the office answered 201. `why` is one of `written`,
 * `written without files` (the office does not take test file results yet, and the line was written without them),
 * `no office`, `no run`, `no project`, `no agent`, `no key`, `not sent` (the run must send the body through
 * office_request), `refused` (the office answered, and not 201) or `no answer`. `words` says what happened in plain
 * sentences; for `refused` it holds the office's own words. `not sent` also holds the exact `body`, printed as one JSON
 * line in `words`, and, when files were given, the body without them as a second line for an office older than
 * migration 0279.
 *
 * @param {{ tool: string, said: string, files?: Array<{ file: string, result: string, seconds: number | null, testFileHash: string | null }>, tree?: { commit: string | null, change: string | null }, office: { api?: string | null, workspace?: string | null, agent?: string | null, session?: string | null, configuration?: string | null, refused?: string } }} use
 * @returns {Promise<{ written: boolean, why: string, words: string, body?: { tool: string, said: string, files?: unknown[], tree?: unknown } }>}
 */
export async function writeAUseLine({ tool, said, files, tree, office }) {
  const { api, workspace, agent, session } = office
  const body = { tool, said, ...(files === undefined ? {} : { files }), ...(tree === undefined ? {} : { tree }) }
  const withoutFiles = { tool, said }
  const unset = (value) => value === undefined || value === null || value.trim() === ''
  if (typeof office.refused === 'string') {
    return { written: false, why: 'no office', words: `The use was not written on any run: ${office.refused}` }
  }
  if (unset(api)) {
    return { written: false, why: 'no office', words: 'The use was not written on any run: no office was named, because MOLE_OFFICE_API is not set.' }
  }
  if (unset(session)) {
    return { written: false, why: 'no run', words: 'The use was not written on any run: no run was named, because MOLE_OFFICE_SESSION is not set.' }
  }
  if (unset(workspace)) {
    return { written: false, why: 'no project', words: 'The use was not written on any run: no project was named, because MOLE_OFFICE_WORKSPACE is not set.' }
  }
  if (unset(agent)) {
    return {
      written: false,
      why: 'no agent',
      words: "The use was not written on any run: MOLE_OFFICE_AGENT is not set, and a use is never written in the person's name.",
    }
  }
  const theKey = theKeyForAWriteOnTheRun(office)
  if (theKey.key === null && theKey.why === null) {
    const older = files === undefined
      ? ''
      : '\nAn office older than migration 0279 refuses `files` and `tree`. Send this body without them to such an office:\n' + JSON.stringify(withoutFiles)
    return {
      written: false,
      why: 'not sent',
      body,
      words: 'Nothing was sent. This shell holds no key and names no office tool configuration. ' +
        'Send this body through office_request with POST /api/toolset/uses. ' +
        "This line is still the run's own word. It goes on the run that sends it.\n" + JSON.stringify(body) + older,
    }
  }
  if (theKey.key === null) {
    return { written: false, why: 'no key', words: `The use was not written on the run ${session}: this shell holds no key, and ${theKey.why}. Nothing was sent.` }
  }
  const headers = officeHeaders({ workspace, agent, session, ...(theKey.key === undefined ? {} : { key: theKey.key }) })
  // THE PROOF THAT THIS TOOL SENT THE LINE (item 2i): made from the key the request carries and the words it sends, so
  // each send has its own. src/config/use-line-proof.mjs says what it proves and what it cannot.
  const sentKey = headers[KEY_HEADER]
  /** @param {{ tool: string, said: string, files?: Array<{ file: string, result: string, seconds: number | null, testFileHash: string | null }>, tree?: { commit: string | null, change: string | null } }} sent */
  const withItsProof = (sent) => (typeof sentKey === 'string' && sentKey.trim() !== ''
    ? { ...headers, [USE_LINE_PROOF_HEADER]: aUseLinesProof(sentKey, { session, ...sent }) }
    : headers)
  const answer = await askTheOffice(api.replace(/\/+$/, ''), '/api/toolset/uses', { method: 'POST', headers: withItsProof(body), body })
  const refusedWords = String(answer.body?.error ?? JSON.stringify(answer.body)).slice(0, 500)
  // THE SECOND SEND EXISTS BECAUSE THE LIVE OFFICE LAGS MAIN: its use door refuses files and tree with a 400 until it has
  // migration 0279. Without the line, every seal preview would find no proof. It can go once every office the tool talks
  // to has migration 0279. It is not silent: the words always say the results were not stored.
  if (files !== undefined && answer.status === 400 && doesNotTakeFiles(refusedWords)) {
    const again = await askTheOffice(api.replace(/\/+$/, ''), '/api/toolset/uses', { method: 'POST', headers: withItsProof(withoutFiles), body: withoutFiles })
    const saidTheOfficeDoesNot = `The office at ${api} does not take test file results yet; it answered 400 with ${refusedWords}`
    if (again.status === 201) {
      return {
        written: true,
        why: 'written without files',
        words: `${saidTheOfficeDoesNot}; the use was written on the run ${String(again.body?.run ?? session)} without them; ` +
          `the ${files.length} test file result${files.length === 1 ? ' was' : 's were'} not stored.`,
      }
    }
    if (again.status === null) {
      return { written: false, why: 'no answer', words: `${saidTheOfficeDoesNot}; sending {tool, said} alone then got no answer (${String(again.why)}). Nothing was written.` }
    }
    return {
      written: false,
      why: 'refused',
      words: `${saidTheOfficeDoesNot}; sending {tool, said} alone was refused ${String(again.status)}: ${String(again.body?.error ?? JSON.stringify(again.body)).slice(0, 500)}. Nothing was written.`,
    }
  }
  if (answer.status === 201) {
    const run = String(answer.body?.run ?? session)
    if (files === undefined) {
      return { written: true, why: 'written', words: `The use was written on the run ${run}.` }
    }
    if (typeof answer.body?.files === 'number') {
      return { written: true, why: 'written', words: `The use was written on the run ${run}, with ${String(answer.body.files)} test file result${answer.body.files === 1 ? '' : 's'}.` }
    }
    return {
      written: true,
      why: 'written',
      words: `The use was written on the run ${run}, but the office did not say whether it stored the ${files.length} test file result${files.length === 1 ? '' : 's'}.`,
    }
  }
  if (answer.status === null) {
    return { written: false, why: 'no answer', words: `The use was not written on any run: the office at ${api} did not answer (${String(answer.why)}).` }
  }
  return {
    written: false,
    why: 'refused',
    words: `The use was not written on the run ${session}: the office answered ${String(answer.status)}: ${refusedWords}`,
  }
}

/**
 * THE KEY A WRITE ON THE CALLING RUN GOES WITH, worked out here once for each write a tool makes on its run: the use
 * line above, and the process row of tools/own-process-row.mjs. When MOLE_AGENT_KEY is in this process's environment
 * the answer is `{ key: undefined }`, because officeHeaders sends that key itself. Otherwise the run's own key is read
 * from the run's office tool configuration, `office.configuration` or the file this process's
 * MOLE_OFFICE_TOOL_CONFIGURATION names (theRunsKeyFromItsOfficeToolFile). With no file named the answer is
 * `{ key: null, why: null }`. A file that gives no key answers `{ key: null, why }` with the reader's words.
 *
 * @param {{ agent: string | undefined, session: string | undefined, configuration?: string | undefined }} office
 * @returns {{ key: string | undefined } | { key: null, why: string | null }}
 */
export function theKeyForAWriteOnTheRun(office) {
  if (theAgentKey() !== null) return { key: undefined }
  const configuration = office.configuration ?? process.env[OFFICE_TOOL_CONFIGURATION]
  if (typeof configuration !== 'string' || configuration === '') return { key: null, why: null }
  const read = theRunsKeyFromItsOfficeToolFile({ [OFFICE_TOOL_CONFIGURATION]: configuration }, { agent: office.agent, session: office.session })
  return read.key === null ? { key: null, why: read.why } : { key: read.key }
}

/**
 * Whether the office's words say that files or tree is an unrecognized key: zod's own words "Unrecognized key" and the
 * quoted key name, and nothing looser.
 */
function doesNotTakeFiles(words) {
  return words.includes('Unrecognized key') && (words.includes('"files"') || words.includes('"tree"'))
}
