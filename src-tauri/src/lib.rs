mod audio;
mod input_listener;
mod keycodes;
mod settings;
mod soundpack;

use audio::AudioEngine;
use input_listener::{
    install_udev_input_rule, start_global_listener, GlobalInputEvent, InputListenerHandle,
    InputStatus,
};
use keycodes::web_code_pan;
use serde::Serialize;
use settings::{load_settings, save_settings, user_soundpacks_dir, AppSettings};
use soundpack::{
    delete_custom_soundpack, discover_soundpacks, import_soundpack_folder, import_soundpack_zip,
    load_soundpack, LoadedSoundpack, SoundpackInfo,
};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, RwLock};
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
    pub total_keystrokes: u64,
    pub soundpacks_dir: String,
}

pub struct EngineState {
    pub audio: AudioEngine,
    pub settings: RwLock<AppSettings>,
    pub keyboard_pack: RwLock<Option<Arc<LoadedSoundpack>>>,
    pub mouse_pack: RwLock<Option<Arc<LoadedSoundpack>>>,
    pub builtin_roots: RwLock<Vec<PathBuf>>,
    pub input_listener: RwLock<Option<InputListenerHandle>>,
    pub total_keystrokes: AtomicU64,
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
            self.audio.play_clip(&clip, vol, cfg.pitch_variation * 0.6, 0.0);
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
            .find(|p| p.id == cfg.active_keyboard_pack && p.device_type == "keyboard")
            .or_else(|| packs.iter().find(|p| p.device_type == "keyboard"))
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
    // Dev mode fallback (CARGO_MANIFEST_DIR/assets/soundpacks)
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
    let settings = state.settings.read().map(|g| g.clone()).unwrap_or_default();
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
    let total_keystrokes = state.total_keystrokes.load(Ordering::Relaxed);

    InitialStateDto {
        settings,
        soundpacks,
        input_status,
        audio_devices,
        total_keystrokes,
        soundpacks_dir: user_soundpacks_dir().to_string_lossy().to_string(),
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
    let roots = state
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
    if let Ok(mut g) = state.keyboard_pack.write() {
        *g = Some(Arc::new(loaded));
    }

    let mut next_cfg = state.settings.read().map(|g| g.clone()).unwrap_or_default();
    next_cfg.active_keyboard_pack = pack_id;
    save_settings(&next_cfg)?;
    if let Ok(mut g) = state.settings.write() {
        *g = next_cfg.clone();
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
    new_settings: AppSettings,
    state: State<'_, Arc<EngineState>>,
) -> Result<AppSettings, String> {
    let old_device = state
        .settings
        .read()
        .ok()
        .and_then(|g| g.audio_device.clone());

    if old_device != new_settings.audio_device {
        state
            .audio
            .set_output_device(new_settings.audio_device.clone())?;
    }

    save_settings(&new_settings)?;
    if let Ok(mut g) = state.settings.write() {
        *g = new_settings.clone();
    }
    Ok(new_settings)
}

#[tauri::command]
fn trigger_test_key(
    web_code: String,
    is_down: bool,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    if is_down {
        state.total_keystrokes.fetch_add(1, Ordering::Relaxed);
    }
    state.play_key_event(&web_code, is_down);
    Ok(())
}

#[tauri::command]
fn trigger_test_mouse(
    button: String,
    is_down: bool,
    state: State<'_, Arc<EngineState>>,
) -> Result<(), String> {
    state.play_mouse_event(&button, is_down);
    Ok(())
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
    std::thread::sleep(std::time::Duration::from_millis(250));
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
    std::thread::sleep(std::time::Duration::from_millis(450));
    Ok(get_input_status(state))
}

#[tauri::command]
fn list_audio_devices() -> Vec<String> {
    AudioEngine::list_output_devices()
}

fn show_main_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    }
}

pub fn run() {
    let initial_settings = load_settings();
    let audio = AudioEngine::new(initial_settings.audio_device.clone());

    let engine = Arc::new(EngineState {
        audio,
        settings: RwLock::new(initial_settings),
        keyboard_pack: RwLock::new(None),
        mouse_pack: RwLock::new(None),
        builtin_roots: RwLock::new(Vec::new()),
        input_listener: RwLock::new(None),
        total_keystrokes: AtomicU64::new(0),
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
                        engine_ev.total_keystrokes.fetch_add(1, Ordering::Relaxed) + 1
                    } else {
                        engine_ev.total_keystrokes.load(Ordering::Relaxed)
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
                    let total = engine_ev.total_keystrokes.load(Ordering::Relaxed);
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

            // Build system tray
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
            pick_and_import_zip,
            pick_and_import_folder,
            delete_soundpack,
            open_soundpacks_folder,
            get_input_status,
            rescan_input_devices,
            enable_global_input_udev,
            list_audio_devices,
        ])
        .run(tauri::generate_context!())
        .expect("error while running sxmcaps");
}
