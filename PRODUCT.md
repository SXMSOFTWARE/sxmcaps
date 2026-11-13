# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Mechanical keyboard enthusiasts, gamers, and Linux/desktop power users running SxmCaps to unify low-latency keycap/mouse acoustic feedback with direct USB/2.4G HID hardware control (starting with AULA F75), SxPerformance input transformations, and SxLighting programmable animations.

## Product Purpose

**SxmCaps** is the primary desktop application unifying real-time mechanical switch & mouse sound synthesis, hardware-accurate peripheral control (`SxBoards`), opt-in low-level input transformations (`SxPerformance`), and normalized LED animation rendering (`SxLighting`) within one responsive monochrome interface.

## Positioning

Unlike vendor-locked proprietary suites or sound-only simulators, SxmCaps detects real connected hardware via native HID descriptors and `evdev`, exposes only verified protocol capabilities per device class (Keyboard, Mouse, Headset/Audio), syncs directly with physical `FN` hardware changes in real time, and drives custom host-rendered RGB + SOCD pipelines safely from Rust.

## Operating Context

- Desktop window (`Tauri v2` + React + TypeScript) on Linux (Wayland/Hyprland & X11), Windows, and macOS.
- Mixed Bento Dashboard landing overview: active peripheral summary, live key/WPM/HID telemetry, hardware visualizer, and quick sound/lighting controls, backed by dedicated left-rail workspaces (`Overview`, `SxBoards`, `SxLighting`, `SxPerformance`, `Sound Studio`, `Telemetry`, `System`).
- Peripherals without vendor write protocols (e.g., `Furylevel Z1` mouse, `Fuxi-H3` wireless headset) display accurate device-class views (Mouse controls / Audio output & headset info) with explicit communication-layer notices instead of broken keyboard UI.

## Capabilities and Constraints

- **SxmCaps Sound Engine**: 20 built-in Mechvibes packs + 8 Pack Hub packs, real-time 3-band EQ, plate presets, Tape Mod, Poron Foam, Soundpack Studio, per-app profiles.
- **Live Hardware Sync (AULA F75)**: Bidirectional tracking so changes made on the physical keyboard via `FN` shortcuts or rotary knob reflect immediately inside the dashboard.
- **SxPerformance**: Opt-in (disabled by default) `evdev` → transform (`SOCD` Last/First/Neutral, `Mod-Tap`, `Tap-Dance`, `One-Shot`, custom FN layers, per-app profiles) → virtual `uinput` pipeline with emergency bypass shortcut and software processing latency analyzer.
- **SxLighting**: Capability-aware normalized X/Y LED topology, independent Rust animation engine (`Solid`, `Per-Key`, `Rainbow Wave`, `Breathing`, `Aurora`, `Matrix Rain`, `Spiral`, `Reactive Ripple`, `Typing Heatmap`, `Audio-Reactive Spectrum/Pulse`), multi-layer blend compositor (`Normal`, `Additive`, `Screen`, `Maximum`, `Multiply`), `.sxl` preset import/export, and hardware output throttling.

## Brand Commitments

- **Application Name**: Strictly **SxmCaps** everywhere (window title, header mark, `.desktop` launcher). `SxBoards` is solely the hardware-controller subsystem/panel inside SxmCaps.
- **Color Palette**: Strictly **Monochrome Black & White** (deep obsidian `#050506` canvas, `#101013` / `#16161a` hairline-bordered bento cards, pure `#ffffff` active pills & ink emphasis, subtle functional status indicators only where signaling hardware link/warning states). Purple/violet accents are explicitly excluded.
- **Dashboard Craft**: Detailed yet immediately usable monochrome bento grid following uploaded reference dashboards and Impeccable design verification.
