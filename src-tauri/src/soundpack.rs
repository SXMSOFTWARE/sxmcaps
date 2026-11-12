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
        "holy-panda" => 0,
        "cherry-mx-blue" => 1,
        "cherry-mx-red" => 2,
        "cherry-mx-brown" => 3,
        "cherry-mx-black" => 4,
        "gateron-oil-king" => 5,
        "topre-45g" => 6,
        "ibm-model-m" => 7,
        "mouse-omron" => 8,
        "mouse-silent" => 9,
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
        if let Ok(info) = parse_soundpack_info(&path, &cfg_path, is_builtin) {
            if let Some(&idx) = seen_ids.get(&info.id) {
                if !is_builtin {
                    packs[idx] = info;
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

    let is_v2 = val.get("config_version").and_then(|v| v.as_str()) == Some("2")
        || val.get("definitions").is_some();

    let key_define_type = val
        .get("key_define_type")
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

    let key_count = if let Some(obj) = val.get("definitions").and_then(|v| v.as_object()) {
        obj.len()
    } else if let Some(obj) = val.get("defines").and_then(|v| v.as_object()) {
        obj.len()
    } else {
        0
    };

    let device_type = val
        .get("device_type")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            if val
                .get("definitions")
                .and_then(|d| d.as_object())
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
        .unwrap_or_else(|| {
            if is_builtin {
                "Built-in".to_string()
            } else {
                "Custom".to_string()
            }
        });

    let accent = val
        .get("accent")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "#8b5cf6".to_string());

    let description = val
        .get("description")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("{} ses paketi ({})", name, format));

    let author = val
        .get("author")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| "Community".to_string());

    Ok(SoundpackInfo {
        id: if is_builtin { id } else { folder_id },
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

    // 2. Load V2 definitions
    if let Some(defs) = val.get("definitions").and_then(|v| v.as_object()) {
        let global_audio = val
            .get("sound")
            .or_else(|| val.get("audio_file"))
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
                if down_clips.is_empty() {
                    if let Some(audio_file) = obj
                        .get("audio_file")
                        .and_then(|v| v.as_str())
                        .or(global_audio)
                    {
                        if let Ok(master_clip) = load_cached(audio_file) {
                            if let (Some(start), Some(dur)) = (
                                obj.get("start").and_then(|v| v.as_u64()),
                                obj.get("duration").and_then(|v| v.as_u64()),
                            ) {
                                down_clips.push(Arc::new(master_clip.slice_ms(start, dur)));
                            } else {
                                down_clips.push(master_clip);
                            }
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
                    let (Some(start), Some(dur)) = (arr[0].as_u64(), arr[1].as_u64()) else {
                        continue;
                    };
                    if dur == 0 {
                        continue;
                    }
                    let sliced = Arc::new(master_clip.slice_ms(start, dur));
                    if default_down.is_empty() {
                        default_down.push(Arc::clone(&sliced));
                    }
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
            // multi mode
            if let Some(fallback_name) = master_file {
                if let Ok(clip) = load_cached(fallback_name) {
                    default_down.push(clip);
                }
            }
            for (raw_code, fname_val) in defines {
                let Some(fname) = fname_val.as_str() else {
                    continue;
                };
                if fname.trim().is_empty() {
                    continue;
                }
                if let Ok(clip) = load_cached(fname) {
                    if default_down.is_empty() {
                        default_down.push(Arc::clone(&clip));
                    }
                    if let Some(web_code) = mechvibes_v1_to_web_code(raw_code) {
                        by_web_code.insert(
                            web_code.to_string(),
                            KeyClips {
                                down: vec![clip],
                                up: vec![],
                            },
                        );
                    }
                }
            }
        }
    }

    // Ensure default_down has at least one clip if any key clip exists
    if default_down.is_empty() {
        if let Some(pool) = variants.get("normal_down") {
            default_down.extend(pool.iter().cloned());
        } else if let Some(first) = by_web_code.values().find(|c| !c.down.is_empty()) {
            default_down.extend(first.down.iter().cloned());
        }
    }
    if default_up.is_empty() {
        if let Some(pool) = variants.get("normal_up") {
            default_up.extend(pool.iter().cloned());
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

    // Locate config.json inside the zip (root or 1 level deep)
    let mut strip_prefix: Option<String> = None;
    let mut found_config = false;
    for i in 0..archive.len() {
        let entry = archive
            .by_index(i)
            .map_err(|e| format!("ZIP girişi okunamadı: {e}"))?;
        let name = entry.name().replace('\\', "/");
        if name == "config.json" {
            found_config = true;
            strip_prefix = None;
            break;
        }
        if name.ends_with("/config.json") && name.matches('/').count() == 1 {
            found_config = true;
            strip_prefix = name.split('/').next().map(|s| format!("{s}/"));
            break;
        }
    }

    if !found_config {
        return Err("ZIP içinde config.json bulunamadı (Mechvibes V1/V2 paketi olmalı)".to_string());
    }

    let base_stem = zip_path
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("custom-pack");
    let mut slug = sanitize_slug(base_stem);
    let root = user_soundpacks_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Soundpack klasörü oluşturulamadı: {e}"))?;

    let mut dest_dir = root.join(&slug);
    if dest_dir.exists() {
        slug = format!("{}-{}", slug, fastrand::u32(100..999));
        dest_dir = root.join(&slug);
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
    let target = user_soundpacks_dir().join(pack_id);
    if !target.exists() {
        return Err("Silinecek özel ses paketi bulunamadı".to_string());
    }
    fs::remove_dir_all(&target).map_err(|e| format!("Paket silinemedi: {e}"))
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
        assert_eq!(packs.len(), 10, "Expected 8 keyboard + 2 mouse packs");

        for info in &packs {
            let loaded = load_soundpack(info)
                .unwrap_or_else(|e| panic!("Failed to load {}: {}", info.id, e));
            if info.device_type == "mouse" {
                assert!(loaded.pick_clip("MouseLeft", true).is_some());
                assert!(loaded.pick_clip("MouseLeft", false).is_some());
                assert!(loaded.pick_clip("MouseRight", true).is_some());
            } else {
                for code in ["KeyA", "Space", "Enter", "ShiftLeft"] {
                    assert!(
                        loaded.pick_clip(code, true).is_some(),
                        "{} missing down clip for {}",
                        info.id,
                        code
                    );
                    assert!(
                        loaded.pick_clip(code, false).is_some(),
                        "{} missing up clip for {}",
                        info.id,
                        code
                    );
                }
            }
        }
    }

    #[test]
    fn mechvibes_v1_single_pack_slices_cleanly() {
        let tmp = std::env::temp_dir().join(format!("sxmcaps-v1-test-{}", fastrand::u32(1..99999)));
        fs::create_dir_all(&tmp).unwrap();

        // Copy an existing generated wav as sound.wav
        let sample_wav = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("assets/soundpacks/cherry-mx-blue/normal_down_0.wav");
        fs::copy(&sample_wav, tmp.join("sound.wav")).unwrap();

        let v1_cfg = serde_json::json!({
            "id": "v1-sample",
            "name": "Legacy V1 Test",
            "key_define_type": "single",
            "sound": "sound.wav",
            "defines": {
                "30": [0, 40],
                "57": [10, 50]
            }
        });
        fs::write(tmp.join("config.json"), v1_cfg.to_string()).unwrap();

        let info = parse_soundpack_info(&tmp, &tmp.join("config.json"), false).unwrap();
        assert_eq!(info.format, "Mechvibes V1 (Single)");
        let loaded = load_soundpack(&info).unwrap();
        let a_clip = loaded.pick_clip("KeyA", true).unwrap();
        let space_clip = loaded.pick_clip("Space", true).unwrap();
        assert!(!a_clip.samples.is_empty());
        assert!(space_clip.samples.len() >= a_clip.samples.len());

        let _ = fs::remove_dir_all(&tmp);
    }
}
