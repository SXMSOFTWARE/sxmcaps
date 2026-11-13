mod audio;
mod autostart;
mod drivers;
mod input_listener;
mod keycodes;
mod pack_hub;
mod profiles;
mod settings;
mod soundpack;
mod stats;
mod studio;
mod sxboards_presets;
mod sxlighting;
mod sxperformance;

use audio::{AudioEngine, DspParams};
use autostart::{is_autostart_enabled, set_autostart};
use drivers::{
    discover_all_devices, install_sxboards_udev_rules, list_f75_remap_targets,
    open_driver_for_device, DeviceHardwareState, HardwareDeviceInfo, KeymapEntryDto,
    PeripheralDriver, RemapTargetDto,
};
use input_listener::{
    install_udev_input_rule, start_global_listener, GlobalInputEvent, InputListenerHandle,
    InputStatus,
};
use keycodes::web_code_pan;
use pack_hub::{check_latest_release, fetch_hub_catalog, install_pack_from_url, HubPackEntry, UpdateCheckResult};
use profiles::{get_active_window, ActiveWindowInfo};
use serde::Serialize;
use settings::{load_settings, save_settings, user_soundpacks_dir, AppSettings};
use soundpack::{
    delete_custom_soundpack, discover_soundpacks, import_soundpack_folder, import_soundpack_zip,
    load_soundpack, LoadedSoundpack, SoundpackInfo,
};
use stats::{StatsData, StatsManager};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock, RwLock};
use std::time::Duration;
use studio::{
    export_pack_zip, inspect_audio_file, preview_audio_slice, save_studio_pack,
    AudioInspectResult, StudioPackSpec,
};
use sxboards_presets::{
    load_workspace_store, save_workspace_store, SxBoardMacro, SxBoardPreset,
    SxBoardWorkspaceStore,
};
use sxlighting::{
    list_saved_presets as list_sxlighting_presets, presets_dir as sxlighting_presets_dir,
    save_preset_to_disk as save_sxlighting_preset_file, validate_preset as validate_sxlighting_preset,
    SxLightingEngine, SxLightingPreset, SxLightingStatus,
};
use sxperformance::{SxPerformanceConfig, SxPerformanceDiagnostics, SxPerformanceEngine};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, State, WindowEvent};
use tauri_plugin_dialog::DialogExt;

#[derive(Debug, Clone, Serialize)]
pub struct UiInputEvent {
    pub web_code: String,
    pub is_down: bool,
    pub is_mouse: bool,
    pub total_keystrokes: u64,
}

#[derive(Debug, Clone, Serialize)]
pub struct InitialStateDto {
    pub settings: AppSettings,
    pub soundpacks: Vec<SoundpackInfo>,
    pub input_status: InputStatus,
    pub audio_devices: Vec<String>,
    pub stats: StatsData,
    pub soundpacks_dir: String,
    pub app_version: String,
    pub devices: Vec<HardwareDeviceInfo>,
    pub remap_targets: Vec<RemapTargetDto>,
    pub workspace: SxBoardWorkspaceStore,
    pub sxlighting_status: SxLightingStatus,
    pub sxlighting_presets: Vec<SxLightingPreset>,
    pub sxperformance_config: SxPerformanceConfig,
    pub sxperformance_diagnostics: SxPerformanceDiagnostics,
}

pub struct EngineState {
    pub audio: AudioEngine,
    pub settings: RwLock<AppSettings>,
    pub keyboard_pack: RwLock<Option<Arc<LoadedSoundpack>>>,
    pub mouse_pack: RwLock<Option<Arc<LoadedSoundpack>>>,
    pub builtin_roots: RwLock<Vec<PathBuf>>,
    pub input_listener: RwLock<Option<InputListenerHandle>>,
    pub stats: StatsManager,
    pub profile_override: Mutex<Option<ProfileOverrideState>>,
    pub driver_cache: RwLock<HashMap<String, Arc<dyn PeripheralDriver>>>,
    pub workspace_store: Mutex<SxBoardWorkspaceStore>,
    pub sxlighting: Arc<SxLightingEngine>,
    pub sxperformance: Arc<SxPerformanceEngine>,
    pub watched_device_id: RwLock<String>,
    pub app_handle_cell: Arc<OnceLock<AppHandle>>,
}

#[derive(Debug, Clone)]
pub struct ProfileOverrideState {
    pub base_pack: String,
    pub base_enabled: bool,
    pub active_rule_id: String,
}

impl EngineState {
    pub fn play_key_event(&self, web_code: &str, is_down: bool) {
        let cfg = self.settings.read().map(|g| g.clone()).unwrap_or_default();
        if !cfg.enabled {
            return;
        }
        if !is_down && !cfg.key_up_enabled {
            return;
        }
        let Ok(pack_guard) = self.keyboard_pack.read() else {
            return;
        };
        let Some(pack) = pack_guard.as_ref() else {
            return;
        };
        if let Some(clip) = pack.pick_clip(web_code, is_down) {
            let vol = if is_down {
                cfg.keyboard_volume
            } else {
                cfg.keyboard_volume * cfg.key_up_volume
            };
            let pan = if cfg.stereo_pan {
                web_code_pan(web_code)
            } else {
                0.0
            };
            self.audio.play_clip(&clip, vol, cfg.pitch_variation, pan);
            let band_idx = ((pan + 0.5).clamp(0.0, 0.99) * 8.0) as usize;
            let intensity = if is_down { vol.clamp(0.25, 1.0) } else { (vol * 0.45).clamp(0.1, 0.7) };
            self.sxlighting.notify_audio_trigger(intensity, band_idx);
        }
    }

    pub fn play_mouse_event(&self, web_code: &str, is_down: bool) {
        let cfg = self.settings.read().map(|g| g.clone()).unwrap_or_default();
        if !cfg.enabled || !cfg.mouse_enabled {
            return;
        }
        if !is_down && !cfg.key_up_enabled {
            return;
        }
        let Ok(pack_guard) = self.mouse_pack.read() else {
            return;
        };
        let Some(pack) = pack_guard.as_ref() else {
            return;
        };
        if let Some(clip) = pack.pick_clip(web_code, is_down) {
            let vol = if is_down {
                cfg.mouse_volume
            } else {
                cfg.mouse_volume * cfg.key_up_volume
            };
            self.audio
                .play_clip(&clip, vol, cfg.pitch_variation * 0.6, 0.0);
        }
    }

