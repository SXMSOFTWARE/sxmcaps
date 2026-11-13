# sxmcaps

Low-latency mechanical keyboard & mouse sound simulator (Mechvibes-compatible), built with Rust, Tauri v2, CPAL/Rodio, and native global input hooks (`evdev` on Linux, Win32 `WH_KEYBOARD_LL`/`WH_MOUSE_LL` on Windows, `CGEventTap` on macOS).

## Features (v0.2.0)

- **Monochrome Black & White Studio UI**: 6-tab categorized workspace (*Switchler*, *Fare*, *Akustik DSP*, *Stüdyo*, *İstatistik*, *Sistem*) with an interactive 75% mechanical keyboard & mouse visualizer.
- **Acoustic DSP Engine**: Real-time zero-allocation 3-band stereo biquad EQ (`Low`, `Mid`, `High`), plate material presets (`Neutral`, `Aluminum`, `Polycarbonate`, `Brass`), `Tape Mod`, `Poron Foam`, and `Room Ambience` early-reflection stereo delay.
- **Soundpack Studio**: In-app soundpack creator with waveform preview, `[start_ms, duration_ms]` slice trimming, per-key `down`/`up` mapping, Mechvibes V2 export, and `.zip` packaging.
- **Pack Hub & Auto-Update Checker**: Browse and install curated online switch packs from `pack-hub/catalog.json`, install custom `.zip` packs by URL, and check GitHub Releases for new versions.
- **Per-App Profiles & OS Autostart**: Active window watcher (`hyprctl`/`xdotool` on Linux, Win32 `GetForegroundWindow` on Windows, `osascript` on macOS) to switch packs or auto-mute in selected apps/games, plus native autostart toggles.
- **Usage Stats & Keycap Heatmap**: Persistent `stats.json` tracking total keystrokes, mouse clicks, peak WPM, a monochrome per-key heatmap, and 14-day history.
- **Cross-Platform Global Input**:
  - **Linux (Wayland / Hyprland & X11)**: Native `/dev/input/event*` (`evdev`) listener with one-click `udev` permission rule (`65-sxmcaps-input.rules`).
  - **Windows**: Native Win32 `WH_KEYBOARD_LL` & `WH_MOUSE_LL` global hooks.
  - **macOS**: Native `CGEventTap` global keyboard & mouse listener.
- **8 Built-in Keyboard Switch Packs + 2 Mouse Packs**:
  - `Holy Panda`, `Cherry MX Blue`, `Cherry MX Red`, `Cherry MX Brown`, `Cherry MX Black`, `Gateron Oil King`, `Topre 45g`, `IBM Model M`
  - `Omron Microswitch`, `Kailh Silent Mouse`
- **Mechvibes V1 & V2 Compatibility**: Import `.zip` or folder soundpacks (`single` slice mode and `multi` per-key mode).
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
