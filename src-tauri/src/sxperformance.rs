use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "snake_case")]
pub enum SocdMode {
    Off,
    #[default]
    LastInput,
    FirstInput,
    Neutral,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SocdPair {
    pub key_a: String,
    pub key_b: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModTapRule {
    pub trigger_key: String,
    pub tap_key: String,
    pub hold_key: String,
    pub threshold_ms: u64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TapDanceRule {
    pub trigger_key: String,
    pub single_key: String,
    pub double_key: String,
    pub window_ms: u64,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxPerformanceConfig {
    /// Strict opt-in: false by default so normal keyboard input never touches uinput.
    pub enabled: bool,
    pub socd_mode: SocdMode,
    pub socd_pairs: Vec<SocdPair>,
    pub mod_taps: Vec<ModTapRule>,
    pub tap_dances: Vec<TapDanceRule>,
    pub one_shot_mods: Vec<String>,
    pub key_remaps: HashMap<String, String>,
    pub emergency_bypass_key: String,
    pub bypass_on_unsupported_game: bool,
}

impl Default for SxPerformanceConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            socd_mode: SocdMode::LastInput,
            socd_pairs: vec![
                SocdPair {
                    key_a: "KeyA".to_string(),
                    key_b: "KeyD".to_string(),
                },
                SocdPair {
                    key_a: "KeyW".to_string(),
                    key_b: "KeyS".to_string(),
                },
            ],
            mod_taps: vec![ModTapRule {
                trigger_key: "CapsLock".to_string(),
                tap_key: "Escape".to_string(),
                hold_key: "ControlLeft".to_string(),
                threshold_ms: 175,
                enabled: false,
            }],
            tap_dances: Vec::new(),
            one_shot_mods: Vec::new(),
            key_remaps: HashMap::new(),
            emergency_bypass_key: "Pause".to_string(),
            bypass_on_unsupported_game: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct SxPerformanceDiagnostics {
    pub enabled: bool,
    pub uinput_ready: bool,
    pub virtual_pipeline_active: bool,
    pub grabbed_devices: Vec<String>,
    pub events_processed: u64,
    pub socd_resolutions: u64,
    pub mod_tap_triggers: u64,
    pub dropped_events: u64,
    pub reconnect_count: u64,
    pub events_per_sec: f32,
    pub last_proc_us: u32,
    pub avg_proc_us: f32,
    pub p95_proc_us: u32,
    pub max_proc_us: u32,
    pub last_error: Option<String>,
    pub latency_disclaimer: String,
}

pub fn config_path() -> PathBuf {
    let base = if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
        if !xdg.is_empty() {
            PathBuf::from(xdg).join("sxmcaps")
        } else {
            PathBuf::from(".")
        }
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config").join("sxmcaps")
    } else {
        PathBuf::from(".")
    };
    let _ = std::fs::create_dir_all(&base);
    base.join("sxperformance.json")
}

pub fn load_config() -> SxPerformanceConfig {
    let p = config_path();
    let mut cfg: SxPerformanceConfig = std::fs::read_to_string(p)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default();
    // Always boot with opt-in disabled unless cleanly safe — keeps reboot failsafe
    cfg.enabled = false;
    cfg
}

pub fn save_config(cfg: &SxPerformanceConfig) -> Result<(), String> {
    let json = serde_json::to_string_pretty(cfg).map_err(|e| e.to_string())?;
    std::fs::write(config_path(), json).map_err(|e| format!("Failed saving sxperformance config: {e}"))
}

/// Pure deterministic input transformation processor (SOCD, Mod-Tap, Tap Dance, Remaps).
/// Decoupled from kernel handles so every rule is unit-tested identically across OS targets.
pub struct TransformPipeline {
    cfg: SxPerformanceConfig,
    phys_down: HashSet<String>,
    virt_down: HashSet<String>,
    socd_last: HashMap<usize, String>,
    mod_tap_down_at: HashMap<String, u64>,
    tap_dance_last: HashMap<String, u64>,
    one_shot_armed: HashSet<String>,
    pub socd_resolutions: u64,
    pub mod_tap_triggers: u64,
}

impl TransformPipeline {
    pub fn new(cfg: SxPerformanceConfig) -> Self {
        Self {
            cfg,
            phys_down: HashSet::new(),
            virt_down: HashSet::new(),
            socd_last: HashMap::new(),
            mod_tap_down_at: HashMap::new(),
            tap_dance_last: HashMap::new(),
            one_shot_armed: HashSet::new(),
            socd_resolutions: 0,
            mod_tap_triggers: 0,
        }
    }

    pub fn update_config(&mut self, cfg: SxPerformanceConfig) {
        self.cfg = cfg;
    }

    pub fn held_outputs(&self) -> Vec<String> {
        self.virt_down.iter().cloned().collect()
    }

    pub fn clear_state(&mut self) {
        self.phys_down.clear();
        self.virt_down.clear();
        self.socd_last.clear();
        self.mod_tap_down_at.clear();
        self.tap_dance_last.clear();
        self.one_shot_armed.clear();
    }

    pub fn process_key(&mut self, raw_code: &str, is_down: bool, now_ms: u64) -> Vec<(String, bool)> {
        if is_down {
            self.phys_down.insert(raw_code.to_string());
        } else {
            self.phys_down.remove(raw_code);
        }

        // 1. Tap-Dance check
        if let Some(td) = self
            .cfg
            .tap_dances
            .iter()
            .find(|r| r.enabled && r.trigger_key == raw_code)
            .cloned()
        {
            if is_down {
                let prev = self.tap_dance_last.get(raw_code).copied().unwrap_or(0);
                self.tap_dance_last.insert(raw_code.to_string(), now_ms);
                let out_key = if now_ms.saturating_sub(prev) <= td.window_ms {
                    self.tap_dance_last.remove(raw_code);
                    td.double_key
                } else {
                    td.single_key
                };
                return self.emit_with_socd(&out_key, true);
            } else {
                // Release whichever of single/double is currently virtually down
                let mut evs = Vec::new();
                if self.virt_down.contains(&td.double_key) {
                    evs.extend(self.emit_with_socd(&td.double_key, false));
                }
                if self.virt_down.contains(&td.single_key) {
                    evs.extend(self.emit_with_socd(&td.single_key, false));
                }
                return evs;
            }
        }

        // 2. Mod-Tap check
        if let Some(mt) = self
            .cfg
            .mod_taps
            .iter()
            .find(|r| r.enabled && r.trigger_key == raw_code)
            .cloned()
        {
            if is_down {
                self.mod_tap_down_at.insert(raw_code.to_string(), now_ms);
                self.mod_tap_triggers += 1;
                return self.emit_virtual(&mt.hold_key, true);
            } else {
                let start = self.mod_tap_down_at.remove(raw_code).unwrap_or(now_ms);
                let held_ms = now_ms.saturating_sub(start);
                let mut evs = self.emit_virtual(&mt.hold_key, false);
                if held_ms < mt.threshold_ms {
                    evs.extend(self.emit_virtual(&mt.tap_key, true));
                    evs.extend(self.emit_virtual(&mt.tap_key, false));
                }
                return evs;
            }
        }

        // 3. One-Shot Modifier check
        if self.cfg.one_shot_mods.iter().any(|m| m == raw_code) {
            if is_down {
                self.one_shot_armed.insert(raw_code.to_string());
                return self.emit_virtual(raw_code, true);
            } else if self.one_shot_armed.contains(raw_code) {
                // Keep modifier virtually held until next non-mod key completes
                return Vec::new();
            }
        }

        // 4. Direct remap lookup
        let code = self
            .cfg
            .key_remaps
            .get(raw_code)
            .cloned()
            .unwrap_or_else(|| raw_code.to_string());

        let mut evs = self.emit_with_socd(&code, is_down);

        // Release any armed One-Shot modifiers after next regular key down/up
        if !is_down && !self.one_shot_armed.is_empty() {
            let armed: Vec<String> = self.one_shot_armed.drain().collect();
            for m in armed {
                evs.extend(self.emit_virtual(&m, false));
            }
        }
        evs
    }

    fn emit_with_socd(&mut self, code: &str, is_down: bool) -> Vec<(String, bool)> {
        if self.cfg.socd_mode == SocdMode::Off {
            return self.emit_virtual(code, is_down);
        }

        let pair_hit = self
            .cfg
            .socd_pairs
            .iter()
            .enumerate()
            .find(|(_, p)| p.key_a == code || p.key_b == code)
            .map(|(i, p)| (i, p.key_a.clone(), p.key_b.clone()));

        let Some((pair_idx, key_a, key_b)) = pair_hit else {
            return self.emit_virtual(code, is_down);
        };

        let opp = if code == key_a { &key_b } else { &key_a };
        let opp_phys_down = self.phys_down.contains(opp);
        let mut out = Vec::new();

        if is_down {
            if opp_phys_down {
                self.socd_resolutions += 1;
                match self.cfg.socd_mode {
                    SocdMode::LastInput => {
                        self.socd_last.insert(pair_idx, code.to_string());
                        if self.virt_down.contains(opp) {
                            out.extend(self.emit_virtual(opp, false));
                        }
                        out.extend(self.emit_virtual(code, true));
                    }
                    SocdMode::FirstInput => {
                        // Opp was already down first; suppress this key until opp releases
                    }
                    SocdMode::Neutral => {
                        if self.virt_down.contains(opp) {
                            out.extend(self.emit_virtual(opp, false));
                        }
                    }
                    SocdMode::Off => unreachable!(),
                }
            } else {
                self.socd_last.insert(pair_idx, code.to_string());
                out.extend(self.emit_virtual(code, true));
            }
        } else {
            // Releasing `code`
            if self.virt_down.contains(code) {
                out.extend(self.emit_virtual(code, false));
            }
            if opp_phys_down {
                // Re-engage opposing held key cleanly across all SOCD policies
                self.socd_resolutions += 1;
                self.socd_last.insert(pair_idx, opp.clone());
                out.extend(self.emit_virtual(opp, true));
            }
        }
        out
    }

    fn emit_virtual(&mut self, code: &str, is_down: bool) -> Vec<(String, bool)> {
        if is_down {
            if self.virt_down.insert(code.to_string()) {
                return vec![(code.to_string(), true)];
            }
        } else if self.virt_down.remove(code) {
            return vec![(code.to_string(), false)];
        }
        Vec::new()
    }
}

pub struct SxPerformanceEngine {
    cfg: Arc<Mutex<SxPerformanceConfig>>,
    diag: Arc<Mutex<SxPerformanceDiagnostics>>,
    bypass_trigger: Arc<AtomicBool>,
    samples_us: Arc<Mutex<VecDeque<u32>>>,
}

impl SxPerformanceEngine {
    pub fn start<F>(on_transformed: F) -> Self
    where
        F: Fn(String, bool) + Send + Sync + 'static,
    {
        let initial_cfg = load_config();
        let cfg = Arc::new(Mutex::new(initial_cfg));
        let diag = Arc::new(Mutex::new(SxPerformanceDiagnostics {
            uinput_ready: check_uinput_writable(),
            latency_disclaimer: "Measures SxmCaps software pipeline latency (evdev -> TransformPipeline -> uinput), not physical PCB/USB/display latency.".to_string(),
            ..Default::default()
        }));
        let bypass_trigger = Arc::new(AtomicBool::new(false));
        let samples_us = Arc::new(Mutex::new(VecDeque::with_capacity(256)));

        platform::spawn_worker(
            Arc::clone(&cfg),
            Arc::clone(&diag),
            Arc::clone(&bypass_trigger),
            Arc::clone(&samples_us),
            on_transformed,
        );

        Self {
            cfg,
            diag,
            bypass_trigger,
            samples_us,
        }
    }

    pub fn get_config(&self) -> SxPerformanceConfig {
        self.cfg.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn update_config(&self, next: SxPerformanceConfig) -> Result<SxPerformanceConfig, String> {
        save_config(&next)?;
        if let Ok(mut g) = self.cfg.lock() {
            *g = next.clone();
        }
        if let Ok(mut d) = self.diag.lock() {
            d.enabled = next.enabled;
            d.uinput_ready = check_uinput_writable();
        }
        Ok(next)
    }

    pub fn emergency_bypass(&self) -> Result<SxPerformanceConfig, String> {
        self.bypass_trigger.store(true, Ordering::SeqCst);
        let mut next = self.get_config();
        next.enabled = false;
        self.update_config(next)
    }

    pub fn get_diagnostics(&self) -> SxPerformanceDiagnostics {
        let mut d = self.diag.lock().map(|g| g.clone()).unwrap_or_default();
        if let Ok(samples) = self.samples_us.lock() {
            if !samples.is_empty() {
                let mut sorted: Vec<u32> = samples.iter().copied().collect();
                sorted.sort_unstable();
                let sum: u64 = sorted.iter().map(|&v| u64::from(v)).sum();
                d.avg_proc_us = sum as f32 / sorted.len() as f32;
                d.max_proc_us = *sorted.last().unwrap_or(&0);
                let p95_idx = ((sorted.len() as f32 * 0.95) as usize).min(sorted.len() - 1);
                d.p95_proc_us = sorted[p95_idx];
            }
        }
        d.uinput_ready = check_uinput_writable();
        d
    }
}

fn check_uinput_writable() -> bool {
    #[cfg(target_os = "linux")]
    {
        let Ok(c) = std::ffi::CString::new("/dev/uinput") else {
            return false;
        };
        let fd = unsafe { libc::open(c.as_ptr(), libc::O_WRONLY | libc::O_NONBLOCK) };
        if fd >= 0 {
            unsafe { libc::close(fd) };
            true
        } else {
            false
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        false
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::*;
    use crate::keycodes::{evdev_to_web_code, web_code_to_evdev_code};
    use std::ffi::CString;
    use std::fs;
    use std::mem;
    use std::path::Path;
    use std::time::Duration;

    const EVIOCGRAB: libc::c_ulong = 0x4004_4590;
    const UI_SET_EVBIT: libc::c_ulong = 0x4004_5564;
    const UI_SET_KEYBIT: libc::c_ulong = 0x4004_5565;
    const UI_DEV_SETUP: libc::c_ulong = 0x405c_5503;
    const UI_DEV_CREATE: libc::c_ulong = 0x5501;
    const UI_DEV_DESTROY: libc::c_ulong = 0x5502;
    const VIRTUAL_NAME: &str = "SxmCaps Virtual Keyboard (SxPerformance)";

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct RawInputEvent {
        time: libc::timeval,
        type_: u16,
        code: u16,
        value: i32,
    }

    #[repr(C)]
    struct UinputSetup {
        id: InputId,
        name: [u8; 80],
        ff_effects_max: u32,
    }

    #[repr(C)]
    struct InputId {
        bustype: u16,
        vendor: u16,
        product: u16,
        version: u16,
    }

    struct GrabbedKbd {
        fd: libc::c_int,
        name: String,
    }

    impl Drop for GrabbedKbd {
        fn drop(&mut self) {
            if self.fd >= 0 {
                unsafe {
                    libc::ioctl(self.fd, EVIOCGRAB as _, 0);
                    libc::close(self.fd);
                }
            }
        }
    }

    struct VirtualUinput {
        fd: libc::c_int,
    }

    impl VirtualUinput {
        fn create() -> Result<Self, String> {
            let cpath = CString::new("/dev/uinput").unwrap();
            let fd = unsafe { libc::open(cpath.as_ptr(), libc::O_WRONLY | libc::O_NONBLOCK) };
            if fd < 0 {
                return Err(format!(
                    "Cannot open /dev/uinput: {}",
                    std::io::Error::last_os_error()
                ));
            }
            unsafe {
                libc::ioctl(fd, UI_SET_EVBIT as _, 1); // EV_KEY
                libc::ioctl(fd, UI_SET_EVBIT as _, 0); // EV_SYN
                for code in 1..249 {
                    libc::ioctl(fd, UI_SET_KEYBIT as _, code);
                }
                let mut setup = UinputSetup {
                    id: InputId {
                        bustype: 0x06, // BUS_VIRTUAL
                        vendor: 0x5358,
                        product: 0x5046,
                        version: 1,
                    },
                    name: [0; 80],
                    ff_effects_max: 0,
                };
                let bytes = VIRTUAL_NAME.as_bytes();
                let n = bytes.len().min(79);
                setup.name[..n].copy_from_slice(&bytes[..n]);
                if libc::ioctl(fd, UI_DEV_SETUP as _, &setup as *const UinputSetup) < 0 {
                    libc::close(fd);
                    return Err("UI_DEV_SETUP ioctl failed".to_string());
                }
                if libc::ioctl(fd, UI_DEV_CREATE as _) < 0 {
                    libc::close(fd);
                    return Err("UI_DEV_CREATE ioctl failed".to_string());
                }
            }
            std::thread::sleep(Duration::from_millis(80));
            Ok(Self { fd })
        }

        fn emit_key(&self, code: u16, is_down: bool) {
            let evs = [
                RawInputEvent {
                    time: libc::timeval { tv_sec: 0, tv_usec: 0 },
                    type_: 1,
                    code,
                    value: if is_down { 1 } else { 0 },
                },
                RawInputEvent {
                    time: libc::timeval { tv_sec: 0, tv_usec: 0 },
                    type_: 0,
                    code: 0,
                    value: 0,
                },
            ];
            unsafe {
                libc::write(
                    self.fd,
                    evs.as_ptr() as *const libc::c_void,
                    mem::size_of_val(&evs),
                );
            }
        }
    }

    impl Drop for VirtualUinput {
        fn drop(&mut self) {
            if self.fd >= 0 {
                unsafe {
                    libc::ioctl(self.fd, UI_DEV_DESTROY as _);
                    libc::close(self.fd);
                }
            }
        }
    }

    fn open_physical_keyboards() -> Vec<GrabbedKbd> {
        let mut out = Vec::new();
        let Ok(entries) = fs::read_dir("/dev/input") else {
            return out;
        };
        for ent in entries.flatten() {
            let fname = ent.file_name().to_string_lossy().into_owned();
            if !fname.starts_with("event") {
                continue;
            }
            let sys = Path::new("/sys/class/input").join(&fname).join("device");
            let name = fs::read_to_string(sys.join("name"))
                .map(|s| s.trim().to_string())
                .unwrap_or_default();
            // CRITICAL: never grab our own virtual SxmCaps keyboard or mouse devices!
            if name.contains("SxmCaps Virtual") || name.contains("Furylevel") {
                continue;
            }
            let ev_caps = fs::read_to_string(sys.join("capabilities/ev")).unwrap_or_default();
            let key_caps = fs::read_to_string(sys.join("capabilities/key")).unwrap_or_default();
            let ev_val = u64::from_str_radix(ev_caps.trim(), 16).unwrap_or(0);
            if (ev_val & (1 << 1)) == 0 {
                continue;
            }
            // Check keyboard alphanumeric cap (low word has KeyQ/W/E/R bits) & not pointer-only
            let words: Vec<u64> = key_caps
                .split_whitespace()
                .filter_map(|w| u64::from_str_radix(w, 16).ok())
                .collect();
            let low = words.last().copied().unwrap_or(0);
            let is_kbd = (low & 0x7fff_0000) != 0;
            if !is_kbd {
                continue;
            }

            let path = format!("/dev/input/{fname}");
            let Ok(cpath) = CString::new(path) else {
                continue;
            };
            let fd = unsafe { libc::open(cpath.as_ptr(), libc::O_RDONLY | libc::O_NONBLOCK) };
            if fd < 0 {
                continue;
            }
            if unsafe { libc::ioctl(fd, EVIOCGRAB as _, 1) } < 0 {
                unsafe { libc::close(fd) };
                continue;
            }
            out.push(GrabbedKbd { fd, name });
        }
        out
    }

    pub fn spawn_worker<F>(
        cfg_arc: Arc<Mutex<SxPerformanceConfig>>,
        diag_arc: Arc<Mutex<SxPerformanceDiagnostics>>,
        bypass: Arc<AtomicBool>,
        samples_us: Arc<Mutex<VecDeque<u32>>>,
        on_transformed: F,
    ) where
        F: Fn(String, bool) + Send + Sync + 'static,
    {
        std::thread::Builder::new()
            .name("sxperformance".to_string())
            .spawn(move || {
                let epoch = Instant::now();
                let mut udev: Option<VirtualUinput> = None;
                let mut grabbed: Vec<GrabbedKbd> = Vec::new();
                let mut pipeline = TransformPipeline::new(SxPerformanceConfig::default());
                let mut last_scan = Instant::now();
                let mut sec_events = 0u32;
                let mut sec_window = Instant::now();
                let mut buf = [RawInputEvent {
                    time: libc::timeval { tv_sec: 0, tv_usec: 0 },
                    type_: 0,
                    code: 0,
                    value: 0,
                }; 64];

                loop {
                    let cur_cfg = cfg_arc.lock().map(|g| g.clone()).unwrap_or_default();
                    let emergency = bypass.swap(false, Ordering::SeqCst);

                    if !cur_cfg.enabled || emergency {
                        if let Some(ref virt) = udev {
                            for held in pipeline.held_outputs() {
                                if let Some(ev_code) = web_code_to_evdev_code(&held) {
                                    virt.emit_key(ev_code, false);
                                }
                            }
                        }
                        pipeline.clear_state();
                        grabbed.clear();
                        udev = None;
                        if let Ok(mut d) = diag_arc.lock() {
                            d.enabled = false;
                            d.virtual_pipeline_active = false;
                            d.grabbed_devices.clear();
                        }
                        std::thread::sleep(Duration::from_millis(120));
                        continue;
                    }

                    pipeline.update_config(cur_cfg.clone());

                    if udev.is_none() {
                        match VirtualUinput::create() {
                            Ok(v) => {
                                udev = Some(v);
                                if let Ok(mut d) = diag_arc.lock() {
                                    d.last_error = None;
                                }
                            }
                            Err(e) => {
                                if let Ok(mut d) = diag_arc.lock() {
                                    d.last_error = Some(e);
                                    d.virtual_pipeline_active = false;
                                }
                                std::thread::sleep(Duration::from_millis(500));
                                continue;
                            }
                        }
                    }

                    if grabbed.is_empty() || last_scan.elapsed() >= Duration::from_secs(4) {
                        if grabbed.is_empty() {
                            grabbed = open_physical_keyboards();
                            last_scan = Instant::now();
                        }
                        if let Ok(mut d) = diag_arc.lock() {
                            d.enabled = true;
                            d.virtual_pipeline_active = udev.is_some() && !grabbed.is_empty();
                            d.grabbed_devices = grabbed.iter().map(|g| g.name.clone()).collect();
                        }
                    }

                    if grabbed.is_empty() {
                        std::thread::sleep(Duration::from_millis(200));
                        continue;
                    }

                    let mut pollfds: Vec<libc::pollfd> = grabbed
                        .iter()
                        .map(|g| libc::pollfd {
                            fd: g.fd,
                            events: libc::POLLIN,
                            revents: 0,
                        })
                        .collect();

                    let ret = unsafe { libc::poll(pollfds.as_mut_ptr(), pollfds.len() as _, 80) };
                    if ret <= 0 {
                        continue;
                    }

                    let ev_size = mem::size_of::<RawInputEvent>();
                    let mut dropped_any = false;

                    for pfd in &pollfds {
                        if (pfd.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL)) != 0 {
                            dropped_any = true;
                            continue;
                        }
                        if (pfd.revents & libc::POLLIN) == 0 {
                            continue;
                        }
                        loop {
                            let bytes = unsafe {
                                libc::read(
                                    pfd.fd,
                                    buf.as_mut_ptr() as *mut libc::c_void,
                                    buf.len() * ev_size,
                                )
                            };
                            if bytes <= 0 {
                                break;
                            }
                            let cnt = (bytes as usize) / ev_size;
                            for ev in &buf[..cnt] {
                                if ev.type_ != 1 || (ev.value != 0 && ev.value != 1) {
                                    continue;
                                }
                                let t0 = Instant::now();
                                let web_code = evdev_to_web_code(ev.code);
                                let is_down = ev.value == 1;

                                // Emergency bypass key cancels grab immediately!
                                if is_down && web_code == cur_cfg.emergency_bypass_key {
                                    bypass.store(true, Ordering::SeqCst);
                                    if let Ok(mut cg) = cfg_arc.lock() {
                                        cg.enabled = false;
                                    }
                                    break;
                                }

                                let now_ms = epoch.elapsed().as_millis() as u64;
                                let transformed = pipeline.process_key(web_code, is_down, now_ms);
                                if let Some(ref virt) = udev {
                                    for (out_web, out_down) in transformed {
                                        if let Some(code_u16) = web_code_to_evdev_code(&out_web) {
                                            virt.emit_key(code_u16, out_down);
                                        }
                                        on_transformed(out_web, out_down);
                                    }
                                }

                                let us = t0.elapsed().as_micros() as u32;
                                sec_events += 1;
                                if let Ok(mut s) = samples_us.lock() {
                                    if s.len() >= 256 {
                                        s.pop_front();
                                    }
                                    s.push_back(us);
                                }
                                if let Ok(mut d) = diag_arc.lock() {
                                    d.events_processed += 1;
                                    d.last_proc_us = us;
                                    d.socd_resolutions = pipeline.socd_resolutions;
                                    d.mod_tap_triggers = pipeline.mod_tap_triggers;
                                }
                            }
                        }
                    }

                    if dropped_any {
                        grabbed.clear();
                        if let Ok(mut d) = diag_arc.lock() {
                            d.reconnect_count += 1;
                        }
                    }

                    if sec_window.elapsed() >= std::time::Duration::from_secs(1) {
                        if let Ok(mut d) = diag_arc.lock() {
                            d.events_per_sec = sec_events as f32 / sec_window.elapsed().as_secs_f32();
                        }
                        sec_events = 0;
                        sec_window = Instant::now();
                    }
                }
            })
            .expect("sxperformance worker spawn failed");
    }
}

#[cfg(not(target_os = "linux"))]
mod platform {
    use super::*;
    pub fn spawn_worker<F>(
        _: Arc<Mutex<SxPerformanceConfig>>,
        diag: Arc<Mutex<SxPerformanceDiagnostics>>,
        _: Arc<AtomicBool>,
        _: Arc<Mutex<VecDeque<u32>>>,
        _: F,
    ) where
        F: Fn(String, bool) + Send + Sync + 'static,
    {
        if let Ok(mut d) = diag.lock() {
            d.last_error = Some("Linux evdev/uinput virtual pipeline applies to Linux only.".to_string());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn socd_last_input_prioritizes_newest_and_restores_held_opposite() {
        let mut cfg = SxPerformanceConfig::default();
        cfg.enabled = true;
        cfg.socd_mode = SocdMode::LastInput;
        let mut p = TransformPipeline::new(cfg);

        assert_eq!(p.process_key("KeyA", true, 10), vec![("KeyA".into(), true)]);
        // Holding KeyA, pressing KeyD -> cancels KeyA, engages KeyD
        assert_eq!(
            p.process_key("KeyD", true, 20),
            vec![("KeyA".into(), false), ("KeyD".into(), true)]
        );
        // Releasing KeyD while KeyA is still physically held -> cancels KeyD, re-engages KeyA
        assert_eq!(
            p.process_key("KeyD", false, 30),
            vec![("KeyD".into(), false), ("KeyA".into(), true)]
        );
        assert_eq!(p.process_key("KeyA", false, 40), vec![("KeyA".into(), false)]);
    }

    #[test]
    fn socd_neutral_and_first_input_behave_accurately() {
        let mut cfg = SxPerformanceConfig::default();
        cfg.enabled = true;
        cfg.socd_mode = SocdMode::Neutral;
        let mut p = TransformPipeline::new(cfg);

        assert_eq!(p.process_key("KeyA", true, 10), vec![("KeyA".into(), true)]);
        assert_eq!(p.process_key("KeyD", true, 20), vec![("KeyA".into(), false)]);

        let mut cfg2 = SxPerformanceConfig::default();
        cfg2.enabled = true;
        cfg2.socd_mode = SocdMode::FirstInput;
        let mut p2 = TransformPipeline::new(cfg2);
        assert_eq!(p2.process_key("KeyA", true, 10), vec![("KeyA".into(), true)]);
        assert!(p2.process_key("KeyD", true, 20).is_empty());
    }

    #[test]
    fn mod_tap_emits_tap_on_short_press() {
        let mut cfg = SxPerformanceConfig::default();
        cfg.enabled = true;
        cfg.mod_taps[0].enabled = true;
        let mut p = TransformPipeline::new(cfg);

        assert_eq!(
            p.process_key("CapsLock", true, 100),
            vec![("ControlLeft".into(), true)]
        );
        assert_eq!(
            p.process_key("CapsLock", false, 180),
            vec![
                ("ControlLeft".into(), false),
                ("Escape".into(), true),
                ("Escape".into(), false),
            ]
        );
    }
}
