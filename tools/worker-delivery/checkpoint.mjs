// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// @ts-check
/** Pending mail belongs to one MCP process and one run. A later office call acknowledges a successful presentation. */
import { askTheOffice, theRunsIdentity, withoutKeys, THE_LONGEST_REPLY } from '../office-request.mjs'
import { deliveryEnvelope, DELIVERY_ENVELOPE, theMessageAnAgentReads, theRoutedLineFor } from '../../src/shared/messages.ts'
import { CHECKPOINT_LETTERS, CHECKPOINT_TEXT, OPENCODE_TOOL_OUTPUT_MAX_BYTES, OPENCODE_TOOL_OUTPUT_MAX_LINES } from '../../src/shared/worker-delivery/contract.mjs'

export const PENDING_MESSAGES_PER_CHECKPOINT = CHECKPOINT_LETTERS
export const PENDING_TEXT_PER_CHECKPOINT = CHECKPOINT_TEXT
const CHECKPOINT_WAIT_MS = 2_000

/** @param {Parameters<typeof askTheOffice>[1]} options */
function bounded(options) {
  const fetchImpl = options?.fetchImpl ?? fetch
  return { ...options, fetchImpl: (/** @type {Parameters<typeof fetch>[0]} */ url, /** @type {Parameters<typeof fetch>[1]} */ init) =>
    fetchImpl(url, { ...init, signal: AbortSignal.any([AbortSignal.timeout(CHECKPOINT_WAIT_MS), ...(init?.signal ? [init.signal] : [])]) }) }
}

/** Every part the checkpoint adds goes before the answer and ends with a newline. @param {string} text */
function anAddedPart(text) {
  return { type: 'text', text: text.endsWith('\n') ? text : `${text}\n` }
}

/** The whole reply as OpenCode joins it and decides whether it keeps it. @param {{type: string, text: string}[]} parts */
function opencodeKeepsWhole(parts) {
  const text = parts.map(part => part.text).join('')
  return text.split('\n').length <= OPENCODE_TOOL_OUTPUT_MAX_LINES && Buffer.byteLength(text, 'utf8') <= OPENCODE_TOOL_OUTPUT_MAX_BYTES
}

/** @param {{id: string}[]} hidden */
function theLineForQueued(hidden) {
  const [only] = hidden
  const how = 'The next short office call shows it, or read it with GET /api/messages?only=waiting-for-me.'
  if (only !== undefined && hidden.length === 1) return `Pending message ${only.id} stays queued: this answer was too long to show it with this reply. ${how}`
  return `${hidden.length} pending messages stay queued: this answer was too long to show them with this reply. The next short office call shows them, or read them with GET /api/messages?only=waiting-for-me.`
}

/** @param {{id: string}[]} hidden */
function theLineForTheTextLimit(hidden) {
  const [only] = hidden
  const most = PENDING_TEXT_PER_CHECKPOINT.toLocaleString('en-GB')
  if (only !== undefined && hidden.length === 1) return `Pending message ${only.id} stays queued: one office call carries at most ${most} characters of messages, counted in the order they came, and this call reached that limit by this message. The next office call shows it, or read it with GET /api/messages?only=waiting-for-me.`
  return `${hidden.length} pending messages stay queued: one office call carries at most ${most} characters of messages, counted in the order they came, and this call reached that limit by the first of them. The next office call shows them, or read them with GET /api/messages?only=waiting-for-me.`
}

/** @param {string} id */
function theLineForAnOversizeLetter(id) {
  return `Pending letter ${id} is too large to show in any reply and stays queued. Ask its sender to split it, or read it with GET /api/messages?only=waiting-for-me.`
}

const THE_CLOSING_LINE = 'These full messages were presented at this office checkpoint. The following office call acknowledges delivery. After acting, mark each seen with POST /api/messages/<id>/mark {"mark":"seen"}.'
const THE_MORE_LINE = 'More pending messages remain for a following office checkpoint.'

