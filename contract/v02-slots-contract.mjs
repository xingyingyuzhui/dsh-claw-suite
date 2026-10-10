/** 0.2.0 slot ids required by claw suite UI (confirmed on dsh-v0.2.0-rc.2). */

export const REQUIRED_SLOT_IDS = Object.freeze([
  'sidebar.panellist',
  'sidebar.workspaces.session.menu.item',
  'sidebar.workspaces.session.row.action',
  'sidebar.session.row.leading',
  'settings.section',
])

/** panellist companion main id (same slot family). */
export const PANELLIST_MAIN_ID = 'main'

export function assertRequiredSlots(registeredIds = []) {
  const set = new Set(registeredIds)
  return REQUIRED_SLOT_IDS.filter((id) => !set.has(id))
}
