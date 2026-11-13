# SxmCaps (`sxmcaps`)

Monochrome desktop peripheral & acoustic suite combining hardware-aware HID control (**SxBoards**), a 24-effect procedural lighting compositor (**SxLighting**), opt-in kernel-level input transforms (**SxPerformance**), and real-time mechanical switch / mouse sound synthesis (`Rust`, `Tauri v2`, `hidapi`, `CPAL/Rodio`, `evdev` / Win32 / `CGEventTap`).

## What's New in `v0.4.1`

- **SxLighting Hardware Streaming Fix (`AULA F75`)**: Added `prepare_realtime_stream()` switching wired AULA F75 firmware into Per-Key Custom mode (`block[9]=0x01`, `block[10]=0x15`, `block[59]=0x47`, `400ms` settle wait), cached stream HID handle for zero-starvation frame delivery, automatic keyboard fallback target resolution, and defaulted Hardware Stream (`LED'lere Aktar`) ON when launching the compositor.
- **Native Furylevel Z1 Mouse Driver (`04f3:026e` Wired / `04f3:026f` 2.4G / `04f3:026d` 4K)**: Full HID protocol support (`0xBC` wake, `0x05` status/battery, `0xBD` flash state, `0x04` live input events, and `0x01..0x0F` config commands) with PAW3395 DPI stages (`50–26,000`), Polling Rate (`125–4000 Hz`), `1/2 mm` LOD, Debounce (`0–30 ms`), Angle Snap, Motion Sync, Ripple Control, Sleep & LED modes, and 6-button remapping.

## Previous Highlights (`v0.4.0`)

- **Monochrome Black & White Bento Studio UI**: Redesigned **`SxmCaps`** dashboard featuring a `#050506` obsidian canvas, `#111114` hairline Bento cards, white pill active controls, unified `Overview` Control Hub, and truthful hardware classification (`Keyboard`, `Mouse`, `Headset`).
- **Live FN Hardware Sync (`AULA F75`)**: Polls USB/2.4G firmware state via `spawn_hardware_watcher` (`sxmcaps://hardware-state`) so physical `FN` key combinations and rotary knob adjustments update the UI in real time.
- **Accurate Device Classification & Graceful Unsupported Handling**: Multi-interface USB VID:PID grouping classifies mice (`Furylevel Z1`, etc.) and wireless headsets (`Fuxi-H3`, etc.) accurately, renders device-appropriate views, and clearly states when a device provides no vendor communication protocol.
- **SxLighting Compositor (`24` Effects + `.sxl` Presets)**: Normalized `(x, y)` LED matrix compositor supporting `Static`, `Dynamic`, `Reactive`, and `Audio-Reactive` effects, 5 blend modes, live preview streaming (`sxmcaps://lighting-frame`), JSON `.sxl` import/export, and throttled USB per-key flashing.
- **SxPerformance Engine (Opt-In `evdev -> uinput`)**: Low-latency transform pipeline with **SOCD** (`Off` / `LastInput` / `FirstInput` / `Neutral`), **Mod-Tap**, **Tap-Dance**, **One-Shot Modifiers**, custom **Remaps**, loopback audio exclusion (`SxmCaps Virtual`), **Emergency Bypass**, and `avg` / `p95` / `max` software processing latency metrics.

## Core Platform Capabilities

- **SxBoards Driver Panel (`drivers/`)**:
  - **AULA F75 (`258a:010c` USB-C Wired & `3554:fa09` 2.4G Wireless)**: 20 firmware RGB effects, 90-key Per-Key RGB planar flashing, Side Light (`0x04`) & Rotary Knob (`Media` / `RGB`), OS mode (`Windows` / `Mac`), Win Lock, sleep timer, 4-layer Keymap Matrix read/write (`Base` / `FN` layers), onboard macro buffer flashing, and `5A A5` readback verification.
- **Unified Sound Engine (`20` Built-in Mechvibes Packs + `8` Pack Hub Packs)**: Real mechanical switch and mouse samples, 3-band stereo biquad EQ & Acoustic DSP (`Aluminum`, `Polycarbonate`, `Brass`, `Tape Mod`, `Poron Foam`, `Room Ambience`), Soundpack Studio WAV slicer/exporter, Per-App auto profiles, and bilingual UI (`Auto` / `Türkçe` / `English`).

## Development & Build

```bash
npm install
npm run tauri dev
```

Run tests & production build:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
NO_STRIP=true npm run tauri build -- --bundles appimage
```