    fn reload_active_packs(&self) {
        let roots = self
            .builtin_roots
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();
        let packs = discover_soundpacks(&roots);
        let mut cfg = self.settings.read().map(|g| g.clone()).unwrap_or_default();
        let mut cfg_changed = false;

        // Migrate legacy v0.1/v0.2 synthetic pack IDs cleanly to real Mechvibes packs
        let mapped_kb = match cfg.active_keyboard_pack.as_str() {
            "holy-panda" => Some("holy-pandas"),
            "cherry-mx-blue" => Some("cherrymx-blue-pbt"),
            "cherry-mx-red" => Some("cherrymx-red-pbt"),
            "cherry-mx-brown" => Some("cherrymx-brown-pbt"),
            "cherry-mx-black" => Some("cherrymx-black-pbt"),
            "gateron-oil-king" => Some("eg-oreo"),
            "topre-45g" => Some("topre-purple-hybrid-pbt"),
            "ibm-model-m" => Some("cherrymx-blue-abs"),
            _ => None,
        };
        if let Some(m) = mapped_kb {
            cfg.active_keyboard_pack = m.to_string();
            cfg_changed = true;
        }
        let mapped_ms = match cfg.active_mouse_pack.as_str() {
            "mouse-omron" => Some("mouse-logi-g502"),
            "mouse-silent" => Some("mouse-chat"),
            _ => None,
        };
        if let Some(m) = mapped_ms {
            cfg.active_mouse_pack = m.to_string();
            cfg_changed = true;
        }

        if let Some(kb_info) = packs
            .iter()
            .find(|p| p.id == cfg.active_keyboard_pack && p.device_type != "mouse")
            .or_else(|| packs.iter().find(|p| p.device_type != "mouse"))
        {
            if cfg.active_keyboard_pack != kb_info.id {
                cfg.active_keyboard_pack = kb_info.id.clone();
                cfg_changed = true;
            }
            if let Ok(loaded) = load_soundpack(kb_info) {
                if let Ok(mut g) = self.keyboard_pack.write() {
                    *g = Some(Arc::new(loaded));
                }
            }
        }

        if let Some(ms_info) = packs
            .iter()
            .find(|p| p.id == cfg.active_mouse_pack && p.device_type == "mouse")
            .or_else(|| packs.iter().find(|p| p.device_type == "mouse"))
        {
            if cfg.active_mouse_pack != ms_info.id {
                cfg.active_mouse_pack = ms_info.id.clone();
                cfg_changed = true;
            }
            if let Ok(loaded) = load_soundpack(ms_info) {
                if let Ok(mut g) = self.mouse_pack.write() {
                    *g = Some(Arc::new(loaded));
                }
            }
        }

        if cfg_changed {
            let _ = save_settings(&cfg);
            if let Ok(mut g) = self.settings.write() {
                *g = cfg;
            }
        }
    }

    fn apply_keyboard_pack_internal(&self, pack_id: &str) -> Result<(), String> {
        let roots = self
            .builtin_roots
            .read()
            .map(|g| g.clone())
            .unwrap_or_default();
        let packs = discover_soundpacks(&roots);
        let info = packs
            .into_iter()
            .find(|p| p.id == pack_id)
            .ok_or_else(|| format!("Ses paketi bulunamadı: {pack_id}"))?;
        let loaded = load_soundpack(&info)?;
        if let Ok(mut g) = self.keyboard_pack.write() {
            *g = Some(Arc::new(loaded));
        }
        Ok(())
    }

    fn get_or_open_driver(&self, device_id: &str) -> Result<Arc<dyn PeripheralDriver>, String> {
        if !device_id.is_empty() {
            if let Ok(cache) = self.driver_cache.read() {
                if let Some(drv) = cache.get(device_id) {
                    return Ok(Arc::clone(drv));
                }
            }
        }
        let boxed = open_driver_for_device(device_id)?;
        let arc: Arc<dyn PeripheralDriver> = Arc::from(boxed);
        let id = arc.device_info().id;
        if let Ok(mut cache) = self.driver_cache.write() {
            cache.insert(id, Arc::clone(&arc));
        }
        Ok(arc)
    }
}

fn collect_builtin_roots(app: &AppHandle) -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(res) = app.path().resource_dir() {
        let cand = res.join("assets").join("soundpacks");
        if cand.is_dir() {
            roots.push(cand);
        }
        let cand_flat = res.join("soundpacks");
        if cand_flat.is_dir() {
            roots.push(cand_flat);
        }
    }
    let dev_cand = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("assets")
        .join("soundpacks");
    if dev_cand.is_dir() && !roots.contains(&dev_cand) {
        roots.push(dev_cand);
    }
    roots
}

#[tauri::command]
fn get_initial_state(state: State<'_, Arc<EngineState>>) -> InitialStateDto {
    let mut settings = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    settings.autostart = is_autostart_enabled();

    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    let soundpacks = discover_soundpacks(&roots);
    let input_status = state
        .input_listener
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|h| h.get_status()))
        .unwrap_or_default();
    let audio_devices = AudioEngine::list_output_devices();
    let stats = state.stats.snapshot();
    let devices = discover_all_devices();
    let remap_targets = list_f75_remap_targets();
    let workspace = state
        .workspace_store
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();

    InitialStateDto {
        settings,
        soundpacks,
        input_status,
        audio_devices,
        stats,
        soundpacks_dir: user_soundpacks_dir().to_string_lossy().to_string(),
        app_version: format!("v{}", env!("CARGO_PKG_VERSION")),
        devices,
        remap_targets,
        workspace,
        sxlighting_status: state.sxlighting.status(),
        sxlighting_presets: list_sxlighting_presets(),
        sxperformance_config: state.sxperformance.get_config(),
        sxperformance_diagnostics: state.sxperformance.get_diagnostics(),
    }
}

#[tauri::command]
fn list_soundpacks(state: State<'_, Arc<EngineState>>) -> Vec<SoundpackInfo> {
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    discover_soundpacks(&roots)
}

