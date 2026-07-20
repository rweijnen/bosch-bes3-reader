# Bosch Smart System (BES3) Component Reader

A diagnostic tool for Bosch Smart System eBikes (2022+ "BES3" platform,
USB-C direct connection to the drive unit's system controller). Reads
identification and status data across every component — drive unit, both
battery slots, remote control, head unit, connect module, ABS — serial
numbers, product codes, hardware/software versions, speed limits, region
configuration, and more, over USB. Almost everything here is read-only; the
deliberate exceptions are a handful of narrow, opt-in repair/preference
actions — see [Scope](#scope-mostly-read-only-a-few-deliberate-exceptions) below.

Two identical implementations sharing the same protocol code:

- **`web/`** — runs entirely in the browser via [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API). No install, no server, nothing leaves your machine. Open `index.html` in Chrome/Edge (desktop only — WebUSB isn't available on iOS/Safari).
- **`node/`** — a CLI using the [`usb`](https://www.npmjs.com/package/usb) package (libusb), for scripting/automation.

`src/addresses.js`, `src/protocol.js`, and `src/messageTypes.js` are the
shared, transport-agnostic core (per-component address table, frame
encoding/decoding, typed value decoding) — the exact same files are loaded by
both the browser page and the Node CLI. Only the USB transport differs per
platform (`node/transport-node-usb.js` vs `web/transport-webusb.js`).

Fields with a confirmed wire type (see `src/messageTypes.js`) are decoded
precisely — e.g. `REGIO_SPEED_CONFIGURATION` resolves to a named region/speed
class ("Europe, 45 km/h (S-Pedelec class)"), not just a raw number. Everything
else falls back to a generic best-effort guess (clearly marked as such, never
presented as exact).

## Why this exists

Bosch publishes an official, freely-licensed [Live Data
Interface](docs/ebike_live_data.proto) (smart system control unit v19+,
Apache-2.0) — a small BLE service any accessory can read with no account or
license required. It's a good, sanctioned way to get ride telemetry (speed,
cadence, power, SoC, odometer, lock/light/charger state) into a bike
computer or watch.

It deliberately does **not** expose the data an owner or independent repair
shop needs to make a repair-vs-replace call: battery **State of Health**,
charge-cycle count, remaining Wh capacity, serials, hardware/software
versions, tuning-detection status. That data only exists behind the fuller
diagnostic protocol this repo implements. In an era where right-to-repair
and reducing e-waste actually matter, being able to check whether *your own*
battery is worth keeping shouldn't require a dealer visit. See
[`docs/README.md`](docs/README.md) for a full comparison.

## Scope: mostly read-only, a few deliberate exceptions

This tool issues **read** requests only, with a small number of narrow,
opt-in exceptions, each behind its own explicit button and confirmation:

- A **"reset to default"** button per assist mode (shown once its settings
  have been read), which resets that one mode's assist level, max speed, and
  acceleration response back to Bosch's factory defaults.
- An **"always start in last-used mode"** button (shown only if the bike is
  currently set to always power on in off/walk mode), which sets one
  setting so the bike resumes whichever assist mode you were last using.

Nothing else is ever written — no tuning, no speed-limit/region changes, no
licensing or authorization systems some commercial services touch. Every
read is the same class of identification data that's visible in your bike's
own display and app — nothing that isn't already exposed to the bike's owner.

The reset action exists because it's exactly what fixed a real
corrupted-assist-mode fault (crash on opening a mode's settings, no assist
in any mode) on the maintainer's own bike — and it's the *same* operation
the official Bosch Flow app's own "Reset" button performs on a mode's
detail screen (confirmed by decompiling Flow: identical RPC, identical
argument, no dealer/HSM gate — a plain consumer-tier feature, not something
this tool works around or bypasses). The start-mode setting is the same
story: a plain `ReadableWritableSubscribableDataPoint`, no dealer/HSM gate,
confirmed writable at the protocol level with no UI in Flow to change it.
Neither action ever runs automatically — both are behind an explicit
button click and a confirmation dialog explaining exactly what it does,
every time.

## Usage

### Browser
**Live at [remkoweijnen.nl/bosch-bes3-reader](https://remkoweijnen.nl/bosch-bes3-reader/)**
— just open it in Chrome/Edge, plug in your bike via USB-C, click **Connect &
Read**. Or run `index.html` locally the same way.

### Node CLI
```bash
cd node
npm install
node cli.js
```

## Bike photo

The dashboard shows the bike's stock photo and brand/model when it recognizes
the GTIN reported by `OEM_BIKE_MODEL_ID`. This uses a small static lookup
(`web/data/bike-model-cache.json`) built offline from Bosch's own public,
unauthenticated bike catalog (`bosch-ebike.com/emd/data/emd-*.json`) — no
login, no account, no per-user API call. Currently resolves ~9,100 GTINs
(~79% with a photo); unrecognized models just show the generic bike icon.
Refresh the cache with `node tools/build-model-cache.mjs`.

## Status / limitations

Not every known data-point address responds to the simple read request this
tool uses — some are callable actions (need an input argument) or
subscription-only points that use a different request shape not yet
implemented here. Those are listed separately in the output rather than
silently skipped. Contributions filling in more of the protocol are welcome.

## Background

The protocol here (nicknamed internally "MCSP") was reverse-engineered
through USB traffic analysis and protocol research on the Bosch Smart System
drive unit platform, cross-referenced against publicly observable behavior of
existing tuning/diagnostic tools for the same platform. It is not affiliated
with or endorsed by Bosch.

## Development / repo hygiene

This is a **public** repo — keep bike-specific and personal data out of it
(serials, device certificates, wire captures, research notes). Those belong in a
private repo. A pre-commit hook (`githooks/pre-commit`) enforces this: it blocks
commits that stage a Bosch serial or research/capture-style files.

After cloning, enable it once:
```bash
git config core.hooksPath githooks
```
(False positive? `ALLOW_SENSITIVE=1 git commit ...` to bypass for one commit.)

## License

MIT — see [LICENSE](LICENSE).
