// Copyright © 2026 Zhengyang Shen
// Licensed under the MIT License. See LICENSE.
import { AddedRoleEditor } from './AddedRoleEditor.tsx'
import { BackLink } from '../components/BackLink.tsx'
import { useRoute } from '../components/router.tsx'
import { t } from '@shared/i18n.ts'
/**
 * `#/roles/new` — A ROLE CARD OF YOUR OWN, FILLED IN ON ITS OWN PAGE. Criterion P51.
 *
 * ---------------------------------------------------------------------------------------
 * WHY THIS PAGE EXISTS
 * ---------------------------------------------------------------------------------------
 *
 * A new card is added on the Role
 * cards page, the other fields are empty, and you fill them in after pressing into it. This is
 * where that press goes. It draws AddedRoleEditor, which writes an added office role, and
 * that role takes effect at once.
 *
 * ---------------------------------------------------------------------------------------
 * THE OLD PROJECT-CARD FORM IS GONE. Wave 13r round 5, the owner's decision
 * ---------------------------------------------------------------------------------------
 *
 * This file held a second form, which wrote a project `role_card` record through
 * POST /api/roles/cards. Nothing enforced such a card. That door now refuses every write and says to
 * add an office role on the Role cards page, so the form and its call went with it. The cards it
 * wrote are kept and drawn on #/roles.
 */

export function RoleCardNewPage() {
  const route = useRoute()
  const name = route.name === 'roleNew' ? route.addedRole : undefined
  return <div className="page rnc">
    <BackLink page="roles" />
    <h1 className="rnc-title">{name === undefined ? t('unlistedWords.page.roleNew') : t('addedRoles.editTitle', { name })}</h1>
    <AddedRoleEditor key={name ?? 'new'} name={name} action={route.name === 'roleNew' ? route.roleAction : undefined} />
  </div>
}
