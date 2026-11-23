// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { useRef, useState } from 'react'
import { content, LANGUAGES, t, wordLanguage, type Language, type WordKey } from '@shared/i18n.ts'
import {
  HANDBOOK_KIND,
  theForOf,
  theLanguagesToSend,
  thePlacesOf,
  theStateOf,
  theNewestWhyOf,
  theTextChangesOf,
  theTextOf,
  THE_OPENING_MOST_WORDS,
  type HandbookPlace,
  type HandbookState,
  type HandbookText,
} from '@shared/handbooks.ts'
import type { OneRevision, RevisionEntry } from '../../server/lib/revisions.ts'
import { api, errorMessage, faultOf, type Fault } from '../api.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { consumePreparedPage, peekPreparedPage } from '../lib/prepared-page.ts'
import { writerNamed } from '../lib/participant-lookup.ts'
import { ProjectName, useProjectTitles } from '../components/ProjectChoice.tsx'
import { flowsPath, handbookPath, navigate, pathFor, recordPath, RouteLink } from '../components/router.tsx'
import { stillOnThisPage } from '../lib/pagechoice.ts'
import { ErrorNote, Field, Loading, Select, TextArea, TextInput, WordsAroundAStamp } from '../components/ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'
/**
 * `#/handbook/<id>` — ONE HANDBOOK'S OWN PAGE. A handbook is guidance for whoever starts a flow or takes a role card.
 *
 * IT DRAWS whom the handbook is for, where it stands, where it hangs (each place a link), its text one language at a
 * time with the opening and the rest marked, a form that changes one language's text and asks why, and every version
 * with who wrote it, when and why.
 *
 * THE DOORS ARE THE ONES THAT EXIST. The record is `GET /api/records/<id>`, a change is `PATCH /api/records/<id>` with a
 * `dataPatch`, and the versions are the revision ledger, `GET /api/records/<id>/revisions` and one
 * `GET /api/records/<id>/revisions/<seq>` for each version listed, which holds that version's text and change record.
 * The server refuses a change that breaks the handbook's rules, and the page draws the refusal as it came.
 *
 * A VERSION'S WHY IS THE NEWEST ENTRY OF ITS OWN CHANGE RECORD, and only when that version added it. A version that
 * changed something else says its text did not change, rather than repeating an older version's why.
 *
 * A RECORD OF ANOTHER KIND IS NOT DRAWN AS A HANDBOOK. The page says what it is and links to the record page.
 */

export function HandbookPage({ id }: { id: string }) {
  const [held] = useState(() => peekPreparedPage<Awaited<ReturnType<typeof api.getRecord>>>(handbookPath(id)))
  const used = useRef(false)
  const ready = used.current || held === undefined ? undefined : peekPreparedPage(handbookPath(id), held)
  const [read, reload] = useProjectAsync(() => {
    if (ready !== undefined && !used.current) {
      used.current = true
      consumePreparedPage(ready)
      return Promise.resolve(ready.value)
    }
    used.current = true
    return api.getRecord(id)
  }, [id], ready === undefined ? {} : { startFrom: { value: ready.value } })
  return (
    <div className="page hbk">
      <style href="mole-office-handbook-page" precedence="default">{HANDBOOK_PAGE_CSS}</style>
      {read.status === 'loading' ? (
        <Loading label={t('handbookPage.loading')} />
      ) : read.status === 'error' ? (
        <ErrorNote message={read.message} fault={read.fault} retry={reload} />
      ) : read.value.record.kind !== HANDBOOK_KIND ? (
        <p className="hbk-says">
          {t('handbookPage.isNotAHandbook')} <RouteLink to={recordPath(id)}>{t('handbookPage.openItsRecord')}</RouteLink>
        </p>
      ) : (
        <TheHandbook id={id} project={read.value.record.workspaceId} title={read.value.record.title} data={read.value.record.data} updatedAt={read.value.record.updatedAt} reload={reload} />
      )}
    </div>
  )
}

const STATE_NAMED: Record<HandbookState, WordKey> = {
  draft: 'handbookPage.stateNamed.draft',
  'in use': 'handbookPage.stateNamed.inUse',
  retired: 'handbookPage.stateNamed.retired',
}

