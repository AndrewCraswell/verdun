import type { EntityId, Simulation, Squad } from "@verdun/sim"
import type { HudState } from "./hud-state.ts"

/**
 * The contract every HUD element keeps, so each can be redesigned and swapped on its own (see ./registry.ts). An
 * element is built once from the context, put in a zone of the screen, and redrawn from the HUD's state: it never
 * reaches into the battle itself, and nothing else reaches into it.
 */

/** Where on the screen an element lives. Zones stack their elements in registry order. */
export type HudZone =
  /** Corners and edges of the screen, each owned by one part of the HUD (docs/design/interface.md#screen-layout). */
  | "top-centre"
  | "top-right"
  | "bottom-left"
  | "bottom-centre"
  | "bottom-right"
  /** The middle of the screen: transient cards over the battle. */
  | "centre"
  /** Full-screen layers under everything else: the screen effects. */
  | "screen"
  /** Full-screen, over the battle and under the panels: marks drawn on the ground, following the camera. */
  | "world"
  /** Not on the screen at all: the pointer, for instance. */
  | "none"

/** A point on the screen, in CSS pixels from the top left. */
export interface ScreenPoint {
  readonly x: number
  readonly y: number
}

/** What elements may use besides the HUD's state: the camera's view of the ground, and the squad's own controls. */
export interface HudContext {
  /** Where a point of the battlefield is on the screen, `y` up from the ground; null behind the camera. */
  project(x: number, y: number, z: number): ScreenPoint | null
  /**
   * The angle on the screen, in radians clockwise from straight up, of a direction on the ground at a point (`x` east,
   * `z` north): north is 0 when the camera looks north. Lets compasses and arrows turn with the camera.
   */
  screenAngle(x: number, z: number, towardX: number, towardZ: number): number
  /** Height of the ground at a point, in metres. */
  heightAt(x: number, z: number): number
  /** How far the camera stands from what it looks at, in metres: the war map's view takes over as it pulls back. */
  cameraDistance(): number
  /** Whether the player's side can see a soldier now, by the fog of war's rule: enemies are drawn only if so. */
  seen(soldier: EntityId): boolean
  /** Where a soldier stands now, for marks that follow men between the HUD's redraws. */
  positionOf(soldier: EntityId): { readonly x: number; readonly z: number }
  /** Take control of a man of the squad, as the number keys do. */
  takeSoldier(soldier: EntityId): void
  /** The battlefield's canvas, for the pointer. */
  readonly canvas: HTMLCanvasElement | null
  /**
   * The battle and the player's squad: for setting up, and for what must move every frame (the war map's men).
   * Everything else elements draw comes from the HUD's state.
   */
  readonly sim: Simulation
  readonly squad: Squad
}

export interface HudElement {
  /** Stable name, for swapping it and for its CSS: "soldier-card". */
  readonly id: string
  readonly zone: HudZone
  /** Its root, put in its zone by the HUD. Null for elements with nothing on the screen. */
  readonly root: HTMLElement | SVGSVGElement | null
  /** Redraws from the HUD's state, about ten times a second. */
  update(state: HudState): void
  /** Every frame, after the battlefield is drawn: for what follows the camera or the men. Optional. */
  frame?(state: HudState, seconds: number): void
  dispose?(): void
}

/** Builds an element. The registry is a list of these. */
export type HudElementFactory = (context: HudContext) => HudElement
