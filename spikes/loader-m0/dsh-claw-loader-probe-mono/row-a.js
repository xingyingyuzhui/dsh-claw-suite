import { writeActiveMarker, clearActiveMarker } from 'dsh-claw-loader-probe-core'

export const name = 'dsh-claw-loader-probe-mono/row-a'
export const inject = []

/** Subpath export used by scheme B patch row `name: dsh-claw-loader-probe-mono/row-a`. */
export function apply(ctx) {
  const marker = writeActiveMarker('probe-a')
  console.log(`[dsh-claw-loader-probe-mono/row-a] apply ACTIVE marker=${marker}`)
  ctx.effect(() => () => {
    clearActiveMarker('probe-a')
    console.log('[dsh-claw-loader-probe-mono/row-a] dispose cleared marker')
  })
}