/** The word for where a handbook stands, in a word or two for a list. Null is a stored state the office does not know. */
export function handbookStateKey(state: HandbookState | null): WordKey {
  return state === null ? 'handbookPage.stateNamed.unknown' : STATE_NAMED[state]
}

function TheHandbook({ id, project, title, data, updatedAt, reload }: { id: string; project: string; title: string; data: Record<string, unknown>; updatedAt: string; reload: () => void }) {
  const state = theStateOf(data)
  const places = thePlacesOf(data)
  const who = theForOf(data)
  return (
    <>
      <RouteLink className="hbk-back" to={pathFor('records')}>
        ← {t('nav.records')}
      </RouteLink>
      <h1 className="hbk-title" data-title-is="its-label">{content(title)}</h1>
      <dl className="hbk-facts">
        <div className="hbk-fact">
          <dt>{t('handbookPage.for')}</dt>
          <dd>{who === null ? t('g6a.common.notRecorded') : content(who)}</dd>
        </div>
        <div className="hbk-fact" data-state={state ?? 'unknown'}>
          <dt>{t('handbookPage.stands')}</dt>
          <dd>{t(handbookStateKey(state))}</dd>
        </div>
        <div className="hbk-fact hbk-fact-wide">
          <dt>{t('handbookPage.hangsOn')}</dt>
          <dd>{places.length === 0 ? t('absence.none') : <ThePlaces places={places} />}</dd>
        </div>
      </dl>
      <TheText key={updatedAt} id={id} project={project} data={data} onSaved={reload} />
      <TheVersions id={id} updatedAt={updatedAt} />
    </>
  )
}

/** Each place as a link: a flow and a step to the flow's page, a card to the role cards, a project to the projects. */
function ThePlaces({ places }: { places: readonly HandbookPlace[] }) {
  const titles = useProjectTitles()
  const flows = [...new Set(places.flatMap((place) => ('flow' in place ? [place.flow] : [])))]
  const [flowTitles] = useProjectAsync(
    async () => new Map<string, string | null>(await Promise.all(flows.map(async (flow) => [flow, await api.readFlow(flow).then((read) => read.title, () => null)] as const))),
    [flows.join(' ')],
  )
  // A FLOW WHOSE TITLE IS NOT READ, YET OR AT ALL, IS NAMED BY ITS ID, which is what the handbook stores.
  const titleOf = (flow: string): string => (flowTitles.status === 'ready' ? flowTitles.value.get(flow) : null) ?? flow
  return (
    <ul className="hbk-places">
      {places.map((place, n) => (
        <li key={n}>
          {'flow' in place ? (
            <RouteLink to={flowsPath(place.flow)}>
              {place.step === undefined ? t('handbookPage.place.flow', { flow: content(titleOf(place.flow)) }) : t('handbookPage.place.step', { n: place.step, flow: content(titleOf(place.flow)) })}
            </RouteLink>
          ) : 'card' in place ? (
            <RouteLink to={pathFor('roles')}>{t('handbookPage.place.card', { card: content(place.card) })}</RouteLink>
          ) : (
            <RouteLink to={pathFor('projects')}>
              {t('handbookPage.place.project')} <ProjectName id={place.project} titles={titles} />
            </RouteLink>
          )}
        </li>
      ))}
    </ul>
  )
}

/** The page's language, with the test language read as English, the way `t` reads its words. */
const thePageLanguage = (): Language => {
  const language = wordLanguage()
  return language === 'xx' ? 'en' : language
}

/** The languages the text is written in, in the office's own order. */
const writtenIn = (text: Partial<Record<Language, HandbookText>>): Language[] => (Object.keys(LANGUAGES) as Language[]).filter((one) => text[one] !== undefined)

