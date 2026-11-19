// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// One read-only trial, read by the answers its provider row declares. The Settings door and the guided command both ask
// here, so a row's answers mean the same on both paths. The reply is never printed or kept: only its status is read, and
// when a declared answer names an error, at most ANSWER_BYTES of the reply are read for that name alone.
export const ANSWER_BYTES = 4096
const MEANINGS = ['passed', 'too-broad', 'refused']
// A row that declares no answers: the provider's 200 passes, and 401 or 403 means it did not accept the key.
const PLAIN = [{ status: 200, means: 'passed' }, { status: 401, means: 'refused' }, { status: 403, means: 'refused' }]

/** The address and answers of a trial declaration, or a thrown Error when the office would not send it. */
export function checkTrial(trial) {
  const url = new URL(trial.url)
  if (trial.method !== 'GET' || url.username || url.password || url.hash ||
      !(url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === '127.0.0.1'))) throw new Error('Invalid trial address')
  const answers = trial.answers ?? PLAIN
  if (!Array.isArray(answers) || answers.length === 0 || !answers.every((answer) => Number.isSafeInteger(answer?.status) &&
      answer.status >= 100 && answer.status <= 599 && MEANINGS.includes(answer.means) &&
      (answer.name === undefined || (typeof answer.name === 'string' && answer.name.length > 0)))) throw new Error('Invalid trial answers')
  return { url, answers }
}

async function errorName(response) {
  if (!response.body) return undefined
  const reader = response.body.getReader(), parts = []
  let size = 0
  try {
    while (size <= ANSWER_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value); size += value.byteLength
    }
  } finally { await reader.cancel().catch(() => {}) }
  if (size > ANSWER_BYTES) return undefined
  try {
    const name = JSON.parse(Buffer.concat(parts).toString('utf8'))?.name
    return typeof name === 'string' ? name : undefined
  } catch { return undefined }
}

/**
 * Sends the trial with the key as a bearer header, follows no redirect, and says which declared answer came back:
 * 'passed', 'too-broad' (the key can do more than the row asks), 'refused' (the provider did not accept the key), or
 * 'unexpected' for any answer the row does not declare. Throws when the provider cannot be reached.
 */
export async function askTrial(trial, value) {
  const { url, answers } = checkTrial(trial)
  const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${value}` }, redirect: 'manual', signal: AbortSignal.timeout(10000) })
  const here = answers.filter((answer) => answer.status === response.status)
  const name = here.some((answer) => answer.name !== undefined) ? await errorName(response) : undefined
  await response.body?.cancel().catch(() => {})
  // An answer that names the error wins over one that names none, whatever their order in the row.
  const answer = here.find((one) => one.name !== undefined && one.name === name) ?? here.find((one) => one.name === undefined)
  return { outcome: answer?.means ?? 'unexpected', status: response.status }
}
