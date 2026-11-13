# SxBoards (`sxmcaps`)

Universal HID peripheral driver & low-latency mechanical keyboard/mouse sound platform built with Rust, Tauri v2, `hidapi`, CPAL/Rodio, and native global input hooks (`evdev` on Linux, Win32 `WH_KEYBOARD_LL`/`WH_MOUSE_LL` on Windows, `CGEventTap` on macOS).

## Features (v0.3.0 — SxBoards Platform)

- **Obsidian-Violet SxBoards Studio UI**: Left vertical icon navigation rail (`Devices`, `Effects`, `Keys`, `Macros`, `Sound`, `Stats`, `System`), workspace top preset toolbar (`OVERWRITE PRESET`, `SAVE IN ACTIVE`, `+ NEW PRESET`), and an interactive AULA F75 hardware deck with glowing side light strip, metallic rotary knob, floating key reassignment callout pills, and bilingual i18n (`Auto` / `Türkçe` / `English`).
- **Modular Hardware Driver Architecture (`drivers/`)**: Automatic USB/2.4G/Bluetooth HID discovery with truthful capability negotiation:
  - **AULA F75 Native Protocol (`258a:010c` USB-C Wired & `3554:fa09` 2.4G Wireless)**: 20 firmware RGB effects, 90-key Per-Key RGB planar flashing, Side Light (`0x04`) & Rotary Knob (`Media` / `RGB`), OS mode (`Windows` / `Mac`), Win Lock, sleep timer, 4-layer Keymap Matrix read/write (`Base` / `FN` layers with factory Layer-0 restore), onboard macro buffer flashing, and readback guardrails (`5A A5` tail verification & packet pacing).
  - **Generic Peripheral Discovery**: Lists connected USB/HID mice, keyboards, and audio devices safely with truthful capability reporting.
- **Unified Sound Engine (20 Built-in Mechvibes Packs + 8 Pack Hub Packs)**: Real mechanical switch and mouse samples, real-time 3-band stereo biquad EQ & plate Acoustic DSP (`Aluminum`, `Polycarbonate`, `Brass`, `Tape Mod`, `Poron Foam`, `Room Ambience`), Soundpack Studio slicer/exporter, Per-App auto profiles, and one-click `.zip`/folder import.
- **Violet Analytics Dashboard**: Usage metrics (`Total Keystrokes`, `Mouse Clicks`, `Peak WPM`), glowing violet 14-day vertical bar columns & trend curve, and violet per-key heatmap.
- **Cross-Platform Global Input & Linux HID Setup**:
  - **Linux (Wayland / Hyprland & X11)**: Native `/dev/input/event*` (`evdev`) listener + `/dev/hidraw*` permission rules (`65-sxmcaps-input.rules` & `70-sxboards-hid.rules`) via one-click `pkexec`.
  - **Windows / macOS**: Native `WH_KEYBOARD_LL`/`WH_MOUSE_LL` (Windows) and `CGEventTap` (macOS) hooks + `hidapi` direct USB HID access.

## Development & Build

```bash
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```
