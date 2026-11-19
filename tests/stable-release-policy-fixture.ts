// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/** Synthetic adapter only: these made-up notes and events are never filed in an office. */
import { stampInZone } from '../src/shared/time.ts'
import { versionOf } from '../src/server/lib/version.ts'
import { MESSAGE_CENTRE } from '../src/shared/workspaces.ts'

type ObjectValue = Record<string, any>
export function fakeReleasePolicyFixture({ config, baseline, tree, now = Date.now, office = 'mole-office' }: {
  config: ObjectValue; baseline: string; tree: string; now?: () => number; office?: string
}) {
  const project = 'fixture-project'
  const records = new Map<string, ObjectValue>()
  const calls: { method: string; path: string; body?: unknown }[] = []
  records.set('/api/office/upgrades?limit=25', historyPage([]))
  records.set('/api/office/gates', gateList([{ id: 'release-spacing', value: '180', unreadable: null }]))
  // Each count the release check sends, and what the made-up office answers it; a test may change the answer.
  const counting: { sent: unknown[]; answer: () => { status: number; body: string } } = { sent: [], answer: () => ({ status: 200, body: '{}' }) }
  const instant = (ms: number) => new Date(ms).toISOString()
  const serving = { commit: baseline, repository: config.stableCheckout, database: config.database, port: config.servicePort }
  records.set('/api/roles', { elevation: { rule: { onlyThisCardCanHoldIt: 'secretary' } } })
  const actor = 'fixture-secretary'
  records.set(`/api/participants/agent/${actor}`, { participant: { id: actor, handle: 'made-up-secretary', role: 'secretary', retired: false } })
  // The office's registry row; its id is the handle until a re-mint gives it another.
  records.set('/api/participants/agent/mole-office', { participant: { id: office, handle: 'mole-office', retired: false } })
  records.set('/api/participants/agent/fixture-writer', { participant: { id: 'fixture-writer', handle: 'made-up-writer', role: 'worker', retired: false } })
  // The order the made-up changes table wrote its rows in. Each record's create row takes the next number.
  let order = 100
  function add(id: string, kind: 'note' | 'message', data: ObjectValue, seq = 1, at = '2026-10-15 09:00:00', writer = actor) {
    const content = { kind, title: 'Synthetic policy fixture', summary: null, data: structuredClone(data), deletedAt: null }
    const revision = { id: `${id}-revision-${seq}`, recordId: id, seq, op: seq === 1 ? 'create' : 'update',
      who: { actorType: 'agent', actorId: writer, resolvedAgentId: writer, sessionId: 'fixture-run' },
      provedBy: 'an-agent-key', provedHolder: null, at, content, contentHash: versionOf(content) }
    records.set(`/api/records/${id}/revisions/${seq}`, revision)
    // A message is kept in the message centre, and its mark in data.writtenIn says the project it was written in.
    const workspaceId = kind === 'message' ? MESSAGE_CENTRE : project
    const created = seq === 1 ? [{ id: `${id}-change-1`, recordId: id, workspaceId, op: 'create', at, appendOrder: order += 10 }]
      : records.get(`/api/records/${id}`)?.changes ?? []
    records.set(`/api/records/${id}`, { record: { id, workspaceId, origin: 'authored', ...structuredClone(content) }, narrowedByPermission: null,
      changes: created, changesCarried: { carried: created.length, total: created.length, budgetBytes: 65_536, next: null } })
    return { id, seq, contentHash: revision.contentHash }
  }
  const bootstrap = add('fixture-bootstrap', 'note', { body: 'Synthetic operator attestation.', extra: { stableReleaseBaseline: {
    version: 1, kind: 'operator-attestation', reason: 'Synthetic first baseline or manual restoration.',
    baselineTag: config.previousBaselineTag, serving, establishedAt: instant(now() - 181 * 60_000),
  } } }, 1, stampInZone(now(), 'Etc/UTC'))
  const authorization: ObjectValue = { version: 1, mode: 'spacing', reason: 'Synthetic release approval.', timeZone: 'Etc/UTC',
    candidateTag: config.candidateTag, baselineTag: config.previousBaselineTag, fromCommit: baseline, toCommit: config.targetCommit, tree,
    evidence: { id: config.evidence.recordId, seq: config.evidence.seq, contentHash: config.evidence.contentHash }, serving,
    validFrom: instant(now() - 60_000), validUntil: instant(now() + 5 * 60_000), baselineSource: { kind: 'bootstrap', note: bootstrap },
  }
  add('fixture-approval', 'note', { body: config.notice }, 1)
  const approval = add('fixture-approval', 'note', { body: config.notice, extra: { stableReleaseAuthorization: authorization } }, 2)
  config.noticeApproval = approval
  function revise(id: string, seq: number, change: (revision: ObjectValue) => void) {
    const revision = records.get(`/api/records/${id}/revisions/${seq}`)!
    change(revision)
    revision.contentHash = versionOf(revision.content)
    return { id, seq, contentHash: revision.contentHash }
  }
  function reviseAuthorization(patch: ObjectValue) {
    Object.assign(authorization, patch)
    Object.assign(approval, revise('fixture-approval', 2, revision => {
      revision.content.data.extra.stableReleaseAuthorization = structuredClone(authorization)
    }))
    return approval
  }
  /**
   * The completed upgrade that installed the baseline; `earlier` names the version it came from. With `emergency`, it
   * went in as an emergency release (notice version 4): no receipt, a switch throw and a message, and the follow-up and
   * the report the office worked out on read.
   */
  function completedAfter(at = '2026-10-15 09:00:00', timeZone = 'Etc/UTC', earlier = { baselineTag: 'stable-older', fromCommit: 'c'.repeat(40) },
    emergency: { followUp: ObjectValue; report: ObjectValue } | null = null) {
    const evidence = { id: 'fixture-old-receipt', seq: 1, contentHash: '1234567890abcdef' }
    const pins = emergency === null ? null : { throw: { change: 'fixture-earlier-throw', appendOrder: order += 10 },
      message: add('fixture-earlier-emergency-message', 'message', { body: `Synthetic emergency message for ${baseline}.`,
        to: [{ kind: 'person', id: 'fixture-person' }], writtenIn: { project } }) }
    const line = pins === null ? '' : `Emergency release: no complete test receipt was read for this version. Message ${pins.message.id} told the owner.\n\n`
    const event = (request: ObjectValue) => ({ version: emergency === null ? 1 : 4, project, date: at, request })
    const data = (request: ObjectValue) => ({ body: request.stage === 'before' ? `${line}Synthetic earlier notice.` : `Upgrade completed and verified.\n\n${line}Synthetic earlier notice.`, notice: 'stableUpgradeNotice',
      sentBy: { kind: 'agent', id: office }, to: [{ kind: 'person', id: 'fixture-person' }], writtenIn: { project },
      extra: { stableUpgradeNotice: event(request) } })
    const kind = pins === null ? {} : { kind: 'emergency' }
    const earlierNote = add('fixture-earlier-note', 'note', { body: 'Synthetic earlier notice.' })
    const before = add('fixture-before', 'message', data({ ...kind, stage: 'before', sendId: 'fixture-before-send', announcement: {
      candidateTag: config.previousBaselineTag, baselineTag: earlier.baselineTag, fromCommit: earlier.fromCommit, toCommit: baseline, tree: 'd'.repeat(40),
      ...(pins === null ? { evidence } : { emergency: pins }), notice: 'Synthetic earlier notice.', noticeApproval: earlierNote,
    } }), 1, at, 'fixture-writer')
    const after = add('fixture-after', 'message', data({ ...kind, stage: 'after', sendId: 'fixture-after-send', before,
      outcome: { state: 'completed', verification: { result: 'completed', ...(pins === null ? { evidence } : {}), serving } },
    }), 1, at, 'fixture-writer')
    const historyRow = { tag: config.previousBaselineTag, baselineTag: earlier.baselineTag, date: at, outcomeDate: at,
      notice: 'Synthetic earlier notice.', fromCommit: earlier.fromCommit, toCommit: baseline, tree: 'd'.repeat(40),
      outcome: 'completed', reason: null, before, after, notices: { before: 'unchanged', after: 'unchanged' },
      ...(pins === null || emergency === null ? {} : { ...kind, emergency: { ...pins, followUp: emergency.followUp, report: emergency.report } }) }
    records.set('/api/office/upgrades?limit=25', historyPage([historyRow]))
    reviseAuthorization({ timeZone, baselineSource: { kind: 'completed-after', after } })
    return { before, after, historyRow }
  }
  const owner = { id: 'fixture-person', name: 'Made-up owner', named: true, placeholder: 'You', guide: '#/guide' }
  records.set('/api/office/owner', owner)
  /**
   * AN EMERGENCY RELEASE'S FACTS, made up: the owner threw the switch to 1 with an end time, a secretary told the owner
   * in chat, and the pinned note's mode is emergency. Each part may be changed by the test that is about it.
   */
  function emergency({ minutes = 60, thrownAgo = 5 }: { minutes?: number; thrownAgo?: number } = {}) {
    const thrown = now() - thrownAgo * 60_000
    const at = stampInZone(thrown, 'Etc/UTC'), until = stampInZone(thrown + minutes * 60_000, 'Etc/UTC')
    const row: ObjectValue = { id: 'stable-emergency', class: 'quality', group: 'the-stable-version', value: '1', unreadable: null,
      chosen: { value: '1', until }, ranOut: null, counts: null,
      lastChange: { id: 'fixture-throw', appendOrder: order += 10, at, by: { type: 'human', id: owner.id, name: owner.name },
        from: '0', to: '1', because: 'Synthetic: the office is broken.', until, ranOut: false } }
    const list = gateList([{ id: 'release-spacing', value: '180', unreadable: null }])
    list.classes.unshift({ class: 'quality', groups: [{ group: 'the-stable-version', rows: [row] }] })
    records.set('/api/office/gates', list)
    const message = add('fixture-emergency-message', 'message', { body: `The office is broken. Synthetic fix ${config.targetCommit} goes in now.`,
      to: [{ kind: 'person', id: owner.id }], writtenIn: { project } }, 1, at)
    config.emergency = true
    delete config.evidence
    delete authorization.evidence
    reviseAuthorization({ mode: 'emergency', message })
    return { row, message, list }
  }
  const officeRequest = Object.assign(async (request: { method: string; path: string; body?: unknown }) => {
    calls.push(request)
    if (request.method === 'POST' && ['/api/office/gates/release-spacing/met', '/api/office/gates/stable-emergency/met'].includes(request.path)) {
      counting.sent.push(request.body)
      return { ...counting.answer(), cut: false, location: null }
    }
    if (request.method !== 'GET') throw new Error('The synthetic release policy adapter permits reads and the two gate counts only.')
    // The gate list is kept at its bare path. A read of one gate gets the whole list, as an office older than the one-row read answers it.
    const value = records.get(request.path.startsWith('/api/office/gates?gate=') ? '/api/office/gates' : request.path)
    return { status: value ? 200 : 404, body: JSON.stringify(value ?? { error: 'Synthetic fixture absent.' }), cut: false, location: null }
  }, { identity: { project, agent: 'fixture-writer', session: 'fixture-run' } })
  return { officeRequest, authorization, records, revise, reviseAuthorization, approval, calls, completedAfter, add, counting, emergency, owner }
}

/** A synthetic gate list in the public reading's shape: the spacing rows a test names, beside one other number row. */
export function gateList(spacing: ObjectValue[], kind = 'builds-mole-office') {
  const row = (id: string, value: unknown, unreadable: unknown) => ({ id, class: 'process', group: 'numbers', value, unreadable, chosen: null, counts: null })
  const classes: ObjectValue[] = [
    { class: 'process', groups: [{ group: 'numbers', rows: [row('checks-an-hour', '6', null), ...spacing.map(one => row(one.id, one.value, one.unreadable))] }] },
  ]
  return { office: { kind, because: kind === 'ordinary' ? 'runs-from-an-installed-build' : 'runs-from-a-checkout' }, mayChange: false, classes }
}

/** A synthetic page uses the public history response shape, including its disclosure counts. */
export function historyPage(entries: ObjectValue[], older: string | null = null) {
  return { entries, older, subtraction: { candidates: entries.length + (older ? 1 : 0), carried: entries.length,
    leftOut: older ? 1 : 0, shortened: 0 }, leftOutGroups: older ? [{ cause: 'budget', bucket: 'older', count: 1, ids: ['fixture-older'] }] : [] }
}
