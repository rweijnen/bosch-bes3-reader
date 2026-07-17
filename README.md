# Bosch Smart System (BES3) Drive Unit Reader

A **read-only** diagnostic tool for Bosch Smart System eBikes (2022+ "BES3"
platform, USB-C direct connection to the drive unit's system controller).
Reads identification and status data — serial number, product code, hardware
and software versions, speed limits, assist-mode info, and more — over USB.

Two identical implementations sharing the same protocol code:

- **`web/`** — runs entirely in the browser via [WebUSB](https://developer.mozilla.org/en-US/docs/Web/API/WebUSB_API). No install, no server, nothing leaves your machine. Open `index.html` in Chrome/Edge (desktop only — WebUSB isn't available on iOS/Safari).
- **`node/`** — a CLI using the [`usb`](https://www.npmjs.com/package/usb) package (libusb), for scripting/automation.

`src/addresses.js` and `src/protocol.js` are the shared, transport-agnostic
core (device address table, frame encoding/decoding) — the exact same files
are loaded by both the browser page and the Node CLI. Only the USB transport
differs per platform (`node/transport-node-usb.js` vs `web/transport-webusb.js`).

## Scope: read-only, by design

This tool only issues **read** requests. It never writes configuration, never
attempts to change tuning/speed settings, and never touches the licensing or
authorization systems some commercial services use. It reads the same class
of identification data that's visible in your bike's own display and app —
nothing that isn't already exposed to the bike's owner.

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

## License

MIT — see [LICENSE](LICENSE).
