// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
/**
 * CHANGING AN AGENT'S NAME AND PICTURE, on the row where the agent is drawn.
 *
 * A user may change an agent's avatar and its name. So the
 * controls are here, on the roster, where a person is already looking at the agent.
 *
 * ---------------------------------------------------------------------------------------
 * A PERSON SEES THESE AND AN AGENT DOES NOT
 * ---------------------------------------------------------------------------------------
 *
 * The door refuses an agent changing a name whoever asks, and that refusal is the rule. This is the
 * page declining to draw a control it knows will be refused, which is the same thing `GET
 * /api/access` does for a route kept on this machine: the guard is on the door and the drawing
 * follows it.
 *
 * IT DOES NOT DRAW A STATE, though since criterion M21 a person may set one. Decision
 * `lUh6uis7oB6z` gave them that power, and the control for it is on the messages panel, in the header
 * of the conversation with the agent — one place, beside the line it changes. This row shows what
 * the line says and stops there.
 *
 * ---------------------------------------------------------------------------------------
 * WHETHER IT IS OPEN IS HELD ABOVE THE ROW, NOT IN HERE
 * ---------------------------------------------------------------------------------------
 *
 * A write here reloads the page that draws the row, and a reload unmounts this component and builds
 * it again — so a panel that remembered being open in its own state closed itself after every
 * write. Changing a name AND a picture is the ordinary case and it cost two presses of Edit, with
 * nothing on screen saying why the first one vanished or whether anything had been saved. Problem
 * `01gd2UhM8FSB`. The page holds which row is open and what the last write said, so both survive
 * the reload; this component reads them and asks for changes to them.
 */

import { t } from '@shared/i18n.ts'
import { useState } from 'react'
import { api, errorMessage, getActor, type ParticipantOnTheWire } from '../api.ts'
import { asBase64 } from './Appearance.tsx'
import { AvatarPicker } from './AvatarPicker.tsx'

/** The registry fields the roster row already holds. */
export interface AgentOnARow {
  id: string
  name: string
  avatarUrl: string
}

/**
 * Which row's editor is open, and what its last write said. Held by the page that draws the rows.
 *
 * ONE OPEN AT A TIME, because two open editors on one roster is two names being typed into at once
 * and only one of them being looked at. `said` belongs to whichever row is open and is cleared when
 * the editor is opened or closed, so a line saying a write landed can never outlive the panel it
 * landed in.
 */
export interface RosterEditor {
  openFor: string | null
  said: string | null
}

/** Nothing open and nothing written yet, which is where a freshly drawn page starts. */
export const NOTHING_OPEN: RosterEditor = { openFor: null, said: null }