/** The text, one language at a time, and the form that changes one language's text. */
function TheText({ id, project, data, onSaved }: { id: string; project: string; data: Record<string, unknown>; onSaved: () => void }) {
  const text = theTextOf(data)
  const written = writtenIn(text)
  // THE PAGE'S LANGUAGE FIRST, by the rule a handbook is sent by, so the reader sees what an agent reading it would get.
  const [shown, setShown] = useState<Language | null>(theLanguagesToSend(written, thePageLanguage()).languages[0] ?? null)
  const [changing, setChanging] = useState(false)
  const one = shown === null ? undefined : text[shown]
  return (
    <section className="hbk-text">
      <div className="hbk-head">
        <h2 className="hbk-h2">{t('handbookPage.text')}</h2>
        {changing ? null : (
          <button type="button" className="hbk-press" onClick={() => setChanging(true)}>
            {t('handbookPage.change.open')}
          </button>
        )}
      </div>
      {written.length === 0 ? (
        <p className="hbk-says">{t('handbookPage.textNone')}</p>
      ) : (
        <>
          <span className="hbk-switch" role="group" aria-label={t('handbookPage.language')}>
            {written.map((language) => (
              <button key={language} type="button" className="hbk-switch-one" aria-pressed={shown === language} onClick={() => setShown(language)}>
                {LANGUAGES[language]}
              </button>
            ))}
          </span>
          {one === undefined ? null : <OneLanguage text={one} />}
        </>
      )}
      {changing ? (
        <TheChange
          id={id}
          project={project}
          data={data}
          first={shown ?? 'en'}
          onCancel={() => setChanging(false)}
          onSaved={() => {
            setChanging(false)
            onSaved()
          }}
        />
      ) : null}
    </section>
  )
}

function OneLanguage({ text }: { text: HandbookText }) {
  return (
    <div className="hbk-one">
      <h3 className="hbk-h3">{t('handbookPage.opening')}</h3>
      <p className="hbk-words">{content(text.opening)}</p>
      <h3 className="hbk-h3">{t('handbookPage.rest')}</h3>
      {text.rest === undefined || text.rest.trim() === '' ? <p className="hbk-says">{t('absence.none')}</p> : <p className="hbk-words">{content(text.rest)}</p>}
    </div>
  )
}

/**
 * ONE LANGUAGE'S TEXT CHANGED, WITH WHY. The write sends the whole text and the whole change record with one entry
 * added, naming the one language changed, which is what the server's check asks of a text change.
 */
function TheChange({ id, project, data, first, onCancel, onSaved }: { id: string; project: string; data: Record<string, unknown>; first: Language; onCancel: () => void; onSaved: () => void }) {
  const text = theTextOf(data)
  const [language, setLanguage] = useState<Language>(first)
  const [opening, setOpening] = useState(text[first]?.opening ?? '')
  const [rest, setRest] = useState(text[first]?.rest ?? '')
  const [why, setWhy] = useState('')
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: Fault | null } | null>(null)
  const choose = (next: Language): void => {
    setLanguage(next)
    setOpening(text[next]?.opening ?? '')
    setRest(text[next]?.rest ?? '')
  }
  const save = async (): Promise<void> => {
    if (why.trim() === '') return setRefused({ message: t('handbookPage.change.noWhy'), fault: null })
    const next: HandbookText = rest.trim() === '' ? { opening } : { opening, rest }
    const was = text[language]
    if (was !== undefined && was.opening === next.opening && (was.rest ?? '') === (next.rest ?? '')) {
      return setRefused({ message: t('handbookPage.change.sameText'), fault: null })
    }
    const stored = typeof data['text'] === 'object' && data['text'] !== null ? (data['text'] as Record<string, unknown>) : {}
    setSaving(true)
    setRefused(null)
    try {
      await api.updateRecord(id, { dataPatch: { text: { ...stored, [language]: next }, text_changes: [...theTextChangesOf(data), { languages: [language], why: why.trim() }] } }, project)
      onSaved()
    } catch (reason) {
      setRefused({ message: errorMessage(reason), fault: faultOf(reason) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="hbk-change"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h3 className="hbk-h3">{t('handbookPage.change.heading')}</h3>
      <Field label={t('handbookPage.language')}>
        <Select<Language>
          value={language}
          onChange={choose}
          options={(Object.keys(LANGUAGES) as Language[]).map((one) => ({ value: one, label: text[one] === undefined ? t('handbookPage.change.notWrittenYet', { language: LANGUAGES[one] }) : LANGUAGES[one] }))}
        />
      </Field>
      <Field label={t('handbookPage.opening')} hint={t('handbookPage.change.openingMost', { most: THE_OPENING_MOST_WORDS })}>
        <TextArea value={opening} onChange={setOpening} rows={5} required />
      </Field>
      <Field label={t('handbookPage.rest')} optional>
        <TextArea value={rest} onChange={setRest} rows={5} />
      </Field>
      <Field label={t('handbookPage.change.why')}>
        <TextArea value={why} onChange={setWhy} rows={2} required />
      </Field>
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('handbookPage.change.notSaved')} />}
      <div className="hbk-presses">
        <button type="submit" className="hbk-press hbk-press-main" disabled={saving}>
          {saving ? t('handbookPage.change.saving') : t('handbookPage.change.save')}
        </button>
        <button type="button" className="hbk-press" onClick={onCancel} disabled={saving}>
          {t('handbookPage.change.cancel')}
        </button>
      </div>
    </form>
  )
}

