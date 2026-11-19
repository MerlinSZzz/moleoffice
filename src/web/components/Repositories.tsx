// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * THE WAY IN: REGISTERING THE TREE A STATED PATH IS RELATIVE TO.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT THIS IS FOR, AND THE FAULT IT CLOSES
 * ---------------------------------------------------------------------------------------
 *
 * Wave 6 built four tables, twelve routes, two resolvers and a governance guard, and wave 6's own
 * verifier then opened the panel on a copy of the owner's corpus and found it empty. Its words:
 * *"On the owner's own corpus, wave 6 draws nothing, and nothing in the product can change that."*
 * `repositories` held no rows, and every route that could write one was reachable only with `curl`.
 *
 * A repository is the tree a path is relative to. `src/server/lib/records.ts` is a different file
 * in every checkout on this machine, so until one repository is registered, every pattern anybody
 * writes has nothing to be relative to and every Module, Block and Pipeline page draws its empty
 * state. THIS PANEL IS THE FIRST ROW.
 *
 * ---------------------------------------------------------------------------------------
 * WHY IT IS IN SETTINGS AND NOT ON A RECORD PAGE
 * ---------------------------------------------------------------------------------------
 *
 * `design/round-ten/design/implementation-map.md` §9.4: *"In Settings, beside the other
 * machine-level panels, because registering a repository is configuration and not project work."*
 * `settings-and-governance.md` gives it the sixth row of this page's layout, quiet, holding *"name,
 * folder on this machine, last scanned, files, rebuild"*. Those five are what it draws.
 *
 * ---------------------------------------------------------------------------------------
 * THE WORDS, WHICH ARE THE DESIGN'S AND NOT THE MACHINERY'S
 * ---------------------------------------------------------------------------------------
 *
 * §9.4 again, applying the Remote Access panel's rule to this one: *"the words are repository,
 * folder on this machine, last scanned, files. Not checkout, not root, not index."* So the column
 * that the database calls `root` is drawn as *folder on this machine*, and the scan's own stamp is
 * drawn as *last scanned*. `Register` and `Scan now` are the two acts.
 *
 * ---------------------------------------------------------------------------------------
 * THE ONE PANEL ON THIS PAGE THAT IS NOT ABOUT THIS BROWSER
 * ---------------------------------------------------------------------------------------
 *
 * Every other panel on Settings is remembered in this browser and applies to every project. A
 * repository is a row on the Mole Office computer and it belongs to ONE project, so the panel says
 * which project above its own title. Without that the page's own opening line — *"These settings
 * are remembered in this browser. They apply to every project."* — would be false of the panel
 * below it, and a reader would have no way to know.
 *
 * ---------------------------------------------------------------------------------------
 * WHAT IT DOES NOT DO, EACH WITH ITS REASON
 * ---------------------------------------------------------------------------------------
 *
 * RE-POINT AND FORGET LANDED IN WAVE 14, WHICH IS WHERE WAVE 6 SAID THEY WOULD. Wave 6's own
 * header said building the press for either here would be building wave 14's panel early; wave 14
 * is the panel, so they are here. Both are behind a press and both ask again before they run,
 * because re-pointing a root is the highest-consequence write in this design — it changes what
 * every stated pattern in that repository resolves against and it drops everything derived from
 * the old tree — and forgetting one is not undoable from this page. The reply says how much was
 * dropped AFTER the fact rather than this panel guessing it before, which is the same rule the
 * scan follows: the server's own count, in the server's own sentence.
 *
 * NO SCAN ON REGISTER. Two acts, and the reply says why: a scan started by a write would make the
 * index's own date mean *when somebody last saved a form*.
 *
 * NO CHECK OF THE NAME OR THE FOLDER IN THIS FILE. `registerRepository` refuses a duplicate name
 * and names the other row; `checkedRoot` refuses a path that is not a directory and names the
 * value. A second copy of either rule here is the same rule in two places, which is this
 * repository's own recurring defect. A refusal is drawn as the server's own sentence.
 */
