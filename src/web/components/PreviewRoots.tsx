// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE DIRECTORIES A PREVIEW MAY READ, FOR ONE PROJECT.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR
 * ---------------------------------------------------------------------------------------
 *
 * Criterion U4: a person is never asked to add environment variables by hand each time they work in
 * a new folder. The directories a preview may read are not a setting anybody types. They are derived: the
 * checkout, ~/.cache/mole-office, the root of every repository registered in the project, and every
 * existing directory a registered work area of the project names under one of those roots. This
 * panel shows that list as it is derived, with where each entry came from.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS ABOUT ONE PROJECT, LIKE THE TWO PANELS ABOVE IT
 * ---------------------------------------------------------------------------------------
 *
 * A work area belongs to a project and a repository is registered in one, so the list is different
 * for each project. The panel names the project above its own title, the way Repositories and
 * Review of finished work do, because a reader who cannot see which project a list describes will
 * read the wrong one.
 *
 * ---------------------------------------------------------------------------------------
 * THE PRESS, WHICH IS FOR THE ODD CASE
 * ---------------------------------------------------------------------------------------
 *
 * A directory that is nobody's registered repository and is named by no work area can still be read:
 * the person adds it here, and the store records who added it and when. The panel says whether
 * anybody has ever added one and whether one was added in this project, because "nobody added one"
 * and "the list is empty" are different facts. The full account of a refusal for a file outside the
 * fence points at the Repositories panel, where a repository or a work area is registered.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'
import { content, t } from '@shared/i18n.ts'
import { howARootCameFrom, type PreviewRootReading, type PreviewRootSource } from '@shared/preview-roots.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { projectName } from '../lib/projects.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { Absence, Btn, ErrorNote, Field, Loading, Panel, TextArea, TextInput } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/** What this panel says, in one place, so a screen and a test read the same words. */
export const PREVIEW_ROOTS_PANEL_WORDS = {
  /** The label whose value names the project, for a reader arriving with no idea which one it is. */
  get showing(): string { return t('settingsPanel.roots.showing') },
  /*
   * THE TWO ABSENCES ARE NOT DECLARED HERE, AND THAT IS NOT AN OVERSIGHT. They are written inline
   * on the `Absence` element that draws them, because `tests/absence-weight.test.ts` reads a
   * sentence where it is WRITTEN and not where it is drawn: a sentence in a constant and handed to
   * `title={...}` sits outside every `<Absence>` span and is counted as an emptiness given a
   * paragraph. The other words in this object are drawn as themselves and stay here. The two read
   * alike and are not the same fact: nobody having added a directory anywhere, and nobody having
   * added one in this project while others have.
   */
  /** The press, in the words on it. */
  get add(): string { return t(settingsControlWord('settings.previewroots', 'settingsPanel.roots.add')) },
}

/**
 * WHERE ONE ENTRY CAME FROM, in the page's language. Which reading applies, and the names that go
 * into it, come from `howARootCameFrom` in src/shared/preview-roots.ts, the same value the English
 * `whereARootCameFrom` is built from. Only the words are chosen here. The names are content and are
 * not translated.
 */
function whereItCameFrom(source: PreviewRootSource): string {
  const how = howARootCameFrom(source)
  switch (how.reading) {
    case 'env':
      return t('settingsPanel.roots.source.env')
    case 'checkout':
      return t('settingsPanel.roots.source.checkout')
    case 'agents':
      return t('settingsPanel.roots.source.agents')
    case 'store':
      return t('settingsPanel.roots.source.store', { store: content(how.store) })
    case 'repository':
      return t('settingsPanel.roots.source.repository', { name: content(how.name) })
    case 'workarea':
      return t('settingsPanel.roots.source.workarea', { area: content(how.area), name: content(how.name) })
    case 'added':
      return t('settingsPanel.roots.source.added', { at: content(how.at), by: content(how.by) })
    case 'addedWhy':
      return t('settingsPanel.roots.source.addedWhy', { at: content(how.at), by: content(how.by), why: content(how.why) })
  }
}

