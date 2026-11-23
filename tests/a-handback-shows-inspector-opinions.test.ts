// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, expect, it } from 'vitest'
import { t } from '../src/shared/i18n.ts'

let panel: typeof import('../src/web/components/TaskPackagePanel.tsx')
const point = 'made-up-point'
const pointTitle = 'A made-up point'
const why = 'A made-up reason for the judgment.'
const data = (checks: unknown[] = []) => ({
  package: {
    materials: [{ kind: 'point', ref: point, says: pointTitle }],
    handedBack: [{ by: { actorType: 'agent', actorId: 'made-up-worker' }, at: '2026-01-01 12:00:00', points: [{ pointId: point, outcome: 'done', words: 'Made up.' }] }],
    checks,
  },
})
const check = (judged: string, rulesKept?: boolean) => ({
  by: { actorType: 'agent', actorId: 'made-up-inspector' }, at: '2026-01-01 12:01:00', answer: 'refused', words: 'Made up.',
  points: [{ pointId: point, judged, holds: false, why, outcome: 'not', ...(rulesKept === undefined ? {} : { rulesKept }) }],
})
const draw = (enabled: boolean, checks: unknown[] = []) => renderToStaticMarkup(h(panel.PackageHandbackPoints, { data: data(checks), enabled }))

beforeAll(async () => {
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  ;(globalThis as unknown as { window: unknown }).window = {
    localStorage: storage, sessionStorage: storage,
    location: { hash: '', origin: 'http://127.0.0.1:41600', hostname: '127.0.0.1', reload: () => {} },
    addEventListener: () => {}, removeEventListener: () => {},
  }
  panel = await import('../src/web/components/TaskPackagePanel.tsx')
})

it('adds nothing to the hand-back when the project switch is off', () => {
  expect(draw(false, [check('more_than_asked', false)])).toBe('')
})

it('draws an objection and the rules answer beside the point it judges', () => {
  const html = draw(true, [check('more_than_asked', false)])
  const row = html.match(/<li[^>]*data-point-id="made-up-point"[^>]*>[\s\S]*?<\/li>/)?.[0]
  expect(row).toBeDefined()
  expect(row).toContain(pointTitle)
  expect(row).toContain(t('delegation.inspection.judged.more_than_asked'))
  expect(row).toContain(t('delegation.inspection.rulesNotKept'))
  expect(row).toContain(why)
})

// CRITERION CHANGE, as decided: a point nobody has checked draws the short state word "not looked at", not a sentence.
it('distinguishes a point with no check from a judgment stored before opinions', () => {
  const waiting = draw(true)
  expect(waiting).toContain(t('absence.notLooked'))
  const older = draw(true, [check('part')])
  expect(older).toContain(t('delegation.inspection.judged.part'))
  expect(older).toContain(why)
  expect(older).not.toContain(t('absence.notLooked'))
})


it('does not assign an unnumbered older check to a later hand-back', () => {
  const held = data([check('part')])
  held.package.handedBack.push({ by: { actorType: 'agent', actorId: 'made-up-worker' }, at: '2026-01-01 12:01:00', points: [{ pointId: point, outcome: 'done', words: 'Made up again.' }] })
  const html = renderToStaticMarkup(h(panel.PackageHandbackPoints, { data: held, enabled: true }))
  expect(html).toContain(t('absence.notLooked'))
  expect(html).not.toContain(why)
})
