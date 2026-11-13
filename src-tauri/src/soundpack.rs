use crate::audio::AudioClip;
use crate::keycodes::{categorize_web_code, mechvibes_v1_to_web_code, KeyCategory};
use crate::settings::user_soundpacks_dir;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SoundpackInfo {
    pub id: String,
    pub name: String,
    pub description: String,
    pub tag: String,
    pub accent: String,
    pub device_type: String, // "keyboard" | "mouse"
    pub author: String,
    pub is_builtin: bool,
    pub path: String,
    pub key_count: usize,
    pub format: String,
}

#[derive(Debug, Clone)]
pub struct KeyClips {
    pub down: Vec<Arc<AudioClip>>,
    pub up: Vec<Arc<AudioClip>>,
}

#[derive(Debug, Clone)]
pub struct LoadedSoundpack {
    pub info: SoundpackInfo,
    pub by_web_code: HashMap<String, KeyClips>,
    pub default_down: Vec<Arc<AudioClip>>,
    pub default_up: Vec<Arc<AudioClip>>,
    pub variants: HashMap<String, Vec<Arc<AudioClip>>>,
}

impl LoadedSoundpack {
    pub fn pick_clip(&self, web_code: &str, is_down: bool) -> Option<Arc<AudioClip>> {
        // 1. If pack has sxmcaps_variants, pick category variation first for natural organic variety
        if !self.variants.is_empty() {
            let key = match (categorize_web_code(web_code), is_down) {
                (KeyCategory::Space, true) => "space_down",
                (KeyCategory::Space, false) => "space_up",
                (KeyCategory::Enter, true) => "enter_down",
                (KeyCategory::Enter, false) => "enter_up",
                (KeyCategory::Modifier, true) => "mod_down",
                (KeyCategory::Modifier, false) => "mod_up",
                (KeyCategory::Normal, true) => "normal_down",
                (KeyCategory::Normal, false) => "normal_up",
            };
            if let Some(pool) = self.variants.get(key) {
                if !pool.is_empty() {
                    let idx = fastrand::usize(..pool.len());
                    return Some(Arc::clone(&pool[idx]));
                }
            }
        }

        // 2. Exact web_code mapping
        if let Some(entry) = self.by_web_code.get(web_code) {
            let pool = if is_down { &entry.down } else { &entry.up };
            if !pool.is_empty() {
                let idx = fastrand::usize(..pool.len());
                return Some(Arc::clone(&pool[idx]));
            }
        }

        // 2b. Mouse side/extra fallback to MouseRight or MouseLeft
        if web_code.starts_with("Mouse") {
            for fallback in ["MouseRight", "MouseLeft"] {
                if let Some(entry) = self.by_web_code.get(fallback) {
                    let pool = if is_down { &entry.down } else { &entry.up };
                    if !pool.is_empty() {
                        let idx = fastrand::usize(..pool.len());
                        return Some(Arc::clone(&pool[idx]));
                    }
                }
            }
        }

        // 3. Default fallback
        let pool = if is_down {
            &self.default_down
        } else {
            &self.default_up
        };
        if !pool.is_empty() {
            let idx = fastrand::usize(..pool.len());
            return Some(Arc::clone(&pool[idx]));
        }

        None
    }
}

