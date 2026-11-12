# sxmcaps

Low-latency mechanical keyboard & mouse sound simulator (Mechvibes-compatible), built with Rust, Tauri v2, CPAL/Rodio, and native global input hooks (Linux `evdev` + Windows Win32 `WH_KEYBOARD_LL`/`WH_MOUSE_LL`).

## Features (v0.1.0)

- **Monochrome Black & White Studio UI**: Categorized workspace (*Klavye Switchleri*, *Fare & Tıklama*, *Akustik & Mikser*, *Sistem & Paketler*) with an interactive 75% mechanical keyboard & mouse visualizer.
- **Ultra-low-latency Polyphonic Mixer**: Custom CPAL float mixer with 64 simultaneous voices, linear-interpolated pitch humanization, and optional spatial stereo panning.
- **8 Built-in Keyboard Switch Packs + 2 Mouse Packs**:
  - `Holy Panda`, `Cherry MX Blue`, `Cherry MX Red`, `Cherry MX Brown`, `Cherry MX Black`, `Gateron Oil King`, `Topre 45g`, `IBM Model M`
  - `Omron Microswitch`, `Kailh Silent Mouse`
- **Mechvibes V1 & V2 Compatibility**: Import `.zip` or folder soundpacks (`single` slice mode and `multi` per-key mode).
- **Cross-Platform Global Input**:
  - **Linux (Wayland / Hyprland & X11)**: Native `/dev/input/event*` (`evdev`) listener with one-click `udev` permission rule (`65-sxmcaps-input.rules`).
  - **Windows**: Native Win32 `WH_KEYBOARD_LL` & `WH_MOUSE_LL` global hooks.
- **System Tray & Persistent Settings**: Minimizes to system tray and saves preferences cleanly to native OS config/data directories.

## Development & Build

```bash
npm install
npm run tauri dev
```

Production build:

```bash
npm run tauri build
```