#[tauri::command]
fn select_keyboard_pack(
    pack_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<AppSettings, String> {
    state.apply_keyboard_pack_internal(&pack_id)?;
    let mut next_cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    next_cfg.active_keyboard_pack = pack_id;
    save_settings(&next_cfg)?;
    if let Ok(mut g) = state.settings.write() {
        *g = next_cfg.clone();
    }
    if let Ok(mut ov) = state.profile_override.lock() {
        *ov = None;
    }
    Ok(next_cfg)
}

#[tauri::command]
fn select_mouse_pack(
    pack_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<AppSettings, String> {
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    let packs = discover_soundpacks(&roots);
    let info = packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| format!("Fare ses paketi bulunamadı: {pack_id}"))?;

    let loaded = load_soundpack(&info)?;
    if let Ok(mut g) = state.mouse_pack.write() {
        *g = Some(Arc::new(loaded));
    }

    let mut next_cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    next_cfg.active_mouse_pack = pack_id;
    save_settings(&next_cfg)?;
    if let Ok(mut g) = state.settings.write() {
        *g = next_cfg.clone();
    }
    Ok(next_cfg)
}

#[tauri::command]
fn update_settings(
    mut new_settings: AppSettings,
    state: State<'_, Arc<EngineState>>,
) -> Result<AppSettings, String> {
    let old_cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();

    if old_cfg.audio_device != new_settings.audio_device {
        state
            .audio
            .set_output_device(new_settings.audio_device.clone())?;
    }

    if old_cfg.autostart != new_settings.autostart {
        new_settings.autostart = set_autostart(new_settings.autostart)?;
    }

    state.audio.update_dsp(DspParams::from_settings(&new_settings));

    save_settings(&new_settings)?;
    if let Ok(mut g) = state.settings.write() {
        *g = new_settings.clone();
    }
    if !new_settings.profiles_enabled {
        if let Ok(mut ov) = state.profile_override.lock() {
            *ov = None;
        }
    }
    Ok(new_settings)
}

#[tauri::command]
fn trigger_test_key(
    web_code: String,
    is_down: bool,
    state: State<'_, Arc<EngineState>>,
) -> Result<u64, String> {
    let total = if is_down {
        state.stats.record_key(&web_code)
    } else {
        state.stats.snapshot().total_keystrokes
    };
    state.play_key_event(&web_code, is_down);
    Ok(total)
}

#[tauri::command]
fn trigger_test_mouse(
    button: String,
    is_down: bool,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    if is_down {
        state.stats.record_mouse();
    }
    state.play_mouse_event(&button, is_down);
    Ok(())
}

#[tauri::command]
fn get_stats(state: State<'_, Arc<EngineState>>) -> StatsData {
    state.stats.snapshot()
}

#[tauri::command]
fn report_wpm(wpm: u32, state: State<'_, Arc<EngineState>>) {
    state.stats.update_peak_wpm(wpm);
}

#[tauri::command]
fn reset_stats(state: State<'_, Arc<EngineState>>) -> Result<StatsData, String> {
    state.stats.reset()
}

#[tauri::command]
fn get_active_window_info() -> Option<ActiveWindowInfo> {
    get_active_window()
}

#[tauri::command]
async fn pick_and_import_zip(
    app: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<Option<Vec<SoundpackInfo>>, String> {
    let app_clone = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app_clone
            .dialog()
            .file()
            .add_filter("Mechvibes / sxmcaps ZIP", &["zip"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("Dosya seçici hatası: {e}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Dosya yolu çözülemedi: {e}"))?;

    import_soundpack_zip(&path_buf)?;
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    Ok(Some(discover_soundpacks(&roots)))
}

#[tauri::command]
async fn pick_and_import_folder(
    app: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<Option<Vec<SoundpackInfo>>, String> {
    let app_clone = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app_clone.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| format!("Klasör seçici hatası: {e}"))?;

    let Some(folder_path) = picked else {
        return Ok(None);
    };
    let path_buf = folder_path
        .into_path()
        .map_err(|e| format!("Klasör yolu çözülemedi: {e}"))?;

    import_soundpack_folder(&path_buf)?;
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    Ok(Some(discover_soundpacks(&roots)))
}

#[tauri::command]
fn delete_soundpack(
    pack_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<SoundpackInfo>, String> {
    delete_custom_soundpack(&pack_id)?;
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    let packs = discover_soundpacks(&roots);

    let mut cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    let mut changed = false;
    if cfg.active_keyboard_pack == pack_id {
        cfg.active_keyboard_pack = "cherrymx-brown-pbt".to_string();
        changed = true;
    }
    if cfg.active_mouse_pack == pack_id {
        cfg.active_mouse_pack = "mouse-logi-g502".to_string();
        changed = true;
    }
    if changed {
        let _ = save_settings(&cfg);
        if let Ok(mut g) = state.settings.write() {
            *g = cfg;
        }
        state.reload_active_packs();
    }
    Ok(packs)
}

#[tauri::command]
fn open_soundpacks_folder() -> Result<(), String> {
    let dir = user_soundpacks_dir();
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(target_os = "windows")]
    let mut cmd = std::process::Command::new("explorer");
    #[cfg(target_os = "macos")]
    let mut cmd = std::process::Command::new("open");
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let mut cmd = std::process::Command::new("xdg-open");

    cmd.arg(&dir)
        .spawn()
        .map_err(|e| format!("Klasör açılamadı: {e}"))?;
    Ok(())
}

#[tauri::command]
fn get_input_status(state: State<'_, Arc<EngineState>>) -> InputStatus {
    state
        .input_listener
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|h| h.get_status()))
        .unwrap_or_default()
}

#[tauri::command]
fn rescan_input_devices(state: State<'_, Arc<EngineState>>) -> InputStatus {
    if let Ok(g) = state.input_listener.read() {
        if let Some(ref handle) = *g {
            handle.trigger_rescan();
        }
    }
    std::thread::sleep(Duration::from_millis(250));
    get_input_status(state)
}

#[tauri::command]
async fn enable_global_input_udev(state: State<'_, Arc<EngineState>>) -> Result<InputStatus, String> {
    tauri::async_runtime::spawn_blocking(install_udev_input_rule)
        .await
        .map_err(|e| format!("Görev hatası: {e}"))??;

    if let Ok(g) = state.input_listener.read() {
        if let Some(ref handle) = *g {
            handle.trigger_rescan();
        }
    }
    std::thread::sleep(Duration::from_millis(450));
    Ok(get_input_status(state))
}

#[tauri::command]
fn list_audio_devices() -> Vec<String> {
    AudioEngine::list_output_devices()
}

// ============================================================================
// Soundpack Studio Commands
// ============================================================================
#[tauri::command]
async fn pick_studio_audio_file(app: AppHandle) -> Result<Option<AudioInspectResult>, String> {
    let app_clone = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app_clone
            .dialog()
            .file()
            .add_filter("Ses Dosyaları", &["wav", "ogg", "mp3", "flac"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("Dosya seçici hatası: {e}"))?;

    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path_buf = file_path
        .into_path()
        .map_err(|e| format!("Dosya yolu çözülemedi: {e}"))?;
    inspect_audio_file(&path_buf).map(Some)
}

#[tauri::command]
fn preview_studio_slice(
    path: String,
    start_ms: u64,
    duration_ms: u64,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let vol = state
        .settings
        .read()
        .map(|g| g.keyboard_volume)
        .unwrap_or(0.85);
    preview_audio_slice(&state.audio, PathBuf::from(path).as_path(), start_ms, duration_ms, vol)
}

#[tauri::command]
fn save_studio_soundpack(
    spec: StudioPackSpec,
    state: State<'_, Arc<EngineState>>,
) -> Result<SoundpackInfo, String> {
    let info = save_studio_pack(spec)?;
    state.apply_keyboard_pack_internal(&info.id)?;
    let mut cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    cfg.active_keyboard_pack = info.id.clone();
    let _ = save_settings(&cfg);
    if let Ok(mut g) = state.settings.write() {
        *g = cfg.clone();
    }
    Ok(info)
}

#[tauri::command]
async fn export_soundpack_zip(
    pack_id: String,
    app: AppHandle,
    state: State<'_, Arc<EngineState>>,
) -> Result<Option<String>, String> {
    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    let packs = discover_soundpacks(&roots);
    let info = packs
        .into_iter()
        .find(|p| p.id == pack_id)
        .ok_or_else(|| "Dışa aktarılacak paket bulunamadı".to_string())?;

    let default_name = format!("{}.zip", info.id);
    let app_clone = app.clone();
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app_clone
            .dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter("ZIP Arşivi", &["zip"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Kayıt penceresi hatası: {e}"))?;

    let Some(dest) = picked else {
        return Ok(None);
    };
    let dest_path = dest
        .into_path()
        .map_err(|e| format!("Hedef yol çözülemedi: {e}"))?;
    export_pack_zip(&PathBuf::from(&info.path), &dest_path)?;
    Ok(Some(dest_path.to_string_lossy().to_string()))
}

// ============================================================================
// Pack Hub & Update Checker Commands
// ============================================================================
#[tauri::command]
async fn get_pack_hub_catalog() -> Result<Vec<HubPackEntry>, String> {
    tauri::async_runtime::spawn_blocking(fetch_hub_catalog)
        .await
        .map_err(|e| format!("Katalog yüklenemedi: {e}"))
}

#[tauri::command]
async fn install_hub_pack(
    url: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<SoundpackInfo>, String> {
    let url_clone = url.clone();
    tauri::async_runtime::spawn_blocking(move || install_pack_from_url(&url_clone))
        .await
        .map_err(|e| format!("İndirme görevi hatası: {e}"))??;

    let roots = state
        .builtin_roots
        .read()
        .map(|g| g.clone())
        .unwrap_or_default();
    Ok(discover_soundpacks(&roots))
}

#[tauri::command]
async fn check_app_update() -> Result<UpdateCheckResult, String> {
    tauri::async_runtime::spawn_blocking(check_latest_release)
        .await
        .map_err(|e| format!("Güncelleme kontrolü hatası: {e}"))?
}

// ============================================================================
// SxBoards Modular Driver & Hardware Communication Commands
// ============================================================================
#[tauri::command]
async fn discover_hardware_devices(
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<HardwareDeviceInfo>, String> {
    if let Ok(mut cache) = state.driver_cache.write() {
        cache.clear();
    }
    tauri::async_runtime::spawn_blocking(discover_all_devices)
        .await
        .map_err(|e| format!("Hardware discovery error: {e}"))
}

#[tauri::command]
async fn get_device_hardware_state(
    device_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<DeviceHardwareState, String> {
    if let Ok(mut w) = state.watched_device_id.write() {
        *w = device_id.clone();
    }
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.read_state())
        .await
        .map_err(|e| format!("Device read error: {e}"))?
}

#[tauri::command]
async fn apply_device_rgb_effect(
    device_id: String,
    effect_id: u8,
    brightness: u8,
    speed: u8,
    color_idx: u8,
    state: State<'_, Arc<EngineState>>,
) -> Result<DeviceHardwareState, String> {
    let _ = state.sxlighting.stop();
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        drv.apply_rgb_effect(effect_id, brightness, speed, color_idx)
    })
    .await
    .map_err(|e| format!("RGB write error: {e}"))?
}

#[tauri::command]
async fn apply_device_per_key_rgb(
    device_id: String,
    colors: Vec<[u8; 3]>,
    brightness: u8,
    state: State<'_, Arc<EngineState>>,
) -> Result<DeviceHardwareState, String> {
    let _ = state.sxlighting.stop();
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.apply_per_key_rgb(colors, brightness))
        .await
        .map_err(|e| format!("Per-key RGB write error: {e}"))?
}

#[tauri::command]
async fn set_device_realtime_rgb(
    device_id: String,
    colors: Vec<[u8; 3]>,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.set_realtime_rgb(colors))
        .await
        .map_err(|e| format!("Realtime RGB error: {e}"))?
}

#[tauri::command]
async fn apply_device_hardware_flags(
    device_id: String,
    side_mode: Option<u8>,
    knob_mode: Option<u8>,
    os_mode: Option<u8>,
    win_lock: Option<bool>,
    sleep_seconds: Option<u16>,
    state: State<'_, Arc<EngineState>>,
) -> Result<DeviceHardwareState, String> {
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        drv.apply_hardware_flags(side_mode, knob_mode, os_mode, win_lock, sleep_seconds)
    })
    .await
    .map_err(|e| format!("Hardware flags write error: {e}"))?
}

