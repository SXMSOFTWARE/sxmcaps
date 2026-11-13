mod audio;
mod autostart;
mod input_listener;
mod keycodes;
mod pack_hub;
mod profiles;
mod settings;
mod soundpack;
mod stats;
mod studio;

use audio::{AudioEngine, DspParams};
use autostart::{is_autostart_enabled, set_autostart};
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
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::time::Duration;
use studio::{
    export_pack_zip, inspect_audio_file, preview_audio_slice, save_studio_pack,
    AudioInspectResult, StudioPackSpec,
};
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
        let cfg = self.settings.read().map(|g| g.clone()).unwrap_or_default();

        if let Some(kb_info) = packs
            .iter()
            .find(|p| p.id == cfg.active_keyboard_pack && p.device_type != "mouse")
            .or_else(|| packs.iter().find(|p| p.device_type != "mouse"))
        {
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
            if let Ok(loaded) = load_soundpack(ms_info) {
                if let Ok(mut g) = self.mouse_pack.write() {
                    *g = Some(Arc::new(loaded));
                }
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

    InitialStateDto {
        settings,
        soundpacks,
        input_status,
        audio_devices,
        stats,
        soundpacks_dir: user_soundpacks_dir().to_string_lossy().to_string(),
        app_version: format!("v{}", env!("CARGO_PKG_VERSION")),
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
        cfg.active_keyboard_pack = "holy-panda".to_string();
        changed = true;
    }
    if cfg.active_mouse_pack == pack_id {
        cfg.active_mouse_pack = "mouse-omron".to_string();
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

pub fn run() {
    let mut initial_settings = load_settings();
    initial_settings.autostart = is_autostart_enabled();

    let dsp = DspParams::from_settings(&initial_settings);
    let audio = AudioEngine::new(initial_settings.audio_device.clone(), dsp);
    let stats = StatsManager::load();

    let engine = Arc::new(EngineState {
        audio,
        settings: RwLock::new(initial_settings),
        keyboard_pack: RwLock::new(None),
        mouse_pack: RwLock::new(None),
        builtin_roots: RwLock::new(Vec::new()),
        input_listener: RwLock::new(None),
        stats,
        profile_override: Mutex::new(None),
    });

    let engine_setup = Arc::clone(&engine);

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(engine)
        .setup(move |app| {
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

            let show_item = MenuItem::with_id(app, "show", "sxmcaps Göster", true, None::<&str>)?;
            let toggle_item =
                MenuItem::with_id(app, "toggle", "Sesi Aç / Kapat", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &toggle_item, &quit_item])?;

            let engine_tray = Arc::clone(&engine_setup);
            let mut tray_builder = TrayIconBuilder::with_id("sxmcaps-tray")
                .menu(&menu)
                .tooltip("sxmcaps — Mechanical Keycap Sounds")
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running sxmcaps");
}
