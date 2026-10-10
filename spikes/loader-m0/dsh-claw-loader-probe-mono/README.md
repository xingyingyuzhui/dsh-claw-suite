# dsh-claw-loader-probe-mono (scheme B)

One package, two Cordis rows:

| Patch `name` | Module |
|---|---|
| `dsh-claw-loader-probe-mono` | `./host.js` (root) |
| `dsh-claw-loader-probe-mono/row-a` | `./row-a` export |

For a rough **scheme C** check: keep only the root insert in a temporary patch overlay and confirm a single-row meta still activates.