#[tauri::command]
async fn read_device_keymap(
    device_id: String,
    layer: u8,
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<KeymapEntryDto>, String> {
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.read_keymap(layer))
        .await
        .map_err(|e| format!("Keymap read error: {e}"))?
}

#[tauri::command]
async fn write_device_keymap_entry(
    device_id: String,
    layer: u8,
    matrix_index: u8,
    code: [u8; 4],
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<KeymapEntryDto>, String> {
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.write_keymap_entry(layer, matrix_index, code))
        .await
        .map_err(|e| format!("Keymap write error: {e}"))?
}

#[tauri::command]
async fn restore_device_keymap_layer(
    device_id: String,
    layer: u8,
    state: State<'_, Arc<EngineState>>,
) -> Result<Vec<KeymapEntryDto>, String> {
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.restore_default_layer(layer))
        .await
        .map_err(|e| format!("Keymap restore error: {e}"))?
}

#[tauri::command]
async fn install_sxboards_udev(
    state: State<'_, Arc<EngineState>>,
) -> Result<(InputStatus, Vec<HardwareDeviceInfo>), String> {
    tauri::async_runtime::spawn_blocking(install_sxboards_udev_rules)
        .await
        .map_err(|e| format!("udev spawn failed: {e}"))??;
    if let Ok(listener) = state.input_listener.read() {
        if let Some(ref h) = *listener {
            h.trigger_rescan();
        }
    }
    std::thread::sleep(Duration::from_millis(450));
    let input_status = state
        .input_listener
        .read()
        .ok()
        .and_then(|g| g.as_ref().map(|h| h.get_status()))
        .unwrap_or_default();
    if let Ok(mut cache) = state.driver_cache.write() {
        cache.clear();
    }
    let devices = discover_all_devices();
    Ok((input_status, devices))
}

