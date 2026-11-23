// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE FIRST-RUN GUIDE: A FRESH OFFICE ASKS ITS PERSON FOR THEIR NAME. `#/welcome`.
 *
 * A person who downloads and installs the office must be led to fill in what it needs, and the first
 * thing is their name. So a fresh office writes no owner's name; it holds a placeholder that is plainly
 * a placeholder (point 1 of a decision). Until its person names themselves,
 * every address draws this page instead of the office (components/OwnerGate.tsx decides that).
 *
 * WHAT IT ASKS, AND WHY NOTHING MORE.
 *   - THE NAME. The office calls its person by it and agents address them by it, so nothing else can
 *     start without it. The field starts filled with the placeholder in the reader's language,
 *     selected, so typing replaces it. Keeping the placeholder is allowed and stores it; it is
 *     glaring on purpose, so whoever sees it knows to change it.
 *   - THE LANGUAGE. Every word of the office, this page included, is drawn in it, and the browser's
 *     own setting is only a guess. A person who cannot read the guess cannot read the rest of this
 *     page, so the choice redraws the page at once, and it is kept on the person with the name.
 *   - NOT THE LOOK. Light or dark already follows the computer's own setting, it is kept for this
 *     browser rather than for the person, and the switch at the foot of the sidebar changes it in one
 *     press. Nothing on the first run depends on it, so asking would only make the first screen longer.
 *
 * THE PRESS sends the name exactly as typed to POST /api/office/owner, which trims it and refuses
 * what it cannot store; any refusal is drawn in the server's own words, including the sentence an
 * agent is given. On success the page opens Home.
 */
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { LANGUAGES, isLanguage, t, wordLanguage, type Language } from '@shared/i18n.ts'
import { THE_OWNER_PLACEHOLDER, type TheOfficeOwner } from '@shared/owner.ts'
import { api, errorMessage, faultOf } from '../api.ts'
import { readLanguage, showLanguageBeforeItIsKept, useLanguage } from '../lib/language.ts'
import { readParticipantsOnce } from '../lib/oneread.ts'
import { Btn, ErrorNote } from '../components/ui.tsx'

/** Whether the field still holds a placeholder name, in any language the office has. */
function isAPlaceholder(name: string): boolean {
  return Object.values(THE_OWNER_PLACEHOLDER).some((placeholder) => placeholder === name.trim())
}

