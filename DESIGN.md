# SxmCaps Design System (`v0.4.0`)

## Aesthetic Direction
- **Strict Monochrome Black & White Precision Bento**: Engineered for hardware telemetry, real-time acoustics, lighting composition, and low-level input tuning without visual clutter or neon/purple accents.
- **Brand Separation**:
  - **SxmCaps**: Unified host application brand (sidebar mark, window chrome, tray, desktop integration).
  - **SxBoards**: Peripheral controller module (`Devices`, `Keys`, `Macros`) focused strictly on hardware discovery and native USB/2.4G HID packets.
  - **SxLighting**: Multi-layer procedural & `.sxl` lighting compositor.
  - **SxPerformance**: Opt-in kernel-level input transform engine (`SOCD`, `Mod-Tap`, `Tap-Dance`, `Remaps`).

## Color Tokens
- **Canvas**: `#050506` (`--sxm-bg`)
- **Outer Shell / Rail**: `#0b0b0d` (`--sxm-frame`)
- **Bento Card**: `#111114` (`--sxm-card`), Hover `#16161a` (`--sxm-card-hover`)
- **Inset Control Well**: `#19191e` (`--sxm-well`)
- **Hairline Borders**: `rgba(255, 255, 255, 0.08)` / `rgba(255, 255, 255, 0.16)` active
- **Primary Action / Active Pill**: Solid `#ffffff` surface with `#000000` label
- **Text Hierarchy**: `#ffffff` / `#f4f4f5` primary, `#a1a1aa` secondary, `#71717a` labels/metadata
- **Functional Hardware Telemetry**: Emerald (`#34d399`) for live connection / synced states and amber (`#fbbf24`) / rose (`#fb7185`) reserved strictly for safety warnings and emergency bypass indicators.

## Typography & Layout
- **Typeface**: `'IBM Plex Sans', 'SF Pro Display', 'Noto Sans', system-ui, sans-serif` paired with `.tabular-nums` for telemetry counters, latencies, WPM, and HEX identifiers.
- **Navigation**: Floating rounded icon rail with pill active states (`bg-white text-black`) and a top peripheral switcher bar showing live classified device badges (`Keyboard`, `Mouse`, `Headset`, or unsupported protocol notices).
- **Truthful Peripheral Adaptation**: Devices lacking a vendor communication protocol display tailored device panels (mouse / headset / audio acoustic context) plus an explicit protocol notice instead of synthetic keyboard editors.
