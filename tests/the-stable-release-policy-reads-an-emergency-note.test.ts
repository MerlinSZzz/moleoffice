// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE RELEASE CHECK READS AN EMERGENCY NOTE. Made-up records only: the fixture's office answers from a map and files
 * nothing anywhere.
 *
 * OLD: a release authorization had mode spacing, outside-use or urgent-fix, and every mode named a receipt.
 * NEW: mode emergency names no receipt. It pins the chat message a secretary wrote to the owner, and the release check
 * reads the emergency switch from the office's gate list. The configuration and the note must agree that the release is
 * an emergency; each mismatch is refused alone. The note's window is at most 15 minutes. The switch and the message are
 * judged by the one rule in src/shared/stable-emergency.ts, and an earlier emergency release that went in and still owes
 * its follow-up receipt or its report stops a new one.
 * WHY: it was agreed that a fix on main may go into the stable version first and be tested afterwards,
 * with the other guards kept. A refused or cleanly restored attempt owes nothing, so a corrected second attempt need not
 * wait hours for a receipt.
 *
 * CASE PROOF MAP — each case has a control, a mutation, the assertion that goes red, and the restore.
 * - valid note: control the fixture's emergency facts; drop `emergency` from the result; the throw-and-message assertion
 *   goes red; restore the spread in emergency mode.
 * - mode mismatches: control a matching pair; remove one of the two checks; that case's refusal assertion goes red.
 * - window: control 15 minutes; let mode emergency skip the 15-minute limit; the 16-minute case passes and goes red.
 * - switch and message tables: control the valid facts; remove one check from the shared rule; its row goes red.
 * - owing: control both filed; treat `missing` as filed; the owing rows go red; restore the shared owing rule.
 * - not owed: control a refused attempt; count it as owing; the second-attempt case goes red.
 * - emergency baseline: control a completed version 4 baseline; let the original reader take version 1 only; the
 *   ordinary release after it goes red.
 * - own BEFORE: control the recheck after BEFORE; stop excluding the release's own BEFORE; the recheck goes red.
 * - the count: control one POST to the emergency gate's met door; send it to release-spacing; the path assertion goes red.
 */
import { describe, expect, it } from 'vitest'
import { momentOfAnInstant } from '../src/shared/time.ts'
import { fakeReleasePolicyFixture, historyPage } from './stable-release-policy-fixture.ts'

// Variable imports keep this criterion checkpoint compilable before the implementation exists.
const policyModule = '../tools/stable/stable-release-policy.mjs'
const schemaModule = '../src/shared/stable-release-policy.ts'
const now = () => Date.parse('2026-10-15T12:00:00Z')
const baseline = 'a'.repeat(40)
const tree = 'e'.repeat(40)
const target = 'b'.repeat(40)
type ObjectValue = Record<string, any>
function fixture() {
  const config: ObjectValue = { stableCheckout: '/fixture/stable', database: '/fixture/office.db', servicePort: 29991,
    candidateTag: 'stable-2026-10-15-candidate', previousBaselineTag: 'stable-2026-10-14-baseline', targetCommit: target,
    notice: 'Synthetic approved notice.', evidence: { recordId: 'fixture-receipt', seq: 1, contentHash: 'abcdef1234567890' }, noticeApproval: {} }
  const f = fakeReleasePolicyFixture({ config, baseline, tree, now })
  return { ...f, config, verify: async (options: ObjectValue = {}) =>
    (await import(policyModule)).verifyStableReleasePolicy({ config, baseline, tree }, { officeRequest: f.officeRequest, now, ...options }) }
}
/** The usual case: a completed release installed the baseline, and then the owner threw the switch. */
function anEmergency() {
  const f = fixture()
  f.completedAfter()
  return { f, e: f.emergency() }
}
const refused = (words: string) => `Release policy refused: ${words}`
const instant = (ms: number) => new Date(ms).toISOString()
const HISTORY = '/api/office/upgrades?limit=25'
const REASONS: Record<string, string | null> = { completed: null, unfinished: null, refused: 'Upgrade was refused before publication.',
  'failed-restored': 'Upgrade failed and the baseline was restored.', 'not-restored': 'Upgrade failed and restoration was not verified.' }