/**
 * WHAT ONE VERSION DID TO THE TEXT, as far as the versions read can say: it changed it with this reason; it left it as
 * it was; it put an earlier version's text back; it changed it with no reason added; it was the first version and held
 * no text; or nobody can tell from here, because the version just before it is not among those read.
 */
type WhatItDid = { why: string } | { did: 'same' | 'putBack' | 'noReason' | 'noText' | 'notKnown' }

/** One version as the page draws it: the ledger's row, that version's own content, and what it did to the text. */
interface AVersion {
  entry: RevisionEntry
  content: OneRevision['content']
  did: WhatItDid
}

/** A text as one string, by the office's order of languages, so two versions compare whatever order they were stored in. */
const textKey = (data: unknown): string => {
  const text = theTextOf(data)
  return JSON.stringify(writtenIn(text).map((language) => [language, text[language]!.opening, text[language]!.rest ?? null]))
}

function whatItDid(entry: RevisionEntry, content: OneRevision['content'], before: { seq: number; content: OneRevision['content'] } | undefined): WhatItDid {
  const newest = theNewestWhyOf(content.data)
  // THE FIRST VERSION WROTE THE TEXT, and its change record's one entry says why. A first version with no text wrote none.
  if (entry.op === 'create' && entry.seq === 1) {
    if (writtenIn(theTextOf(content.data)).length === 0) return { did: 'noText' }
    return newest === null ? { did: 'noReason' } : { why: newest }
  }
  if (before === undefined || before.seq !== entry.seq - 1) return { did: 'notKnown' }
  if (textKey(content.data) === textKey(before.content.data)) return { did: 'same' }
  if (entry.op === 'restore') return { did: 'putBack' }
  const grew = theTextChangesOf(content.data).length > theTextChangesOf(before.content.data).length
  return grew && newest !== null ? { why: newest } : { did: 'noReason' }
}

/** Every version listed, newest first, each with what it did to the text. */
async function theVersionsOf(id: string): Promise<{ versions: AVersion[]; leftOut: number }> {
  const listing = await api.revisions(id)
  const contents = await Promise.all(listing.revisions.map((entry) => api.revision(id, entry.seq).then((one) => one.content)))
  const versions = listing.revisions.map((entry, n): AVersion => {
    const content = contents[n]!
    const older = listing.revisions[n + 1]
    return { entry, content, did: whatItDid(entry, content, older === undefined ? undefined : { seq: older.seq, content: contents[n + 1]! }) }
  })
  return { versions, leftOut: listing.subtraction.leftOut }
}

const DID_WORD: Record<Exclude<WhatItDid, { why: string }>['did'], () => string> = {
  same: () => t('handbookPage.textSame'),
  putBack: () => t('handbookPage.textPutBackShort'),
  noReason: () => t('handbookPage.textChangedNoWhy'),
  noText: () => t('handbookPage.textNone'),
  notKnown: () => t('handbookPage.textChangeUnknown'),
}