/**
 * @param {{base: {type: string, text: string}[], eligible: {id: string, text: string}[], overBudget: {id: string, text: string}[], oversize: string[], more: boolean}} given
 * @param {number} show
 */
function theAdditionsFor(given, show) {
  const shown = given.eligible.slice(0, show)
  const tooLong = given.eligible.slice(show)
  /** @type {{type: string, text: string}[]} */
  const parts = [...given.base]
  if (tooLong.length > 0) parts.push(anAddedPart(theLineForQueued(tooLong)))
  if (given.overBudget.length > 0) parts.push(anAddedPart(theLineForTheTextLimit(given.overBudget)))
  for (const id of given.oversize) parts.push(anAddedPart(theLineForAnOversizeLetter(id)))
  for (const message of shown) parts.push(anAddedPart(message.text))
  if (shown.length > 0) parts.push(anAddedPart(THE_CLOSING_LINE))
  if (given.more) parts.push(anAddedPart(THE_MORE_LINE))
  return { parts, shown }
}

/** The checkpoint never changes the requested answer or the MCP result shape. */
export function workerCheckpoint() {
  /** @type {Map<string, boolean>} ids whose words were written; true means a mark's outcome must be read back. */
  const pending = new Map()
  /** @type {WeakMap<object, string[]>} */
  const prepared = new WeakMap()
  /** @type {string | null} */
  let binding = null
  /** @type {string | null} */
  let recipient = null
  /** @type {string[]} */
  let notices = []

  return {
    /** @param {Parameters<typeof askTheOffice>[1]} options */
    async beforeCall(options) {
      notices = []
      const { api, workspace, agent, session } = theRunsIdentity(options?.env)
      const identity = JSON.stringify([api, workspace, agent, session])
      if (binding !== identity) { pending.clear(); recipient = null; binding = identity }
      const ask = (/** @type {Parameters<typeof askTheOffice>[0]} */ request) => askTheOffice(request, bounded(options))
      try {
        for (const [id, uncertain] of pending) {
          if (uncertain) {
            const read = await ask({ method: 'GET', path: `/api/messages/${encodeURIComponent(id)}` })
            if (read.status !== 200 || read.cut) throw new Error(`The delivery read answered ${read.status}.`)
            const message = JSON.parse(read.body)?.message
            const row = message?.deliveries?.find((/** @type {any} */ d) => d.to?.kind === 'agent' && d.to.id === recipient)
            if (!row) throw new Error('The delivery read did not name this recipient.')
            if (row.mark !== 'queued') { pending.delete(id); continue }
          }
          // If the reply is lost, read the mark before another write. The store's delivered mark is monotone.
          pending.set(id, true)
          const answer = await ask({ method: 'POST', path: `/api/messages/${encodeURIComponent(id)}/mark`, body: { mark: 'delivered' } })
          if (answer.status !== 200) { pending.set(id, false); throw new Error(`The delivery acknowledgement answered ${answer.status}.`) }
          pending.delete(id)
        }
      } catch (why) {
        notices.push(withoutKeys(`Pending messages remain unacknowledged: ${why instanceof Error ? why.message : String(why)}`))
      }
    },
    /** @param {{content: any[], isError: boolean}} result @param {Parameters<typeof askTheOffice>[1]} options */
    async append(result, options) {
      const base = notices.map(anAddedPart)
      /** @type {string[]} */
      const ids = []
      /** @type {{id: string, text: string}[]} */
      const eligible = []
      /** @type {{id: string, text: string}[]} */
      const overBudget = []
      /** @type {string[]} */
      let oversize = []
      let more = false
      let readFailed = false
      {
        try {
          const read = await askTheOffice({ method: 'GET', path: `/api/messages?only=waiting-for-me&checkpoint=1&limit=${PENDING_MESSAGES_PER_CHECKPOINT}` }, bounded(options))
          if (read.status !== 200 || read.cut) throw new Error(`The pending checkpoint read answered ${read.status}${read.cut ? ' with a cut reply; ask the sender to split a large letter' : '; this office may not support checkpoint delivery'}.`)
          const page = JSON.parse(read.body)
          const session = theRunsIdentity(options?.env).session
          if (page?.checkpoint?.run !== session || typeof page?.checkpoint?.agent !== 'string' || page.checkpoint.agent === '') {
            throw new Error(`This office did not support a bound checkpoint reply${page?.checkpoint?.because ? `: ${page.checkpoint.because}` : '.'}`)
          }
          /** @type {string} */
          const boundRecipient = page.checkpoint.agent
          recipient = boundRecipient
          if (!Array.isArray(page?.messages)) throw new Error('The pending message read carried no message list.')
          let used = 0
          let full = false
          for (const message of page.messages.slice(0, PENDING_MESSAGES_PER_CHECKPOINT)) {
            if (typeof message?.id !== 'string' || typeof message?.body !== 'string' || pending.has(message.id)) continue
            if (!message.deliveries?.some((/** @type {any} */ d) => d.to?.kind === 'agent' && d.to.id === boundRecipient && d.mark === 'queued')) continue
            const text = withoutKeys([...deliveryEnvelope({
              fromGroup: message.fromGroup,
              from: message.whoSentIt ?? DELIVERY_ENVELOPE.aSenderTheOfficeDidNotName(message.sentBy),
              addressTheSender: message.howToAddressTheSender,
              writtenIn: message.writtenIn,
              inProject: message.workspaceId,
              message: message.id,
              routedLine: theRoutedLineFor(message, { kind: 'agent', id: boundRecipient }),
              intent: message.intent,
              label: message.label,
              whatTheMarkAsks: typeof message.whatTheMarkAsks === 'string' ? message.whatTheMarkAsks : null,
              whatTheLabelAsks: typeof message.whatTheLabelAsks === 'string' ? message.whatTheLabelAsks : null,
              body: typeof message.body === 'string' ? message.body : '',
              markedParts: Array.isArray(message.markedParts) ? message.markedParts : null,
              noMarkName: typeof message.noMarkName === 'string' ? message.noMarkName : null,
            }), '', theMessageAnAgentReads(message.body, Array.isArray(message.quotes) ? message.quotes : [], message.quotePositions ?? null), ...(message.saidInFull ? ['', message.saidInFull] : [])].join('\n'))
            if (full || (used + text.length > PENDING_TEXT_PER_CHECKPOINT && (eligible.length > 0 || text.length > THE_LONGEST_REPLY))) {
              full = true
              overBudget.push({ id: message.id, text })
              continue
            }
            used += text.length
            eligible.push({ id: message.id, text })
          }
          oversize = Array.isArray(page.checkpoint.oversize) ? page.checkpoint.oversize.filter((/** @type {unknown} */ id) => typeof id === 'string') : []
          more = typeof page.left === 'number' && page.left > 0
        } catch (why) {
          readFailed = true
          base.push(anAddedPart(withoutKeys(`Pending messages may be waiting for this worker, but they could not be read at this office checkpoint: ${why instanceof Error ? why.message : String(why)}. Read them with GET /api/messages?only=waiting-for-me.`)))
        }
      }
      let chosen = { parts: base, shown: /** @type {{id: string, text: string}[]} */ ([]) }
      if (!readFailed) {
        let show = eligible.length
        while (true) {
          chosen = theAdditionsFor({ base, eligible, overBudget, oversize, more }, show)
          if (show === 0 || opencodeKeepsWhole([...chosen.parts, ...result.content])) break
          show -= 1
        }
      }
      for (const message of chosen.shown) ids.push(message.id)
      const answer = { ...result, content: [...chosen.parts, ...result.content] }
      prepared.set(answer, ids)
      return answer
    },
    /** Called only after the complete JSON-RPC response was written successfully. @param {unknown} result */
    presented(result) {
      if (result === null || typeof result !== 'object') return
      for (const id of prepared.get(result) ?? []) pending.set(id, false)
      prepared.delete(result)
    },
  }
}
