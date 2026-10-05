import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem"
import type { Scene } from "@babylonjs/core/scene"

/**
 * Whether a particle system has nothing to animate: no particle alive, and none to be made this frame, by a count asked
 * for or by a rate. One on a clock (a stop duration, which gradients of the emit rate need too), or with something to
 * do when it ends, never is: only animating it runs the clock and ends it.
 */
function idle(system: ParticleSystem): boolean {
  if (!system.isStarted() || system.particles.length > 0) {
    return false
  }
  if (system.targetStopDuration > 0 || system.disposeOnStop || system.onAnimationEnd) {
    return false
  }
  return system.manualEmitCount > -1 ? system.manualEmitCount <= 0 : system.emitRate <= 0
}

/**
 * Pauses the scene's particle systems while they have nothing to draw. Babylon animates every started system every
 * frame, and one with no particle alive still uploads its whole vertex buffer, as large as its capacity, since it reads
 * a count of none as all of it: the shells' bursts, the flares, the tracers, and the rain and snow in dry weather sent a
 * megabyte or more a frame for nothing. Checked just before Babylon animates them, after the frame's emits, so a system
 * wakes in the frame it's given something to make; Babylon asks again as each rendering group draws its particles, to
 * no effect. Only the systems paused here are woken, so one paused by hand (from the Inspector, say) stays paused.
 */
export function pauseIdleParticles(scene: Scene): void {
  const paused = new WeakSet<ParticleSystem>()
  scene.onBeforeParticlesRenderingObservable.add(() => {
    for (const system of scene.particleSystems) {
      if (!(system instanceof ParticleSystem)) {
        continue
      }
      if (idle(system)) {
        if (!system.paused) {
          system.paused = true
          paused.add(system)
        }
      } else if (paused.delete(system)) {
        system.paused = false
      }
    }
  })
}
