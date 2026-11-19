// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * `Themes`: the three looks, the six themes Mole Office ships, and the person's own (migration 0347).
 *
 * A look (Auto, Light, Dark) is drawn by tokens.css and has no values to copy. A shipped theme can be
 * used and copied, never changed. An own theme can be used, copied, changed, renamed and deleted. A
 * person keeps at most `MOST_OWN_THEMES` of them, and only that person is given them.
 *
 * THE OFFICE DECIDES WHAT IS KEPT. Each press sends the whole look through the participant change
 * door, and the door reads it with the theme reader and the one readability check. A refusal is shown
 * in the office's own sentences, and nothing was written. The check list here asks the same function
 * (`whyTheThemeIsHardToRead`), so it marks the pairs the office will refuse, before the person saves.
 *
 * THE PREVIEW is drawn with the unsaved values, as CSS custom properties on the preview alone, so the
 * rest of the page stays in the theme in use until the person saves and chooses this one.
 */

import { useState, type CSSProperties } from 'react'

import { content, t, wordLanguage, type WordKey } from '@shared/i18n.ts'
import { aCopyOf, asATheme, isOwnThemeId, lookWithout, measureOwnTheme, MOST_OWN_THEMES, type OwnTheme, type TheLook } from '@shared/own-themes.ts'
import { CannotMeasure, howToFixIt, ratioWords, READABILITY_PAIRS, whyTheThemeIsHardToRead, type Measurement } from '@shared/readability.ts'
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { EDIT_GROUPS, FACE_NAMES, NAMES_IN_EACH_GROUP, type EditGroup } from '@shared/theme-groups.ts'
import { STYLE_NAMES, type StyleName } from '@shared/theme-style-names.ts'
import { themeById, themeName, THEMES, type Theme } from '@shared/themes.ts'
import { useLanguage } from '../lib/language.ts'
import { keepTheLook, useTheLookInTheOffice } from '../lib/the-look.ts'
import { choosePreset, themeChoiceName, usePresets } from './PresetBar.tsx'
import { Loading, Panel } from './ui.tsx'

/** The word of one of this panel's controls, as the Settings declaration names it. */
function word(key: string): string {
  return t(settingsControlWord('settings.ownthemes', key))
}

const LOOKS = ['auto', 'light', 'dark'] as const

const GROUP_NAMES: Readonly<Record<EditGroup, WordKey>> = {
  colour: 'settingsPanel.ownThemes.group.colour',
  type: 'settingsPanel.ownThemes.group.type',
  shape: 'settingsPanel.ownThemes.group.shape',
  modules: 'settingsPanel.ownThemes.group.modules',
  controls: 'settingsPanel.ownThemes.group.controls',
}

const GROUP_SAYS: Readonly<Record<EditGroup, WordKey>> = {
  colour: 'settingsPanel.ownThemes.groupSays.colour',
  type: 'settingsPanel.ownThemes.groupSays.type',
  shape: 'settingsPanel.ownThemes.groupSays.shape',
  modules: 'settingsPanel.ownThemes.groupSays.modules',
  controls: 'settingsPanel.ownThemes.groupSays.controls',
}

/** A theme's values as custom properties on one element. `color-scheme` is a property of its own. */
function asStyle(values: Readonly<Record<StyleName, string>>): CSSProperties {
  const style: Record<string, string> = {}
  for (const name of STYLE_NAMES) {
    if (name === 'color-scheme') style['colorScheme'] = values[name]
    else style[name] = values[name]
  }
  return style as CSSProperties
}

/** The faces the shipped themes use for one face name, for the face choice. */
function facesFor(name: StyleName): readonly string[] {
  return [...new Set(THEMES.map((theme) => theme.values[name]))]
}

type Said = { kind: 'said'; words: string } | { kind: 'refused'; words: string; inEditor: boolean }