pub fn discover_soundpacks(builtin_roots: &[PathBuf]) -> Vec<SoundpackInfo> {
    let mut packs = Vec::new();
    let mut seen_ids = HashMap::<String, usize>::new();

    for root in builtin_roots {
        scan_root(root, true, &mut packs, &mut seen_ids);
    }

    let custom_root = user_soundpacks_dir();
    let _ = fs::create_dir_all(&custom_root);
    scan_root(&custom_root, false, &mut packs, &mut seen_ids);

    // Sort: built-in packs in curated order first, then custom packs alphabetically
    packs.sort_by(|a, b| {
        b.is_builtin
            .cmp(&a.is_builtin)
            .then_with(|| a.device_type.cmp(&b.device_type))
            .then_with(|| builtin_order(&a.id).cmp(&builtin_order(&b.id)))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    packs
}

fn builtin_order(id: &str) -> usize {
    match id {
        "cherrymx-brown-pbt" => 0,
        "cherrymx-brown-abs" => 1,
        "cherrymx-blue-pbt" => 2,
        "cherrymx-blue-abs" => 3,
        "cherrymx-black-pbt" => 4,
        "cherrymx-black-abs" => 5,
        "cherrymx-red-pbt" => 6,
        "cherrymx-red-abs" => 7,
        "holy-pandas" => 8,
        "topre-purple-hybrid-pbt" => 9,
        "nk-cream" => 10,
        "eg-crystal-purple" => 11,
        "eg-oreo" => 12,
        "turquoise" => 13,
        "mouse-logi-g502" => 14,
        "mouse-apple-magic" => 15,
        "mouse-wooden" => 16,
        "mouse-ping" => 17,
        "mouse-chat" => 18,
        "mouse-vibrate" => 19,
        _ => 100,
    }
}

fn scan_root(
    root: &Path,
    is_builtin: bool,
    packs: &mut Vec<SoundpackInfo>,
    seen_ids: &mut HashMap<String, usize>,
) {
    let Ok(entries) = fs::read_dir(root) else {
        return;
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        let cfg_path = path.join("config.json");
        if !cfg_path.is_file() {
            continue;
        }
        if let Ok(mut info) = parse_soundpack_info(&path, &cfg_path, is_builtin) {
            if let Some(&idx) = seen_ids.get(&info.id) {
                if !is_builtin {
                    if packs[idx].is_builtin {
                        // Avoid clobbering a built-in pack if a user zip shares the same id
                        info.id = format!(
                            "{}-custom",
                            info.id
                        );
                        seen_ids.insert(info.id.clone(), packs.len());
                        packs.push(info);
                    } else {
                        packs[idx] = info;
                    }
                }
            } else {
                seen_ids.insert(info.id.clone(), packs.len());
                packs.push(info);
            }
        }
    }
}

fn parse_soundpack_info(
    dir: &Path,
    cfg_path: &Path,
    is_builtin: bool,
) -> Result<SoundpackInfo, String> {
    let raw = fs::read_to_string(cfg_path)
        .map_err(|e| format!("config.json okunamadı ({}): {e}", cfg_path.display()))?;
    let val: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("config.json ayrıştırılamadı ({}): {e}", cfg_path.display()))?;

    let folder_id = dir
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("pack")
        .to_string();

    let id = val
        .get("id")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| folder_id.clone());

    let name = val
        .get("name")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| id.clone());

    let is_v2 = val
        .get("config_version")
        .map(|v| v.as_str() == Some("2") || v.as_u64() == Some(2))
        .unwrap_or(false)
        || val.get("definitions").is_some()
        || val.get("defs").is_some();

    let key_define_type = val
        .get("key_define_type")
        .or_else(|| val.get("definition_method"))
        .and_then(|v| v.as_str())
        .unwrap_or("single");

    let format = if val.get("sxmcaps_variants").is_some() {
        "sxmcaps / V2".to_string()
    } else if is_v2 {
        "Mechvibes V2".to_string()
    } else if key_define_type == "multi" {
        "Mechvibes V1 (Multi)".to_string()
    } else {
        "Mechvibes V1 (Single)".to_string()
    };

    let defs_obj = val
        .get("definitions")
        .or_else(|| val.get("defs"))
        .and_then(|v| v.as_object());

    let key_count = if let Some(obj) = defs_obj {
        obj.len()
    } else if let Some(obj) = val.get("defines").and_then(|v| v.as_object()) {
        obj.len()
    } else {
        0
    };

    let device_type = val
        .get("device_type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_lowercase())
        .or_else(|| {
            val.get("soundpack_type")
                .and_then(|v| v.as_str())
                .map(|s| s.to_lowercase())
        })
        .unwrap_or_else(|| {
            if id.starts_with("mouse-")
                || folder_id.starts_with("mouse-")
                || defs_obj
                    .map(|m| m.keys().any(|k| k.starts_with("Mouse")))
                    .unwrap_or(false)
            {
                "mouse".to_string()
            } else {
                "keyboard".to_string()
            }
        });

    let tag = val
        .get("tag")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .or_else(|| {
            val.get("tags")
                .and_then(|v| v.as_array())
                .and_then(|arr| arr.first())
                .and_then(|v| v.as_str())
                .map(|s| s.to_string())
        })
        .unwrap_or_else(|| {
            if is_builtin {
                "Mechvibes".to_string()
            } else {
                "Custom".to_string()
            }
        });

    let accent = val
        .get("accent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "#ffffff".to_string());

    let description = val
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{} ({})", name, format));

    let author = val
        .get("author")
        .or_else(|| val.get("m_author"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Mechvibes".to_string());

    Ok(SoundpackInfo {
        id,
        name,
        description,
        tag,
        accent,
        device_type,
        author,
        is_builtin,
        path: dir.to_string_lossy().to_string(),
        key_count,
        format,
    })
}

fn expand_sound_pattern(pattern: &str) -> Vec<String> {
    if let (Some(l), Some(r)) = (pattern.find('{'), pattern.find('}')) {
        if l < r {
            let inner = &pattern[l + 1..r];
            if let Some((a_str, b_str)) = inner.split_once('-') {
                if let (Ok(a), Ok(b)) = (a_str.parse::<u32>(), b_str.parse::<u32>()) {
                    let prefix = &pattern[..l];
                    let suffix = &pattern[r + 1..];
                    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
                    return (lo..=hi)
                        .take(32)
                        .map(|n| format!("{prefix}{n}{suffix}"))
                        .collect();
                }
            }
        }
    }
    vec![pattern.to_string()]
}

fn push_timing_pair(
    master_clip: &AudioClip,
    pair: &Value,
    target: &mut Vec<Arc<AudioClip>>,
) {
    let Some(arr) = pair.as_array() else {
        return;
    };
    if arr.len() < 2 {
        return;
    }
    let (Some(start), Some(end)) = (arr[0].as_f64(), arr[1].as_f64()) else {
        return;
    };
    if end > start {
        target.push(Arc::new(master_clip.slice_range_ms(start, end)));
    }
}

pub fn load_soundpack(info: &SoundpackInfo) -> Result<LoadedSoundpack, String> {
    let dir = PathBuf::from(&info.path);
    let cfg_path = dir.join("config.json");
    let raw = fs::read_to_string(&cfg_path)
        .map_err(|e| format!("config.json okunamadı: {e}"))?;
    let val: Value = serde_json::from_str(&raw)
        .map_err(|e| format!("config.json geçersiz JSON: {e}"))?;

    let mut file_cache: HashMap<String, Arc<AudioClip>> = HashMap::new();
    let mut load_cached = |rel: &str| -> Result<Arc<AudioClip>, String> {
        if let Some(existing) = file_cache.get(rel) {
            return Ok(Arc::clone(existing));
        }
        let target = dir.join(rel);
        let clip = Arc::new(AudioClip::decode_file(&target)?);
        file_cache.insert(rel.to_string(), Arc::clone(&clip));
        Ok(clip)
    };

    let mut by_web_code: HashMap<String, KeyClips> = HashMap::new();
    let mut default_down: Vec<Arc<AudioClip>> = Vec::new();
    let mut default_up: Vec<Arc<AudioClip>> = Vec::new();
    let mut variants: HashMap<String, Vec<Arc<AudioClip>>> = HashMap::new();

    // 1. Load sxmcaps_variants if present
    if let Some(vars) = val.get("sxmcaps_variants").and_then(|v| v.as_object()) {
        for (k, arr) in vars {
            if let Some(items) = arr.as_array() {
                let mut clips = Vec::new();
                for item in items {
                    if let Some(fname) = item.as_str() {
                        if let Ok(clip) = load_cached(fname) {
                            clips.push(clip);
                        }
                    }
                }
                if !clips.is_empty() {
                    variants.insert(k.clone(), clips);
                }
            }
        }
    }

    // 2. Load V2 definitions / defs
    if let Some(defs) = val
        .get("definitions")
        .or_else(|| val.get("defs"))
        .and_then(|v| v.as_object())
    {
        let global_audio = val
            .get("audio_file")
            .or_else(|| val.get("sound"))
            .and_then(|v| v.as_str());

        for (code, entry) in defs {
            let mut down_clips = Vec::new();
            let mut up_clips = Vec::new();

            if let Some(fname) = entry.as_str() {
                if let Ok(c) = load_cached(fname) {
                    down_clips.push(c);
                }
            } else if let Some(arr) = entry.as_array() {
                if arr.len() >= 2 {
                    if let (Some(start), Some(dur), Some(master)) =
                        (arr[0].as_u64(), arr[1].as_u64(), global_audio)
                    {
                        if let Ok(master_clip) = load_cached(master) {
                            down_clips.push(Arc::new(master_clip.slice_ms(start, dur)));
                        }
                    }
                }
            } else if let Some(obj) = entry.as_object() {
                if let Some(down_str) = obj.get("down").and_then(|v| v.as_str()) {
                    if let Ok(c) = load_cached(down_str) {
                        down_clips.push(c);
                    }
                }
                if let Some(up_str) = obj.get("up").and_then(|v| v.as_str()) {
                    if let Ok(c) = load_cached(up_str) {
                        up_clips.push(c);
                    }
                }
                if down_clips.is_empty() && up_clips.is_empty() {
                    if let Some(audio_file) = obj
                        .get("audio_file")
                        .and_then(|v| v.as_str())
                        .or(global_audio)
                    {
                        match load_cached(audio_file) {
                            Ok(master_clip) => {
                                if let Some(timing) = obj.get("timing").and_then(|v| v.as_array()) {
                                    if let Some(down_pair) = timing.first() {
                                        push_timing_pair(&master_clip, down_pair, &mut down_clips);
                                    }
                                    if let Some(up_pair) = timing.get(1) {
                                        push_timing_pair(&master_clip, up_pair, &mut up_clips);
                                    }
                                } else if let (Some(start), Some(dur)) = (
                                    obj.get("start").and_then(|v| v.as_u64()),
                                    obj.get("duration").and_then(|v| v.as_u64()),
                                ) {
                                    down_clips.push(Arc::new(master_clip.slice_ms(start, dur)));
                                } else {
                                    down_clips.push(master_clip);
                                }
                            }
                            Err(e) => return Err(e),
                        }
                    }
                }
            }

            if code == "Default" || code == "default" {
                default_down.extend(down_clips);
                default_up.extend(up_clips);
            } else if !down_clips.is_empty() || !up_clips.is_empty() {
                by_web_code.insert(
                    code.clone(),
                    KeyClips {
                        down: down_clips,
                        up: up_clips,
                    },
                );
            }
        }
    }

    // 3. Load Mechvibes V1 defines
    if let Some(defines) = val.get("defines").and_then(|v| v.as_object()) {
        let define_type = val
            .get("key_define_type")
            .and_then(|v| v.as_str())
            .unwrap_or("single");
        let master_file = val.get("sound").and_then(|v| v.as_str());

        if define_type == "single" {
            if let Some(master_name) = master_file {
                let master_clip = load_cached(master_name)?;
                for (raw_code, range) in defines {
                    let Some(arr) = range.as_array() else {
                        continue;
                    };
                    if arr.len() < 2 {
                        continue;
                    }
                    let (Some(start), Some(dur)) = (arr[0].as_f64(), arr[1].as_f64()) else {
                        continue;
                    };
                    if dur <= 0.0 {
                        continue;
                    }
                    let sliced = Arc::new(master_clip.slice_ms_f64(start, dur));
                    if let Some(web_code) = mechvibes_v1_to_web_code(raw_code) {
                        by_web_code.insert(
                            web_code.to_string(),
                            KeyClips {
                                down: vec![sliced],
                                up: vec![],
                            },
                        );
                    }
                }
            }
        } else {
            // multi mode (supports pattern expansion `{0-4}`, `soundup`, and `XX-up` release keys)
            if let Some(fallback_pattern) = master_file {
                for fname in expand_sound_pattern(fallback_pattern) {
                    if let Ok(clip) = load_cached(&fname) {
                        default_down.push(clip);
                    }
                }
            }
            if let Some(up_pattern) = val.get("soundup").and_then(|v| v.as_str()) {
                for fname in expand_sound_pattern(up_pattern) {
                    if let Ok(clip) = load_cached(&fname) {
                        default_up.push(clip);
                    }
                }
            }
            for (raw_code, fname_val) in defines {
                let Some(fname) = fname_val.as_str() else {
                    continue;
                };
                if fname.trim().is_empty() {
                    continue;
                }
                let is_up_key = raw_code.ends_with("-up");
                let base_code = raw_code.strip_suffix("-up").unwrap_or(raw_code);
                if let Some(web_code) = mechvibes_v1_to_web_code(base_code) {
                    if let Ok(clip) = load_cached(fname) {
                        let entry = by_web_code
                            .entry(web_code.to_string())
                            .or_insert_with(|| KeyClips {
                                down: Vec::new(),
                                up: Vec::new(),
                            });
                        if is_up_key {
                            entry.up.push(clip);
                        } else {
                            entry.down.push(clip);
                        }
                    }
                }
            }
        }
    }

    // Ensure default_down and default_up have sensible clips if any key clip exists
    if default_down.is_empty() {
        if let Some(pool) = variants.get("normal_down") {
            default_down.extend(pool.iter().cloned());
        } else {
            for preferred in ["KeyA", "KeyE", "KeyS", "MouseLeft"] {
                if let Some(c) = by_web_code.get(preferred) {
                    if !c.down.is_empty() {
                        default_down.extend(c.down.iter().cloned());
                        break;
                    }
                }
            }
            if default_down.is_empty() {
                if let Some(first) = by_web_code.values().find(|c| !c.down.is_empty()) {
                    default_down.extend(first.down.iter().cloned());
                }
            }
        }
    }
    if default_up.is_empty() {
        if let Some(pool) = variants.get("normal_up") {
            default_up.extend(pool.iter().cloned());
        } else {
            for preferred in ["KeyA", "KeyE", "KeyS", "MouseLeft"] {
                if let Some(c) = by_web_code.get(preferred) {
                    if !c.up.is_empty() {
                        default_up.extend(c.up.iter().cloned());
                        break;
                    }
                }
            }
            if default_up.is_empty() {
                if let Some(first) = by_web_code.values().find(|c| !c.up.is_empty()) {
                    default_up.extend(first.up.iter().cloned());
                }
            }
        }
    }

    if default_down.is_empty() && by_web_code.is_empty() && variants.is_empty() {
        return Err("Ses paketinde geçerli ses dosyası bulunamadı".to_string());
    }

    Ok(LoadedSoundpack {
        info: info.clone(),
        by_web_code,
        default_down,
        default_up,
        variants,
    })
}

fn sanitize_slug(raw: &str) -> String {
    let mut slug: String = raw
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    while slug.contains("--") {
        slug = slug.replace("--", "-");
    }
    let trimmed = slug.trim_matches('-').to_string();
    if trimmed.is_empty() {
        format!("custom-pack-{}", fastrand::u32(1000..9999))
    } else {
        trimmed
    }
}

pub fn import_soundpack_zip(zip_path: &Path) -> Result<SoundpackInfo, String> {
    let file = fs::File::open(zip_path)
        .map_err(|e| format!("ZIP dosyası açılamadı: {e}"))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Geçersiz ZIP arşivi: {e}"))?;

    // Locate config.json inside the zip (root or 1 level deep) and extract preferred id/name
    let mut strip_prefix: Option<String> = None;
    let mut cfg_entry_idx: Option<usize> = None;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP girişi okunamadı: {e}"))?;
        let name = entry.name().replace('\\', "/");
        if name == "config.json" {
            cfg_entry_idx = Some(i);
            strip_prefix = None;
            break;
        }
        if name.ends_with("/config.json") && name.matches('/').count() == 1 {
            cfg_entry_idx = Some(i);
            strip_prefix = name.split('/').next().map(|s| format!("{s}/"));
            break;
        }
    }

    let Some(cfg_idx) = cfg_entry_idx else {
        return Err("ZIP içinde config.json bulunamadı (Mechvibes V1/V2 paketi olmalı)".to_string());
    };

    let mut cfg_slug_hint: Option<String> = None;
    let mut cfg_explicit_id: Option<String> = None;
    if let Ok(mut cfg_entry) = archive.by_index(cfg_idx) {
        let mut raw_cfg = String::new();
        if io::Read::read_to_string(&mut cfg_entry, &mut raw_cfg).is_ok() {
            if let Ok(val) = serde_json::from_str::<Value>(&raw_cfg) {
                if let Some(id_str) = val.get("id").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                    cfg_explicit_id = Some(id_str.to_string());
                    cfg_slug_hint = Some(id_str.to_string());
                } else if let Some(name_str) = val.get("name").and_then(|v| v.as_str()).map(str::trim).filter(|s| !s.is_empty()) {
                    cfg_slug_hint = Some(name_str.to_string());
                }
            }
        }
    }

    let base_stem = zip_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("custom-pack");
    let slug = sanitize_slug(cfg_slug_hint.as_deref().unwrap_or(base_stem));
    let root = user_soundpacks_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Soundpack klasörü oluşturulamadı: {e}"))?;

    let dest_dir = root.join(&slug);
    if dest_dir.exists() {
        let _ = fs::remove_dir_all(&dest_dir);
    }
    // Also clean up any older random sxmcaps-hub-* folder carrying the exact same pack id
    if let Some(ref target_id) = cfg_explicit_id {
        if let Ok(entries) = fs::read_dir(&root) {
            for e in entries.flatten() {
                let p = e.path();
                if p.is_dir() && p != dest_dir {
                    let c = p.join("config.json");
                    if let Ok(info) = parse_soundpack_info(&p, &c, false) {
                        if info.id == *target_id {
                            let _ = fs::remove_dir_all(&p);
                        }
                    }
                }
            }
        }
    }
    fs::create_dir_all(&dest_dir).map_err(|e| format!("Hedef klasör oluşturulamadı: {e}"))?;

    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP içeriği okunamadı: {e}"))?;
        let raw_name = entry.name().replace('\\', "/");
        let rel_str = if let Some(ref prefix) = strip_prefix {
            if let Some(stripped) = raw_name.strip_prefix(prefix) {
                stripped.to_string()
            } else {
                continue;
            }
        } else {
            raw_name
        };

        if rel_str.is_empty() || rel_str.contains("..") {
            continue;
        }
        let rel_path = Path::new(&rel_str);
        if rel_path.is_absolute() {
            continue;
        }
        let out_path = dest_dir.join(rel_path);
        if entry.is_dir() {
            let _ = fs::create_dir_all(&out_path);
        } else {
            if let Some(parent) = out_path.parent() {
                let _ = fs::create_dir_all(parent);
            }
            let mut outfile = fs::File::create(&out_path)
                .map_err(|e| format!("Dosya çıkarılamadı: {e}"))?;
            io::copy(&mut entry, &mut outfile)
                .map_err(|e| format!("Dosya yazılamadı: {e}"))?;
        }
    }

    let cfg_path = dest_dir.join("config.json");
    let info = parse_soundpack_info(&dest_dir, &cfg_path, false)?;
    // Validate it decodes cleanly
    load_soundpack(&info)?;
    Ok(info)
}

