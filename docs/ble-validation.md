# BLE MCSP Validation Gate A

Gate A is preparation for a future read-only BLE MCSP validation pass. It does
not include hardware validation, Bluetooth connection attempts, data export,
publishing, or claims that the BLE MCSP path is validated.

## Scope

Gate A permits deterministic local tests and pure helper logic only:

- MCSP segmentation encode/decode coverage.
- Bounded per-channel reassembly for fragmented notifications.
- USB-adapter address translation from BLE source `0x4180` while preserving the
  destination status MSB.
- MobileApp peer startup behavior needed for the bike's own control/startup
  exchange: READ `0x40AA` and WRITE `0x40A9`.
- A read-only outbound validation allowlist prepared for a later gate, with
  bike-originated startup requests classified separately.

No Gate A task connects to Bluetooth, accesses a bike, opens a pull request,
publishes artifacts, or uploads captures.

## Privacy

BLE MCSP logs must avoid device identifiers. Device `id` and `name` are not
logged; selection is recorded generically.

Frame payload logging defaults off. MessageBus payloads are not assumed safe for
public output. Identification-oriented payloads and malformed or unknown
MessageBus payloads are omitted from public log data. Export remains a manual,
local browser action only; there is no automatic export or upload.

## Validation Gates

Gate A, local preparation:

- Unit tests with deterministic fake transport inputs.
- No hardware access.
- No write/RPC validation against a bike.
- No evidence claims beyond code behavior exercised by tests.

Gate B, future dry-run review:

- Review exact planned operations against the allowlist.
- Confirm no MessageBus write/RPC operations are scheduled.
- Confirm privacy handling before any capture is created.

Gate C, future hardware validation:

- Requires separate explicit approval.
- Must use only the approved read-only operation set.
- Must record categorical outcomes without raw identification payloads.

## Categorical Evidence Format

Future hardware notes should record categories rather than raw private data:

- `operation`: symbolic name and address, for example
  `DriveUnit.MAXIMUM_ASSISTANCE_SPEED 0x1817 READ`.
- `result`: `success`, `declined`, `timeout`, `malformed`, or `transport-error`.
- `status`: MessageBus status name if an explicit status byte is present.
- `shape`: payload class only, such as `empty`, `varint`, `fixed32`,
  `length-delimited`, or `unknown-omitted`.
- `privacy`: `payload-omitted` unless the value is already non-identifying and
  explicitly safe for public output.

Do not include device names, device IDs, MAC addresses, serial numbers, rider
names, account identifiers, raw captures, or long hex blobs in public evidence.

## Read-Only Allowlist

The outbound preparation helper allows only:

- Required MCSP control negotiation commands.
- READ operations for `0x1817`, `0x1842`, `0x187D`, and ephemeral current-assist
  READ `0x181E` (`DriveUnit.PRESENT_ASSIST_FACTOR`).

Bike-originated startup requests for READ `0x40AA` and WRITE `0x40A9`, plus the
MobileApp responses correlated to those requests, are classified separately.
They do not make arbitrary outbound MessageBus writes valid.

All other MessageBus writes and RPCs are blocked by default, including WRITE
`0x1842`, RPC `0x1093`, and reset-like writes.
