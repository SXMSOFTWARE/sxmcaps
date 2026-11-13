use crate::settings::config_dir;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MacroEventStep {
    pub web_code: String,
    pub key_label: String,
    pub is_down: bool,
    pub delay_ms: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxBoardMacro {
    pub id: String,
    pub name: String,
    pub category: String,
    pub steps: Vec<MacroEventStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxBoardPreset {
    pub id: String,
    pub name: String,
    pub device_id: String,
    pub effect_id: u8,
    pub brightness: u8,
    pub speed: u8,
    pub color_idx: u8,
    pub side_mode: u8,
    pub knob_mode: u8,
    pub os_mode: u8,
    pub win_lock: bool,
    pub sleep_seconds: u16,
    pub per_key_colors: Vec<[u8; 3]>,
    pub keyboard_pack: String,
    pub mouse_pack: String,
    pub plate_preset: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SxBoardWorkspaceStore {
    pub active_preset_id: String,
    pub presets: Vec<SxBoardPreset>,
    pub macros: Vec<SxBoardMacro>,
}

impl Default for SxBoardWorkspaceStore {
    fn default() -> Self {
        Self {
            active_preset_id: "default-studio".to_string(),
            presets: vec![
                SxBoardPreset {
                    id: "default-studio".to_string(),
                    name: "Default Studio".to_string(),
                    device_id: "".to_string(),
                    effect_id: 3,
                    brightness: 9,
                    speed: 4,
                    color_idx: 7,
                    side_mode: 1,
                    knob_mode: 0,
                    os_mode: 0,
                    win_lock: false,
                    sleep_seconds: 300,
                    per_key_colors: Vec::new(),
                    keyboard_pack: "cherrymx-brown-pbt".to_string(),
                    mouse_pack: "mouse-logi-g502".to_string(),
                    plate_preset: "neutral".to_string(),
                },
                SxBoardPreset {
                    id: "gaming-violet".to_string(),
                    name: "Gaming Violet".to_string(),
                    device_id: "".to_string(),
                    effect_id: 1,
                    brightness: 9,
                    speed: 3,
                    color_idx: 4,
                    side_mode: 3,
                    knob_mode: 1,
                    os_mode: 0,
                    win_lock: true,
                    sleep_seconds: 0,
                    per_key_colors: Vec::new(),
                    keyboard_pack: "holy-pandas".to_string(),
                    mouse_pack: "mouse-logi-g502".to_string(),
                    plate_preset: "brass".to_string(),
                },
                SxBoardPreset {
                    id: "work-minimal".to_string(),
                    name: "Work Minimal".to_string(),
                    device_id: "".to_string(),
                    effect_id: 2,
                    brightness: 5,
                    speed: 1,
                    color_idx: 6,
                    side_mode: 2,
                    knob_mode: 0,
                    os_mode: 0,
                    win_lock: false,
                    sleep_seconds: 180,
                    per_key_colors: Vec::new(),
                    keyboard_pack: "topre-purple-hybrid-pbt".to_string(),
                    mouse_pack: "mouse-chat".to_string(),
                    plate_preset: "polycarbonate".to_string(),
                },
            ],
            macros: vec![
                SxBoardMacro {
                    id: "macro-copy-paste".to_string(),
                    name: "Quick Terminal Toggle".to_string(),
                    category: "System".to_string(),
                    steps: vec![
                        MacroEventStep {
                            web_code: "ControlLeft".into(),
                            key_label: "Ctrl".into(),
                            is_down: true,
                            delay_ms: 15,
                        },
                        MacroEventStep {
                            web_code: "Backquote".into(),
                            key_label: "`".into(),
                            is_down: true,
                            delay_ms: 25,
                        },
                        MacroEventStep {
                            web_code: "Backquote".into(),
                            key_label: "`".into(),
                            is_down: false,
                            delay_ms: 15,
                        },
                        MacroEventStep {
                            web_code: "ControlLeft".into(),
                            key_label: "Ctrl".into(),
                            is_down: false,
                            delay_ms: 0,
                        },
                    ],
                },
            ],
        }
    }
}

fn store_path() -> PathBuf {
    config_dir().join("sxboards_workspace.json")
}

pub fn load_workspace_store() -> SxBoardWorkspaceStore {
    let p = store_path();
    if let Ok(raw) = fs::read_to_string(&p) {
        if let Ok(parsed) = serde_json::from_str::<SxBoardWorkspaceStore>(&raw) {
            if !parsed.presets.is_empty() {
                return parsed;
            }
        }
    }
    let def = SxBoardWorkspaceStore::default();
    let _ = save_workspace_store(&def);
    def
}

pub fn save_workspace_store(store: &SxBoardWorkspaceStore) -> Result<(), String> {
    let p = store_path();
    if let Some(parent) = p.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    fs::write(&p, json).map_err(|e| e.to_string())
}
