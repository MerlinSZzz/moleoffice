// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { describe, expect, it } from 'vitest'
import { fakeReleasePolicyFixture, gateList, historyPage } from './stable-release-policy-fixture.ts'

// Variable imports keep this criterion checkpoint compilable before the implementation exists.
const policyModule = '../tools/stable/stable-release-policy.mjs'
const schemaModule = '../src/shared/stable-release-policy.ts'
const gatesModule = '../src/config/gates.mjs'
const clockModule = '../src/shared/time.ts'
const now = () => Date.parse('2026-10-15T12:00:00Z')
const baseline = 'a'.repeat(40)
const tree = 'e'.repeat(40)
function fixture(office?: string) {
  const config = { stableCheckout: '/fixture/stable', database: '/fixture/office.db', servicePort: 29991,
    candidateTag: 'stable-2026-10-15-candidate', previousBaselineTag: 'stable-2026-10-14-baseline', targetCommit: 'b'.repeat(40),
    notice: 'Synthetic approved notice.', evidence: { recordId: 'fixture-receipt', seq: 1, contentHash: 'abcdef1234567890' }, noticeApproval: {} }
  const f = fakeReleasePolicyFixture({ config, baseline, tree, now, office })
  return { ...f, config, verify: async (request = f.officeRequest, clock = now) =>
    (await import(policyModule)).verifyStableReleasePolicy({ config, baseline, tree }, { officeRequest: request, now: clock }) }
}
const refused = (words: string) => `Release policy refused: ${words}`

