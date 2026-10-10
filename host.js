export const name = 'dsh-claw-suite'
export const inject = []

/** Meta suite Host — presence proves the meta package itself loaded. Components apply via their own rows. */
export function apply(ctx) {
  if (ctx.logger && typeof ctx.logger.info === 'function') {
    ctx.logger.info('[dsh-claw-suite] meta apply (scheme A)')
  }
  ctx.effect(() => () => {})
}
