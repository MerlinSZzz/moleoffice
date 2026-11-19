// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * HOW MUCH REVIEW A FINISHED RUN IN THIS PROJECT GETS, on the settings page.
 *
 * A decision, and how the three levels meet the chain the office already has:
 *
 *   None   The office starts no inspector, and the secretary confirms the finished run directly.
 *   Light  The report goes to the secretary, who answers. No inspector.
 *   Full   The inspector runs exactly as it does today.
 *
 * ---------------------------------------------------------------------------------------
 * IT IS KEPT FOR ONE PROJECT, AND THE PANEL SAYS WHICH
 * ---------------------------------------------------------------------------------------
 *
 * The second panel on this page that is not about this browser, after Repositories, and it follows
 * that panel's rule: a setting that belongs to one project names the project above its own title,
 * because a reader who cannot see which project a control changes will change the wrong one. The
 * value lives on the `workspaces` row, added by migration 0153.
 *
 * ---------------------------------------------------------------------------------------
 * THE VALUE BEFORE ANYBODY CHOOSES IS FULL, AND THAT IS NOT THE SAME AS CHOOSING FULL
 * ---------------------------------------------------------------------------------------
 *
 * A project nobody has chosen for holds NULL and reads as Full, which is what the office did before
 * this setting existed — so nothing changed on the day it landed. `BackToNotChosen` is how a person
 * gets back there, and it appears only when there is a choice to undo.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THE LEVEL DOES NOT CHANGE
 * ---------------------------------------------------------------------------------------
 *
 * The seal. The work is sealed at every level and the seal blocks nobody. The
 * one exception is a run that changed only records, which is neither sealed nor checked at None and
 * Light (criterion C35). That is why this panel says what is not checked rather than what is not
 * kept.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import { content, t } from '@shared/i18n.ts'