export function AgentAppearance({
  agent,
  editor,
  onEditor,
  onChanged,
}: {
  agent: AgentOnARow
  editor: RosterEditor
  onEditor: (next: RosterEditor) => void
  onChanged: () => void
}) {
  const open = editor.openFor === agent.id
  const [name, setName] = useState(agent.name)
  const [fault, setFault] = useState<string | null>(null)

  // WRITING AS A PERSON IS WHAT THIS ASKS. An agent gets no controls, because the door would refuse
  // every one of them and a control that is always refused is worse than none.
  if (getActor().type !== 'human') return null

  const run = (what: Promise<{ participant: ParticipantOnTheWire }>, landed: string): void => {
    setFault(null)
    void what
      .then(() => {
        // THE PANEL STAYS OPEN AND SAYS WHAT LANDED, in that order: `onChanged` reloads the page
        // and rebuilds this component, so the page has to be told before it is asked to redraw.
        onEditor({ openFor: agent.id, said: landed })
        onChanged()
      })
      .catch((err: unknown) => setFault(errorMessage(err)))
  }

  return (
    <div className="agap" data-open={open ? 'yes' : undefined}>
      <style href="mole-office-agent-appearance" precedence="default">
        {CSS}
      </style>
      <button
        type="button"
        className="agap-toggle"
        aria-expanded={open}
        onClick={() => onEditor(open ? NOTHING_OPEN : { openFor: agent.id, said: null })}
      >
        {open ? t('g6a.appearance.done') : t('g6a.appearance.edit')}
      </button>
      {!open ? null : (
        <div className="agap-body">
          <label className="agap-field">
            <span className="agap-label">{t('g6a.appearance.name')}</span>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => {
                if (name.trim() !== '' && name !== agent.name) {
                  run(api.changeParticipant('agent', agent.id, { name }), t('g6a.appearance.nameStored'))
                }
              }}
            />
          </label>
          <div className="agap-row">
            <label className="agap-file">
              <span>{t('g6a.appearance.picture')}</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file === undefined) return
                  void asBase64(file).then((bytes) =>
                    run(api.sendAvatar('agent', agent.id, { bytes }), t('g6a.appearance.pictureStored')),
                  )
                }}
              />
            </label>
            {/* THE PRESS THAT UNCHOOSES, and it names the act rather than a picture. It said "Use
                the drawn one" and answered "Drawn picture chosen." until 6 September; criterion M53
                makes chill-bee what anybody with no picture is given, so the press no longer ends at
                a drawing and neither words could stay. The same rename is on the picker below, in
                `PICKER_WORDS`. */}
            <button
              type="button"
              onClick={() => run(api.sendAvatar('agent', agent.id, { reset: true }), t('g6a.appearance.pictureReset'))}
            >
              {t('g6a.appearance.reset')}</button>
          </div>
          {/* AND THE PICTURES THIS PRODUCT ALREADY HAS, so choosing one is a press rather than a
              trip to a file manager. Criterion M30. The file input above stays: a picture of their
              own is still theirs to send, and this offers the set beside it rather than in place of
              it. */}
          <AvatarPicker
            kind="agent"
            id={agent.id}
            name={agent.name}
            onStored={() => {
              onEditor({ openFor: agent.id, said: t('g6a.appearance.pictureStored') })
              onChanged()
            }}
          />
          {/* WHAT LANDED, IN TWO WORDS. A write used to close this panel and say nothing, which
              reads as something having gone wrong. */}
          {editor.said === null ? null : (
            <p className="agap-said" role="status">
              {editor.said}
            </p>
          )}
          {fault === null ? null : (
            <p className="agap-fault" role="status">
              {fault}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const CSS = `
.agap { margin-left: auto; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }

.agap button, .agap-file {
  min-height: 28px;
  padding: 0 var(--pad);
  display: inline-flex;
  align-items: center;
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text-2);
  font-size: var(--fs-1);
  font-weight: 600;
  cursor: pointer;
}
.agap button:hover, .agap-file:hover { background: var(--hover); }

.agap-body { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }

/* THE OPEN EDITOR TAKES A LINE OF ITS OWN, and everything in it reads from the left.
   Closed, this is a single Edit button and it belongs at the end of the agent's row. Open, it
   holds a name, two presses and fifty pictures to choose between, and squeezing that into whatever
   is left of a row after a long agent name gave one column of pictures a hundred pixels wide at
   390. The row above wraps, so a full-width child gets a line to itself. */
.agap[data-open="yes"] { flex: 1 1 100%; margin-left: 0; align-items: stretch; }
.agap[data-open="yes"] .agap-toggle { align-self: flex-end; }
.agap[data-open="yes"] .agap-body { align-items: stretch; }
.agap[data-open="yes"] .agap-field { align-items: flex-start; }
.agap[data-open="yes"] .agap-row { justify-content: flex-start; }
.agap[data-open="yes"] .agap-said, .agap[data-open="yes"] .agap-fault { text-align: left; }

.agap-field { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }

.agap-label {
  font-size: var(--fs-1);
  font-weight: 600;
  color: var(--text-3);
  letter-spacing: .06em;
  text-transform: var(--section-case);
}

.agap-field input[type="text"] {
  width: min(100%, 16rem);
  min-height: 28px;
  padding: 0 var(--pad);
  border: var(--border-w) solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--panel);
  color: var(--text);
  font-size: var(--fs-2);
}

.agap-row { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }

.agap-file input[type="file"] {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.agap-said {
  margin: 0;
  font-size: var(--fs-1);
  color: var(--text-3);
  text-align: right;
}

.agap-fault {
  margin: 0;
  max-width: 20rem;
  font-size: var(--fs-2);
  line-height: var(--lh-tight);
  color: var(--st-failed);
  text-align: right;
}
`