pub fn import_soundpack_folder(src_dir: &Path) -> Result<SoundpackInfo, String> {
    let cfg = src_dir.join("config.json");
    if !cfg.is_file() {
        return Err("Seçilen klasörde config.json bulunamadı".to_string());
    }

    let folder_name = src_dir
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("custom-pack");
    let mut slug = sanitize_slug(folder_name);
    let root = user_soundpacks_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Soundpack klasörü oluşturulamadı: {e}"))?;

    let mut dest_dir = root.join(&slug);
    if dest_dir.exists() {
        slug = format!("{}-{}", slug, fastrand::u32(100..999));
        dest_dir = root.join(&slug);
    }

    copy_dir_recursive(src_dir, &dest_dir)?;
    let dest_cfg = dest_dir.join("config.json");
    let info = parse_soundpack_info(&dest_dir, &dest_cfg, false)?;
    load_soundpack(&info)?;
    Ok(info)
}

fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| format!("Klasör oluşturulamadı: {e}"))?;
    for entry in fs::read_dir(src).map_err(|e| format!("Klasör okunamadı: {e}"))?.flatten() {
        let path = entry.path();
        let target = dst.join(entry.file_name());
        if path.is_dir() {
            copy_dir_recursive(&path, &target)?;
        } else {
            fs::copy(&path, &target).map_err(|e| format!("Dosya kopyalanamadı: {e}"))?;
        }
    }
    Ok(())
}

