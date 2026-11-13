use crate::drivers::{LedTopologyNode, PeripheralDriver};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

pub const SXL_MAGIC: &str = "sxl-v1";
pub const MAX_LAYERS: usize = 8;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AnimationKind {
    SolidColor,
    MultiColorGradient,
    WasdHighlight,
    RainbowWave,
    ColorCycle,
    Breathing,
    Spiral,
    Aurora,
    MatrixRain,
    CircularWave,
    GradientFlow,
    Plasma,
    Fire,
    MeteorTrail,
    KeyPressFlash,
    KeyReleaseFlash,
    Ripple,
    MultiKeyRipple,
    TypingHeatmap,
    ReactiveGradient,
    AudioBassPulse,
    AudioSpectrum,
    AudioWaveform,
    AudioBeatFlash,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum LayerBlendMode {
    #[default]
    Normal,
    Additive,
    Screen,
    Maximum,
    Multiply,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum WaveDirection {
    #[default]
    LeftToRight,
    RightToLeft,
    TopToBottom,
    RadialOut,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxLightingLayer {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub effect: AnimationKind,
    pub palette: Vec<[u8; 3]>,
    pub opacity: f32,
    pub speed: f32,
    pub scale: f32,
    pub blend_mode: LayerBlendMode,
    pub direction: WaveDirection,
    pub zone_filter: String, // "all" | "alpha" | "mod" | "fn" | "nav" | "wasd"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxLightingPreset {
    pub magic: String,
    pub version: u32,
    pub id: String,
    pub name: String,
    pub author: String,
    pub description: String,
    pub fps: u8,
    pub max_brightness: u8, // 0..=100% safety limiter
    pub layers: Vec<SxLightingLayer>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxLightingStatus {
    pub active: bool,
    pub hardware_streaming: bool,
    pub target_device_id: String,
    pub actual_fps: f32,
    pub frames_sent: u64,
    pub frames_deduped: u64,
    pub last_error: Option<String>,
    pub active_preset: SxLightingPreset,
}

#[derive(Debug, Clone, Serialize)]
pub struct LightingPreviewFrame {
    pub preset_id: String,
    pub matrix_rgb: Vec<[u8; 3]>, // indexed 0..126 matching AULA/topology matrix
    pub audio_peak: f32,
}

#[derive(Clone)]
pub struct RipplePulse {
    x: f32,
    y: f32,
    born: Instant,
    is_release: bool,
}

struct EngineShared {
    preset: SxLightingPreset,
    topology: Vec<LedTopologyNode>,
    driver: Option<Arc<dyn PeripheralDriver>>,
    is_wired: bool,
    streaming_to_hw: bool,
    ripples: VecDeque<RipplePulse>,
    key_heat: HashMap<usize, f32>,
    audio_level: f32,
    audio_bands: [f32; 8],
    frames_sent: u64,
    frames_deduped: u64,
    actual_fps: f32,
    last_error: Option<String>,
}

pub struct SxLightingEngine {
    running: Arc<AtomicBool>,
    force_resend_hw: Arc<AtomicBool>,
    shared: Arc<Mutex<EngineShared>>,
}

pub fn default_presets() -> Vec<SxLightingPreset> {
    vec![
        SxLightingPreset {
            magic: SXL_MAGIC.to_string(),
            version: 1,
            id: "aurora-ripple".to_string(),
            name: "Aurora + Reactive Ripple".to_string(),
            author: "SxmCaps".to_string(),
            description: "Multi-layer Aurora canvas with white keypress ripple overlay.".to_string(),
            fps: 20,
            max_brightness: 85,
            layers: vec![
                SxLightingLayer {
                    id: "layer-bg".to_string(),
                    name: "Aurora Drift".to_string(),
                    enabled: true,
                    effect: AnimationKind::Aurora,
                    palette: vec![[20, 220, 180], [50, 130, 255], [255, 255, 255]],
                    opacity: 0.75,
                    speed: 0.85,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Normal,
                    direction: WaveDirection::LeftToRight,
                    zone_filter: "all".to_string(),
                },
                SxLightingLayer {
                    id: "layer-react".to_string(),
                    name: "Keypress Ripple".to_string(),
                    enabled: true,
                    effect: AnimationKind::MultiKeyRipple,
                    palette: vec![[255, 255, 255], [180, 220, 255]],
                    opacity: 1.0,
                    speed: 1.4,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Screen,
                    direction: WaveDirection::RadialOut,
                    zone_filter: "all".to_string(),
                },
            ],
        },
        SxLightingPreset {
            magic: SXL_MAGIC.to_string(),
            version: 1,
            id: "monochrome-studio".to_string(),
            name: "Studio Monochrome Pulse".to_string(),
            author: "SxmCaps".to_string(),
            description: "Low-key white breathing base with sharp reactive key flash.".to_string(),
            fps: 20,
            max_brightness: 80,
            layers: vec![
                SxLightingLayer {
                    id: "layer-mono-base".to_string(),
                    name: "Breathe Dim".to_string(),
                    enabled: true,
                    effect: AnimationKind::Breathing,
                    palette: vec![[90, 90, 96]],
                    opacity: 0.5,
                    speed: 0.6,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Normal,
                    direction: WaveDirection::LeftToRight,
                    zone_filter: "all".to_string(),
                },
                SxLightingLayer {
                    id: "layer-mono-flash".to_string(),
                    name: "Key Flash".to_string(),
                    enabled: true,
                    effect: AnimationKind::KeyPressFlash,
                    palette: vec![[255, 255, 255]],
                    opacity: 1.0,
                    speed: 1.6,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Maximum,
                    direction: WaveDirection::RadialOut,
                    zone_filter: "all".to_string(),
                },
            ],
        },
        SxLightingPreset {
            magic: SXL_MAGIC.to_string(),
            version: 1,
            id: "audio-spectrum".to_string(),
            name: "Audio Spectrum + WASD".to_string(),
            author: "SxmCaps".to_string(),
            description: "Sound-reactive frequency bars synced to keystroke audio envelope.".to_string(),
            fps: 22,
            max_brightness: 90,
            layers: vec![
                SxLightingLayer {
                    id: "layer-spec".to_string(),
                    name: "Spectrum".to_string(),
                    enabled: true,
                    effect: AnimationKind::AudioSpectrum,
                    palette: vec![[255, 255, 255], [0, 210, 255], [255, 80, 120]],
                    opacity: 0.95,
                    speed: 1.2,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Normal,
                    direction: WaveDirection::LeftToRight,
                    zone_filter: "all".to_string(),
                },
                SxLightingLayer {
                    id: "layer-wasd".to_string(),
                    name: "WASD Anchor".to_string(),
                    enabled: true,
                    effect: AnimationKind::WasdHighlight,
                    palette: vec![[255, 255, 255]],
                    opacity: 0.9,
                    speed: 1.0,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Maximum,
                    direction: WaveDirection::LeftToRight,
                    zone_filter: "wasd".to_string(),
                },
            ],
        },
        SxLightingPreset {
            magic: SXL_MAGIC.to_string(),
            version: 1,
            id: "matrix-heatmap".to_string(),
            name: "Matrix Rain + Typing Heat".to_string(),
            author: "SxmCaps".to_string(),
            description: "Falling rain columns blended with live typing frequency heatmap.".to_string(),
            fps: 20,
            max_brightness: 85,
            layers: vec![
                SxLightingLayer {
                    id: "layer-rain".to_string(),
                    name: "Matrix Rain".to_string(),
                    enabled: true,
                    effect: AnimationKind::MatrixRain,
                    palette: vec![[40, 240, 130], [200, 255, 220]],
                    opacity: 0.85,
                    speed: 1.1,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Normal,
                    direction: WaveDirection::TopToBottom,
                    zone_filter: "all".to_string(),
                },
                SxLightingLayer {
                    id: "layer-heat".to_string(),
                    name: "Typing Heatmap".to_string(),
                    enabled: true,
                    effect: AnimationKind::TypingHeatmap,
                    palette: vec![[255, 210, 70], [255, 70, 50]],
                    opacity: 0.9,
                    speed: 0.8,
                    scale: 1.0,
                    blend_mode: LayerBlendMode::Additive,
                    direction: WaveDirection::RadialOut,
                    zone_filter: "all".to_string(),
                },
            ],
        },
    ]
}

/// Validates and clamps a `.sxl` preset against malformed inputs or resource limits.
pub fn validate_preset(mut p: SxLightingPreset) -> Result<SxLightingPreset, String> {
    if !p.magic.is_empty() && p.magic != SXL_MAGIC {
        return Err(format!("Unsupported SxLighting preset magic '{}'", p.magic));
    }
    if p.version > 2 {
        return Err(format!("Unsupported SxLighting schema version {}", p.version));
    }
    if p.name.trim().is_empty() || p.name.len() > 80 {
        return Err("Preset name must be 1..80 characters.".to_string());
    }
    if p.layers.len() > MAX_LAYERS {
        return Err(format!("Preset exceeds maximum layer cap ({MAX_LAYERS})."));
    }
    p.magic = SXL_MAGIC.to_string();
    p.version = 1;
    p.fps = p.fps.clamp(5, 30);
    p.max_brightness = p.max_brightness.clamp(10, 100);
    for l in &mut p.layers {
        l.opacity = l.opacity.clamp(0.0, 1.0);
        l.speed = l.speed.clamp(0.1, 5.0);
        l.scale = l.scale.clamp(0.25, 4.0);
        if l.palette.is_empty() {
            l.palette.push([255, 255, 255]);
        } else if l.palette.len() > 8 {
            l.palette.truncate(8);
        }
    }
    Ok(p)
}

pub fn presets_dir() -> PathBuf {
    let base = dirs_or_home();
    let dir = base.join("sxlighting_presets");
    let _ = std::fs::create_dir_all(&dir);
    dir
}

fn dirs_or_home() -> PathBuf {
    if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            return PathBuf::from(xdg).join("sxmcaps");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return PathBuf::from(home).join(".config").join("sxmcaps");
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        return PathBuf::from(appdata).join("sxmcaps");
    }
    PathBuf::from(".")
}

pub fn list_saved_presets() -> Vec<SxLightingPreset> {
    let mut map: HashMap<String, SxLightingPreset> = HashMap::new();
    for p in default_presets() {
        map.insert(p.id.clone(), p);
    }
    let dir = presets_dir();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for ent in entries.flatten() {
            let path = ent.path();
            if path.extension().and_then(|s| s.to_str()) == Some("sxl") {
                if let Ok(raw) = std::fs::read_to_string(&path) {
                    if let Ok(parsed) = serde_json::from_str::<SxLightingPreset>(&raw) {
                        if let Ok(valid) = validate_preset(parsed) {
                            map.insert(valid.id.clone(), valid);
                        }
                    }
                }
            }
        }
    }
    let mut out: Vec<SxLightingPreset> = map.into_values().collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out
}

pub fn save_preset_to_disk(preset: &SxLightingPreset) -> Result<SxLightingPreset, String> {
    let valid = validate_preset(preset.clone())?;
    let slug: String = valid
        .id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' { c } else { '-' })
        .collect();
    let file = presets_dir().join(format!("{slug}.sxl"));
    let json = serde_json::to_string_pretty(&valid).map_err(|e| e.to_string())?;
    std::fs::write(file, json).map_err(|e| format!("Failed saving .sxl preset: {e}"))?;
    Ok(valid)
}

impl SxLightingEngine {
    pub fn start<F>(on_preview_frame: F) -> Self
    where
        F: Fn(LightingPreviewFrame) + Send + Sync + 'static,
    {
        let running = Arc::new(AtomicBool::new(false));
        let default = default_presets().into_iter().next().unwrap();
        let shared = Arc::new(Mutex::new(EngineShared {
            preset: default,
            topology: crate::drivers::aula::f75::build_f75_topology(),
            driver: None,
            is_wired: true,
            streaming_to_hw: false,
            ripples: VecDeque::with_capacity(16),
            key_heat: HashMap::new(),
            audio_level: 0.0,
            audio_bands: [0.0; 8],
            frames_sent: 0,
            frames_deduped: 0,
            actual_fps: 0.0,
            last_error: None,
        }));

        let run_flag = Arc::clone(&running);
        let force_resend_hw = Arc::new(AtomicBool::new(true));
        let force_flag = Arc::clone(&force_resend_hw);
        let shared_bg = Arc::clone(&shared);

        std::thread::Builder::new()
            .name("sxlighting-engine".to_string())
            .spawn(move || {
                let epoch = Instant::now();
                let mut prev_hw_frame: Vec<[u8; 3]> = Vec::new();
                let mut last_hw_send = Instant::now() - Duration::from_secs(1);
                let mut last_ui_emit = Instant::now() - Duration::from_secs(1);
                let mut fps_counter = 0u32;
                let mut fps_window = Instant::now();

                loop {
                    if !run_flag.load(Ordering::Relaxed) {
                        prev_hw_frame.clear();
                        std::thread::sleep(Duration::from_millis(90));
                        continue;
                    }

                    let t = epoch.elapsed().as_secs_f32();
                    let (frame, preset_id, fps, driver, hw_min_gap, stream_hw) = {
                        let Ok(mut st) = shared_bg.lock() else {
                            std::thread::sleep(Duration::from_millis(50));
                            continue;
                        };
                        let now = Instant::now();
                        st.ripples.retain(|r| now.duration_since(r.born).as_secs_f32() < 2.2);
                        // Exponential decay for audio envelope & heatmap
                        st.audio_level = (st.audio_level * 0.86).clamp(0.0, 1.0);
                        for b in &mut st.audio_bands {
                            *b = (*b * 0.88).clamp(0.0, 1.0);
                        }
                        st.key_heat.retain(|_, v| {
                            *v *= 0.992;
                            *v > 0.015
                        });

                        let frame = render_composited_frame(
                            &st.preset,
                            &st.topology,
                            t,
                            now,
                            &st.ripples,
                            &st.key_heat,
                            st.audio_level,
                            &st.audio_bands,
                        );
                        let min_gap = if st.is_wired {
                            Duration::from_millis(48)
                        } else {
                            Duration::from_millis(96)
                        };
                        (
                            frame,
                            st.preset.id.clone(),
                            st.preset.fps,
                            st.driver.clone(),
                            min_gap,
                            st.streaming_to_hw,
                        )
                    };

                    if last_ui_emit.elapsed() >= Duration::from_millis(45) {
                        last_ui_emit = Instant::now();
                        let peak = shared_bg.lock().map(|g| g.audio_level).unwrap_or(0.0);
                        on_preview_frame(LightingPreviewFrame {
                            preset_id,
                            matrix_rgb: frame.clone(),
                            audio_peak: peak,
                        });
                    }

                    if stream_hw {
                        if let Some(drv) = driver {
                            let force_hw = force_flag.swap(false, Ordering::Relaxed)
                                || prev_hw_frame.is_empty()
                                || last_hw_send.elapsed() >= Duration::from_secs(2);
                            if last_hw_send.elapsed() >= hw_min_gap {
                                if force_hw || frame != prev_hw_frame {
                                    match drv.set_realtime_rgb(frame.clone()) {
                                        Ok(()) => {
                                            prev_hw_frame = frame;
                                            last_hw_send = Instant::now();
                                            fps_counter += 1;
                                            if let Ok(mut st) = shared_bg.lock() {
                                                st.frames_sent += 1;
                                                st.last_error = None;
                                            }
                                        }
                                        Err(e) => {
                                            if let Ok(mut st) = shared_bg.lock() {
                                                st.last_error = Some(e);
                                                st.streaming_to_hw = false;
                                            }
                                        }
                                    }
                                } else if let Ok(mut st) = shared_bg.lock() {
                                    st.frames_deduped += 1;
                                }
                            }
                        }
                    }

                    if fps_window.elapsed() >= Duration::from_secs(1) {
                        if let Ok(mut st) = shared_bg.lock() {
                            st.actual_fps = fps_counter as f32 / fps_window.elapsed().as_secs_f32();
                        }
                        fps_counter = 0;
                        fps_window = Instant::now();
                    }

                    let tick_ms = (1000 / u64::from(fps.max(5))).max(33);
                    std::thread::sleep(Duration::from_millis(tick_ms));
                }
            })
            .expect("sxlighting engine spawn failed");

        Self { running, force_resend_hw, shared }
    }

    pub fn is_streaming(&self) -> bool {
        self.running.load(Ordering::Relaxed)
            && self
                .shared
                .lock()
                .map(|g| g.streaming_to_hw)
                .unwrap_or(false)
    }

    pub fn notify_key_event(&self, web_code: &str, is_down: bool) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut st) = self.shared.lock() {
            if let Some(node) = st.topology.iter().find(|n| n.web_code == web_code) {
                let idx = node.matrix_index;
                let nx = node.x;
                let ny = node.y;
                if is_down {
                    let h = st.key_heat.entry(idx).or_insert(0.0);
                    *h = (*h + 0.35).min(1.0);
                }
                if st.ripples.len() >= 16 {
                    st.ripples.pop_front();
                }
                st.ripples.push_back(RipplePulse {
                    x: nx,
                    y: ny,
                    born: Instant::now(),
                    is_release: !is_down,
                });
            }
        }
    }

    /// Abstract audio-event hook triggered by SxmCaps audio trigger without tight coupling.
    pub fn notify_audio_trigger(&self, intensity: f32, band_idx: usize) {
        if !self.running.load(Ordering::Relaxed) {
            return;
        }
        if let Ok(mut st) = self.shared.lock() {
            st.audio_level = (st.audio_level + intensity * 0.7).min(1.0);
            let bi = band_idx % 8;
            st.audio_bands[bi] = (st.audio_bands[bi] + intensity * 0.95).min(1.0);
            if bi > 0 {
                st.audio_bands[bi - 1] = (st.audio_bands[bi - 1] + intensity * 0.45).min(1.0);
            }
            if bi + 1 < 8 {
                st.audio_bands[bi + 1] = (st.audio_bands[bi + 1] + intensity * 0.45).min(1.0);
            }
        }
    }

    pub fn apply_config(
        &self,
        preset: SxLightingPreset,
        active: bool,
        stream_to_hardware: bool,
        driver: Option<Arc<dyn PeripheralDriver>>,
    ) -> Result<SxLightingStatus, String> {
        let valid = validate_preset(preset)?;
        let mut prep_error: Option<String> = None;
        let can_hw_stream = if active && stream_to_hardware {
            if let Some(ref drv) = driver {
                let info = drv.device_info();
                if info.capabilities.host_streaming && info.online && info.permission_ok {
                    match drv.prepare_realtime_stream() {
                        Ok(()) => true,
                        Err(e) => {
                            prep_error = Some(e);
                            false
                        }
                    }
                } else {
                    false
                }
            } else {
                false
            }
        } else {
            false
        };

        if let Ok(mut st) = self.shared.lock() {
            if let Some(ref drv) = driver {
                let topo = drv.get_led_topology();
                if !topo.is_empty() {
                    st.topology = topo;
                }
                let info = drv.device_info();
                st.is_wired = info.link == crate::drivers::ConnectionLink::Wired;
                st.streaming_to_hw = can_hw_stream;
            } else {
                st.streaming_to_hw = false;
            }
            st.driver = driver;
            st.preset = valid;
            st.last_error = prep_error;
        }
        self.force_resend_hw.store(true, Ordering::Relaxed);
        self.running.store(active, Ordering::Relaxed);
        Ok(self.status())
    }

    pub fn stop(&self) -> SxLightingStatus {
        self.running.store(false, Ordering::Relaxed);
        if let Ok(mut st) = self.shared.lock() {
            st.streaming_to_hw = false;
        }
        self.status()
    }

    pub fn status(&self) -> SxLightingStatus {
        let active = self.running.load(Ordering::Relaxed);
        let st = self.shared.lock().unwrap();
        SxLightingStatus {
            active,
            hardware_streaming: active && st.streaming_to_hw,
            target_device_id: st
                .driver
                .as_ref()
                .map(|d| d.device_info().id)
                .unwrap_or_default(),
            actual_fps: if active { st.actual_fps } else { 0.0 },
            frames_sent: st.frames_sent,
            frames_deduped: st.frames_deduped,
            last_error: st.last_error.clone(),
            active_preset: st.preset.clone(),
        }
    }
}