import { settingsControlWord } from '@shared/settings-declaration.ts'
import { useState } from 'react'

import type { RepositoriesReply, RepositoryOut } from '../../server/api/implementation.ts'
import { content, t } from '@shared/i18n.ts'
import { faultOf, api, errorMessage } from '../api.ts'
import { useLanguage } from '../lib/language.ts'
import { projectName } from '../lib/projects.ts'
import { currentWorkspace } from '../lib/workspace.ts'
import { TieredPress } from './TieredPress.tsx'
import { Absence, Btn, ErrorNote, Explain, Field, Loading, Panel, ServerNote, TextArea, TextInput } from './ui.tsx'
import { useProjectAsync } from '../lib/project-async.ts'

/**
 * One repository: its name, the folder on this machine, when it was last scanned, how many files.
 *
 * A FOLDER THAT IS NOT HERE IS DRAWN AS AN ABSENCE AND NOT AS AN ERROR. §9.4: a project implemented
 * on four repositories and read on a laptop holding two is normal. Somebody looked and there is
 * none, so the absence says so — which is a different fact from nobody having scanned it, and the
 * two are drawn as different absences on the same row.
 */
export function OneRepository({
  repository,
  scanning,
  onScan,
  onChanged,
}: {
  repository: RepositoryOut
  scanning: string | null
  onScan: (id: string) => void
  onChanged: () => void
}) {
  useLanguage()
  // Whether the re-point form is open. Forgetting asks its own question through `TieredPress`.
  const [doing, setDoing] = useState<'repoint' | null>(null)
  const [root, setRoot] = useState(repository.root ?? '')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [said, setSaid] = useState<string | null>(null)

  // FORGETTING ASKS FIRST, naming the repository in the quote. A refusal is
  // thrown to the question, which draws the server's own sentence and keeps the question open.
  async function forget(): Promise<void> {
    const reply = await api.forgetRepository(repository.id)
    setRefused(null)
    setSaid(reply.note)
    setDoing(null)
    onChanged()
  }

  async function run(): Promise<void> {
    setBusy(true)
    setRefused(null)
    try {
      const reply = await api.repointRepository(repository.id, { root: root.trim() === '' ? null : root.trim() })
      setSaid(reply.note)
      setDoing(null)
      onChanged()
    } catch (err) {
      // THE SERVER'S OWN SENTENCE. Forgetting one that still holds relationships somebody stated is
      // refused with the count and the route that lists them; a folder that is not a directory is
      // refused by name. Rewording either here would be a second copy of a rule that lives once.
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="repos-row">
      <div className="repos-head">
        <span className="repos-name">{content(repository.name)}</span>
        {repository.hasRoot ? (
          <Btn
            size="sm"
            variant="ghost"
            pending={scanning === repository.id}
            onClick={() => onScan(repository.id)}
            title={t('settingsPanel.repos.scanSays')}
          >
            {t(settingsControlWord('settings.repositories', 'settingsPanel.repos.scanNow'))}
          </Btn>
        ) : null}
      </div>
      <dl className="repos-facts">
        <dt className="repos-key">{t(settingsControlWord('settings.repositories', 'settingsPanel.repos.folder'))}</dt>
        <dd className="repos-val">
          {repository.root === null ? (
            <Absence
              tier="told-apart"
              looked
              word={t('settingsPanel.repos.noneHere')}
              title={t('settingsPanel.repos.noneHereSays')}
            />
          ) : (
            <code className="wrap-anywhere">{content(repository.root)}</code>
          )}
        </dd>

        <dt className="repos-key">{t('settingsPanel.repos.lastScanned')}</dt>
        <dd className="repos-val">
          {repository.builtAt === null ? (
            <Absence
              tier="told-apart"
              looked={false}
              word={t('settingsPanel.repos.never')}
              title={t('settingsPanel.repos.neverSays')}
            />
          ) : (
            <span className="repos-when">{content(repository.builtAt)}</span>
          )}
        </dd>

        <dt className="repos-key">{t('settingsPanel.repos.files')}</dt>
        <dd className="repos-val">
          {repository.builtAt === null ? (
            <Absence
              tier="told-apart"
              looked={false}
              word={t('settingsPanel.repos.notCounted')}
              title={t('settingsPanel.repos.notCountedSays')}
            />
          ) : (
            <span className="repos-count num">{repository.fileCount}</span>
          )}
        </dd>
      </dl>
      {repository.note === null ? null : <p className="repos-note">{content(repository.note)}</p>}

      {/* THE TWO ACTS WAVE 6 HANDED TO THIS WAVE. They are drawn at rest as two quiet presses
          rather than hidden behind a fold: an act that exists and has no door on a screen is the
          fault this whole panel was built to close, and putting it behind a fold is the same fault
          one layer down. Re-pointing opens its form; forgetting asks its question. Neither runs from the
          first press. */}
      <div className="repos-acts">
        <Btn size="sm" variant="ghost" onClick={() => setDoing(doing === 'repoint' ? null : 'repoint')}
          title={t('settingsPanel.repos.repointSays')}>
          {t(settingsControlWord('settings.repositories', 'settingsPanel.repos.repoint'))}
        </Btn>
        <TieredPress tier="confirm" size="sm" press={t(settingsControlWord('settings.repositories', 'settingsPanel.repos.forget'))} pending={t('settingsPanel.repos.forgetting')}
          question={t('settingsPanel.repos.forgetQuestion')} quote={content(repository.name)}
          warning={t('settingsPanel.repos.forgetWarning')} cancel={t('settingsPanel.repos.keep')}
          onPress={forget} />
      </div>

      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('settingsPanel.repos.notChanged')} />}
      {said === null ? null : <ServerNote text={said} />}

      {doing === 'repoint' ? (
        <div className="repos-form">
          <Field label={t(settingsControlWord('settings.repositories', 'settingsPanel.repos.folder'))}>
            <TextInput value={root} onChange={setRoot} placeholder={t('settingsPanel.repos.somewhere')} />
          </Field>
          {/* WHAT IT COSTS, BEFORE THE PRESS. Behind a fold rather than beside the button: the
              press already says what it does, and a paragraph over every control is the shape the
              UX contract calls a failed fix. The fold's own line is the consequence in four words
              and opening it is the whole of it. */}
          <Explain declares={{ surface: null }} meaning={t('settingsPanel.repos.whatDrops')} opens={t('settingsPanel.repos.consequence')}>
            <p>{t('settingsPanel.repos.dropsSays')}</p>
          </Explain>
          <div className="repos-acts">
            <Btn size="sm" variant="primary" pending={busy} onClick={() => void run()}>
              {t(settingsControlWord('settings.repositories', 'settingsPanel.repos.pointThere'))}
            </Btn>
            <Btn size="sm" variant="ghost" onClick={() => setDoing(null)}>
              {t('settingsPanel.repos.leave')}
            </Btn>
          </div>
        </div>
      ) : null}
    </li>
  )
}