pub fn delete_custom_soundpack(pack_id: &str) -> Result<(), String> {
    let root = user_soundpacks_dir();
    let direct = root.join(pack_id);
    if direct.exists() {
        return fs::remove_dir_all(&direct).map_err(|e| format!("Paket silinemedi: {e}"));
    }

    let mut removed = false;
    if let Ok(entries) = fs::read_dir(&root) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                let cfg = p.join("config.json");
                if let Ok(info) = parse_soundpack_info(&p, &cfg, false) {
                    if info.id == pack_id {
                        fs::remove_dir_all(&p).map_err(|e| format!("Paket silinemedi: {e}"))?;
                        removed = true;
                    }
                }
            }
        }
    }

    if !removed {
        return Err("Silinecek özel ses paketi bulunamadı".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_soundpacks_load_and_decode() {
        let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets")
            .join("soundpacks");
        let packs = discover_soundpacks(&[root]);
        assert!(
            packs.len() >= 20,
            "Expected at least 20 real built-in packs, got {}",
            packs.len()
        );

        for info in &packs {
            let loaded = load_soundpack(info)
                .unwrap_or_else(|e| panic!("Failed to load {}: {}", info.id, e));
            if info.device_type == "mouse" {
                assert!(loaded.pick_clip("MouseLeft", true).is_some());
                assert!(loaded.pick_clip("MouseRight", true).is_some());
            } else {
                for code in ["KeyA", "Space", "Enter", "ShiftLeft"] {
                    assert!(
                        loaded.pick_clip(code, true).is_some(),
                        "{} missing down clip for {}",
                        info.id,
                        code
                    );
                }
            }
        }
    }

    #[test]
    fn mechvibes_v1_single_and_v2_timing_packs_slice_cleanly() {
        let tmp = std::env::temp_dir().join(format!("sxmcaps-v12-test-{}", fastrand::u32(1..99999)));
        fs::create_dir_all(&tmp).unwrap();

        let sample_pack = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets/soundpacks/holy-pandas");
        let sample_mp3 = sample_pack.join("GENERIC_R0.mp3");
        fs::copy(&sample_mp3, tmp.join("sound.mp3")).unwrap();

        let v2_cfg = serde_json::json!({
            "id": "v2-timing-sample",
            "name": "Mechvibes V2 Timing Test",
            "config_version": "2",
            "definition_method": "single",
            "audio_file": "sound.mp3",
            "definitions": {
                "KeyA": { "timing": [[0.0, 45.0], [45.0, 90.0]] },
                "Space": { "timing": [[5.0, 65.0]] }
            }
        });
        fs::write(tmp.join("config.json"), v2_cfg.to_string()).unwrap();

        let info = parse_soundpack_info(&tmp, &tmp.join("config.json"), false).unwrap();
        assert_eq!(info.format, "Mechvibes V2");
        assert_eq!(info.id, "v2-timing-sample");
        let loaded = load_soundpack(&info).unwrap();
        assert!(loaded.pick_clip("KeyA", true).is_some());
        assert!(loaded.pick_clip("KeyA", false).is_some());
        assert!(loaded.pick_clip("Space", true).is_some());

        let _ = fs::remove_dir_all(&tmp);
    }
}
