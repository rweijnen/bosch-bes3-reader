# docs/

`ebike_live_data.proto` is a verbatim copy of Bosch eBike Systems' official
**Live Data Interface** specification (smart system control unit v19+,
published 2026-05-01), vendored here under the Apache-2.0 license Bosch
attached to that exact file. It defines a small, purpose-built BLE GATT
service (`0000eb20-eaa2-11e9-81b4-2a2ae2dbcce4`) that any accessory can read
without an account, license, or partnership agreement — see the source PDF's
Terms of Use ("fully public and open basis... no specific keys or other
technical barriers required").

This is implemented in `web/transport-webble.js` and is a genuinely
different thing from the rest of this repo's read path:

|  | Official Live Data Interface | This repo's MessageBus reads |
|---|---|---|
| Transport | BLE only | USB today; BLE planned |
| Sanctioned by Bosch | Yes, explicitly, in writing | No — reverse-engineered |
| Fields | ~13: speed, cadence, rider power, SoC, odometer, lock/charger/light state | ~370 across 8 components |
| Battery health (SoH), cycle count, serials, tuning-detection, region config | Not present | Present |

The official interface is great for what it's built for (ride telemetry for
accessories like bike computers). It deliberately does not expose the
health/diagnostic data an owner or independent repair shop needs to decide
whether a battery is worth keeping — which is exactly the gap the rest of
this repo's protocol work fills. See the main README's "Why this exists"
section.