/**
 * THE FORM, WHICH IS OPEN AT REST WHEN THERE IS NOTHING ELSE IN THE PANEL.
 *
 * A project with no repository has exactly one thing to do here, and putting that one thing behind
 * a press is the shape of the fault this panel exists to close: the act existed and nothing on a
 * screen led to it. Once a row exists the form goes behind `Add a repository`, because then the
 * panel's job is to say what is registered and the form is the rarer act.
 */
function RegisterForm({ onRegistered }: { onRegistered: () => void }) {
  useLanguage()
  const [name, setName] = useState('')
  const [root, setRoot] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)

  async function register(): Promise<void> {
    setBusy(true)
    setRefused(null)
    try {
      await api.registerRepository({
        name,
        root: root.trim() === '' ? null : root,
        note: note.trim() === '' ? null : note,
      })
      setName('')
      setRoot('')
      setNote('')
      onRegistered()
    } catch (err) {
      // THE SERVER'S OWN SENTENCE. A duplicate name, a path that is not a directory, an empty name
      // — each has a refusal written where the rule is, and rewording it here would be a second
      // copy of a rule that lives in one place.
      setRefused({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="repos-form">
      {refused === null ? null : <ErrorNote message={refused.message} fault={refused.fault} label={t('settingsPanel.repos.notRegistered')} />}
      <Field label={t(settingsControlWord('settings.repositories', 'settingsPanel.repos.name'))}>
        <TextInput
          value={name}
          onChange={setName}
          placeholder={t('settingsPanel.repos.namePlaceholder')}
        />
      </Field>
      {/* THE PLACEHOLDER IS THE PATH ALONE. It used to carry what leaving the box empty MEANS, and a
          390px photograph from `node tools/review.mjs` showed it cut off just after the path. A
          placeholder is the wrong home for a meaning anyway: it disappears the moment somebody types. That the answer may be left out is carried by the
          `optional` mark beside the label, and what an empty box MEANS is on the row it produces —
          "Folder on this machine · none here" — which is where a reader meets the question again. */}
      <Field label={t(settingsControlWord('settings.repositories', 'settingsPanel.repos.folder'))} optional>
        <TextInput
          value={root}
          onChange={setRoot}
          mono
          placeholder={t('settingsPanel.repos.folderPlaceholder')}
        />
      </Field>
      <Field label={t(settingsControlWord('settings.repositories', 'settingsPanel.repos.holds'))} optional>
        <TextArea value={note} onChange={setNote} rows={2} placeholder={t('settingsPanel.repos.holdsPlaceholder')} />
      </Field>
      <div className="repos-acts">
        <Btn
          variant="primary"
          pending={busy}
          disabled={name.trim() === ''}
          reason={t('settingsPanel.repos.needsName')}
          onClick={() => void register()}
        >
          {t(settingsControlWord('settings.repositories', 'settingsPanel.repos.register'))}
        </Btn>
      </div>
    </div>
  )
}

/**
 * THE PANEL SETTINGS MOUNTS.
 *
 * It is rank 2, quiet, per `settings-and-governance.md`: on a one-repository installation it is the
 * least interesting thing on the page. It is quiet and it is never hidden — the whole fault was a
 * capability that existed and had no way to it.
 */
export function RepositoriesPanel() {
  useLanguage()
  const [reading, reload] = useProjectAsync(() => api.repositories(), [])
  const [adding, setAdding] = useState(false)
  const [scanning, setScanning] = useState<string | null>(null)
  const [scanFailed, setScanFailed] = useState<{ message: string; fault: ReturnType<typeof faultOf> } | null>(null)
  const [scanned, setScanned] = useState<string | null>(null)

  async function scan(id: string): Promise<void> {
    setScanning(id)
    setScanFailed(null)
    setScanned(null)
    try {
      const done = await api.rebuildRepositories(id)
      setScanned(done.note)
      reload()
    } catch (err) {
      setScanFailed({ message: errorMessage(err), fault: faultOf(err) })
    } finally {
      setScanning(null)
    }
  }

  const held = reading.status === 'ready' ? reading.value.repositories : []
  const project = currentWorkspace()

  return (
    <Panel titleIs="label"
      declares={{ surface: 'settings.repositories' }}
      rank={2}
      title={t('settingsPanel.title.repositories')}
      // WHICH PROJECT THESE BELONG TO. Every other panel on this page is about this browser and
      // applies to every project; this one is a row on the Mole Office computer, in one project, and the
      // page's own opening line would be false of it if the panel did not say so.
      kind={t('settingsPanel.repos.inProject', { project: content(projectName(project)) })}
      actions={
        held.length === 0 ? undefined : (
          <Btn size="sm" variant="ghost" onClick={() => setAdding(!adding)}>
            {adding ? t(settingsControlWord('settings.repositories', 'settingsPanel.repos.cancel')) : t(settingsControlWord('settings.repositories', 'settingsPanel.repos.add'))}
          </Btn>
        )
      }
    >
      <style href="mole-office-repositories" precedence="default">
        {REPOSITORIES_CSS}
      </style>

      {scanFailed === null ? null : <ErrorNote message={scanFailed.message} fault={scanFailed.fault} label={t('settingsPanel.repos.notScanned')} />}
      {scanned === null ? null : <ServerNote text={scanned} />}

      {reading.status === 'loading' ? (
        <Loading label={t('settingsPanel.repos.what')} rows={2} />
      ) : reading.status === 'error' ? (
        <ErrorNote message={reading.message} fault={reading.fault} retry={reload} />
      ) : (
        <RepositoriesRead
          reply={reading.value}
          adding={adding}
          scanning={scanning}
          onScan={(id) => void scan(id)}
          onRegistered={() => {
            setAdding(false)
            reload()
          }}
        />
      )}
    </Panel>
  )
}

/**
 * EVERYTHING THE PANEL DRAWS ONCE THE READ HAS LANDED, WITH NOTHING FETCHING INSIDE IT.
 *
 * SPLIT OUT SO IT CAN BE RENDERED FROM A REPLY, for the reason `Implementation.tsx` gives beside
 * its own split: `useAsync` runs in an effect and `renderToStaticMarkup` does not run effects, so a
 * test of the whole panel could only ever photograph its loading state. The shell above owns the
 * request; this draws the rows, and `tests/registering-a-repository.test.ts` hands it replies the
 * route really produced.
 */
export function RepositoriesRead({
  reply,
  adding,
  scanning,
  onScan,
  onRegistered,
}: {
  reply: RepositoriesReply
  adding: boolean
  scanning: string | null
  onScan: (id: string) => void
  onRegistered: () => void
}) {
  const held = reply.repositories
  return (
    <>
      {held.length === 0 ? null : (
        <ul className="repos-list">
          {held.map((repository) => (
            <OneRepository key={repository.id} repository={repository} scanning={scanning} onScan={onScan} onChanged={onRegistered} />
          ))}
        </ul>
      )}
      {/* THE FORM IS OPEN AT REST WHEN THE PROJECT HOLDS NONE. A project with no repository has
          exactly one thing to do here, and putting that one thing behind a press is the shape of
          the fault this panel closes: the act existed and nothing on a screen led to it. */}
      {held.length === 0 || adding ? <RegisterForm onRegistered={onRegistered} /> : null}
      <ServerNote text={reply.note} />
    </>
  )
}

const REPOSITORIES_CSS = `
.repos-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.repos-row { border-top: 1px solid var(--edge); padding-top: 10px; }
.repos-row:first-child { border-top: 0; padding-top: 0; }
.repos-head { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
.repos-name { font-weight: 600; }
/* The three facts as pairs, so a narrow screen stacks them instead of truncating a path. */
.repos-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px 12px; margin: 6px 0 0; }
.repos-key { color: var(--ink-3); font-size: 0.82rem; }
.repos-val { margin: 0; min-width: 0; }
.repos-when, .repos-count { font-variant-numeric: tabular-nums; }
/* What a repository holds may run over several lines, so its line breaks are kept. */
.repos-note { color: var(--ink-3); font-size: 0.86rem; margin: 6px 0 0; white-space: pre-wrap; }
.repos-acts { display: flex; flex-wrap: wrap; gap: var(--pad); margin: var(--pad) 0 0; min-width: 0; }
.repos-warn { margin: 0; max-width: var(--measure-in-box); font-size: var(--fs-2); line-height: var(--lh-body); color: var(--text-2); overflow-wrap: anywhere; }
.repos-form { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
.repos-acts { display: flex; gap: 8px; flex-wrap: wrap; }
@media (max-width: 40rem) {
  .repos-facts { grid-template-columns: minmax(0, 1fr); gap: 0 0; }
  .repos-key { margin-top: 6px; }
}
`