pub fn hsv_to_rgb(h: f32, s: f32, v: f32) -> [u8; 3] {
    let h = ((h % 1.0) + 1.0) % 1.0 * 6.0;
    let i = h.floor() as i32;
    let f = h - i as f32;
    let p = v * (1.0 - s);
    let q = v * (1.0 - s * f);
    let t = v * (1.0 - s * (1.0 - f));
    let (r, g, b) = match i.rem_euclid(6) {
        0 => (v, t, p),
        1 => (q, v, p),
        2 => (p, v, t),
        3 => (p, q, v),
        4 => (t, p, v),
        _ => (v, p, q),
    };
    [
        (r.clamp(0.0, 1.0) * 255.0) as u8,
        (g.clamp(0.0, 1.0) * 255.0) as u8,
        (b.clamp(0.0, 1.0) * 255.0) as u8,
    ]
}

fn lerp_palette(palette: &[[u8; 3]], t: f32) -> [u8; 3] {
    if palette.is_empty() {
        return [255, 255, 255];
    }
    if palette.len() == 1 {
        return palette[0];
    }
    let tt = ((t % 1.0) + 1.0) % 1.0 * (palette.len() - 1) as f32;
    let idx = (tt.floor() as usize).min(palette.len() - 2);
    let frac = tt - idx as f32;
    let a = palette[idx];
    let b = palette[idx + 1];
    [
        (a[0] as f32 + (b[0] as f32 - a[0] as f32) * frac) as u8,
        (a[1] as f32 + (b[1] as f32 - a[1] as f32) * frac) as u8,
        (a[2] as f32 + (b[2] as f32 - a[2] as f32) * frac) as u8,
    ]
}

