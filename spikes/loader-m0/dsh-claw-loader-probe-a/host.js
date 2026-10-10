import { writeActiveMarker, clearActiveMarker } from 'dsh-claw-loader-probe-core'

export const name = 'dsh-claw-loader-probe-a'
export const inject = []

/**
 * Minimal Cordis function plugin for Loader experiments.
 * Writes $DSH_HOME/lab/loader-m0/probe-a.active when the row reaches apply.
 */
export function apply(ctx) {
  const marker = writeActiveMarker('probe-a')
  console.log(`[dsh-claw-loader-probe-a] apply ACTIVE marker=${marker}`)
  ctx.effect(() => () => {
    clearActiveMarker('probe-a')
    console.log('[dsh-claw-loader-probe-a] dispose cleared marker')
  })
}
