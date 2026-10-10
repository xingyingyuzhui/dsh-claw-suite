export const name = 'dsh-claw-loader-probe-mono'
export const inject = []

/** Root export — scheme C can use this alone by omitting subpath rows. */
export function apply(ctx) {
  console.log('[dsh-claw-loader-probe-mono] apply (root)')
  ctx.effect(() => () => {
    console.log('[dsh-claw-loader-probe-mono] dispose (root)')
  })
}
