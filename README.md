# sxmcaps

Low-latency mechanical keyboard & mouse sound simulator (Mechvibes-compatible), built with Rust, Tauri v2, CPAL/Rodio, and native global input hooks (`evdev` on Linux, Win32 `WH_KEYBOARD_LL`/`WH_MOUSE_LL` on Windows, `CGEventTap` on macOS).

## Features (v0.2.1)

- **Monochrome Black & White Studio UI + Bilingual i18n (`Auto` / `Türkçe` / `English`)**: Automatically detects OS/browser locale (Turkish if `tr*`, otherwise English) with a header & System tab switcher, 6-tab categorized workspace, and an interactive 75% mechanical keyboard & mouse visualizer.
- **20 Authentic Built-in Mechvibes Soundpacks (14 Keyboard + 6 Mouse) + 8 Pack Hub Packs**: Real recorded mechanical switch and mouse samples sourced from MIT-licensed Mechvibes repositories (`Cherry MX` PBT/ABS, `Gateron Milky Yellow`, `Holy Pandas`, `EG Crystal Purple`, `EG Oreo`, `NK Cream`, `Topre Purple Hybrid`, `Opera`, `Logitech G502`, `Razer DeathAdder`, `SteelSeries Rival 310`, `Logitech G305`, `Chat Click`, `Typewriter`, plus 8 more in Pack Hub).
- **Acoustic DSP Engine**: Real-time zero-allocation 3-band stereo biquad EQ (`Low`, `Mid`, `High`), plate material presets (`Neutral`, `Aluminum`, `Polycarbonate`, `Brass`), `Tape Mod`, `Poron Foam`, and `Room Ambience` early-reflection stereo delay.
- **Soundpack Studio**: In-app soundpack creator with waveform preview, `[start_ms, duration_ms]` slice trimming, per-key `down`/`up` mapping, Mechvibes V2 export, and `.zip` packaging.
- **Pack Hub & Auto-Update Checker**: Browse and install curated online switch & mouse packs from `pack-hub/catalog.json` (showing live `Installed` status badges), install custom `.zip` packs by URL, and check GitHub Releases for new versions.
- **Per-App Profiles & OS Autostart**: Active window watcher (`hyprctl`/`xdotool` on Linux, Win32 `GetForegroundWindow` on Windows, `osascript` on macOS) to switch packs or auto-mute in selected apps/games, plus native autostart toggles.
- **Usage Stats & Keycap Heatmap**: Persistent `stats.json` tracking total keystrokes, mouse clicks, peak WPM, a monochrome per-key heatmap, and 14-day history.
- **Cross-Platform Global Input**:
  - **Linux (Wayland / Hyprland & X11)**: Native `/dev/input/event*` (`evdev`) listener with one-click `udev` permission rule (`65-sxmcaps-input.rules`).
  - **Windows**: Native Win32 `WH_KEYBOARD_LL` & `WH_MOUSE_LL` global hooks.
  - **macOS**: Native `CGEventTap` global keyboard & mouse listener.
- **Mechvibes V1 & V2 Compatibility**: Import `.zip` or folder soundpacks (`timing` Ogg Vorbis / WAV V2 packs, `single` slice mode, `multi` per-key mode, `{0-N}` range wildcards, and key release `-up`/`soundup` triggers).
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