/**
 * THE DIRECTORIES IN FORCE, each with where it came from. Exported so
 * tests/the-settings-panels-say-the-shared-facts.test.ts can draw it from made-up roots.
 */
export function PreviewRootsList({ roots }: { roots: readonly PreviewRootReading[] }) {
  useLanguage()
  return (
    <dl className="pvr-list">
      {roots.map((root) => (
        <div key={root.canonical} className="pvr-row">
          <dt className="pvr-path">{content(root.path)}</dt>
          <dd className="pvr-source">{whereItCameFrom(root.source)}</dd>
        </div>
      ))}
    </dl>
  )
}

export function PreviewRootsPanel() {
  useLanguage()
  const here = currentWorkspace()
  const [reply, reload] = useProjectAsync(() => api.previewRoots(), [])

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.previewroots' }} title={t('settingsPanel.title.previewroots')}>
      <style href="mole-office-preview-roots" precedence="default">
        {PREVIEW_ROOTS_CSS}
      </style>
      {/* WHICH PROJECT THIS LIST IS ABOUT, ABOVE THE LIST. The Repositories panel's rule. */}
      <p className="pvr-where">
        <span className="pvr-label">{PREVIEW_ROOTS_PANEL_WORDS.showing}</span>
        <span className="pvr-value">{content(projectName(here))}</span>
      </p>
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.roots.what')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status === 'ready' && reply.value.roots.length === 0 ? (
        <p className="pvr-none">
          {/*
            A LIST WITH NOTHING IN IT IS AN ABSENCE SOMEBODY MUST ACT ON, because until a directory
            is in force no file in this project can be previewed at all. The sentence rides the
            `title` and comes from the word table. An earlier version wrote it here, not in a
            constant, for the sentence gate, a test deleted on 12 November 2026, which read a
            string where it was written.
          */}
          <Absence
            tier="told-apart"
            looked
            word={t('settingsPanel.roots.noneInForce')}
            title={t('settingsPanel.roots.noneInForceSays')}
          />
        </p>
      ) : null}
      {reply.status === 'ready' && reply.value.roots.length > 0 ? (
        <PreviewRootsList roots={reply.value.roots} />
      ) : null}
      {reply.status === 'ready' ? (
        <p className="pvr-added">
          {reply.value.added.additions.length > 0 ? (
            /* A COUNT IS A VALUE AND A LABEL, not a sentence about a count. The same two spans the
               project line above uses, so the panel reads one way throughout. */
            <>
              <span className="pvr-label">{t('settingsPanel.roots.addedByHand')}</span>
              <span className="pvr-value">{reply.value.added.additions.length}</span>
            </>
          ) : reply.value.added.chosen ? (
            /*
             * THE TWO ABSENCES ARE DRAWN AS TWO ELEMENTS, NOT ONE WITH A TERNARY, so each sentence
             * sits immediately after its own `title=`, where a reader can see it is on a
             * tooltip. They read alike and are not the same fact: somebody has added a directory
             * somewhere and none of them is here, or nobody has ever added one at all. `looked` is
             * exactly that distinction, so neither is guessed at, and told-apart rather than
             * must-act-on because a project whose repositories already cover what it needs is the
             * ordinary case and nobody has to do anything about it.
             */
            <Absence
              tier="told-apart"
              looked
              word={t('settingsPanel.roots.noneAdded')}
              title={t('settingsPanel.roots.noneAddedHereSays')}
            />
          ) : (
            <Absence
              tier="told-apart"
              looked={false}
              word={t('settingsPanel.roots.noneAdded')}
              title={t('settingsPanel.roots.noneAddedSays')}
            />
          )}
        </p>
      ) : null}
      <AddADirectoryByHand onAdded={reload} />
    </Panel>
  )
}

