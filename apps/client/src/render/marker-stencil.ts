import { Constants } from "@babylonjs/core/Engines/constants"
import type { Material } from "@babylonjs/core/Materials/material"

/**
 * The squad's markers (control/soldier-marker.ts) are drawn last, over the battlefield, so a man's ring shows round his
 * feet down in a trench, where its walls would hide most of it. Over the battlefield, but not over the men: the
 * soldiers write this value to the stencil buffer wherever they're drawn in front, and the markers draw only where it
 * isn't, so they go round a man and behind him, never across him.
 */
const SOLDIER_STENCIL = 1

/** Marks where a material draws in front of everything else as a soldier, for the markers to keep off. */
export function marksSoldier(material: Material): void {
  const { stencil } = material
  stencil.enabled = true
  stencil.func = Constants.ALWAYS
  stencil.funcRef = SOLDIER_STENCIL
  stencil.opStencilDepthPass = Constants.REPLACE
  stencil.mask = 0xff
}

/** Keeps a marker's material off the soldiers: it draws only where no soldier was drawn in front. */
export function keepsOffSoldiers(material: Material): void {
  const { stencil } = material
  stencil.enabled = true
  stencil.func = Constants.NOTEQUAL
  stencil.funcRef = SOLDIER_STENCIL
  stencil.funcMask = 0xff
  stencil.opStencilDepthPass = Constants.KEEP
  stencil.mask = 0x00
}