export function OwnThemesPanel() {
  useLanguage()
  const office = useTheLookInTheOffice()
  const { presets } = usePresets()
  const [editing, setEditing] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<Said | null>(null)

  const title = t('settingsPanel.title.ownthemes')
  const css = (
    <style href="mole-office-own-themes" precedence="default">
      {OWN_THEMES_CSS}
    </style>
  )

  if (office.status === 'loading') {
    return (
      <Panel titleIs="label" declares={{ surface: 'settings.ownthemes' }} title={title}>
        <Loading what={t('settingsPanel.ownThemes.loading')} />
      </Panel>
    )
  }
  if (office.status === 'elsewhere') {
    return (
      <Panel titleIs="label" declares={{ surface: 'settings.ownthemes' }} title={title}>
        <p>{t('settingsPanel.ownThemes.elsewhere', { because: content(office.because) })}</p>
      </Panel>
    )
  }

  /** Keep this whole look, and say what was done, or show the office's refusal. */
  const keep = async (next: TheLook, saying: string, inEditor: boolean): Promise<boolean> => {
    setBusy(true)
    setSaid(null)
    const kept = await keepTheLook(next)
    setBusy(false)
    if (!kept.ok) {
      setSaid({ kind: 'refused', words: t('settingsPanel.ownThemes.refused', { reason: content(kept.why) }), inEditor })
      return false
    }
    setSaid({ kind: 'said', words: saying })
    return true
  }

  if (office.status === 'unreadable') {
    // The page is drawn in a look of the three or the six while this lasts, never in an own theme.
    const showing = isOwnThemeId(presets.theme) ? 'auto' : presets.theme
    return (
      <Panel titleIs="label" declares={{ surface: 'settings.ownthemes' }} title={title}>
        {css}
        <div className="owth">
          <p>{t('settingsPanel.ownThemes.startAgainSays')}</p>
          <ul className="owth-why">
            {office.why.map((sentence) => (
              <li key={sentence}>{content(sentence)}</li>
            ))}
          </ul>
          <button type="button" className="owth-button" disabled={busy} onClick={() => void keep({ chosen: showing, own: [] }, t('settingsPanel.ownThemes.saved', { name: themeChoiceName(showing) }), false)}>
            {word('settingsPanel.ownThemes.startAgain')}
          </button>
          <Saying said={said} inEditor={false} />
        </div>
      </Panel>
    )
  }

  // NONE OR SET. With none, the look is what the page draws, from this browser, with no own themes.
  const look: TheLook = office.status === 'set' ? office.look : { chosen: presets.theme, own: [] }
  const editingTheme = look.own.find((one) => one.id === editing) ?? null

  const copy = async (source: Theme | OwnTheme, sourceName: string): Promise<void> => {
    const made = aCopyOf(source, look, t('settingsPanel.ownThemes.copyName', { name: sourceName }))
    const kept = await keep({ chosen: look.chosen, own: [...look.own, made] }, t('settingsPanel.ownThemes.copied', { name: content(made.name), from: sourceName }), false)
    if (kept) setEditing(made.id)
  }

  const row = (id: string, name: string, actions: { copy?: () => void; change?: () => void }, swatch: Readonly<Record<StyleName, string>> | null) => {
    const inUse = presets.theme === id
    return (
      <li key={id} className="owth-row" data-theme-id={id} aria-label={name} data-in-use={inUse ? 'true' : 'false'}>
        {swatch === null ? <span className="owth-swatch owth-swatch-none" aria-hidden="true" /> : (
          <span className="owth-swatch" style={asStyle(swatch)} aria-hidden="true">
            {t('settingsPanel.ownThemes.sample')}
          </span>
        )}
        <span className="owth-name">{name}</span>
        {inUse ? <span className="owth-in-use">{t('settingsPanel.ownThemes.inUse')}</span> : null}
        <span className="owth-actions">
          <button type="button" className="owth-button" disabled={busy || inUse} onClick={() => choosePreset('theme', id as typeof presets.theme)}>
            {word('settingsPanel.ownThemes.use')}
          </button>
          {actions.copy === undefined ? null : (
            <button type="button" className="owth-button" disabled={busy} onClick={actions.copy}>
              {word('settingsPanel.ownThemes.copy')}
            </button>
          )}
          {actions.change === undefined ? null : (
            <button type="button" className="owth-button" disabled={busy} aria-pressed={editing === id ? 'true' : 'false'} onClick={actions.change}>
              {word('settingsPanel.ownThemes.change')}
            </button>
          )}
        </span>
      </li>
    )
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.ownthemes' }} title={title}>
      {css}
      <div className="owth">
        <h3 className="owth-heading">{t('settingsPanel.ownThemes.looks')}</h3>
        <p className="owth-says">{t('settingsPanel.ownThemes.looksAreNotCopied')}</p>
        <ul className="owth-list">{LOOKS.map((id) => row(id, themeChoiceName(id), {}, null))}</ul>

        <h3 className="owth-heading">{t('settingsPanel.ownThemes.shipped')}</h3>
        <p className="owth-says">{t('settingsPanel.ownThemes.shippedIsCopyOnly')}</p>
        <ul className="owth-list">
          {THEMES.map((theme) => {
            const name = themeName(theme, wordLanguage())
            return row(theme.id, name, { copy: () => void copy(theme, name) }, theme.values)
          })}
        </ul>

        <h3 className="owth-heading">{t('settingsPanel.ownThemes.own')}</h3>
        <p className="owth-says">
          {look.own.length === 0 ? t('settingsPanel.ownThemes.noneYet') : t('settingsPanel.ownThemes.howMany', { n: look.own.length, most: MOST_OWN_THEMES })}
        </p>
        {look.own.length === 0 ? null : (
          <ul className="owth-list">
            {look.own.map((own) => row(own.id, content(own.name), {
              copy: () => void copy(own, content(own.name)),
              change: () => {
                setSaid(null)
                setEditing(editing === own.id ? null : own.id)
              },
            }, own.values))}
          </ul>
        )}
        <Saying said={said} inEditor={false} />

        {editingTheme === null ? null : (
          <Editor
            // A NEW THEME OPENED IS A NEW EDITOR, so its boxes start from what the office kept.
            key={editingTheme.id}
            saved={editingTheme}
            busy={busy}
            said={said}
            save={(values) => void keep(
              { chosen: look.chosen, own: look.own.map((one) => (one.id === editingTheme.id ? { ...one, values } : one)) },
              t('settingsPanel.ownThemes.saved', { name: content(editingTheme.name) }),
              true,
            )}
            rename={(name) => void keep(
              { chosen: look.chosen, own: look.own.map((one) => (one.id === editingTheme.id ? { ...one, name } : one)) },
              t('settingsPanel.ownThemes.renamed', { name: content(name) }),
              true,
            )}
            remove={() => {
              const { look: next, chosenBecame } = lookWithout(look, editingTheme.id)
              const saying = chosenBecame === null
                ? t('settingsPanel.ownThemes.deleted', { name: content(editingTheme.name) })
                : t('settingsPanel.ownThemes.deletedInUse', { name: content(editingTheme.name), from: themeName(themeById(chosenBecame), wordLanguage()) })
              void keep(next, saying, true).then((kept) => {
                if (kept) setEditing(null)
              })
            }}
          />
        )}
      </div>
    </Panel>
  )
}