pub fn blend_pixel(dst: [u8; 3], src: [u8; 3], opacity: f32, mode: &LayerBlendMode) -> [u8; 3] {
    let op = opacity.clamp(0.0, 1.0);
    let mut out = [0u8; 3];
    for c in 0..3 {
        let d = dst[c] as f32 / 255.0;
        let s = src[c] as f32 / 255.0;
        let blended = match mode {
            LayerBlendMode::Normal => s,
            LayerBlendMode::Additive => (d + s).min(1.0),
            LayerBlendMode::Screen => 1.0 - (1.0 - d) * (1.0 - s),
            LayerBlendMode::Maximum => d.max(s),
            LayerBlendMode::Multiply => d * s,
        };
        let mixed = d + (blended - d) * op;
        out[c] = (mixed.clamp(0.0, 1.0) * 255.0).round() as u8;
    }
    out
}

fn matches_zone(node: &LedTopologyNode, zone_filter: &str) -> bool {
    match zone_filter {
        "" | "all" => true,
        "wasd" => matches!(node.web_code.as_str(), "KeyW" | "KeyA" | "KeyS" | "KeyD"),
        other => node.zone == other,
    }
}

#[allow(clippy::too_many_arguments)]
pub fn render_composited_frame(
    preset: &SxLightingPreset,
    topology: &[LedTopologyNode],
    t: f32,
    now: Instant,
    ripples: &VecDeque<RipplePulse>,
    key_heat: &HashMap<usize, f32>,
    audio_level: f32,
    audio_bands: &[f32; 8],
) -> Vec<[u8; 3]> {
    let mut matrix = vec![[0u8, 0u8, 0u8]; 126];
    let bright_scale = (preset.max_brightness as f32 / 100.0).clamp(0.05, 1.0);

    for layer in &preset.layers {
        if !layer.enabled {
            continue;
        }
        let spd = layer.speed;
        let scl = layer.scale.max(0.25);

        for node in topology {
            if node.matrix_index >= 126 || !matches_zone(node, &layer.zone_filter) {
                continue;
            }
            let x = match layer.direction {
                WaveDirection::LeftToRight => node.x,
                WaveDirection::RightToLeft => 1.0 - node.x,
                WaveDirection::TopToBottom => node.y,
                WaveDirection::RadialOut => {
                    let dx = node.x - 0.5;
                    let dy = node.y - 0.5;
                    (dx * dx + dy * dy).sqrt() * 1.414
                }
            };
            let y = node.y;

            let src_rgb: Option<[u8; 3]> = match layer.effect {
                AnimationKind::SolidColor | AnimationKind::WasdHighlight => {
                    Some(layer.palette.first().copied().unwrap_or([255, 255, 255]))
                }
                AnimationKind::MultiColorGradient => Some(lerp_palette(&layer.palette, x * scl)),
                AnimationKind::RainbowWave => {
                    Some(hsv_to_rgb((x * scl * 0.8) - t * spd * 0.25, 0.95, 1.0))
                }
                AnimationKind::ColorCycle => Some(hsv_to_rgb(t * spd * 0.14, 0.9, 1.0)),
                AnimationKind::Breathing => {
                    let wave = 0.5 + 0.5 * (t * spd * 2.1).sin();
                    let col = lerp_palette(&layer.palette, t * 0.08);
                    Some([
                        (col[0] as f32 * wave) as u8,
                        (col[1] as f32 * wave) as u8,
                        (col[2] as f32 * wave) as u8,
                    ])
                }
                AnimationKind::Spiral => {
                    let dx = node.x - 0.5;
                    let dy = node.y - 0.5;
                    let angle = dy.atan2(dx) / std::f32::consts::TAU + 0.5;
                    let dist = (dx * dx + dy * dy).sqrt();
                    Some(hsv_to_rgb(angle + dist * 0.6 * scl - t * spd * 0.3, 0.95, 1.0))
                }
                AnimationKind::Aurora => {
                    let p = ((x * 2.3 * scl + t * spd * 0.25).sin()
                        + (y * 3.1 + t * spd * 0.18).cos())
                        * 0.25
                        + 0.5;
                    Some(lerp_palette(&layer.palette, p))
                }
                AnimationKind::GradientFlow => {
                    let p = (x * scl + t * spd * 0.25).fract();
                    Some(lerp_palette(&layer.palette, p))
                }
                AnimationKind::CircularWave => {
                    let dx = node.x - 0.5;
                    let dy = node.y - 0.5;
                    let dist = (dx * dx + dy * dy).sqrt() * 2.0 * scl;
                    let w = (0.5 + 0.5 * (dist * 6.0 - t * spd * 4.0).sin()).powf(1.5);
                    let col = lerp_palette(&layer.palette, dist - t * 0.15);
                    Some([
                        (col[0] as f32 * w) as u8,
                        (col[1] as f32 * w) as u8,
                        (col[2] as f32 * w) as u8,
                    ])
                }
                AnimationKind::Plasma => {
                    let v1 = (node.x * 5.0 * scl + t * spd).sin();
                    let v2 = ((node.y * 4.0 + t * spd * 0.7).sin() + v1) * 0.5;
                    Some(hsv_to_rgb(0.5 + 0.5 * v2, 0.9, 1.0))
                }
                AnimationKind::MatrixRain => {
                    let seed = ((node.matrix_index as f32 * 1.618).fract()) * 3.0;
                    let drop = ((y * 1.2 - t * spd * 0.65 - seed).rem_euclid(1.4)) / 1.4;
                    let intensity = if drop < 0.35 { 1.0 - drop / 0.35 } else { 0.04 };
                    let col = layer.palette.first().copied().unwrap_or([40, 240, 120]);
                    Some([
                        (col[0] as f32 * intensity) as u8,
                        (col[1] as f32 * intensity) as u8,
                        (col[2] as f32 * intensity) as u8,
                    ])
                }
                AnimationKind::Fire => {
                    let flicker = (node.x * 12.0 + t * spd * 6.0).sin() * 0.15;
                    let heat = (node.y + flicker).clamp(0.0, 1.0);
                    Some([
                        (255.0 * heat.min(1.0)) as u8,
                        (140.0 * heat * heat) as u8,
                        (25.0 * heat.powi(3)) as u8,
                    ])
                }
                AnimationKind::MeteorTrail => {
                    let head = (t * spd * 0.55).fract();
                    let dist = (head - x).rem_euclid(1.0);
                    let glow = if dist < 0.25 { 1.0 - dist / 0.25 } else { 0.0 };
                    let col = layer.palette.first().copied().unwrap_or([255, 255, 255]);
                    Some([
                        (col[0] as f32 * glow) as u8,
                        (col[1] as f32 * glow) as u8,
                        (col[2] as f32 * glow) as u8,
                    ])
                }
                AnimationKind::KeyPressFlash
                | AnimationKind::KeyReleaseFlash
                | AnimationKind::Ripple
                | AnimationKind::MultiKeyRipple
                | AnimationKind::ReactiveGradient => {
                    let want_release = layer.effect == AnimationKind::KeyReleaseFlash;
                    let mut boost = 0.0f32;
                    for pulse in ripples {
                        if layer.effect == AnimationKind::KeyReleaseFlash && !pulse.is_release {
                            continue;
                        }
                        if layer.effect == AnimationKind::KeyPressFlash && pulse.is_release {
                            continue;
                        }
                        let age = now.duration_since(pulse.born).as_secs_f32() * spd;
                        let dx = node.x - pulse.x;
                        let dy = node.y - pulse.y;
                        let dist = (dx * dx + dy * dy).sqrt();
                        if matches!(
                            layer.effect,
                            AnimationKind::KeyPressFlash | AnimationKind::KeyReleaseFlash
                        ) {
                            if dist < 0.08 && age < 0.55 {
                                boost = boost.max(1.0 - age / 0.55);
                            }
                        } else {
                            let radius = age * 0.9;
                            let ring = (1.0 - (dist - radius).abs() * 7.5).clamp(0.0, 1.0);
                            let decay = (1.0 - age / 1.4).clamp(0.0, 1.0);
                            boost = boost.max(ring * decay);
                            if want_release && pulse.is_release {
                                boost = boost.max(ring * decay);
                            }
                        }
                    }
                    if boost > 0.01 {
                        let col = lerp_palette(&layer.palette, boost);
                        Some([
                            (col[0] as f32 * boost) as u8,
                            (col[1] as f32 * boost) as u8,
                            (col[2] as f32 * boost) as u8,
                        ])
                    } else {
                        None
                    }
                }
                AnimationKind::TypingHeatmap => {
                    let heat = key_heat.get(&node.matrix_index).copied().unwrap_or(0.0);
                    if heat > 0.02 {
                        Some(lerp_palette(&layer.palette, heat))
                    } else {
                        None
                    }
                }
                AnimationKind::AudioBassPulse | AnimationKind::AudioBeatFlash => {
                    let intensity = if layer.effect == AnimationKind::AudioBeatFlash {
                        if audio_level > 0.35 { audio_level } else { 0.05 }
                    } else {
                        audio_level
                    };
                    let col = lerp_palette(&layer.palette, intensity);
                    Some([
                        (col[0] as f32 * intensity) as u8,
                        (col[1] as f32 * intensity) as u8,
                        (col[2] as f32 * intensity) as u8,
                    ])
                }
                AnimationKind::AudioSpectrum => {
                    let b = ((node.x * 7.99) as usize).min(7);
                    let lvl = audio_bands[b];
                    let height = 1.0 - node.y;
                    let lit = if lvl >= height * 0.95 { 1.0 } else { 0.06 };
                    let col = lerp_palette(&layer.palette, b as f32 / 7.0);
                    Some([
                        (col[0] as f32 * lit) as u8,
                        (col[1] as f32 * lit) as u8,
                        (col[2] as f32 * lit) as u8,
                    ])
                }
                AnimationKind::AudioWaveform => {
                    let wave_y = 0.5 + ((node.x * 10.0 + t * spd * 4.0).sin() * 0.45 * audio_level);
                    let dist = (node.y - wave_y).abs();
                    let lit = (1.0 - dist * 4.5).clamp(0.05, 1.0);
                    let col = layer.palette.first().copied().unwrap_or([255, 255, 255]);
                    Some([
                        (col[0] as f32 * lit) as u8,
                        (col[1] as f32 * lit) as u8,
                        (col[2] as f32 * lit) as u8,
                    ])
                }
            };

            if let Some(rgb) = src_rgb {
                matrix[node.matrix_index] =
                    blend_pixel(matrix[node.matrix_index], rgb, layer.opacity, &layer.blend_mode);
            }
        }
    }

    for px in &mut matrix {
        px[0] = (px[0] as f32 * bright_scale) as u8;
        px[1] = (px[1] as f32 * bright_scale) as u8;
        px[2] = (px[2] as f32 * bright_scale) as u8;
    }

    matrix
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn layer_blend_modes_work_within_bounds() {
        assert_eq!(blend_pixel([100, 50, 20], [200, 10, 10], 1.0, &LayerBlendMode::Maximum), [200, 50, 20]);
        assert_eq!(blend_pixel([200, 200, 200], [100, 100, 100], 1.0, &LayerBlendMode::Additive), [255, 255, 255]);
        assert_eq!(blend_pixel([0, 0, 0], [255, 255, 255], 0.5, &LayerBlendMode::Normal), [128, 128, 128]);
    }

    #[test]
    fn sxl_preset_validation_rejects_bad_magic_and_clamps_fps() {
        let mut p = default_presets().into_iter().next().unwrap();
        p.fps = 240;
        let ok = validate_preset(p.clone()).expect("valid preset clamps cleanly");
        assert_eq!(ok.fps, 30);

        p.magic = "evil-script".to_string();
        assert!(validate_preset(p).is_err());
    }

    #[test]
    fn compositor_renders_non_zero_frame_with_reactive_ripple() {
        let topo = crate::drivers::aula::f75::build_f75_topology();
        let preset = default_presets().into_iter().next().unwrap();
        let mut ripples = VecDeque::new();
        ripples.push_back(RipplePulse {
            x: 0.25,
            y: 0.5,
            born: Instant::now(),
            is_release: false,
        });
        let heat = HashMap::new();
        let frame = render_composited_frame(
            &preset,
            &topo,
            0.5,
            Instant::now(),
            &ripples,
            &heat,
            0.4,
            &[0.5; 8],
        );
        assert_eq!(frame.len(), 126);
        assert!(frame.iter().any(|rgb| rgb[0] > 0 || rgb[1] > 0 || rgb[2] > 0));
    }
}