describe('stable release original authority', () => {
  // OLD: history holds only upgrades. NEW: first handoff is ignored by ordinary spacing.
  // WHY: changing the serving checkout does not replace a completed-release filing clock.
  it('ignores first handoff rows without resetting ordinary release spacing', async () => {
    const f = fixture(); f.completedAfter()
    const page = f.records.get('/api/office/upgrades?limit=25')!
    const prior = page.entries[0]
    f.records.set('/api/office/upgrades?limit=25', historyPage([{ ...prior, kind: 'first-handoff', baselineTag: null,
      fromCommit: baseline, toCommit: baseline, fromRepository: '/fixture/development', toRepository: '/fixture/stable',
      outcome: 'handed-off', date: '2026-10-15 11:59:00', outcomeDate: '2026-10-15 11:59:01',
      before: { id: 'fixture-handoff-before', seq: 1, contentHash: 'a'.repeat(16) },
      after: { id: 'fixture-handoff-after', seq: 1, contentHash: 'b'.repeat(16) } }, prior]))
    expect((await f.verify()).elapsedMinutes).toBe(180)
    await expect(f.verify(f.officeRequest, () => now() - 1)).rejects.toThrow(refused('The baseline has not completed 180 minutes.'))
  })

  // OLD: the spacing was the constant STABLE_RELEASE_SPACING_MINUTES, pinned at 180. NEW: the constant is gone, and 180 is
  // the default in both columns of the release-spacing gate. WHY: the owner made the 180 a setting they may change (21 Oct).
  it('requires strict versioned authorization and baseline shapes', async () => {
    const { stableReleaseAuthorizationSchema: a, stableReleaseBaselineSchema: b, stableReleaseBaselineSourceSchema: source,
      STABLE_RELEASE_SPACING_MINUTES, STABLE_RELEASE_EXCEPTION_MINUTES } = await import(schemaModule)
    const f = fixture()
    expect(source.safeParse({ kind: 'completed-after', after: { ...f.approval, seq: 1 }, timeZone: 'Etc/UTC' }).success).toBe(false)
    expect(STABLE_RELEASE_SPACING_MINUTES).toBeUndefined()
    expect((await import(gatesModule)).gateNamed('release-spacing').defaults).toEqual({ buildsMoleOffice: '180', ordinary: '180' })
    expect(STABLE_RELEASE_EXCEPTION_MINUTES).toBe(15)
    expect(a.safeParse(f.authorization).success).toBe(true)
    for (const patch of [{ version: 2 }, { timeZone: '' }, { mode: 'quiet' }, { unexpected: true }, { reason: '' }]) {
      expect(a.safeParse({ ...f.authorization, ...patch }).success).toBe(false)
    }
    const attestation = f.records.get('/api/records/fixture-bootstrap/revisions/1')!.content.data.extra.stableReleaseBaseline
    expect(b.safeParse(attestation).success).toBe(true)
    expect(b.safeParse({ ...attestation, kind: 'release-event' }).success).toBe(false)
    expect(b.safeParse({ ...attestation, unknown: true }).success).toBe(false)
    expect(source.safeParse({ ...f.authorization.baselineSource, after: f.approval }).success).toBe(false)
  })

  it('starts spacing at the original completed AFTER filing instant and allows exactly 180 minutes', async () => {
    const f = fixture(); f.completedAfter()
    const current = f.records.get('/api/records/fixture-after')!
    current.record.createdAt = '2026-10-01 00:00:00'
    current.record.data.extra.stableUpgradeNotice.date = '2026-10-01 00:00:00'
    const result = await f.verify()
    expect(result.mode).toBe('spacing')
    expect(result.timeZone).toBe('Etc/UTC')
    expect(result.elapsedMinutes).toBe(180)
    const { momentOfAnInstant } = await import(clockModule)
    expect(result.baselineEstablishedAt).toMatch(/\.\d{3}[+-]\d{2}:\d{2}$/)
    expect(momentOfAnInstant(result.baselineEstablishedAt)).toBe(Date.parse('2026-10-15T09:00:00.000Z'))
    expect(result.checkedAt).toMatch(/\.\d{3}[+-]\d{2}:\d{2}$/)
    expect(momentOfAnInstant(result.checkedAt)).toBe(now())
    expect(result.approval).toEqual(f.approval)
    expect(result.baselineSource).toEqual(f.authorization.baselineSource)
    await expect(f.verify(f.officeRequest, () => now() - 1)).rejects.toThrow(refused('The baseline has not completed 180 minutes.'))
  })

  it('requires active authenticated secretary authors for pinned and original notes', async () => {
    const handles = fixture()
    for (const [path, row] of handles.records) {
      if (path.includes('/revisions/')) row.who.actorId = `stored-handle-${row.who.resolvedAgentId}`
    }
    expect((await handles.verify()).mode).toBe('spacing')
    const declared = fixture()
    declared.records.get('/api/roles')!.elevation.rule.onlyThisCardCanHoldIt = 'fixture-authorizer'
    declared.records.get('/api/participants/agent/fixture-secretary')!.participant.role = 'fixture-authorizer'
    expect((await declared.verify()).mode).toBe('spacing')
    for (const corrupt of [
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval/revisions/2')!.who.resolvedAgentId = null },
      (f: ReturnType<typeof fixture>) => { delete f.records.get('/api/records/fixture-approval/revisions/2')!.who.resolvedAgentId },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval/revisions/2')!.who.resolvedAgentId = 'fixture-writer' },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/roles')!.elevation.rule.onlyThisCardCanHoldIt = 'different-card' },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/participants/agent/fixture-secretary')!.participant.role = 'worker' },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/participants/agent/fixture-secretary')!.participant.retired = true },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/participants/agent/fixture-secretary')!.participant.id = 'different-author' },
      (f: ReturnType<typeof fixture>) => { delete f.records.get('/api/records/fixture-approval/revisions/2')!.provedBy },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval/revisions/2')!.provedHolder = 'fixture-other' },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval/revisions/1')!.op = 'baseline' },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval/revisions/1')!.who.sessionId = null },
      (f: ReturnType<typeof fixture>) => { f.records.get('/api/records/fixture-approval')!.record.origin = 'fixture' },
    ]) {
      const f = fixture(); corrupt(f)
      await expect(f.verify()).rejects.toThrow(refused('The pinned note lacks active authenticated secretary authority.'))
    }
  })

  it('binds every release scope field to the exact target and serving baseline', async () => {
    for (const patch of [{ candidateTag: 'stable-2026-10-15-other' }, { baselineTag: 'stable-other' },
      { fromCommit: 'c'.repeat(40) }, { toCommit: 'c'.repeat(40) }, { tree: 'c'.repeat(40) },
      { evidence: { id: 'other-receipt', seq: 1, contentHash: 'abcdef1234567890' } },
      ...['commit', 'repository', 'database', 'port'].map(key => ({ serving: { ...fixture().authorization.serving,
        [key]: key === 'port' ? 29992 : key === 'commit' ? 'c'.repeat(40) : '/fixture/other' } }))]) {
      const f = fixture(); f.reviseAuthorization(patch)
      await expect(f.verify()).rejects.toThrow(refused('The authorization does not match this release.'))
    }
    const f = fixture(); f.config.notice = 'Different notice.'
    await expect(f.verify()).rejects.toThrow(refused('The authorization does not match this release.'))
  })

  it('bounds outside-use and urgent-fix windows without inferring presence', async () => {
    for (const mode of ['outside-use', 'urgent-fix']) {
      const f = fixture(); f.completedAfter('2026-10-15 11:59:00')
      f.reviseAuthorization({ mode, validFrom: '2026-10-15T12:00:00Z', validUntil: '2026-10-15T12:15:00Z' })
      expect((await f.verify()).mode).toBe(mode)
      let clock = now()
      const delayed = Object.assign(async (asked: { method: string; path: string }) => {
        const response = await f.officeRequest(asked); clock = Date.parse('2026-10-15T12:16:00Z'); return response
      }, f.officeRequest)
      await expect(f.verify(delayed, () => clock)).rejects.toThrow(refused('The authorization validity window does not cover this check.'))
      for (const patch of [
        { validUntil: '2026-10-15T12:00:00Z' }, { validFrom: '2026-10-15T12:00:01Z' },
        { validUntil: '2026-10-15T12:15:00.001Z' }, { validFrom: '2026-10-15 11:59:00' },
      ]) {
        const bad = fixture(); bad.reviseAuthorization({ mode, validFrom: '2026-10-15T12:00:00Z', validUntil: '2026-10-15T12:15:00Z', ...patch })
        await expect(bad.verify()).rejects.toThrow(refused('The authorization validity window does not cover this check.'))
      }
    }
  })

  it('ignores forged latest contents and refuses damaged original hashes', async () => {
    const f = fixture(); f.records.get('/api/records/fixture-approval')!.record.data = { body: 'Forged latest', extra: {} }
    expect((await f.verify()).mode).toBe('spacing')
    for (const change of [(r: any) => { r.content.data.body = 'Changed without rehash' }, (r: any) => { r.recordId = 'different' },
      (r: any) => { r.seq = 3 }, (r: any) => { r.contentHash = '1234567890abcdef' }]) {
      const bad = fixture(); change(bad.records.get('/api/records/fixture-approval/revisions/2'))
      await expect(bad.verify()).rejects.toThrow(refused('The pinned revision identity or content hash does not match.'))
    }
  })

  it('accepts only original completed events and verifies their BEFORE and serving baseline', async () => {
    const retried = fixture(); retried.completedAfter()
    retried.records.get('/api/records/fixture-after/revisions/1')!.who.sessionId = 'fixture-new-run'
    retried.records.get('/api/records/fixture-after/revisions/1')!.who.actorId = 'stored-writer-handle'
    expect((await retried.verify()).elapsedMinutes).toBe(180)
    for (const change of [
      (r: any) => { r.op = 'update' },
      (r: any) => { r.content.data.body = 'Forged outcome body.' },
      (r: any) => { r.provedBy = null },
      (r: any) => { r.who.actorId = 'fixture-secretary'; r.who.resolvedAgentId = 'fixture-secretary' },
      (r: any) => { r.who.resolvedAgentId = null },
      (r: any) => { r.content.data.sentBy.id = 'fixture-writer' },
      (r: any) => { r.content.data.extra.stableUpgradeNotice.request.outcome = { state: 'refused', reason: 'Upgrade was refused before publication.' } },
      (r: any) => { r.content.data.extra.stableUpgradeNotice.request.outcome = { state: 'failed-restored', reason: 'Upgrade failed and the baseline was restored.' } },
      (r: any) => { r.content.data.extra.stableUpgradeNotice.request.outcome.verification.serving.database = '/fixture/other.db' },
      (r: any) => { r.content.data.extra.stableUpgradeNotice.request.outcome.verification.evidence.id = 'different-receipt' },
      (r: any) => { r.content.data.extra.stableUpgradeNotice.project = 'other-project' },
    ]) {
      const f = fixture(); f.completedAfter()
      const after = f.revise('fixture-after', 1, change)
      f.reviseAuthorization({ baselineSource: { kind: 'completed-after', after } })
      await expect(f.verify()).rejects.toThrow(refused('The baseline is not a matching original completed AFTER.'))
    }
    const f = fixture(); f.completedAfter()
    f.records.delete('/api/records/fixture-before/revisions/1')
    await expect(f.verify()).rejects.toThrow('Release policy refused:')
  })

  // OLD: an original event's sender had to be the handle mole-office. NEW: it must be the id the office's
  // registry row holds now, and a row that cannot be read refuses. WHY: that id can differ from the
  // handle.
  it('takes the office from its registry row, so a re-minted office counts and its handle alone does not', async () => {
    const reminted = 'aB3dE6gH9jKl'
    const minted = fixture(reminted); minted.completedAfter()
    expect((await minted.verify()).elapsedMinutes).toBe(180)
    const handle = fixture(reminted); handle.completedAfter()
    const after = handle.revise('fixture-after', 1, (r: any) => { r.content.data.sentBy.id = 'mole-office' })
    handle.reviseAuthorization({ baselineSource: { kind: 'completed-after', after } })
    await expect(handle.verify()).rejects.toThrow(refused('The baseline is not a matching original completed AFTER.'))
    const unread = fixture(); unread.completedAfter()
    unread.records.delete('/api/participants/agent/mole-office')
    await expect(unread.verify()).rejects.toThrow(refused('The office\'s registry row could not be read (404)'))
  })

  it('paginates to the exact baseline and refuses a newer success for the same installation', async () => {
    const f = fixture(); f.completedAfter()
    const baselineRow = f.records.get('/api/office/upgrades?limit=25')!.entries[0]
    const attempts = Array.from({ length: 25 }, (_, i) => ({ ...baselineRow,
      outcome: i % 3 === 0 ? 'unfinished' : i % 3 === 1 ? 'refused' : 'failed-restored',
      reason: i % 3 === 0 ? null : i % 3 === 1 ? 'Upgrade was refused before publication.' : 'Upgrade failed and the baseline was restored.',
      before: { ...baselineRow.before, id: `fixture-attempt-${i}` }, after: i % 3 === 0 ? null : { ...baselineRow.after, id: `fixture-outcome-${i}` },
    }))
    f.records.set('/api/office/upgrades?limit=25', historyPage(attempts, 'fixture-next'))
    f.records.set('/api/office/upgrades?limit=25&before=fixture-next', historyPage([baselineRow]))
    expect((await f.verify()).elapsedMinutes).toBe(180)
    expect(f.calls.some(call => call.path === '/api/office/upgrades?limit=25&before=fixture-next')).toBe(true)
    f.records.delete('/api/office/upgrades?limit=25&before=fixture-next')
    await expect(f.verify()).rejects.toThrow('Release policy refused:')
    for (const sameInstallation of [true, false]) {
      const newer = fixture(); newer.completedAfter()
      const prior = newer.records.get('/api/office/upgrades?limit=25')!.entries[0]
      const beforeData = structuredClone(newer.records.get('/api/records/fixture-before/revisions/1')!.content.data)
      Object.assign(beforeData.extra.stableUpgradeNotice.request.announcement, {
        candidateTag: 'stable-2026-10-15-newer', toCommit: 'f'.repeat(40),
      })
      const before = newer.add('fixture-newer-before', 'message', beforeData, 1, '2026-10-15 10:00:00', 'fixture-writer')
      const afterData = structuredClone(newer.records.get('/api/records/fixture-after/revisions/1')!.content.data)
      afterData.extra.stableUpgradeNotice.request.before = before
      Object.assign(afterData.extra.stableUpgradeNotice.request.outcome.verification.serving, {
        commit: 'f'.repeat(40), database: sameInstallation ? '/fixture/office.db' : '/fixture/another.db',
      })
      const after = newer.add('fixture-newer-after', 'message', afterData, 1, '2026-10-15 10:00:00', 'fixture-writer')
      newer.records.set('/api/office/upgrades?limit=25', historyPage([
        { ...prior, tag: 'stable-2026-10-15-newer', toCommit: 'f'.repeat(40), before, after }, prior,
      ]))
      if (sameInstallation) await expect(newer.verify()).rejects.toThrow(refused('The baseline is not a matching original completed AFTER.'))
      else expect((await newer.verify()).elapsedMinutes).toBe(180)
    }
  })

  it('requires an explicit matching operator attestation after bootstrap or manual restore', async () => {
    const f = fixture(); expect((await f.verify()).elapsedMinutes).toBe(181)
    const reversed = fixture()
    reversed.records.get('/api/records/fixture-bootstrap/revisions/1')!.at = '2026-10-15 08:58:00'
    await expect(reversed.verify()).rejects.toThrow(refused('The baseline attestation was filed before its establishment.'))
    const restored = fixture()
    const bootstrap = structuredClone(restored.authorization.baselineSource)
    restored.completedAfter()
    restored.reviseAuthorization({ mode: 'urgent-fix', baselineSource: bootstrap })
    await expect(restored.verify()).rejects.toThrow(refused('The baseline attestation must follow the latest completed release.'))
    const data = structuredClone(restored.records.get('/api/records/fixture-bootstrap/revisions/1')!.content.data)
    for (const [establishedAt, filed] of [
      ['2026-10-15T10:00:00Z', '2026-10-15 09:00:00'],
      ['2026-10-15T08:59:00Z', '2026-10-15 10:01:00'],
    ]) {
      data.extra.stableReleaseBaseline.establishedAt = establishedAt
      const note = restored.add('fixture-bootstrap', 'note', structuredClone(data), 2, filed)
      restored.reviseAuthorization({ baselineSource: { kind: 'bootstrap', note } })
      await expect(restored.verify()).rejects.toThrow(refused('The baseline attestation must follow the latest completed release.'))
    }
    data.extra.stableReleaseBaseline.establishedAt = '2026-10-15T10:00:00Z'
    const fresh = restored.add('fixture-bootstrap', 'note', data, 2, '2026-10-15 10:01:00')
    restored.reviseAuthorization({ baselineSource: { kind: 'bootstrap', note: fresh } })
    expect((await restored.verify()).mode).toBe('urgent-fix')
    expect((await restored.verify()).elapsedMinutes).toBe(120)

    for (const patch of [{ baselineTag: 'stable-manual-restored' }, { serving: { ...f.authorization.serving, commit: 'c'.repeat(40) } },
      { establishedAt: '2026-10-15 09:00:00' }, { kind: 'release-event' }]) {
      const bad = fixture()
      const note = bad.revise('fixture-bootstrap', 1, r => Object.assign(r.content.data.extra.stableReleaseBaseline, patch))
      bad.reviseAuthorization({ baselineSource: { kind: 'bootstrap', note } })
      await expect(bad.verify()).rejects.toThrow(refused('The baseline attestation does not match the serving baseline.'))
    }
  })

  it('refuses inaccessible partial masked or redirected replies and performs only reads', async () => {
    const f = fixture(); const result = await f.verify()
    expect(f.calls.length).toBeGreaterThan(0)
    expect(f.calls.every(call => call.method === 'GET')).toBe(true)
    expect(JSON.stringify(result)).not.toContain('provedBy')
    expect(JSON.stringify(result)).not.toContain('fixture-run')
    for (const patch of [{ status: 403 }, { cut: true }, { location: '/redirect' },
      { body: '{' }, { body: JSON.stringify({ content: '<a key, not shown>' }) },
      { body: JSON.stringify({ narrowedByPermission: { omitted: 1 } }) }, { body: '{}' }]) {
      const request = Object.assign(async (asked: { method: string; path: string }) => ({ ...await f.officeRequest(asked), ...patch }), f.officeRequest)
      await expect(f.verify(request)).rejects.toThrow('Release policy refused:')
    }
  })

  // OLD: a cut answer was refused as "inaccessible, partial, masked or redirected". NEW: a cut is named as a cut.
  // WHY: the request helper cuts an answer at 60,000 characters, and a cut is not the office refusing.
  // Mutation: drop the release check's own refusal for a cut, and every path below names the old words.
  it('names a cut answer as cut, on every read the release check makes', async () => {
    const f = fixture()
    await f.verify()
    const paths = [...new Set(f.calls.map(call => call.path))]
    expect(paths).toContain('/api/roles')
    expect(paths).toContain('/api/office/upgrades?limit=25')
    for (const path of paths) {
      const request = Object.assign(async (asked: { method: string; path: string }) => {
        const reply = await f.officeRequest(asked)
        return asked.path === path ? { ...reply, cut: true } : reply
      }, f.officeRequest)
      await expect(f.verify(request), path).rejects.toThrow(refused(`The office's answer to ${path} was cut, so the release check cannot read it whole.`))
    }
  })

  // The case above stops at a first baseline. A completed release also reads the office's registry row, and after a
  // re-mint only that read asks for the handle. Mutation: read the row outside the release check's own request.
  it('names a cut answer as cut on every read of a completed release, the office\'s registry row too', async () => {
    const f = fixture('aB3dE6gH9jKl'); f.completedAfter()
    await f.verify()
    const paths = [...new Set(f.calls.map(call => call.path))]
    expect(paths).toContain('/api/participants/agent/mole-office')
    for (const path of paths) {
      const request = Object.assign(async (asked: { method: string; path: string }) => {
        const reply = await f.officeRequest(asked)
        return asked.path === path ? { ...reply, cut: true } : reply
      }, f.officeRequest)
      await expect(f.verify(request), path).rejects.toThrow(refused(`The office's answer to ${path} was cut, so the release check cannot read it whole.`))
    }
  })

  it('refuses ambiguous nonexistent future and zoneless filing times', async () => {
    const { uniqueMomentOfStoredStampInZone } = await import(clockModule)
    expect(uniqueMomentOfStoredStampInZone('2026-10-25 01:30:00', 'Europe/London')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-03-29 01:30:00', 'Europe/London')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-02-30 00:00:00', 'Etc/UTC')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-10-15 09:00:00', '')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-10-15 09:00:00 garbage', 'Etc/UTC')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-10-15', 'Etc/UTC')).toBeNull()
    expect(uniqueMomentOfStoredStampInZone('2026-10-25 02:30:00', 'Europe/London')).toBe(Date.parse('2026-10-25T02:30:00Z'))
    const f = fixture(); f.completedAfter('2026-10-15 12:00:01')
    await expect(f.verify()).rejects.toThrow(refused('The baseline filing time is unavailable, ambiguous or future.'))
    const dst = fixture(); dst.completedAfter('2026-10-25 01:30:00', 'Europe/London')
    dst.reviseAuthorization({ validFrom: '2026-10-25T04:59:00Z', validUntil: '2026-10-25T05:05:00Z' })
    await expect(dst.verify(dst.officeRequest, () => Date.parse('2026-10-25T05:00:00Z'))).rejects.toThrow(refused('The baseline filing time is unavailable, ambiguous or future.'))
  })
})