/** An earlier emergency release, newer than the baseline row, as the office's history gives it. */
function earlierEmergency(f: ReturnType<typeof fixture>, outcome: string, followUp: ObjectValue, report: ObjectValue,
  pins: ObjectValue = { throw: { change: 'fixture-old-throw', appendOrder: 50 }, message: { id: 'fixture-old-message', seq: 1, contentHash: '0123456789abcdef' } },
  before = { id: 'fixture-emergency-before', seq: 1, contentHash: 'a'.repeat(16) }) {
  const page = f.records.get(HISTORY)!
  const prior = page.entries.at(-1)
  const row = { ...prior, kind: 'emergency', tag: 'stable-2026-10-15-earlier-emergency', baselineTag: prior.tag,
    date: '2026-10-15 10:00:00', outcomeDate: outcome === 'unfinished' ? null : '2026-10-15 10:30:00', outcome, reason: REASONS[outcome],
    before, after: outcome === 'unfinished' ? null : { id: 'fixture-emergency-after', seq: 1, contentHash: 'b'.repeat(16) },
    notices: { before: 'unchanged', after: outcome === 'unfinished' ? null : 'unchanged' },
    emergency: { ...pins, followUp, report } }
  f.records.set(HISTORY, historyPage([row, ...page.entries]))
  return row
}
const filedReceipt = (green: boolean) => ({ state: 'filed', receipt: { id: 'fixture-follow-up', seq: 1, contentHash: 'c'.repeat(16) }, commit: 'f'.repeat(40), green })

describe('an emergency note', () => {
  it('returns the throw and the message, reads no spacing and sends no count', async () => {
    const { f, e } = anEmergency()
    const result = await f.verify()
    expect(result.mode).toBe('emergency')
    expect(result.spacing).toBeNull()
    expect(result.emergency).toEqual({ throw: { change: 'fixture-throw', appendOrder: e.row.lastChange.appendOrder }, message: e.message })
    expect(f.counting.sent).toEqual([])
    expect(f.calls.filter(call => call.method !== 'GET')).toEqual([])
  })

  it('has its own strict shape: a message in place of a receipt', async () => {
    const { stableReleaseAuthorizationSchema: a } = await import(schemaModule)
    const { f } = anEmergency()
    expect(a.safeParse(f.authorization).success).toBe(true)
    expect(a.safeParse({ ...f.authorization, evidence: { id: 'fixture-receipt', seq: 1, contentHash: 'abcdef1234567890' } }).success).toBe(false)
    const { message, ...withoutMessage } = f.authorization
    expect(message.seq).toBe(1)
    expect(a.safeParse(withoutMessage).success).toBe(false)
    expect(a.safeParse({ ...f.authorization, message: { ...message, seq: 2 } }).success).toBe(false)
    expect(a.safeParse({ ...withoutMessage, mode: 'urgent-fix', evidence: { id: 'fixture-receipt', seq: 1, contentHash: 'abcdef1234567890' } }).success).toBe(true)
  })

  it('refuses a configuration that asks for an emergency with a note that does not, and the other way round', async () => {
    const plain = fixture()
    plain.completedAfter()
    plain.config.emergency = true
    await expect(plain.verify()).rejects.toThrow(refused("The configuration asks for an emergency release, and the pinned note's mode is not emergency."))
    const { f } = anEmergency()
    delete f.config.emergency
    await expect(f.verify()).rejects.toThrow(refused("The pinned note's mode is emergency, and the configuration does not ask for an emergency release."))
  })

  it('takes a window of 15 minutes and refuses one of 16', async () => {
    const { f } = anEmergency()
    f.reviseAuthorization({ validFrom: instant(now() - 60_000), validUntil: instant(now() + 14 * 60_000) })
    expect((await f.verify()).mode).toBe('emergency')
    f.reviseAuthorization({ validUntil: instant(now() + 15 * 60_000) })
    await expect(f.verify()).rejects.toThrow(refused('The authorization validity window does not cover this check.'))
  })
})

describe('a baseline that went in as an emergency release', () => {
  it('is read as the newest completed release by an ordinary release after it', async () => {
    const f = fixture()
    f.completedAfter('2026-10-15 09:00:00', 'Etc/UTC', undefined, { followUp: filedReceipt(true), report: { state: 'filed', id: 'fixture-report' } })
    const result = await f.verify()
    expect(result.mode).toBe('spacing')
    expect(result.emergency).toBeUndefined()
    expect(momentOfAnInstant(result.baselineEstablishedAt)).toBe(Date.parse('2026-10-15T09:00:00.000Z'))
  })
})

