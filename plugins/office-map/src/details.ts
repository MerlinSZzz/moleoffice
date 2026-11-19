// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import type { BridgeSnapshot } from './bridge.ts'
import { drawSprite, type ArtPack } from './pack.ts'
import { standingScale } from './appearance.ts'
import { currentFacts, workGroup, workWords, type Occupant } from './model.ts'
import { PIXEL_STATES } from '../../../src/shared/plugin-read.ts'
import { words, readFailureWords } from './words.ts'
export function element<K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = ''): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag); node.textContent = text; node.className = className; return node
}
function field(list: HTMLDListElement, label: string, value: unknown): void {
  list.append(element('dt', label), element('dd', typeof value === 'string' ? value : JSON.stringify(value) ?? 'null'))
}
export function occupantCard(occupant: Occupant, snapshot: BridgeSnapshot, pack: ArtPack | null): HTMLElement {
  const language = snapshot.context!.language
  const t = words[language]
  const card = element('article', '', 'occupant')
  card.dataset['identity'] = occupant.key
  if (occupant.facts) {
    const errors = new Set([occupant.facts.people, occupant.facts.work].filter(fact => fact.error).map(fact => readFailureWords(language, fact.failure)))
    for (const error of errors) card.append(element('p', error))
  }
  if (occupant.facts && (occupant.facts.people.status !== 'loaded' || occupant.facts.work.status !== 'loaded')) {
    card.append(element('h3', occupant.agent.name || occupant.agent.handle), element('p', occupant.facts.people.status === 'absent' || occupant.facts.work.status === 'absent' ? t.agentAbsent : t.factsUnloaded))
    return card
  }
  if (!currentFacts(occupant)) card.append(element('p', t.stale))
  const station = element('div', '', 'station')
  const portrait = occupant.portrait
  if (pack && occupant.agent.scale !== null) {
    const canvas = element('canvas', '', 'standing-preview'); canvas.width = 256; canvas.height = 160
    const ctx = canvas.getContext('2d'), frame = pack.sources.sprites?.['stand-' + occupant.standing.look]
    if (ctx && frame) {
      ctx.imageSmoothingEnabled = false
      drawSprite(ctx, pack, 'worker-desk', 0, 78)
      const scale = standingScale(occupant.agent.scale.value)
      drawSprite(ctx, pack, 'stand-' + occupant.standing.look, 190 - frame.anchor[0]! * scale, 152 - frame.anchor[1]! * scale, scale)
      canvas.setAttribute('aria-label', occupant.standing.look); station.append(canvas)
    }
  }
  if (!station.childElementCount) {
    const fallback = element('span', '◇', 'portrait-missing'); fallback.setAttribute('aria-label', t.portraitUnavailable); station.append(fallback)
  }
  card.append(station, element('h3', occupant.agent.name || occupant.agent.handle))
  card.append(element('p', occupant.agent.role ?? t.roleUnknown, 'role'))
  card.append(element('p', `${t.standingLook}: ${occupant.standing.look}.${occupant.standing.source === 'stable-fallback' ? ' ' + t.standingFallback : ''}`, 'small-note'))
  if (occupant.agent.scale === null) card.append(element('p', t.sizeUnavailable, 'small-note'))
  const presence = element('ul', '', 'presence')
  for (const dot of occupant.agent.presence) {
    const row = element('li')
    const marker = element('span', '', 'dot')
    // Use only a colour, never arbitrary CSS supplied by the view.
    const colour = ({ green: '#438251', amber: '#9a7117', yellow: '#9a7117', red: '#b84741', grey: '#767d79', gray: '#767d79' } as Record<string, string>)[dot.colour]
    if (colour) marker.style.backgroundColor = colour
    const name = snapshot.views.projects.data?.projects.find(one => one.id === dot.project)?.name ?? dot.project
    row.append(marker, document.createTextNode(`${name} · ${dot.word}`)); presence.append(row)
  }
  if (!presence.childElementCount) presence.append(element('li', t.presenceUnavailable))
  presence.setAttribute('aria-label', t.presence)
  card.append(presence)
  const work = occupant.work
  if (occupant.facts ? occupant.facts.work.status !== 'loaded' : snapshot.views.work.data === null) card.append(element('p', t.workUnavailable, 'small-note'))
  else if (work.length === 0) card.append(element('p', t.noWork, 'small-note'))
  for (const row of work) {
    const block = element('div', '', 'work')
    const badge = element('span', workWords(row, language), 'work-state')
    badge.style.borderColor = PIXEL_STATES[workGroup(row)].colour
    block.append(badge, element('p', row.title))
    const details = element('details')
    details.dataset['section'] = `work:${row.id}`
    details.append(element('summary', t.details))
    const fields = element('dl')
    field(fields, 'ID', row.id); field(fields, t.filter, row.project)
    field(fields, t.association, row.association); field(fields, t.state, row.recordedState)
    field(fields, t.executing, row.executing); field(fields, t.doing, row.doing)
    field(fields, t.updated, row.updatedAt); field(fields, t.standing, row.runStanding)
    field(fields, language === 'zh' ? '工作状态值' : 'Work detail', row.detail)
    details.append(fields); block.append(details); card.append(block)
  }
  const details = element('details', '', 'profile-details')
  details.dataset['section'] = 'profile'
  details.append(element('summary', t.details))
  const fields = element('dl')
  field(fields, 'ID', occupant.agent.id); field(fields, language === 'zh' ? '标识' : 'Handle', occupant.agent.handle)
  field(fields, t.role, occupant.agent.role); field(fields, t.started, occupant.starter?.name ??
    (occupant.relationshipUnavailable ? t.relationshipUnavailable : t.notSupplied))
  field(fields, t.scale, occupant.agent.scale?.value ?? t.sizeUnavailable)
  field(fields, t.generationRole, occupant.agent.scale?.roleAtGeneration ?? t.notSupplied)
  field(fields, t.chosen, occupant.agent.appearanceChosen); field(fields, t.appearance, portrait.stored)
  field(fields, t.membership, occupant.projects.length ? occupant.projects.map(one => one.name ?? `${one.id} · ${t.projectUnknown}`).join(', ') : t.notSupplied)
  details.append(fields, element('p', t.presenceDetails, 'small-note')); card.append(details)
  return card
}
