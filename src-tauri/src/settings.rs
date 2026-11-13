use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppProfileRule {
    pub id: String,
    pub name: String,
    pub pattern: String,
    pub pack_id: String,
    pub mute: bool,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct AppSettings {
    pub active_keyboard_pack: String,
    pub active_mouse_pack: String,
    pub enabled: bool,
    pub keyboard_volume: f32,
    pub mouse_enabled: bool,
    pub mouse_volume: f32,
    pub key_up_enabled: bool,
    pub key_up_volume: f32,
    pub pitch_variation: f32,
    pub stereo_pan: bool,
    pub minimize_to_tray: bool,
    pub audio_device: Option<String>,
    // v0.2 Acoustic DSP
    pub plate_preset: String, // "neutral" | "aluminum" | "polycarbonate" | "brass"
    pub tape_mod: bool,
    pub poron_foam: bool,
    pub eq_low_db: f32,
    pub eq_mid_db: f32,
    pub eq_high_db: f32,
    pub room_ambience: f32,
    // v0.2 App Profiles & Autostart
    pub profiles_enabled: bool,
    pub app_profiles: Vec<AppProfileRule>,
    pub autostart: bool,
    // v0.2.1 Localization ("auto" | "tr" | "en")
    pub language: String,
    // v0.4.2 Performance & RAM Optimization
    pub sound_only_mode: bool,
    pub hibernate_on_tray: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            active_keyboard_pack: "cherrymx-brown-pbt".to_string(),
            active_mouse_pack: "mouse-logi-g502".to_string(),
            enabled: true,
            keyboard_volume: 0.85,
            mouse_enabled: true,
            mouse_volume: 0.75,
            key_up_enabled: true,
            key_up_volume: 0.65,
            pitch_variation: 0.035,
            stereo_pan: true,
            minimize_to_tray: true,
            audio_device: None,
            plate_preset: "neutral".to_string(),
            tape_mod: false,
            poron_foam: false,
            eq_low_db: 0.0,
            eq_mid_db: 0.0,
            eq_high_db: 0.0,
            room_ambience: 0.0,
            profiles_enabled: false,
            app_profiles: Vec::new(),
            autostart: false,
            language: "auto".to_string(),
            sound_only_mode: false,
            hibernate_on_tray: true,
        }
    }
}

pub fn config_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            if !appdata.trim().is_empty() {
                return PathBuf::from(appdata).join("sxmcaps");
            }
        }
        let home = std::env::var("USERPROFILE").unwrap_or_else(|_| ".".to_string());
        return PathBuf::from(home)
            .join("AppData")
            .join("Roaming")
            .join("sxmcaps");
    }
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        return PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("sxmcaps");
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_CONFIG_HOME") {
            if !xdg.trim().is_empty() {
                return PathBuf::from(xdg).join("sxmcaps");
            }
        }
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".config").join("sxmcaps")
    }
}

pub fn data_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            if !local.trim().is_empty() {
                return PathBuf::from(local).join("sxmcaps");
            }
        }
        return config_dir();
    }
    #[cfg(target_os = "macos")]
    {
        return config_dir();
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        if let Ok(xdg) = std::env::var("XDG_DATA_HOME") {
            if !xdg.trim().is_empty() {
                return PathBuf::from(xdg).join("sxmcaps");
            }
        }
        let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
        PathBuf::from(home).join(".local").join("share").join("sxmcaps")
    }
}

pub fn user_soundpacks_dir() -> PathBuf {
    data_dir().join("soundpacks")
}

pub fn settings_file_path() -> PathBuf {
    config_dir().join("settings.json")
}

pub fn load_settings() -> AppSettings {
    let path = settings_file_path();
    if let Ok(raw) = fs::read_to_string(&path) {
        if let Ok(parsed) = serde_json::from_str::<AppSettings>(&raw) {
            return parsed;
        }
    }
    AppSettings::default()
}

pub fn save_settings(settings: &AppSettings) -> Result<(), String> {
    let path = settings_file_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Ayar klasörü oluşturulamadı: {e}"))?;
    }
    let json = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Ayarlar serileştirilemedi: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Ayarlar kaydedilemedi: {e}"))
}
