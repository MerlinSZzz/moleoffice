// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
// Right-click ONE addressable element (criterion B1 of design/pointing-reopened/ACCEPTANCE.md, one press with a photograph).
// usage: MOLE_OFFICE_URL=http://127.0.0.1:<web port> node tools/press-one.mjs <recordId> <element index> [shot.png]
// Right-click ONE addressable element (by index in document order) on a record page, photograph it,
// and report every element on the page carrying the same key, the composer chip, and the mark pieces.
import { chromium } from 'playwright'
import { whereIsTheWebApp } from './where-is-the-api.mjs'
const BASE = whereIsTheWebApp(undefined, { ifUnset: 'http://127.0.0.1:5199' })
const [id, idxArg, shot] = process.argv.slice(2)
const idx = Number(idxArg)
const browser = await chromium.launch()
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, colorScheme: 'light' })
await ctx.addInitScript(() => { window.localStorage.setItem('mole-office.workspace', 'panelx'); window.localStorage.setItem('mole-office.detail', 'full'); window.localStorage.setItem('mole-office.pictures', 'drawn') })
const page = await ctx.newPage()
await page.goto(`${BASE}/#/r/${id}`, { waitUntil: 'load', timeout: 60000 })
await page.waitForSelector('.rd-report', { timeout: 30000 })
await page.waitForTimeout(1500)
const point = await page.evaluate((i) => {
  const el = document.querySelectorAll('[data-target]')[i]
  el.scrollIntoView({ block: 'center' })
  const name = el.querySelector('[data-name]') ?? el
  const r = name.getBoundingClientRect()
  return { key: el.getAttribute('data-target'), x: r.left + Math.min(r.width / 2, 120), y: r.top + Math.min(r.height / 2, 10), text: (el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) }
}, idx)
const under = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-target]')?.getAttribute('data-target') ?? null, point)
await page.mouse.click(point.x, point.y, { button: 'right' })
await page.waitForTimeout(900)
const seen = await page.evaluate((key) => {
  const chips = document.querySelector('.px-talk-chips')?.innerText?.replace(/\s+/g, ' ').trim() ?? null
  const talk = document.querySelector('.px-talk')
  const talkBox = talk ? talk.getBoundingClientRect() : null
  const subject = document.querySelector('.px-subject')
  const cs = subject ? getComputedStyle(subject) : null
  const pieces = [...document.querySelectorAll('.px-subject > *')].map((p) => ({ cls: p.className, left: p.style.left, top: p.style.top, width: p.style.width, height: p.style.height, rect: (() => { const b = p.getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } })() }))
  const same = [...document.querySelectorAll(`[data-target="${CSS.escape(key)}"]`)].map((el, n) => { const b = el.getBoundingClientRect(); return { n, cls: el.className.toString().slice(0, 30), l: Math.round(b.left), t: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), text: (el.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) } })
  return { chips, talkBox, subjectPosition: cs?.position, pieces, same, scrollY: window.scrollY }
}, point.key)
console.log(JSON.stringify({ point, under, ...seen }, null, 1))
if (shot) await page.screenshot({ path: shot, fullPage: false })
await browser.close()