#[tauri::command]
fn get_sxboard_workspace(state: State<'_, Arc<EngineState>>) -> SxBoardWorkspaceStore {
    state
        .workspace_store
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default()
}

#[tauri::command]
fn create_sxboard_preset(
    name: String,
    preset: SxBoardPreset,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxBoardWorkspaceStore, String> {
    let mut store = state
        .workspace_store
        .lock()
        .map_err(|_| "Workspace lock poisoned".to_string())?;
    let slug: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let id = format!("{}-{}", slug.trim_matches('-'), fastrand::u32(100..9999));
    let mut entry = preset;
    entry.id = id.clone();
    entry.name = if name.trim().is_empty() {
        "Custom Preset".to_string()
    } else {
        name.trim().to_string()
    };
    store.presets.push(entry);
    store.active_preset_id = id;
    save_workspace_store(&store)?;
    Ok(store.clone())
}

#[tauri::command]
fn save_in_active_sxboard_preset(
    preset: SxBoardPreset,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxBoardWorkspaceStore, String> {
    let mut store = state
        .workspace_store
        .lock()
        .map_err(|_| "Workspace lock poisoned".to_string())?;
    let active_id = store.active_preset_id.clone();
    if let Some(target) = store.presets.iter_mut().find(|p| p.id == active_id) {
        let keep_name = target.name.clone();
        *target = preset;
        target.id = active_id;
        target.name = keep_name;
    }
    save_workspace_store(&store)?;
    Ok(store.clone())
}

#[tauri::command]
fn overwrite_sxboard_preset(
    preset_id: String,
    preset: SxBoardPreset,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxBoardWorkspaceStore, String> {
    let mut store = state
        .workspace_store
        .lock()
        .map_err(|_| "Workspace lock poisoned".to_string())?;
    if let Some(target) = store.presets.iter_mut().find(|p| p.id == preset_id) {
        let keep_name = if preset.name.trim().is_empty() {
            target.name.clone()
        } else {
            preset.name.clone()
        };
        *target = preset;
        target.id = preset_id.clone();
        target.name = keep_name;
        store.active_preset_id = preset_id;
    }
    save_workspace_store(&store)?;
    Ok(store.clone())
}

#[tauri::command]
async fn select_and_apply_sxboard_preset(
    preset_id: String,
    device_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<(SxBoardWorkspaceStore, Option<DeviceHardwareState>, AppSettings), String> {
    let preset = {
        let mut store = state
            .workspace_store
            .lock()
            .map_err(|_| "Workspace lock poisoned".to_string())?;
        let p = store
            .presets
            .iter()
            .find(|p| p.id == preset_id)
            .cloned()
            .ok_or_else(|| "Preset not found".to_string())?;
        store.active_preset_id = preset_id;
        save_workspace_store(&store)?;
        p
    };

    // Update sound & DSP settings from preset cleanly
    let mut next_cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    if !preset.keyboard_pack.is_empty() {
        next_cfg.active_keyboard_pack = preset.keyboard_pack.clone();
    }
    if !preset.mouse_pack.is_empty() {
        next_cfg.active_mouse_pack = preset.mouse_pack.clone();
    }
    if !preset.plate_preset.is_empty() {
        next_cfg.plate_preset = preset.plate_preset.clone();
    }
    save_settings(&next_cfg)?;
    if let Ok(mut g) = state.settings.write() {
        *g = next_cfg.clone();
    }
    state.audio.update_dsp(DspParams::from_settings(&next_cfg));
    state.reload_active_packs();

    // Apply to hardware if writable driver exists
    let hw_state = if !device_id.is_empty() {
        if let Ok(drv) = state.get_or_open_driver(&device_id) {
            let info = drv.device_info();
            if info.capabilities.writable && info.online {
                let eff = preset.effect_id;
                let br = preset.brightness;
                let sp = preset.speed;
                let col = preset.color_idx;
                let side = preset.side_mode;
                let knob = preset.knob_mode;
                let os = preset.os_mode;
                let wl = preset.win_lock;
                let sl = preset.sleep_seconds;
                let pk = preset.per_key_colors.clone();
                let _ = tauri::async_runtime::spawn_blocking(move || {
                    if eff == 21 && !pk.is_empty() {
                        let _ = drv.apply_per_key_rgb(pk, br);
                    } else {
                        let _ = drv.apply_rgb_effect(eff, br, sp, col);
                    }
                    drv.apply_hardware_flags(Some(side), Some(knob), Some(os), Some(wl), Some(sl))
                })
                .await;
                if let Ok(drv2) = state.get_or_open_driver(&device_id) {
                    tauri::async_runtime::spawn_blocking(move || drv2.read_state())
                        .await
                        .ok()
                        .and_then(|r| r.ok())
                } else {
                    None
                }
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    let store = state
        .workspace_store
        .lock()
        .map(|g| g.clone())
        .unwrap_or_default();
    Ok((store, hw_state, next_cfg))
}

#[tauri::command]
fn delete_sxboard_preset(
    preset_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxBoardWorkspaceStore, String> {
    let mut store = state
        .workspace_store
        .lock()
        .map_err(|_| "Workspace lock poisoned".to_string())?;
    if store.presets.len() <= 1 {
        return Err("En az bir preset bulunmalıdır / Keep at least one preset.".to_string());
    }
    store.presets.retain(|p| p.id != preset_id);
    if store.active_preset_id == preset_id {
        store.active_preset_id = store.presets[0].id.clone();
    }
    save_workspace_store(&store)?;
    Ok(store.clone())
}

#[tauri::command]
fn save_sxboard_macros(
    macros: Vec<SxBoardMacro>,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxBoardWorkspaceStore, String> {
    let mut store = state
        .workspace_store
        .lock()
        .map_err(|_| "Workspace lock poisoned".to_string())?;
    store.macros = macros;
    save_workspace_store(&store)?;
    Ok(store.clone())
}

#[tauri::command]
async fn flash_macros_to_device(
    device_id: String,
    macros: Vec<SxBoardMacro>,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    {
        let mut store = state
            .workspace_store
            .lock()
            .map_err(|_| "Workspace lock poisoned".to_string())?;
        store.macros = macros.clone();
        save_workspace_store(&store)?;
    }
    let drv = state.get_or_open_driver(&device_id)?;
    tauri::async_runtime::spawn_blocking(move || drv.write_macros(&macros))
        .await
        .map_err(|e| format!("Macro flash error: {e}"))?
}

// ============================================================================
// SxLighting & SxPerformance & Live Hardware Sync Commands
// ============================================================================
#[tauri::command]
fn set_watched_hardware_device(device_id: String, state: State<'_, Arc<EngineState>>) {
    if let Ok(mut w) = state.watched_device_id.write() {
        *w = device_id;
    }
}

#[tauri::command]
fn get_sxlighting_state(state: State<'_, Arc<EngineState>>) -> (SxLightingStatus, Vec<SxLightingPreset>) {
    (state.sxlighting.status(), list_sxlighting_presets())
}

#[tauri::command]
fn apply_sxlighting_config(
    preset: SxLightingPreset,
    active: bool,
    stream_to_hardware: bool,
    device_id: String,
    state: State<'_, Arc<EngineState>>,
) -> Result<SxLightingStatus, String> {
    let driver = if active && !device_id.trim().is_empty() {
        state.get_or_open_driver(&device_id).ok()
    } else {
        None
    };
    state
        .sxlighting
        .apply_config(preset, active, stream_to_hardware, driver)
}

#[tauri::command]
fn stop_sxlighting(state: State<'_, Arc<EngineState>>) -> SxLightingStatus {
    state.sxlighting.stop()
}

#[tauri::command]
fn save_sxlighting_preset(
    preset: SxLightingPreset,
    state: State<'_, Arc<EngineState>>,
) -> Result<(SxLightingStatus, Vec<SxLightingPreset>), String> {
    let valid = validate_sxlighting_preset(preset)?;
    save_sxlighting_preset_file(&valid)?;
    Ok((state.sxlighting.status(), list_sxlighting_presets()))
}

#[tauri::command]
fn delete_sxlighting_preset(preset_id: String) -> Result<Vec<SxLightingPreset>, String> {
    let safe_id: String = preset_id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let path = sxlighting_presets_dir().join(format!("{safe_id}.sxl"));
    if path.exists() {
        std::fs::remove_file(&path)
            .map_err(|e| format!("Preset dosyası silinemedi: {e}"))?;
    }
    Ok(list_sxlighting_presets())
}

#[tauri::command]
async fn export_sxlighting_preset_file(
    preset: SxLightingPreset,
    app: AppHandle,
) -> Result<Option<String>, String> {
    let valid = validate_sxlighting_preset(preset)?;
    let safe_name: String = valid
        .id
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let default_name = format!("{}.sxl", safe_name.trim_matches('_'));
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .set_file_name(&default_name)
            .add_filter("SxLighting Preset (.sxl)", &["sxl", "json"])
            .blocking_save_file()
    })
    .await
    .map_err(|e| format!("Dosya penceresi hatası: {e}"))?;

    let Some(dest) = picked else {
        return Ok(None);
    };
    let dest_path = dest
        .into_path()
        .map_err(|e| format!("Hedef yol çözülemedi: {e}"))?;
    let json = serde_json::to_string_pretty(&valid).map_err(|e| e.to_string())?;
    std::fs::write(&dest_path, json).map_err(|e| format!("Yazma hatası: {e}"))?;
    Ok(Some(dest_path.to_string_lossy().to_string()))
}

#[tauri::command]
async fn import_sxlighting_preset_file(
    app: AppHandle,
) -> Result<Option<(SxLightingPreset, Vec<SxLightingPreset>)>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        app.dialog()
            .file()
            .add_filter("SxLighting Preset (.sxl)", &["sxl", "json"])
            .blocking_pick_file()
    })
    .await
    .map_err(|e| format!("Dosya seçme hatası: {e}"))?;

    let Some(file) = picked else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|e| format!("Dosya yolu çözülemedi: {e}"))?;
    let raw = std::fs::read_to_string(&path).map_err(|e| format!("Okuma hatası: {e}"))?;
    let parsed: SxLightingPreset =
        serde_json::from_str(&raw).map_err(|e| format!("Geçersiz .sxl biçimi: {e}"))?;
    let valid = validate_sxlighting_preset(parsed)?;
    let saved = save_sxlighting_preset_file(&valid)?;
    Ok(Some((saved, list_sxlighting_presets())))
}

#[tauri::command]
fn get_sxperformance_state(
    state: State<'_, Arc<EngineState>>,
) -> (SxPerformanceConfig, SxPerformanceDiagnostics) {
    (
        state.sxperformance.get_config(),
        state.sxperformance.get_diagnostics(),
    )
}

#[tauri::command]
fn update_sxperformance_config(
    config: SxPerformanceConfig,
    state: State<'_, Arc<EngineState>>,
) -> Result<(SxPerformanceConfig, SxPerformanceDiagnostics), String> {
    let saved = state.sxperformance.update_config(config)?;
    Ok((saved, state.sxperformance.get_diagnostics()))
}

#[tauri::command]
fn trigger_sxperformance_bypass(
    state: State<'_, Arc<EngineState>>,
) -> Result<(SxPerformanceConfig, SxPerformanceDiagnostics), String> {
    let saved = state.sxperformance.emergency_bypass()?;
    Ok((saved, state.sxperformance.get_diagnostics()))
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

fn spawn_profile_watcher(engine: Arc<EngineState>, app: AppHandle) {
    std::thread::Builder::new()
        .name("sxmcaps-profiles".to_string())
        .spawn(move || {
            let mut last_window: Option<ActiveWindowInfo> = None;
            loop {
                std::thread::sleep(Duration::from_millis(1200));

                let current_win = get_active_window();
                if current_win != last_window {
                    last_window = current_win.clone();
                    let _ = app.emit("sxmcaps://active-window", &current_win);
                }

                let cfg = engine.settings.read().map(|g| g.clone()).unwrap_or_default();
                if !cfg.profiles_enabled {
                    continue;
                }

                let Some(ref win) = current_win else {
                    continue;
                };
                let haystack_class = win.app_class.to_lowercase();
                let haystack_title = win.title.to_lowercase();

                let matched = cfg.app_profiles.iter().find(|r| {
                    if !r.enabled || r.pattern.trim().is_empty() {
                        return false;
                    }
                    let pat = r.pattern.trim().to_lowercase();
                    haystack_class.contains(&pat) || haystack_title.contains(&pat)
                });

                if let Some(rule) = matched {
                    let already_same = engine
                        .profile_override
                        .lock()
                        .ok()
                        .and_then(|g| g.as_ref().map(|o| o.active_rule_id == rule.id))
                        .unwrap_or(false);

                    if !already_same {
                        let base_info = engine
                            .profile_override
                            .lock()
                            .ok()
                            .and_then(|g| g.clone())
                            .unwrap_or(ProfileOverrideState {
                                base_pack: cfg.active_keyboard_pack.clone(),
                                base_enabled: cfg.enabled,
                                active_rule_id: String::new(),
                            });

                        if let Ok(mut ov) = engine.profile_override.lock() {
                            *ov = Some(ProfileOverrideState {
                                base_pack: base_info.base_pack.clone(),
                                base_enabled: base_info.base_enabled,
                                active_rule_id: rule.id.clone(),
                            });
                        }

                        let mut next_cfg = cfg.clone();
                        next_cfg.enabled = !rule.mute;
                        if !rule.mute && !rule.pack_id.is_empty() {
                            if engine.apply_keyboard_pack_internal(&rule.pack_id).is_ok() {
                                next_cfg.active_keyboard_pack = rule.pack_id.clone();
                            }
                        }
                        if let Ok(mut g) = engine.settings.write() {
                            *g = next_cfg.clone();
                        }
                        let _ = app.emit("sxmcaps://settings-updated", next_cfg);
                    }
                } else {
                    // Restore base settings if we previously overrode them
                    let prev = engine
                        .profile_override
                        .lock()
                        .ok()
                        .and_then(|mut g| g.take());

                    if let Some(base) = prev {
                        let mut next_cfg = cfg.clone();
                        next_cfg.enabled = base.base_enabled;
                        if engine.apply_keyboard_pack_internal(&base.base_pack).is_ok() {
                            next_cfg.active_keyboard_pack = base.base_pack;
                        }
                        if let Ok(mut g) = engine.settings.write() {
                            *g = next_cfg.clone();
                        }
                        let _ = app.emit("sxmcaps://settings-updated", next_cfg);
                    }
                }
            }
        })
        .expect("profile watcher thread spawn failed");
}

fn spawn_hardware_watcher(engine: Arc<EngineState>, app: AppHandle) {
    std::thread::Builder::new()
        .name("sxmcaps-hw-watch".to_string())
        .spawn(move || {
            let mut last_device_id = String::new();
            let mut last_state_sig = String::new();
            let mut tick = 0u64;
            loop {
                std::thread::sleep(Duration::from_millis(650));
                tick = tick.wrapping_add(1);

                if engine.sxlighting.is_streaming() {
                    continue;
                }

                let mut watched_id = engine
                    .watched_device_id
                    .read()
                    .map(|g| g.clone())
                    .unwrap_or_default();

                if watched_id.is_empty() && tick % 4 == 1 {
                    let devs = discover_all_devices();
                    if let Some(d) = devs
                        .into_iter()
                        .find(|d| d.online && d.capabilities.communication_supported)
                    {
                        watched_id = d.id.clone();
                        if let Ok(mut w) = engine.watched_device_id.write() {
                            *w = watched_id.clone();
                        }
                    }
                }

                if watched_id.is_empty() {
                    continue;
                }

                if watched_id != last_device_id {
                    last_device_id = watched_id.clone();
                    last_state_sig.clear();
                }

                let Ok(drv) = engine.get_or_open_driver(&watched_id) else {
                    continue;
                };

                let info = drv.device_info();
                if !info.online || !info.capabilities.communication_supported || !info.permission_ok
                {
                    continue;
                }
                if info.link != drivers::ConnectionLink::Wired && tick % 3 != 0 {
                    continue;
                }

                if let Ok(Some(hw_state)) = drv.poll_live_state() {
                    let sig = serde_json::to_string(&hw_state).unwrap_or_default();
                    if sig != last_state_sig {
                        last_state_sig = sig;
                        let _ = app.emit("sxmcaps://hardware-state", hw_state);
                    }
                }
            }
        })
        .expect("hardware watcher thread spawn failed");
}

pub fn run() {
    let mut initial_settings = load_settings();
    initial_settings.autostart = is_autostart_enabled();

    let dsp = DspParams::from_settings(&initial_settings);
    let audio = AudioEngine::new(initial_settings.audio_device.clone(), dsp);
    let stats = StatsManager::load();

    let workspace = load_workspace_store();
    let app_handle_cell: Arc<OnceLock<AppHandle>> = Arc::new(OnceLock::new());

    let app_cell_light = Arc::clone(&app_handle_cell);
    let sxlighting = Arc::new(SxLightingEngine::start(move |frame| {
        if let Some(app) = app_cell_light.get() {
            let _ = app.emit("sxmcaps://lighting-frame", frame);
        }
    }));

    let app_cell_perf = Arc::clone(&app_handle_cell);
    let sxperformance = Arc::new(SxPerformanceEngine::start(move |web_code, is_down| {
        if let Some(app) = app_cell_perf.get() {
            let _ = app.emit(
                "sxmcaps://performance-transformed",
                serde_json::json!({ "web_code": web_code, "is_down": is_down }),
            );
        }
    }));

    let engine = Arc::new(EngineState {
        audio,
        settings: RwLock::new(initial_settings),
        keyboard_pack: RwLock::new(None),
        mouse_pack: RwLock::new(None),
        builtin_roots: RwLock::new(Vec::new()),
        input_listener: RwLock::new(None),
        stats,
        profile_override: Mutex::new(None),
        driver_cache: RwLock::new(HashMap::new()),
        workspace_store: Mutex::new(workspace),
        sxlighting,
        sxperformance,
        watched_device_id: RwLock::new(String::new()),
        app_handle_cell,
    });

    let engine_setup = Arc::clone(&engine);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine)
        .setup(move |app| {
            let _ = engine_setup.app_handle_cell.set(app.handle().clone());

            let roots = collect_builtin_roots(app.handle());
            if let Ok(mut g) = engine_setup.builtin_roots.write() {
                *g = roots;
            }
            engine_setup.reload_active_packs();

            let app_handle = app.handle().clone();
            let engine_ev = Arc::clone(&engine_setup);

            let listener = start_global_listener(move |ev| match ev {
                GlobalInputEvent::Key { web_code, is_down } => {
                    engine_ev.play_key_event(web_code, is_down);
                    engine_ev.sxlighting.notify_key_event(web_code, is_down);
                    let total = if is_down {
                        engine_ev.stats.record_key(web_code)
                    } else {
                        engine_ev.stats.snapshot().total_keystrokes
                    };
                    let _ = app_handle.emit(
                        "sxmcaps://input-event",
                        UiInputEvent {
                            web_code: web_code.to_string(),
                            is_down,
                            is_mouse: false,
                            total_keystrokes: total,
                        },
                    );
                }
                GlobalInputEvent::Mouse { button, is_down } => {
                    let web_code = button.as_web_code();
                    engine_ev.play_mouse_event(web_code, is_down);
                    if is_down {
                        engine_ev.stats.record_mouse();
                    }
                    let total = engine_ev.stats.snapshot().total_keystrokes;
                    let _ = app_handle.emit(
                        "sxmcaps://input-event",
                        UiInputEvent {
                            web_code: web_code.to_string(),
                            is_down,
                            is_mouse: true,
                            total_keystrokes: total,
                        },
                    );
                }
            });

            if let Ok(mut g) = engine_setup.input_listener.write() {
                *g = Some(listener);
            }

            spawn_profile_watcher(Arc::clone(&engine_setup), app.handle().clone());
            spawn_hardware_watcher(Arc::clone(&engine_setup), app.handle().clone());

            let show_item = MenuItem::with_id(app, "show", "SxmCaps Göster", true, None::<&str>)?;
            let toggle_item =
                MenuItem::with_id(app, "toggle", "Sesi Aç / Kapat", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &toggle_item, &quit_item])?;

            let engine_tray = Arc::clone(&engine_setup);
            let mut tray_builder = TrayIconBuilder::with_id("sxmcaps-tray")
                .menu(&menu)
                .tooltip("SxmCaps — Keycap Sound & Peripheral Studio")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => show_main_window(app),
                    "toggle" => {
                        let mut cfg = engine_tray
                            .settings
                            .read()
                            .map(|g| g.clone())
                            .unwrap_or_default();
                        cfg.enabled = !cfg.enabled;
                        let _ = save_settings(&cfg);
                        if let Ok(mut g) = engine_tray.settings.write() {
                            *g = cfg.clone();
                        }
                        let _ = app.emit("sxmcaps://settings-updated", cfg);
                    }
                    "quit" => {
                        let _ = engine_tray.stats.save_now();
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        show_main_window(tray.app_handle());
                    }
                });

            if let Some(icon) = app.default_window_icon().cloned() {
                tray_builder = tray_builder.icon(icon);
            }
            let _ = tray_builder.build(app);

            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<Arc<EngineState>>();
                let _ = state.stats.save_now();
                let minimize = state
                    .settings
                    .read()
                    .map(|g| g.minimize_to_tray)
                    .unwrap_or(true);
                if minimize {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            get_initial_state,
            list_soundpacks,
            select_keyboard_pack,
            select_mouse_pack,
            update_settings,
            trigger_test_key,
            trigger_test_mouse,
            get_stats,
            report_wpm,
            reset_stats,
            get_active_window_info,
            pick_and_import_zip,
            pick_and_import_folder,
            delete_soundpack,
            open_soundpacks_folder,
            get_input_status,
            rescan_input_devices,
            enable_global_input_udev,
            list_audio_devices,
            pick_studio_audio_file,
            preview_studio_slice,
            save_studio_soundpack,
            export_soundpack_zip,
            get_pack_hub_catalog,
            install_hub_pack,
            check_app_update,
            discover_hardware_devices,
            get_device_hardware_state,
            apply_device_rgb_effect,
            apply_device_per_key_rgb,
            set_device_realtime_rgb,
            apply_device_hardware_flags,
            read_device_keymap,
            write_device_keymap_entry,
            restore_device_keymap_layer,
            install_sxboards_udev,
            get_sxboard_workspace,
            create_sxboard_preset,
            save_in_active_sxboard_preset,
            overwrite_sxboard_preset,
            select_and_apply_sxboard_preset,
            delete_sxboard_preset,
            save_sxboard_macros,
            flash_macros_to_device,
            set_watched_hardware_device,
            get_sxlighting_state,
            apply_sxlighting_config,
            stop_sxlighting,
            save_sxlighting_preset,
            delete_sxlighting_preset,
            export_sxlighting_preset_file,
            import_sxlighting_preset_file,
            get_sxperformance_state,
            update_sxperformance_config,
            trigger_sxperformance_bypass,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sxmcaps");
}
