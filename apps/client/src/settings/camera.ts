import { browserStorage, createSettings, type Settings, type SettingsStorage, within } from "./store.ts"

/** The camera settings from the options screen (S3 in docs/design/interface.md, Controls). Apply at once. */
export interface CameraSettings {
  /** Whether the pointer resting at a screen edge pans the view. */
  readonly edgePan: boolean
  /** Panning speed, keys and edges, as a multiple of the usual, from 0.5 to 2. */
  readonly panSpeed: number
  /** Middle-drag turns and tilts the other way. */
  readonly invertDrag: boolean
}

export const DEFAULT_CAMERA: CameraSettings = { edgePan: true, panSpeed: 1, invertDrag: false }

export function readCamera(stored: unknown): CameraSettings {
  if (typeof stored !== "object" || stored === null) {
    return DEFAULT_CAMERA
  }
  const record: Partial<Record<keyof CameraSettings, unknown>> = stored
  return {
    edgePan: typeof record.edgePan === "boolean" ? record.edgePan : DEFAULT_CAMERA.edgePan,
    panSpeed: within(record.panSpeed, DEFAULT_CAMERA.panSpeed, 0.5, 2),
    invertDrag: typeof record.invertDrag === "boolean" ? record.invertDrag : DEFAULT_CAMERA.invertDrag
  }
}

export function createCameraSettings(storage: SettingsStorage | null): Settings<CameraSettings> {
  return createSettings("verdun.camera", readCamera, storage)
}

let shared: Settings<CameraSettings> | null = null

/** The page's camera settings, kept in the browser: what the camera and the options screen both use. */
export function cameraSettings(): Settings<CameraSettings> {
  shared ??= createCameraSettings(browserStorage())
  return shared
}
