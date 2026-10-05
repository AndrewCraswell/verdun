import type { HudElementFactory } from "./element.ts"
import { aimCursor } from "./elements/aim-cursor.ts"
import { bannerStrip } from "./elements/banner-strip.ts"
import { clockPanel } from "./elements/clock-panel.ts"
import { effectsList } from "./elements/effects-list.ts"
import { firePanel } from "./elements/fire-panel.ts"
import { handoverCard } from "./elements/handover-card.ts"
import { hintLine } from "./elements/hint-line.ts"
import { logFeed } from "./elements/log-feed.ts"
import { objectivesPanel } from "./elements/objectives-panel.ts"
import { orderPlate } from "./elements/order-plate.ts"
import { rosterStrip } from "./elements/roster-strip.ts"
import { screenEffects } from "./elements/screen-effects.ts"
import { soldierCard } from "./elements/soldier-card.ts"
import { strengthPanel } from "./elements/strength-panel.ts"
import { takeOverMarks } from "./elements/take-over-marks.ts"
import { throwPreviewMarks } from "./elements/throw-preview.ts"
import { warMap } from "./elements/war-map.ts"
import { wipedPanel } from "./elements/wiped-panel.ts"
import { worldMarks } from "./elements/world-marks.ts"

/**
 * Every element of the HUD, in the order each zone stacks them: the bottom-left corner from the bottom up, the
 * top-right from the top down. IDs and designs are in docs/design/interface.md.
 *
 * Each element draws only from the HUD's state (./hud-state.ts) and owns its own DOM and stylesheet, so redesigning
 * one means writing its replacement and changing its line here: nothing else moves. In a dev build,
 * `verdun.hud.swap(id, factory)` swaps one in the running game.
 */
export const HUD_ELEMENTS: readonly HudElementFactory[] = [
  // Full-screen layers: E1-E8; the war map's view as the camera pulls back; W2 and W4-W8 on the ground over it.
  screenEffects,
  warMap,
  worldMarks,
  // H9 and W7: the grenade's arc, reach and blast while the throw key is held, over every other mark.
  throwPreviewMarks,
  takeOverMarks,
  // Bottom left, from the bottom: H1, H3 and H4; H5; H6; H2 beside them.
  soldierCard,
  rosterStrip,
  orderPlate,
  effectsList,
  // Top right, from the top: H11, H12, H13.
  clockPanel,
  objectivesPanel,
  strengthPanel,
  // Top centre: H14.
  logFeed,
  // Bottom right: H10.
  firePanel,
  // Bottom centre: H18.
  hintLine,
  // The middle of the screen: H15, H16, H17.
  bannerStrip,
  handoverCard,
  wipedPanel,
  // The pointer: H8.
  aimCursor
]
