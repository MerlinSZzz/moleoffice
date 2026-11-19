// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { t, wordLanguage } from '@shared/i18n.ts'
import { cardWord } from '@shared/card-words.ts'
import { differenceBetweenRoleCards, type WhatTheRolesSay } from '@shared/roles.ts'
import { powerNameHere } from '../components/RoleCard.tsx'

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    name: t('pageWords.RoleCardNewPage.002'), duties: t('roleCard.part.duties'), powers: t('g6b.roles.powers'),
    appointedBy: t('roleCard.part.appointedBy'), appoints: t('roleCard.part.appoints'), mustRead: t('roleCard.part.mustRead'),
    reportsTo: t('roleCard.part.reportsTo'), whatEndsIt: t('roleCard.part.whatEndsIt'), workArea: t('addedRoles.workArea'),
    flow: t('g6b.roles.flow'), howItWorks: t('addedRoles.howItWorks'), inPractice: t('addedRoles.inPractice'),
    rung: t('addedRoles.place'), refusedEverythingElse: t('addedRoles.onlyNamedActs'), grain: t('addedRoles.grain'),
    most: t('addedRoles.most'), says: t('addedRoles.areaWords'), rootFiles: t('addedRoles.rootFiles'),
    chapters: t('addedRoles.chapters'), andWhatItsStarterNames: t('addedRoles.starterReading'), en: t('addedRoles.english'), zh: t('addedRoles.chinese'),
  }
  return (Object.hasOwn(labels, field) ? labels[field]! : undefined) ?? field.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ')
}

function FieldValue({ field, value, roles }: { field: string; value: unknown; roles: WhatTheRolesSay }) {
  if (value === null || value === undefined || value === '') return <p>{field === 'rung' ? t('addedRoles.offTree') : t('addedRoles.none')}</p>
  if (Array.isArray(value)) {
    if (value.length === 0) return <p>{t('addedRoles.none')}</p>
    if (field === 'chapters') return <ul>{value.map((entry: unknown, index) => {
      const one = typeof entry === 'object' && entry !== null ? entry as Record<string, unknown> : {}
      const chapter = roles.chapters.find(chapter => chapter.number === one.chapter)
      const name = chapter === undefined ? t('addedRoles.chapterUnknown', { number: String(one.chapter ?? '') }) : `${chapter.number}. ${wordLanguage() === 'zh' && chapter.zh !== null ? chapter.zh : chapter.name}`
      return <li key={index}>{name}{typeof one.level === 'string' ? <p>{roles.readingLevels.find(level => level.level === one.level)?.meaning ?? one.level}</p> : null}</li>
    })}</ul>
    return <ul>{value.map((one, index) => <li key={index}><FieldValue field={field} value={one} roles={roles} /></li>)}</ul>
  }
  if (typeof value === 'object') return <dl>{Object.entries(value).map(([part, one]) => <div key={part}><dt>{fieldLabel(part)}</dt><dd><FieldValue field={part} value={one} roles={roles} /></dd></div>)}</dl>
  let words = String(value)
  if (field === 'powers' && typeof value === 'string') words = powerNameHere(value)
  else if (field === 'name' && typeof value === 'string') words = cardWord(value)
  else if (field === 'appointedBy' && value === 'the person') words = t('addedRoles.person')
  else if (field === 'appointedBy' && value === 'the tree') words = t('addedRoles.tree')
  else if (field === 'appoints' && value === 'nobody') words = t('addedRoles.nobody')
  else if (field === 'appoints' && value === 'every role') words = t('addedRoles.everyRole')
  else if (field === 'appoints' && value === 'at or below its own rung') words = t('addedRoles.ownRung')
  else if (field === 'most' && value === 'no limit') words = t('addedRoles.noLimit')
  else if (field === 'rootFiles' && value === 'by name') words = t('addedRoles.yes')
  else if (typeof value === 'boolean') words = t(value ? 'addedRoles.yes' : 'addedRoles.no')
  return <p>{words}</p>
}

/** Preview and history use the form's labels and the same field comparison, with no stored JSON drawn. */
export function RoleCardDifference({ before, after, changes, roles }: { before: unknown; after: unknown; changes?: ReturnType<typeof differenceBetweenRoleCards>; roles: WhatTheRolesSay }) {
  const difference = changes ?? differenceBetweenRoleCards(before, after)
  return <div className="added-difference">
    <p>{difference.length === 0 ? t('addedRoles.cardUnchanged') : before !== null && (typeof before !== 'object' || Array.isArray(before)) ? t('addedRoles.cardRepaired') : before === null && after !== null ? t('addedRoles.cardAdded') : after === null && before !== null ? t('addedRoles.cardRemoved') : t('addedRoles.cardChanged')}</p>
    {difference.length === 0 ? <p>{t('addedRoles.noFieldChanges')}</p> : difference.map(one => <section key={one.field}><h4>{fieldLabel(one.field)}</h4><div className="added-pair"><div><h5>{t('addedRoles.before')}</h5><FieldValue field={one.field} value={one.before} roles={roles} /></div><div><h5>{t('addedRoles.after')}</h5><FieldValue field={one.field} value={one.after} roles={roles} /></div></div></section>)}
  </div>
}