import { packageInspectionOf, REVIEW_LEVELS, REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES, type ReviewLevel } from '@shared/workspaces.ts'
import { api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { readWorkspacesOnce } from '../lib/oneread.ts'
import { useInspect } from '../lib/mode.ts'
import { projectName } from '../lib/projects.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { BackToNotChosen } from './BackToNotChosen.tsx'
import { ErrorNote, Loading, Panel, useAsync } from './ui.tsx'

/** What this panel says, in one place, so a screen and a test read the same words. */
export const REVIEW_LEVEL_PANEL_WORDS = {
  get title(): string { return t('settingsPanel.title.reviewlevel') },
  /** The label whose value is the choice, for a reader nothing can be drawn for. */
  get showing(): string { return t('settingsPanel.review.showing') },
  /** What this setting is, in the sentence `BackToNotChosen` builds. */
  get setting(): string { return t(settingsControlWord('settings.reviewlevel', 'settingsPanel.review.setting')) },
}

/** Each level's word and what it does. The English lives once, in `REVIEW_LEVEL_WORDS` and `REVIEW_LEVEL_SAYS`. */
const LEVEL_WORD = {
  none: 'settingsPanel.review.level.none',
  light: 'settingsPanel.review.level.light',
  full: 'settingsPanel.review.level.full',
} as const satisfies Record<ReviewLevel, string>
const LEVEL_SAYS = {
  none: 'settingsPanel.review.says.none',
  light: 'settingsPanel.review.says.light',
  full: 'settingsPanel.review.says.full',
} as const satisfies Record<ReviewLevel, string>

export function ReviewLevelPanel() {
  useLanguage()
  const developer = useInspect()
  const [reply, reload] = useAsync(() => api.listWorkspaces(), [])
  const [fault, setFault] = useState<string | null>(null)
  const here = currentWorkspace()

  const project = reply.status === 'ready' ? (reply.value.workspaces.find((one) => one.id === here) ?? null) : null
  // NULL ON THE ROW MEANS NOBODY HAS CHOSEN, and the value before anybody chooses is named once in
  // shared code, so this control and the office door cannot come to different answers about it.
  const chosen: ReviewLevel = project?.reviewLevel ?? REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES

  const pick = (which: ReviewLevel | null): void => {
    if (project === null) return
    setFault(null)
    void api
      .changeWorkspace(project.id, { reviewLevel: which })
      .then(() => {
        reload()
      })
      .catch((err: unknown) => {
        setFault(errorMessage(err))
      })
  }

  const pickPackageInspection = (enabled: boolean): void => {
    if (project === null) return
    setFault(null)
    void api.changeWorkspace(project.id, { packageInspection: enabled }).then(async () => {
      readWorkspacesOnce.written()
      await readWorkspacesOnce.again()
      reload()
    }).catch((err: unknown) => setFault(errorMessage(err)))
  }

  return (
    <Panel titleIs="label" declares={{ surface: 'settings.reviewlevel' }} title={REVIEW_LEVEL_PANEL_WORDS.title}>
      <style href="mole-office-review-level" precedence="default">
        {CSS}
      </style>
      {/* WHICH PROJECT THIS CHANGES, ABOVE THE CONTROL. The Repositories panel's rule. */}
      {/* THE PROJECT'S NAME, NOT ITS ID, in normal mode. Its title arrives with the reading, so until
          then the row is drawn only for a developer, who may read the id. */}
      {project === null && !developer ? null : (
        <p className="rvl-where">
          <span className="rvl-label">{REVIEW_LEVEL_PANEL_WORDS.showing}</span>
          <span className="rvl-value">{content(projectName(here, project?.title))}</span>
        </p>
      )}
      {reply.status === 'loading' ? <Loading what={t('settingsPanel.review.what')} /> : null}
      {reply.status === 'error' ? <ErrorNote message={reply.message} fault={reply.fault} /> : null}
      {reply.status === 'ready' && project === null ? (
        <p className="rvl-none">
          <span className="rvl-label">{REVIEW_LEVEL_PANEL_WORDS.showing}</span>
          <span className="rvl-value">
            {developer ? t('settingsPanel.review.noProjectNamed', { id: content(here) }) : t('settingsPanel.review.noProject')}
          </span>
        </p>
      ) : null}
      {project === null ? null : (
        <>
          <div className="rvl-choices" role="group" aria-label={REVIEW_LEVEL_PANEL_WORDS.title}>
            {REVIEW_LEVELS.map((which) => (
              <button
                key={which}
                type="button"
                className="rvl-choice"
                data-choice={which}
                aria-pressed={chosen === which}
                onClick={() => {
                  pick(which)
                }}
              >
                <span className="rvl-word">{t(settingsControlWord('settings.reviewlevel', LEVEL_WORD[which]))}</span>
                <span className="rvl-says">{t(LEVEL_SAYS[which])}</span>
              </button>
            ))}
          </div>
          <BackToNotChosen
            chosen={project.reviewLevel !== null}
            setting={REVIEW_LEVEL_PANEL_WORDS.setting}
            usual={t(settingsControlWord('settings.reviewlevel', LEVEL_WORD[REVIEW_LEVEL_BEFORE_ANYBODY_CHOOSES]))}
            onPut={() => {
              pick(null)
            }}
          />
        </>
      )}
      {project === null ? null : (
        <section className="rvl-package-inspection" aria-label={t('delegation.inspection.setting')}>
          <h3>{t('delegation.inspection.setting')}</h3>
          <p>{t('delegation.inspection.settingSays')}</p>
          <div className="rvl-choices" role="group" aria-label={t('delegation.inspection.setting')}>
            {[true, false].map((enabled) => (
              <button key={String(enabled)} type="button" className="rvl-choice" aria-pressed={packageInspectionOf(project.packageInspection) === enabled} onClick={() => pickPackageInspection(enabled)}>
                <span className="rvl-word">{t(settingsControlWord('settings.reviewlevel', enabled ? 'delegation.inspection.on' : 'delegation.inspection.off'))}</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {fault === null ? null : (
        <p className="rvl-fault" role="status">
          {fault}
        </p>
      )}
    </Panel>
  )
}

const CSS = `
.rvl-where, .rvl-none { margin: 0 0 var(--pad) 0; display: flex; flex-wrap: wrap; gap: 6px; font-size: var(--fs-2); }
.rvl-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: uppercase;
}
.rvl-value { color: var(--text-2); }

.rvl-package-inspection { margin-top: var(--pad); }
.rvl-choices { display: flex; flex-wrap: wrap; gap: var(--pad); }

.rvl-choice {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
  max-width: 22rem;
  padding: var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  cursor: pointer;
  text-align: left;
}
.rvl-choice:hover { background: var(--hover); }
.rvl-choice[aria-pressed="true"] { border-color: var(--chosen-edge); color: var(--chosen-ink); background: var(--chosen-bg); box-shadow: var(--chosen-shadow); }

.rvl-word { font-size: var(--fs-2); font-weight: 600; }
.rvl-says { font-size: var(--fs-1); color: var(--text-3); }

.rvl-fault { margin: var(--pad) 0 0 0; font-size: var(--fs-2); color: var(--st-failed); }
`