export function WelcomePage({ onNamed }: { onNamed: (owner: TheOfficeOwner) => void }) {
  const reading = useLanguage()
  const pageLanguage: Language | null = isLanguage(reading.language) ? reading.language : null
  const drawnLanguage = wordLanguage()
  // WHAT THE PERSON TYPED, or null while they have typed nothing. Until then the field shows the
  // placeholder in the page's language, from @shared/owner.ts, where the server reads it too, so it
  // follows a change of language; a name somebody typed never changes. A test language has no
  // placeholder of its own, so it shows the English one.
  const [typed, setTyped] = useState<string | null>(null)
  const name = typed ?? THE_OWNER_PLACEHOLDER[isLanguage(drawnLanguage) ? drawnLanguage : 'en']
  const [sending, setSending] = useState(false)
  const [refused, setRefused] = useState<unknown>(null)
  const input = useRef<HTMLInputElement>(null)
  const ids = useId()

  // SELECTED ON ARRIVAL, so the first key typed replaces the placeholder rather than adding to it.
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const keepsThePlaceholder = isAPlaceholder(name)

  const send = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (sending) return
    setSending(true)
    setRefused(null)
    try {
      const owner = await api.nameTheOwner({ name, ...(pageLanguage === null ? {} : { language: pageLanguage }) })
      // THE OFFICE NOW HAS A PERSON, so the two reads that looked for one and found none ask again.
      // A failed read stores nothing, and the sidebar that shows the name says so itself, so neither
      // failure is handled here.
      readParticipantsOnce.again().then(() => {}, () => {})
      void readLanguage(true)
      onNamed(owner)
    } catch (err) {
      setRefused(err)
      setSending(false)
    }
  }

  return (
    <main className="page wlc" id="main" tabIndex={-1}>
      <style href="mole-office-welcome" precedence="default">{WELCOME_CSS}</style>
      <div className="wlc-column">
        {/* THE LANGUAGE CHOICES COME FIRST, above the title (wave 13y round 129, item 68). A choice draws the title, the
            lead and everything under them again in the language chosen, so the choices sit where that cannot move them.
            Each is written in its own language, so none of them changes either. The form sends the language from the
            page's state, so the choices need not be inside it. */}
        <fieldset className="wlc-field wlc-languages">
          <legend className="wlc-label">{t('welcomeGuide.languageLabel')}</legend>
          <div className="wlc-choices">
            {(Object.entries(LANGUAGES) as [Language, string][]).map(([value, word]) => (
              <label key={value} className="wlc-choice">
                <input
                  type="radio"
                  name={`${ids}-language`}
                  value={value}
                  checked={pageLanguage === value}
                  onChange={() => showLanguageBeforeItIsKept(value)}
                />
                <span lang={value}>{word}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <header className="wlc-head">
          <h1 className="wlc-title">{t('welcomeGuide.title')}</h1>
          <p className="wlc-lead">{t('welcomeGuide.lead')}</p>
        </header>

        <form className="wlc-form" onSubmit={(event) => { void send(event) }}>
          <div className="wlc-field">
            <label className="wlc-label" htmlFor={`${ids}-name`}>{t('welcomeGuide.nameLabel')}</label>
            <input
              ref={input}
              id={`${ids}-name`}
              className="px-input wlc-input"
              type="text"
              autoComplete="name"
              value={name}
              data-placeholder-kept={keepsThePlaceholder ? '1' : undefined}
              aria-describedby={keepsThePlaceholder ? `${ids}-kept` : undefined}
              onChange={(event) => setTyped(event.target.value)}
            />
            {/* THE WARNING KEEPS ITS PLACE WHILE IT IS NOT SHOWN (wave 13y round 129, item 68), so typing over the
                placeholder moves nothing under it. Hidden, it is not read out, and the field no longer names it. */}
            <p className="wlc-say wlc-kept" id={`${ids}-kept`} data-shown={keepsThePlaceholder ? '1' : undefined}>
              {t('welcomeGuide.placeholderSays')}
            </p>
          </div>

          {refused === null ? null : (
            <ErrorNote label={t('welcomeGuide.notSaved')} message={errorMessage(refused)} fault={faultOf(refused)} />
          )}

          <div className="wlc-foot">
            <Btn variant="primary" type="submit" pending={sending}>
              {sending ? t('welcomeGuide.opening') : t('welcomeGuide.open')}
            </Btn>
          </div>
        </form>
      </div>
    </main>
  )
}

/*
 * THE SHARED RULES OF THE REDESIGN (report n9Mjk3c_sJRu, block b-3), on one form. The spacing tokens
 * the rules name are not in tokens.css yet, so this page declares the ones it uses on its own root,
 * with the rules' values: a 32px margin (16px on a phone), 32px between sections, a 16px step.
 * One column at every width. The press is at the foot of the form, and full width on a phone. The
 * language choices are at least 44px tall, as every press on a phone is.
 */
const WELCOME_CSS = `
.page.wlc {
  --sp-2: 8px; --sp-3: 16px; --sp-4: 24px; --sp-5: 32px;
  --page-margin: var(--sp-5); --section-gap: var(--sp-5); --press-h: 44px;
  max-width: none; min-height: 100vh; padding: var(--page-margin);
  background: var(--bg); color: var(--text);
}
.wlc-column { max-width: 34rem; margin: 0 auto; padding-top: var(--sp-5); display: flex; flex-direction: column; gap: var(--section-gap); }
.wlc-head { display: flex; flex-direction: column; gap: var(--sp-2); }
.wlc-title { margin: 0; font-size: var(--fs-5); font-weight: var(--title-weight, 600); line-height: var(--lh-tight); color: var(--text); }
.wlc-lead { margin: 0; font-size: var(--fs-3); line-height: var(--lh-body); color: var(--text-2); }
.wlc-form { display: flex; flex-direction: column; gap: var(--section-gap); margin: 0; }
.wlc-field { display: flex; flex-direction: column; gap: var(--sp-2); margin: 0; padding: 0; border: 0; min-width: 0; }
.wlc-label { padding: 0; font-size: var(--fs-2); font-weight: 600; color: var(--text); }
.wlc-input { width: 100%; min-height: var(--press-h); font-size: var(--fs-3); }
.wlc-input[data-placeholder-kept] { border-color: var(--ask); box-shadow: inset 3px 0 0 var(--ask); }
.wlc-say { margin: 0; font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); }
.wlc-kept { color: var(--text); font-weight: 600; }
.wlc-kept:not([data-shown]) { visibility: hidden; }
.wlc-choices { display: flex; flex-wrap: wrap; gap: var(--sp-4); }
.wlc-choice { display: inline-flex; align-items: center; gap: var(--sp-2); min-height: var(--press-h); font-size: var(--fs-3); cursor: pointer; }
.wlc-choice input { width: 18px; height: 18px; margin: 0; }
.wlc-foot { display: flex; justify-content: flex-end; }
@media (max-width: 40rem) {
  .page.wlc { --page-margin: var(--sp-3); }
  .wlc-column { padding-top: 0; }
  .wlc-foot .px-btn { width: 100%; }
}
`
