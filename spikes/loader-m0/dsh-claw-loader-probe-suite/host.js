export const name = 'dsh-claw-loader-probe-suite'
export const inject = []

/** Meta suite Host — presence proves the meta package itself loaded. */
export function apply(ctx) {
  console.log('[dsh-claw-loader-probe-suite] apply (scheme A meta)')
  ctx.effect(() => () => {
    console.log('[dsh-claw-loader-probe-suite] dispose')
  })
}