describe('the emergency switch, as the release check reads it', () => {
  const cases: [string, (f: ReturnType<typeof fixture>, e: ReturnType<ReturnType<typeof fixture>['emergency']>) => void, string][] = [
    ['at 0', (_f, e) => { e.row.value = '0'; e.row.chosen = { value: '0', until: null }; e.row.lastChange.to = '0'; e.row.lastChange.until = null },
      'The emergency switch is at 0.'],
    ['run out', (_f, e) => { e.row.value = '0'; e.row.ranOut = { value: '1', until: e.row.chosen.until }; e.row.chosen = null
      e.row.lastChange = { ...e.row.lastChange, from: '1', to: '0', ranOut: true } }, 'The emergency switch has run out.'],
    ['no until', (_f, e) => { e.row.chosen.until = null; e.row.lastChange.until = null }, 'The emergency switch has no end time.'],
    ['another throw', (_f, e) => { e.row.lastChange.until = '2026-10-15 13:30:00' },
      'The office has no recorded throw of the emergency switch to 1 with this end time.'],
    ['thrown before the newest completed release', (_f, e) => { e.row.lastChange.appendOrder = 1 },
      'The emergency switch was thrown before the newest completed release.'],
    ['spent by an earlier release', (f, e) => { earlierEmergency(f, 'failed-restored', { state: 'not-owed' }, { state: 'not-owed' },
      { throw: { change: e.row.lastChange.id, appendOrder: e.row.lastChange.appendOrder }, message: { id: 'fixture-old-message', seq: 1, contentHash: '0123456789abcdef' } }) },
    'An earlier release already used this throw of the emergency switch.'],
    ['unreadable', (_f, e) => { e.row.unreadable = 'Synthetic: the value could not be read.' },
      'The office could not read the emergency switch: Synthetic: the value could not be read.'],
    ['missing from the gate list', (_f, e) => { e.list.classes.shift() },
      "The office's gate list has no row for the emergency switch, so the office is older than this tool. An emergency release needs an office that has it."],
  ]
  for (const [name, change, words] of cases) {
    it(`refuses a switch that is ${name}`, async () => {
      const { f, e } = anEmergency()
      expect((await f.verify()).mode).toBe('emergency')
      change(f, e)
      await expect(f.verify()).rejects.toThrow(refused(words))
    })
  }

  it('takes an end time 120 minutes after the throw and refuses one 121 minutes after', async () => {
    const at120 = fixture(); at120.completedAfter(); at120.emergency({ minutes: 120 })
    expect((await at120.verify()).mode).toBe('emergency')
    const at121 = fixture(); at121.completedAfter(); at121.emergency({ minutes: 121 })
    await expect(at121.verify()).rejects.toThrow(refused('The emergency switch ends more than 120 minutes after it was thrown.'))
  })
})

describe('the chat message, as the release check reads it', () => {
  /** Write the message again with other content, and pin the new revision in the note, as a secretary would. */
  function rewrite(f: ReturnType<typeof fixture>, change: (data: ObjectValue) => void, writer?: string) {
    const current = f.records.get('/api/records/fixture-emergency-message/revisions/1')!
    const data = structuredClone(current.content.data)
    change(data)
    const pin = f.add('fixture-emergency-message', 'message', data, 1, current.at, writer)
    f.reviseAuthorization({ message: pin })
  }
  const cases: [string, (f: ReturnType<typeof fixture>, e: ReturnType<ReturnType<typeof fixture>['emergency']>) => void, string][] = [
    ['missing', f => { f.records.delete('/api/records/fixture-emergency-message/revisions/1'); f.records.delete('/api/records/fixture-emergency-message') },
      'The emergency message is missing.'],
    ['deleted', f => { f.records.get('/api/records/fixture-emergency-message')!.record.deletedAt = '2026-10-15 11:58:00' },
      'The emergency message is missing.'],
    ['not by the secretary card', f => rewrite(f, () => {}, 'fixture-writer'),
      'The emergency message was not written by an agent holding the secretary card.'],
    ['not to the owner alone', f => rewrite(f, data => { data.to.push({ kind: 'agent', id: 'fixture-writer' }) }),
      'The emergency message is not addressed to the owner alone.'],
    ['to somebody else', f => rewrite(f, data => { data.to = [{ kind: 'person', id: 'fixture-somebody-else' }] }),
      'The emergency message is not addressed to the owner alone.'],
    ['without the full commit', f => rewrite(f, data => { data.body = `The office is broken. Synthetic fix ${target.slice(0, 39)} goes in now.` }),
      'The emergency message does not name the full 40-character target commit.'],
    ['inside a longer hexadecimal word', f => rewrite(f, data => { data.body = `The office is broken. Synthetic fix ${target}0 goes in now.` }),
      'The emergency message does not name the full 40-character target commit.'],
    ['written before the newest completed release', f => { f.records.get('/api/records/fixture-emergency-message')!.changes[0].appendOrder = 1 },
      'The emergency message was written before the newest completed release.'],
    ['without its place in the order', f => { f.records.get('/api/records/fixture-emergency-message')!.changes = [] },
      "The emergency message's place in the office's order could not be read."],
    ['pinned twice', (f, e) => { earlierEmergency(f, 'refused', { state: 'not-owed' }, { state: 'not-owed' },
      { throw: { change: 'fixture-old-throw', appendOrder: 50 }, message: e.message }) },
    'An earlier release already pinned this emergency message.'],
  ]
  for (const [name, change, words] of cases) {
    it(`refuses a message that is ${name}`, async () => {
      const { f, e } = anEmergency()
      expect((await f.verify()).mode).toBe('emergency')
      change(f, e)
      await expect(f.verify()).rejects.toThrow(refused(words))
    })
  }
})

