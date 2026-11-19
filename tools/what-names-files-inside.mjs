// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * The named-inside door's answer, read and judged in one place: which records name files inside a
 * folder, before a tool removes it. GET /api/report-files/named-inside answers with the records the
 * caller may read and a count of the ones it may not. A tool that removes a folder asks here, so the
 * shape it trusts and the sentence it says are worked out once.
 */
import { settingValue, workspaceFrom } from '../src/config/settings.mjs'
import { NAMED_INSIDE_CLASSES, NAMED_INSIDE_CLASSES_THAT_KEEP, WHAT_A_RECORD_NAMES_INSIDE } from '../src/shared/what-a-record-names-inside.ts'
import { anAgentsToolHeaders } from './sandbox-common.mjs'

/**
 * An unrelated success reply gives no permission to remove anything. The comparison with the worktree's commit
 * (comparedWith, notComparedBecause, hiddenCiters and each record's names, from round 115) may be absent, as in the
 * door's answer before it, and is the door's shape when it is there.
 */
export function isTheNamedInsideAnswer(answer, folder) {
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
  const words = (value) => typeof value === 'string' && value.trim() !== ''
  const absentOrNull = (value) => value === undefined || value === null
  const aClass = (value) => NAMED_INSIDE_CLASSES.includes(value)
  const counts = (value) => object(value) && Object.keys(value).length === NAMED_INSIDE_CLASSES.length &&
    NAMED_INSIDE_CLASSES.every((key) => Number.isInteger(value[key]) && value[key] >= 0)
  return object(answer) && answer.folder === folder && words(answer.scope) && words(answer.says) &&
    Number.isInteger(answer.hiddenCount) && answer.hiddenCount >= 0 && Array.isArray(answer.records) && answer.records.every((record) => object(record) &&
      words(record.id) && words(record.kind) && typeof record.title === 'string' &&
      Array.isArray(record.paths) && record.paths.length > 0 &&
      record.paths.every((path) => object(path) && words(path.where) && words(path.path)) &&
      (record.names === undefined || aClass(record.names))) &&
    (absentOrNull(answer.comparedWith) || (typeof answer.comparedWith === 'string' && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(answer.comparedWith))) &&
    (absentOrNull(answer.notComparedBecause) || words(answer.notComparedBecause)) &&
    (absentOrNull(answer.hiddenCiters) || counts(answer.hiddenCiters))
}

/**
 * Ask the office, as the agent this shell runs for or else as `tool`. Keep the status and the
 * office's words when the check fails, including while reading its body.
 */
export async function askWhatNamesFilesInside(api, folder, tool) {
  let reply
  let text
  try {
    const self = settingValue('MOLE_OFFICE_AGENT')
    reply = await fetch(`${api}/api/report-files/named-inside?folder=${encodeURIComponent(folder)}`, {
      headers: { 'x-mole-office-workspace': workspaceFrom(process.env),
        ...anAgentsToolHeaders({ self, withoutAKey: self ?? tool }) },
      signal: AbortSignal.timeout(10_000), redirect: 'manual',
    })
    text = await reply.text()
  } catch (error) {
    throw new Error(`The office at ${api} could not be asked about ${folder}${reply === undefined ? '' : ` (status ${String(reply.status)})`}: ` +
      String(error?.cause?.message ?? error?.message ?? error))
  }
  let answer = null
  try { answer = JSON.parse(text) } catch { /* The refusal below names the status and what came back. */ }
  if (reply.status !== 200 || !isTheNamedInsideAnswer(answer, folder)) {
    throw new Error(`The office at ${api} did not give the named-inside answer for ${folder}. It replied ${String(reply.status)}: ` +
      (typeof answer?.error === 'string' ? answer.error : text.slice(0, 300)))
  }
  return answer
}

/**
 * Null when no record names a file inside the folder. Otherwise one sentence that counts every
 * record that does: the ones the caller can read and the ones it may not.
 */
export function whatNamesFilesInside(answer) {
  const readable = answer.records.length
  const hidden = answer.hiddenCount
  const all = readable + hidden
  if (all === 0) return null
  return `${String(all)} ${all === 1 ? 'record names' : 'records name'} files inside ${answer.folder}, ` +
    `${String(readable)} you can read and ${String(hidden)} you may not.`
}

/** "1 record" or "2 records". */
const records = (count) => `${String(count)} ${count === 1 ? 'record' : 'records'}`

/** A class as the tool says it: the door's words and its key. */
const theClass = (key) => `${WHAT_A_RECORD_NAMES_INSIDE[key]} (${key})`

/** What a listed record names inside, as one line under its paths, or null when the door did not compare it. */
export function whatARecordNamesInside(record) {
  return record.names === undefined ? null : `It names ${theClass(record.names)}.`
}

/** What the records the caller may not read name inside, class by class, or null when there are none or none was compared. */
export function whatTheHiddenRecordsName(answer) {
  const citers = answer.hiddenCiters
  if (answer.hiddenCount === 0 || citers === undefined || citers === null) return null
  const parts = NAMED_INSIDE_CLASSES.filter((key) => citers[key] > 0)
    .map((key) => `${String(citers[key])} ${citers[key] === 1 ? 'names' : 'name'} ${theClass(key)}`)
  return `Of the ${records(answer.hiddenCount)} you may not read, ${parts.join('; ')}.`
}

/**
 * WHY THE ANSWER ALONE KEEPS THE WORKTREE, one sentence each, or none (wave 13s round 115, item 25). The owner's rule,
 * as they changed it in point 1 of a decision, lets a worktree that records name go only when no record names an
 * untracked or ignored file inside. A record the door did not compare
 * cannot be weighed, so an answer with no comparison keeps it, as does any record, readable or not, in a class that
 * keeps it whatever ref holds the commit. Asked only when a record names the folder. The tool's own reading of git
 * comes after.
 */
export function whyTheAnswerKeepsIt(answer) {
  if (typeof answer.comparedWith !== 'string') {
    return [`The office did not compare the records with the worktree's commit. ${typeof answer.notComparedBecause === 'string' ? answer.notComparedBecause : 'Its answer carries no comparison.'}`]
  }
  const reasons = []
  const unclassed = answer.records.filter((record) => record.names === undefined).map((record) => record.id)
  if (unclassed.length) reasons.push(`The office put no class on ${unclassed.join(', ')}.`)
  for (const key of NAMED_INSIDE_CLASSES_THAT_KEEP) {
    const ids = answer.records.filter((record) => record.names === key).map((record) => record.id)
    if (ids.length) reasons.push(`${ids.join(', ')} ${ids.length === 1 ? 'names' : 'name'} ${theClass(key)}.`)
  }
  if (answer.hiddenCount > 0) {
    const citers = answer.hiddenCiters
    const classed = citers === undefined || citers === null ? 0 : NAMED_INSIDE_CLASSES.reduce((sum, key) => sum + citers[key], 0)
    if (classed !== answer.hiddenCount) {
      reasons.push(`The office counted ${records(answer.hiddenCount)} you may not read and put ${String(classed)} in a class.`)
    } else {
      for (const key of NAMED_INSIDE_CLASSES_THAT_KEEP) {
        if (citers[key] > 0) reasons.push(`${records(citers[key])} you may not read ${citers[key] === 1 ? 'names' : 'name'} ${theClass(key)}.`)
      }
    }
  }
  return reasons
}