function TheVersions({ id, updatedAt }: { id: string; updatedAt: string }) {
  const [read, reload] = useProjectAsync(() => theVersionsOf(id), [id, updatedAt])
  const [participants] = useProjectAsync(() => readParticipantsOnce(), [])
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="hbk-versions">
      <h2 className="hbk-h2">{t('handbookPage.versions')}</h2>
      {read.status === 'loading' ? (
        <Loading label={t('handbookPage.versionsLoading')} />
      ) : read.status === 'error' ? (
        <ErrorNote message={read.message} fault={read.fault} retry={reload} />
      ) : (
        <>
          {read.value.leftOut === 0 ? null : <p className="hbk-says">{t('handbookPage.versionsNotListed', { n: read.value.leftOut })}</p>}
          <ol className="hbk-rows">
            {read.value.versions.map((version) => (
              <li key={version.entry.seq} className="hbk-row">
                <p className="hbk-row-line">
                  <span className="hbk-row-n">{t('handbookPage.version', { n: version.entry.seq })}</span>
                  <span aria-hidden="true"> · </span>
                  <WordsAroundAStamp words={(when) => t('handbookPage.writtenBy', { when, who: writerNamed(version.entry.who, participants.status === 'ready' ? participants.value : undefined) })} at={version.entry.at} />
                </p>
                <p className="hbk-row-why">{'why' in version.did ? t('handbookPage.why', { why: content(version.did.why) }) : DID_WORD[version.did.did]()}</p>
                <button type="button" className="hbk-press hbk-press-small" aria-expanded={open === version.entry.seq} onClick={() => setOpen(open === version.entry.seq ? null : version.entry.seq)}>
                  {open === version.entry.seq ? t('handbookPage.closeVersion') : t('handbookPage.readVersion')}
                </button>
                {open === version.entry.seq ? <AVersionsText data={version.content.data} /> : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}

function AVersionsText({ data }: { data: Record<string, unknown> }) {
  const text = theTextOf(data)
  return (
    <div className="hbk-version-text">
      {writtenIn(text).map((language) => (
        <div key={language}>
          <h3 className="hbk-h3">{LANGUAGES[language]}</h3>
          <OneLanguage text={text[language]!} />
        </div>
      ))}
    </div>
  )
}

/**
 * A NEW HANDBOOK ON ONE FLOW, filed as a draft, so it is sent to nobody until somebody puts it in use on its page. Its
 * first text is a text change as well, so the form asks why it is written, and the change record starts with that.
 */
export function NewHandbookOnAFlow({ flow, project, onCancel }: { flow: string; project: string; onCancel: () => void }) {
  const [title, setTitle] = useState('')
  const [who, setWho] = useState('')
  const [language, setLanguage] = useState<Language>(thePageLanguage())
  const [opening, setOpening] = useState('')
  const [why, setWhy] = useState('')
  const [saving, setSaving] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: Fault | null } | null>(null)
  const save = async (): Promise<void> => {
    if ([title, who, opening, why].some((one) => one.trim() === '')) return setRefused({ message: t('handbookPage.new.allNeeded'), fault: null })
    const stillHere = stillOnThisPage()
    setSaving(true)
    setRefused(null)
    try {
      const record = await api.createRecord(
        {
          kind: HANDBOOK_KIND,
          title: title.trim(),
          data: { for: who.trim(), state: 'draft', text: { [language]: { opening } }, hangs_on: [{ flow }], text_changes: [{ languages: [language], why: why.trim() }] },
        },
        project,
      )
      if (stillHere()) navigate(handbookPath(record.id))
    } catch (reason) {
      setRefused({ message: errorMessage(reason), fault: faultOf(reason) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <form
      className="hbk-change"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <style href="mole-office-handbook-page" precedence="default">{HANDBOOK_PAGE_CSS}</style>
      <h3 className="hbk-h3">{t('handbookPage.new.heading')}</h3>
      <Field label={t('handbookPage.new.title')}>
        <TextInput value={title} onChange={setTitle} />
      </Field>
      <Field label={t('handbookPage.for')} hint={t('handbookPage.new.forHint')}>
        <TextInput value={who} onChange={setWho} />
      </Field>
      <Field label={t('handbookPage.language')}>
        <Select<Language> value={language} onChange={setLanguage} options={(Object.keys(LANGUAGES) as Language[]).map((one) => ({ value: one, label: LANGUAGES[one] }))} />
      </Field>
      <Field label={t('handbookPage.opening')} hint={t('handbookPage.change.openingMost', { most: THE_OPENING_MOST_WORDS })}>
        <TextArea value={opening} onChange={setOpening} rows={5} required />
      </Field>
      <Field label={t('handbookPage.new.why')}>
        <TextArea value={why} onChange={setWhy} rows={2} required />
      </Field>
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('handbookPage.new.notFiled')} />}
      <div className="hbk-presses">
        <button type="submit" className="hbk-press hbk-press-main" disabled={saving}>
          {saving ? t('handbookPage.new.filing') : t('handbookPage.new.file')}
        </button>
        <button type="button" className="hbk-press" onClick={onCancel} disabled={saving}>
          {t('handbookPage.change.cancel')}
        </button>
      </div>
    </form>
  )
}

export const HANDBOOK_PAGE_CSS = `
.hbk-back { display: inline-block; margin: 0 0 var(--pad) 0; }
.hbk-title { margin: 0 0 4px 0; overflow-wrap: anywhere; }
.hbk-says { margin: 0 0 var(--gut) 0; color: var(--text-2); max-width: var(--measure-in-box); }
.hbk-head { display: flex; flex-wrap: wrap; gap: var(--pad) var(--gut); align-items: center; justify-content: space-between; margin: var(--gut) 0 var(--pad) 0; }
.hbk-head > .hbk-h2 { margin: 0; }
.hbk-h2 { font-size: var(--fs-3); margin: var(--gut) 0 6px 0; }
.hbk-h3 { font-size: var(--fs-2); margin: var(--gut) 0 4px 0; color: var(--text-2); }
.hbk-facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: var(--pad) var(--gut); margin: 0 0 var(--gut) 0; }
.hbk-fact { border: var(--border-w) solid var(--border); border-radius: var(--radius-sm); background: var(--panel); padding: 8px 12px; min-width: 0; }
.hbk-fact-wide { grid-column: 1 / -1; }
.hbk-fact dt { font-size: var(--fs-1); color: var(--text-2); font-weight: 600; margin: 0 0 2px 0; }
.hbk-fact dd { margin: 0; overflow-wrap: anywhere; }
.hbk-places { margin: 0; padding: 0 0 0 1.2em; }
.hbk-press {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text);
  padding: 4px 12px; min-height: 2rem; cursor: pointer; font: inherit; border-radius: var(--radius-sm);
}
.hbk-press-main { background: var(--accent); color: var(--accent-text); border-color: var(--accent); font-weight: 600; }
.hbk-press-small { min-height: 1.75rem; padding: 2px 10px; font-size: var(--fs-1); }
.hbk-presses { display: flex; flex-wrap: wrap; gap: var(--pad); margin: var(--pad) 0 0 0; }
.hbk-switch { display: inline-flex; flex-wrap: wrap; margin: 0 0 var(--pad) 0; }
.hbk-switch-one {
  border: var(--border-w) solid var(--border-strong); background: var(--panel); color: var(--text);
  padding: 4px 12px; min-height: 2rem; cursor: pointer; font: inherit;
}
.hbk-switch-one + .hbk-switch-one { border-left: none; }
.hbk-switch-one:first-of-type { border-radius: var(--radius-sm) 0 0 var(--radius-sm); }
.hbk-switch-one:last-of-type { border-radius: 0 var(--radius-sm) var(--radius-sm) 0; }
.hbk-switch-one[aria-pressed='true'] { background: var(--accent); color: var(--accent-text); font-weight: 600; }
.hbk-one { border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); padding: 4px var(--gut) var(--gut) var(--gut); }
.hbk-words { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; max-width: var(--measure-in-box); }
.hbk-change { margin: var(--gut) 0 0 0; border: var(--border-w) solid var(--border-strong); border-radius: var(--radius); padding: 4px var(--gut) var(--gut) var(--gut); }
.hbk-rows { list-style: none; margin: 0; padding: 0; border: var(--border-w) solid var(--border); border-radius: var(--radius); background: var(--panel); }
.hbk-rows > li + li { border-top: var(--border-w) solid var(--border); }
.hbk-row { padding: 10px var(--gut); display: flex; flex-direction: column; gap: 4px; align-items: flex-start; min-width: 0; }
.hbk-row-line { margin: 0; display: flex; flex-wrap: wrap; gap: 0 4px; align-items: baseline; color: var(--text-2); }
.hbk-row-n { font-weight: 600; color: var(--text); }
.hbk-row-why { margin: 0; overflow-wrap: anywhere; max-width: var(--measure-in-box); }
.hbk-version-text { width: 100%; }
@media (max-width: 40rem) {
  .hbk-press, .hbk-switch-one { min-height: 44px; }
}
`