describe('an earlier emergency release that went in owes its follow-up receipt and its report', () => {
  const owing: [string, string, ObjectValue, ObjectValue, RegExp][] = [
    ['owes both', 'not-restored', { state: 'missing' }, { state: 'missing' }, /still owes its follow-up receipt and its report\./],
    ['owes its report', 'not-restored', filedReceipt(false), { state: 'missing' }, /still owes its report\./],
    ['owes its follow-up receipt', 'unfinished', { state: 'missing' }, { state: 'filed', id: 'fixture-report' }, /still owes its follow-up receipt\./],
    ['cannot be checked', 'not-restored', { state: 'unknown', because: 'Synthetic: git could not read the repository.' }, { state: 'filed', id: 'fixture-report' },
      /Its follow-up receipt could not be checked, so it counts as owed: Synthetic: git could not read the repository\./],
  ]
  for (const [name, outcome, followUp, report, words] of owing) {
    it(`refuses a new emergency while an earlier one ${name}`, async () => {
      const { f } = anEmergency()
      expect((await f.verify()).mode).toBe('emergency')
      earlierEmergency(f, outcome, followUp, report)
      const error: Error = await f.verify().then(() => { throw new Error('The release check took it.') }, (refusal: Error) => refusal)
      expect(error.message).toMatch(/^Release policy refused: The emergency release stable-2026-10-15-earlier-emergency still owes /)
      expect(error.message).toMatch(words)
      expect(error.message).toMatch(/ No second emergency release goes in while an earlier one owes either\.$/)
    })
  }

  it('refuses a new emergency while the release it starts from went in as one and owes', async () => {
    const f = fixture()
    f.completedAfter(undefined, undefined, undefined, { followUp: { state: 'missing' }, report: { state: 'filed', id: 'fixture-report' } })
    f.emergency()
    await expect(f.verify()).rejects.toThrow(refused(
      'The emergency release stable-2026-10-14-baseline still owes its follow-up receipt. No second emergency release goes in while an earlier one owes either.'))
  })

  it('lets the next emergency go once both are filed, and a red follow-up counts as filed', async () => {
    const { f } = anEmergency()
    earlierEmergency(f, 'not-restored', filedReceipt(false), { state: 'filed', id: 'fixture-report' })
    expect((await f.verify()).mode).toBe('emergency')
    const g = fixture()
    g.completedAfter(undefined, undefined, undefined, { followUp: filedReceipt(true), report: { state: 'filed', id: 'fixture-report' } })
    g.emergency()
    expect((await g.verify()).mode).toBe('emergency')
  })

  it('lets a corrected second attempt go at once after a refused or cleanly restored one', async () => {
    for (const outcome of ['refused', 'failed-restored']) {
      const { f } = anEmergency()
      earlierEmergency(f, outcome, { state: 'not-owed' }, { state: 'not-owed' })
      expect((await f.verify()).mode).toBe('emergency')
    }
  })
})

describe('the release rechecks after its own BEFORE', () => {
  it('does not count its own BEFORE as an earlier release', async () => {
    const { f, e } = anEmergency()
    const own = { id: 'fixture-own-before', seq: 1, contentHash: 'd'.repeat(16) }
    earlierEmergency(f, 'unfinished', { state: 'missing' }, { state: 'missing' },
      { throw: { change: e.row.lastChange.id, appendOrder: e.row.lastChange.appendOrder }, message: e.message }, own)
    await expect(f.verify()).rejects.toThrow(refused('An earlier release already used this throw of the emergency switch.'))
    expect((await f.verify({ ownBefore: own })).emergency.message).toEqual(e.message)
  })
})

describe('the use of the switch is counted once', () => {
  it('sends one count to the emergency gate and says what the office answered', async () => {
    const { f } = anEmergency()
    const { countTheEmergencyUse } = await import(policyModule)
    expect(await countTheEmergencyUse(f.officeRequest)).toBe('The office counted this use of the emergency switch.')
    expect(f.calls.filter(call => call.method === 'POST')).toEqual([{ method: 'POST', path: '/api/office/gates/stable-emergency/met', body: { position: '1' } }])
    f.counting.answer = () => ({ status: 403, body: JSON.stringify({ error: 'Synthetic refusal.' }) })
    expect(await countTheEmergencyUse(f.officeRequest)).toBe('The office did not count this use of the emergency switch (403): Synthetic refusal.')
  })
})