/**
 * THE PRESS FOR THE ODD CASE, AND THE FORM BEHIND IT.
 *
 * It starts behind a press because it is the rarer act: the ordinary way a directory becomes readable
 * is a registered repository or a work area, and both are on the Repositories panel below. A refusal
 * is the server's own sentence — an absolute path that is not a directory, an empty reason, one
 * already added — because each rule lives in one place and rewording it here would be a second copy.
 */
function AddADirectoryByHand({ onAdded }: { onAdded: () => void }) {
  useLanguage()
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [why, setWhy] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function add(): Promise<void> {
    setBusy(true)
    setRefused(null)
    try {
      await api.addPreviewRoot({ path: path.trim(), why: why.trim() })
      setPath('')
      setWhy('')
      setOpen(false)
      onAdded()
    } catch (err) {
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="pvr-acts">
        <Btn size="sm" onClick={() => setOpen(true)}>
          {PREVIEW_ROOTS_PANEL_WORDS.add}
        </Btn>
      </div>
    )
  }

  return (
    <div className="pvr-form">
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('settingsPanel.roots.notAdded')} />}
      <Field label={t(settingsControlWord('settings.previewroots', 'settingsPanel.roots.folder'))}>
        <TextInput value={path} onChange={setPath} mono placeholder={t('settingsPanel.roots.folderPlaceholder')} />
      </Field>
      <Field label={t(settingsControlWord('settings.previewroots', 'settingsPanel.roots.why'))}>
        <TextArea value={why} onChange={setWhy} rows={2} placeholder={t('settingsPanel.roots.whyPlaceholder')} />
      </Field>
      <div className="pvr-acts">
        <Btn
          variant="primary"
          pending={busy}
          disabled={path.trim() === '' || why.trim() === ''}
          reason={t('settingsPanel.roots.needsBoth')}
          onClick={() => void add()}
        >
          {t(settingsControlWord('settings.previewroots', 'settingsPanel.roots.addIt'))}
        </Btn>
        <Btn variant="ghost" onClick={() => setOpen(false)}>
          {t(settingsControlWord('settings.previewroots', 'settingsPanel.roots.leave'))}
        </Btn>
      </div>
    </div>
  )
}

/**
 * The panel's own rules. Every value is a token, so a preset change on the root reaches all of it.
 *
 * NO BACKTICK APPEARS ANYWHERE BELOW: this is a CSS template literal, and a backtick inside it
 * would close the string and turn the rest of the file into nonsense. Chapter 6 rule 3.
 */
const PREVIEW_ROOTS_CSS = `
.pvr-where { margin: 0 0 var(--pad) 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; min-width: 0; }
.pvr-label { flex: none; font-size: var(--fs-1); font-weight: 600; color: var(--ink-3); letter-spacing: .06em; text-transform: uppercase; }
.pvr-value { color: var(--text-2); font-size: var(--fs-2); }

.pvr-none { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); }

.pvr-list { margin: 0; display: flex; flex-direction: column; gap: var(--pad); min-width: 0; }
.pvr-row { display: flex; flex-direction: column; gap: 2px; min-width: 0; border-top: 1px solid var(--edge); padding-top: 8px; }
.pvr-row:first-child { border-top: 0; padding-top: 0; }
.pvr-path { margin: 0; min-width: 0; font-family: var(--font-mono); font-size: var(--fs-1); color: var(--text); overflow-wrap: anywhere; }
/* The reason a person gave may run over several lines, so its line breaks are kept. */
.pvr-source { margin: 0; min-width: 0; font-size: var(--fs-1); color: var(--ink-3); overflow-wrap: anywhere; white-space: pre-wrap; }

.pvr-added { margin: var(--pad) 0 0 0; display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 12px; max-width: var(--measure-in-box); font-size: var(--fs-1); color: var(--ink-3); }

.pvr-acts { display: flex; flex-wrap: wrap; gap: var(--pad); margin: var(--pad) 0 0 0; min-width: 0; }
.pvr-form { display: flex; flex-direction: column; gap: 8px; margin-top: var(--pad); min-width: 0; }
`