/** What the last press did, or the office's refusal, in the place it belongs. */
function Saying({ said, inEditor }: { said: Said | null; inEditor: boolean }) {
  if (said === null) return null
  if (said.kind === 'said') {
    return inEditor ? null : (
      <p className="owth-say" role="status">
        {said.words}
      </p>
    )
  }
  if (said.inEditor !== inEditor) return null
  return (
    <p className="owth-refused" role="alert">
      {said.words}
    </p>
  )
}

/** One own theme, changed in five groups with a live preview and the check, then saved, renamed or deleted. */
function Editor({ saved, busy, said, save, rename, remove }: {
  saved: OwnTheme
  busy: boolean
  said: Said | null
  save: (values: Readonly<Record<StyleName, string>>) => void
  rename: (name: string) => void
  remove: () => void
}) {
  useLanguage()
  const [values, setValues] = useState<Readonly<Record<StyleName, string>>>(saved.values)
  const [name, setName] = useState(saved.name)
  const [asking, setAsking] = useState(false)
  const draft: OwnTheme = { ...saved, values }
  const unsaved = STYLE_NAMES.filter((one) => values[one] !== saved.values[one]).length
  const setValue = (one: StyleName, value: string) => setValues({ ...values, [one]: value })

  return (
    <section className="owth-edit" data-editing={saved.id} aria-label={t('settingsPanel.ownThemes.changing', { name: content(saved.name) })}>
      <h3 className="owth-heading">{t('settingsPanel.ownThemes.changing', { name: content(saved.name) })}</h3>

      <form
        className="owth-rename"
        onSubmit={(event) => {
          event.preventDefault()
          rename(name.trim())
        }}
      >
        <label className="owth-field">
          <span className="owth-label">{t('settingsPanel.ownThemes.name')}</span>
          <input className="owth-text" type="text" value={name} disabled={busy} autoComplete="off" onChange={(event) => setName(event.target.value)} />
        </label>
        <button type="submit" className="owth-button" disabled={busy}>
          {word('settingsPanel.ownThemes.rename')}
        </button>
        {asking ? null : (
          <button type="button" className="owth-button owth-delete" disabled={busy} onClick={() => setAsking(true)}>
            {word('settingsPanel.ownThemes.delete')}
          </button>
        )}
      </form>
      {asking ? (
        <div className="owth-ask">
          <p>{t('settingsPanel.ownThemes.deleteSure', { name: content(saved.name) })}</p>
          <button type="button" className="owth-button owth-delete" disabled={busy} onClick={remove}>
            {t('settingsPanel.ownThemes.deleteYes')}
          </button>
          <button type="button" className="owth-button" disabled={busy} onClick={() => setAsking(false)}>
            {t('settingsPanel.ownThemes.deleteNo')}
          </button>
        </div>
      ) : null}

      <div className="owth-work">
        <div className="owth-side">
          <Preview values={values} />
          <Check theme={draft} />
        </div>
        <div className="owth-groups">
          {EDIT_GROUPS.map((group) => (
            <details key={group} className="owth-group" data-group={group}>
              <summary>
                <span className="owth-group-name">{t(GROUP_NAMES[group])}</span> <span className="owth-says">{t(GROUP_SAYS[group])}</span>
              </summary>
              <div className="owth-values">
                {NAMES_IN_EACH_GROUP[group].map((one) => (
                  <ValueRow key={one} name={one} value={values[one]} busy={busy} change={(value) => setValue(one, value)} />
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>

      <div className="owth-save">
        {unsaved === 0 ? null : <span className="owth-unsaved">{t('settingsPanel.ownThemes.notSaved', { n: unsaved })}</span>}
        <button type="button" className="owth-button owth-primary" disabled={busy || unsaved === 0} onClick={() => save(values)}>
          {word('settingsPanel.ownThemes.save')}
        </button>
        <button type="button" className="owth-button" disabled={busy || unsaved === 0} onClick={() => setValues(saved.values)}>
          {word('settingsPanel.ownThemes.undo')}
        </button>
      </div>
      <Saying said={said} inEditor={true} />
    </section>
  )
}

/** One style name: a box for its value, a colour well when the value is a six-digit colour, a choice for a face. */
function ValueRow({ name, value, busy, change }: { name: StyleName; value: string; busy: boolean; change: (value: string) => void }) {
  const faces = FACE_NAMES.includes(name) ? facesFor(name) : null
  return (
    <div className="owth-value">
      <span className="owth-value-name">{content(name)}</span>
      {faces === null ? (
        <input className="owth-text" type="text" value={value} disabled={busy} autoComplete="off" spellCheck={false} aria-label={t('settingsPanel.ownThemes.valueOf', { name: content(name) })} onChange={(event) => change(event.target.value)} />
      ) : (
        <select className="owth-text" value={value} disabled={busy} aria-label={t('settingsPanel.ownThemes.valueOf', { name: content(name) })} onChange={(event) => change(event.target.value)}>
          {(faces.includes(value) ? faces : [value, ...faces]).map((face) => (
            <option key={face} value={face}>
              {content(face)}
            </option>
          ))}
        </select>
      )}
      {/^#[0-9a-f]{6}$/i.test(value) ? (
        <input className="owth-well" type="color" value={value.toLowerCase()} disabled={busy} aria-label={t('settingsPanel.ownThemes.colourOf', { name: content(name) })} onChange={(event) => change(event.target.value)} />
      ) : null}
    </div>
  )
}

/** A small page drawn with the unsaved values. */
function Preview({ values }: { values: Readonly<Record<StyleName, string>> }) {
  return (
    <div className="owth-preview" style={asStyle(values)} role="group" aria-label={t('settingsPanel.ownThemes.preview')}>
      <p className="owth-preview-says">{t('settingsPanel.ownThemes.previewSays')}</p>
      <div className="owth-preview-panel">
        <p className="owth-preview-heading">{t('settingsPanel.ownThemes.previewHeading')}</p>
        <p className="owth-preview-body">{t('settingsPanel.ownThemes.previewBody')}</p>
        <p className="owth-preview-quiet">{t('settingsPanel.ownThemes.previewQuiet')}</p>
        <p className="owth-preview-row">
          <span className="owth-preview-link">{t('settingsPanel.ownThemes.previewLink')}</span>
          <span className="owth-preview-button">{t('settingsPanel.ownThemes.previewButton')}</span>
          <span className="owth-preview-chosen">{t('settingsPanel.ownThemes.previewChosen')}</span>
        </p>
      </div>
    </div>
  )
}

/** The one readability check on the unsaved values: each failing pair marked, with the moves that would fix it. */
function Check({ theme }: { theme: OwnTheme }) {
  const answer = whyTheThemeIsHardToRead(asATheme(theme), theme.name)
  if (answer.cannotMeasure !== null) {
    return (
      <div className="owth-check">
        <p className="owth-check-head">{t('settingsPanel.ownThemes.check')}</p>
        <p className="owth-fails">{t('settingsPanel.ownThemes.cannotMeasure', { reason: content(answer.cannotMeasure) })}</p>
      </div>
    )
  }
  let measured: readonly Measurement[]
  try {
    measured = measureOwnTheme(theme)
  } catch (error) {
    // The check above measured this theme, so this one cannot fail on it; if it does, say so.
    if (error instanceof CannotMeasure) throw new Error(`OwnThemesPanel: the check measured the theme once and could not a second time: ${error.message}`)
    throw error
  }
  const all = READABILITY_PAIRS.length
  const pairWords = (m: Measurement) => t('settingsPanel.ownThemes.pair', { what: content(m.pair.what), on: content(m.pair.on) })
  const ratio = (m: Measurement) => t('settingsPanel.ownThemes.ratio', { ratio: ratioWords(m.ratio), floor: m.floor })
  return (
    <div className="owth-check">
      <p className="owth-check-head">{t('settingsPanel.ownThemes.check')}</p>
      {answer.failing.length === 0 ? (
        <p className="owth-passes">{t('settingsPanel.ownThemes.checkPasses', { all })}</p>
      ) : (
        <>
          <p className="owth-fails">{t('settingsPanel.ownThemes.checkFails', { failing: answer.failing.length, all })}</p>
          <ul className="owth-pairs">
            {answer.failing.map((failing) => {
              const { measurement } = failing
              const at = READABILITY_PAIRS.indexOf(measurement.pair)
              return (
                <li key={at} className="owth-pair" data-pair={at} data-passes="false">
                  <span className="owth-pair-mark" aria-hidden="true" style={{ color: measurement.fg, background: measurement.bg }}>
                    {t('settingsPanel.ownThemes.sample')}
                  </span>
                  <span>
                    <strong>{pairWords(measurement)}</strong> {ratio(measurement)} {t(howToFixIt(failing), { fg: content(measurement.pair.fg), bg: content(measurement.pair.bg) })}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <details className="owth-passing">
        <summary>{t('settingsPanel.ownThemes.passingPairs')}</summary>
        <ul className="owth-pairs">
          {measured.map((m, at) => (m.passes ? (
            <li key={at} className="owth-pair" data-pair={at} data-passes="true">
              <span className="owth-pair-mark" aria-hidden="true" style={{ color: m.fg, background: m.bg }}>
                {t('settingsPanel.ownThemes.sample')}
              </span>
              <span>
                {pairWords(m)} {ratio(m)}
              </span>
            </li>
          ) : null))}
        </ul>
      </details>
    </div>
  )
}

/**
 * THIS PANEL'S OWN RULES, in its own style element, read from the page's tokens. styles.css belongs to
 * another part of the page and is not changed for this panel. Outside the preview a rule reads only
 * names tokens.css defines. Inside it, a rule may read a theme's own names, such as `--font-head`,
 * because the preview sets every one of STYLE_NAMES on itself.
 */
const OWN_THEMES_CSS = `
.owth { display: flex; flex-direction: column; gap: 10px; }
.owth-heading { margin: 8px 0 0; font-size: var(--fs-3); font-weight: 600; color: var(--text); }
.owth-says { margin: 0; color: var(--text-2); font-size: var(--fs-2); }
.owth-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.owth-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 8px; border: 1px solid var(--border); border-radius: var(--look-radius-sm); background: var(--panel); }
.owth-row[data-in-use="true"] { border-color: var(--accent); }
.owth-swatch { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 24px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font-size: 12px; font-weight: 600; flex: none; }
.owth-swatch-none { background: transparent; border-style: dashed; }
.owth-name { flex: 1 1 10em; min-width: 0; overflow-wrap: anywhere; color: var(--text); }
/* --accent on --panel is a pair the readability check measures. --accent-text is for text on the accent itself. */
.owth-in-use { font-size: var(--fs-1); color: var(--accent); font-weight: 600; }
.owth-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.owth-button { font: inherit; font-size: var(--fs-2); padding: 3px 10px; border: 1px solid var(--border-strong); border-radius: var(--look-radius-sm); background: var(--panel-2); color: var(--text); cursor: pointer; }
.owth-button:disabled { color: var(--text-dis); cursor: default; }
.owth-primary { background: var(--accent); color: var(--accent-text); border-color: var(--accent); }
.owth-delete { color: var(--st-failed); }
.owth-say { margin: 0; color: var(--text); }
.owth-refused { margin: 0; padding: 6px 8px; border: 1px solid var(--st-failed-line); background: var(--st-failed-bg); color: var(--text); border-radius: 4px; }
.owth-edit { display: flex; flex-direction: column; gap: 10px; padding: 10px; border: 1px solid var(--border-strong); border-radius: var(--look-radius); }
.owth-rename, .owth-ask, .owth-save { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.owth-ask p { margin: 0; flex-basis: 100%; color: var(--text); }
.owth-field { display: flex; align-items: center; gap: 6px; flex: 1 1 14em; min-width: 0; }
.owth-label { color: var(--text-2); }
.owth-text { font: inherit; font-size: var(--fs-2); min-width: 0; flex: 1 1 8em; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); color: var(--text); }
.owth-work { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr); gap: 12px; align-items: start; }
@media (max-width: 900px) { .owth-work { grid-template-columns: minmax(0, 1fr); } }
.owth-side { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.owth-groups { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.owth-group { border: 1px solid var(--border); border-radius: 4px; background: var(--panel); }
.owth-group > summary { cursor: pointer; padding: 6px 8px; }
.owth-group-name { font-weight: 600; color: var(--text); }
.owth-values { display: flex; flex-direction: column; gap: 4px; padding: 6px 8px 8px; max-height: 420px; overflow: auto; }
.owth-value { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.owth-value-name { flex: 0 1 13em; min-width: 0; font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text-2); overflow-wrap: anywhere; }
.owth-well { width: 32px; height: 24px; padding: 0; border: 1px solid var(--border); background: none; flex: none; }
.owth-unsaved { color: var(--text-2); }
.owth-preview { padding: 10px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; font-family: var(--font-sans); }
.owth-preview-says { margin: 0 0 6px; font-size: var(--fs-1); color: var(--text-3); }
.owth-preview-panel { padding: 10px; background: var(--panel); border: var(--border-w) solid var(--border); border-radius: var(--look-radius); box-shadow: var(--elev-1); }
.owth-preview-panel p { margin: 0 0 6px; }
.owth-preview-heading { font-family: var(--font-head); font-weight: var(--heading-weight); color: var(--panel-head-ink); font-size: var(--fs-3); }
.owth-preview-body { color: var(--text); font-family: var(--font-read); line-height: var(--lh-body); }
.owth-preview-quiet { color: var(--text-2); }
.owth-preview-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.owth-preview-link { color: var(--accent); text-decoration: var(--link-decoration); }
.owth-preview-button { padding: 3px 10px; border: 1px solid var(--button-primary-border); border-radius: var(--look-radius-sm); background: var(--button-primary-bg); color: var(--button-primary-ink); font-weight: var(--button-weight); }
.owth-preview-chosen { padding: 3px 10px; border-radius: var(--look-radius-sm); background: var(--chosen-bg); color: var(--chosen-ink); box-shadow: var(--chosen-shadow); }
.owth-check { display: flex; flex-direction: column; gap: 6px; }
.owth-check-head { margin: 0; font-weight: 600; color: var(--text); }
.owth-passes { margin: 0; color: var(--st-done); }
.owth-fails { margin: 0; color: var(--text); font-weight: 600; }
.owth-pairs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.owth-pair { display: flex; gap: 8px; align-items: flex-start; color: var(--text); font-size: var(--fs-2); }
.owth-pair[data-passes="false"] { padding: 4px 6px; border-left: 3px solid var(--st-failed); background: var(--st-failed-bg); }
.owth-pair-mark { flex: none; width: 32px; text-align: center; border: 1px solid var(--border); border-radius: 3px; font-weight: 600; }
.owth-passing > summary { cursor: pointer; color: var(--text-2); }
.owth-why { margin: 0; padding-left: 1.2em; color: var(--text); }
`