// OLD: the release check compared the time since the baseline with 180 written in its own code. NEW: in spacing mode it
// reads the number from the office's gate list, refuses a number its own declaration does not allow, uses its own default
// for an office whose list has no such row, and sends one count to the office when it refuses.
// WHY: the owner made the 180 a setting (21 Oct), and the secretary chose that the release tool decides and counts (round E, way 1).
describe('the spacing between stable releases is the office\'s number', () => {
  type Fixture = ReturnType<typeof fixture>
  const spacing = (f: Fixture, value: unknown, unreadable: string | null = null) =>
    f.records.set('/api/office/gates', gateList([{ id: 'release-spacing', value, unreadable }]))
  const writes = (f: Fixture) => f.calls.filter(call => call.method !== 'GET')

  // Mutation: compare with 180 again, and the office's 240 lets the release through.
  it('takes the number from the office, refuses below it and counts that refusal once', async () => {
    const f = fixture(); f.completedAfter(); spacing(f, '240')
    await expect(f.verify()).rejects.toThrow(refused('The baseline has not completed 240 minutes. The office counted this refusal.'))
    expect(writes(f)).toEqual([{ method: 'POST', path: '/api/office/gates/release-spacing/met', body: { position: '240' } }])
    const shorter = fixture(); shorter.completedAfter('2026-10-15 10:00:00'); spacing(shorter, '120')
    const result = await shorter.verify()
    expect(result.elapsedMinutes).toBe(120)
    expect(result.spacing).toEqual({ minutes: 120, from: 'the-office', says: 'The office gives the spacing between stable releases as 120 minutes.' })
    expect(writes(shorter)).toEqual([])
    const control = fixture(); control.completedAfter('2026-10-15 10:00:00')
    await expect(control.verify()).rejects.toThrow(refused('The baseline has not completed 180 minutes. The office counted this refusal.'))
    expect(control.counting.sent).toEqual([{ position: '180' }])
  })

  // Mutation: clamp the office's number into the declared bounds, and 0 and 1441 decide instead of refusing.
  it('refuses a number its own declaration does not allow, names it, never changes it to fit, and counts nothing', async () => {
    for (const value of ['0', '1441', '90.5', 'abc', '', ' 180', null, 180]) {
      const f = fixture(); f.completedAfter(); spacing(f, value)
      await expect(f.verify(), String(value)).rejects.toThrow(refused(`The office gives the spacing between stable releases as ${JSON.stringify(value)}, which this tool's own declaration does not allow: a whole number of minutes from 1 to 1440. It was not changed to fit.`))
      expect(writes(f), String(value)).toEqual([])
    }
    const f = fixture(); f.completedAfter(); spacing(f, null, 'MOLE_OFFICE_RELEASE_SPACING_MINUTES is "soon", which is not a whole number.')
    await expect(f.verify()).rejects.toThrow(refused('The office could not read its spacing between stable releases, so this tool cannot use it: MOLE_OFFICE_RELEASE_SPACING_MINUTES is "soon", which is not a whole number.'))
    expect(writes(f)).toEqual([])
  })

  it('refuses a gate list it cannot read whole, a list of another shape, and a list with two spacing rows', async () => {
    const shape = refused('The office\'s gate list could not be read as classes, groups and rows.')
    for (const [change, words] of [
      // The release check asks the door for the one row; this made-up office is older than that and answers its whole list.
      [(f: Fixture) => f.records.delete('/api/office/gates'), refused('GET /api/office/gates?gate=release-spacing was inaccessible, partial, masked or redirected.')],
      [(f: Fixture) => f.records.set('/api/office/gates', {}), shape],
      [(f: Fixture) => f.records.set('/api/office/gates', { office: { kind: 'builds-mole-office' }, classes: [{ class: 'process', groups: [{ group: 'numbers', rows: 'none' }] }] }), shape],
      [(f: Fixture) => f.records.set('/api/office/gates', { office: { kind: 'builds-mole-office' }, classes: [{ class: 'process', groups: [{ group: 'numbers', rows: [null] }] }] }), shape],
      [(f: Fixture) => f.records.set('/api/office/gates', gateList([{ id: 'release-spacing', value: '180', unreadable: null }, { id: 'release-spacing', value: '240', unreadable: null }])),
        refused('The office\'s gate list has more than one row for the spacing between stable releases, so this tool cannot tell which one decides.')],
    ] as const) {
      const f = fixture(); f.completedAfter(); change(f)
      await expect(f.verify()).rejects.toThrow(words)
      expect(writes(f)).toEqual([])
    }
  })

  // Mutation: refuse a list without the row, and the first release after this change stops at the office it upgrades.
  it('uses its own default for an older office whose gate list has no spacing row, and says so', async () => {
    const older = 'The office\'s gate list has no row for the spacing between stable releases, so the office is older than this tool. This tool used its own default for this kind of office: 180 minutes.'
    for (const kind of ['builds-mole-office', 'ordinary']) {
      const f = fixture(); f.completedAfter(); f.records.set('/api/office/gates', gateList([], kind))
      expect((await f.verify()).spacing, kind).toEqual({ minutes: 180, from: 'this-tools-default', says: older })
      const early = fixture(); early.completedAfter('2026-10-15 09:00:01'); early.records.set('/api/office/gates', gateList([], kind))
      early.counting.answer = () => ({ status: 403, body: JSON.stringify({ error: "Only the office key, or the release tool with its own run's key, may send a gate count. Nothing was counted.", code: 'gateCountNotAllowed' }) })
      await expect(early.verify(), kind).rejects.toThrow(refused(`The baseline has not completed 180 minutes. ${older} The office did not count this refusal (403): Only the office key, or the release tool with its own run's key, may send a gate count. Nothing was counted.`))
    }
    const unknown = fixture(); unknown.completedAfter(); unknown.records.set('/api/office/gates', gateList([], 'made-up-kind'))
    await expect(unknown.verify()).rejects.toThrow(refused('The office\'s gate list has no row for the spacing between stable releases, and it does not say which kind of office it is, so this tool cannot choose its default.'))
    expect(writes(unknown)).toEqual([])
  })

  // Mutation: send the count again when the office does not take it, and two counts are sent.
  it('says a count the office did not take, and never sends it again', async () => {
    const refusedCount = fixture(); refusedCount.completedAfter('2026-10-15 09:00:01')
    refusedCount.counting.answer = () => ({ status: 500, body: JSON.stringify({ error: 'Made-up failure.' }) })
    await expect(refusedCount.verify()).rejects.toThrow(refused('The baseline has not completed 180 minutes. The office did not count this refusal (500): Made-up failure.'))
    expect(refusedCount.counting.sent).toEqual([{ position: '180' }])
    const thrown = fixture(); thrown.completedAfter('2026-10-15 09:00:01')
    thrown.counting.answer = () => { throw new Error('Made-up transport refusal.') }
    await expect(thrown.verify()).rejects.toThrow(refused('The baseline has not completed 180 minutes. The office did not count this refusal: Made-up transport refusal.'))
    expect(thrown.counting.sent).toEqual([{ position: '180' }])
  })

  it('reads no gate list outside spacing mode', async () => {
    const f = fixture(); f.completedAfter('2026-10-15 11:59:00')
    f.reviseAuthorization({ mode: 'outside-use', validFrom: '2026-10-15T12:00:00Z', validUntil: '2026-10-15T12:15:00Z' })
    f.records.delete('/api/office/gates')
    expect((await f.verify()).spacing).toBeNull()
    expect(f.calls.some(call => call.path.startsWith('/api/office/gates'))).toBe(false)
  })
})
