use crate::audio::{AudioClip, AudioEngine};
use crate::settings::user_soundpacks_dir;
use crate::soundpack::{load_soundpack, SoundpackInfo};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::Path;
use std::sync::Arc;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

#[derive(Debug, Clone, Serialize)]
pub struct AudioInspectResult {
    pub path: String,
    pub file_name: String,
    pub duration_ms: u64,
    pub sample_rate: u32,
    pub waveform: Vec<f32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StudioKeyMapping {
    pub web_code: String, // "Default", "Space", "Enter", "ShiftLeft", "KeyA", etc.
    pub down_path: String,
    pub down_start_ms: u64,
    pub down_duration_ms: u64,
    pub up_path: Option<String>,
    pub up_start_ms: u64,
    pub up_duration_ms: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StudioPackSpec {
    pub name: String,
    pub tag: String,
    pub author: String,
    pub description: String,
    pub mappings: Vec<StudioKeyMapping>,
}

pub fn inspect_audio_file(path: &Path) -> Result<AudioInspectResult, String> {
    let clip = AudioClip::decode_file(path)?;
    let duration_ms = ((clip.samples.len() as f64 / clip.sample_rate as f64) * 1000.0).round() as u64;

    let bars = 64usize;
    let mut waveform = Vec::with_capacity(bars);
    let chunk_size = (clip.samples.len() / bars).max(1);
    for i in 0..bars {
        let start = i * chunk_size;
        if start >= clip.samples.len() {
            waveform.push(0.0);
            continue;
        }
        let end = ((i + 1) * chunk_size).min(clip.samples.len());
        let peak = clip.samples[start..end]
            .iter()
            .fold(0.0f32, |acc, &s| acc.max((s as f32 / 32768.0).abs()));
        waveform.push(peak.clamp(0.0, 1.0));
    }

    let max_peak = waveform.iter().copied().fold(0.0f32, f32::max);
    if max_peak > 0.01 {
        for v in &mut waveform {
            *v = (*v / max_peak).clamp(0.05, 1.0);
        }
    }

    Ok(AudioInspectResult {
        path: path.to_string_lossy().to_string(),
        file_name: path
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("audio")
            .to_string(),
        duration_ms: duration_ms.max(10),
        sample_rate: clip.sample_rate,
        waveform,
    })
}

pub fn preview_audio_slice(
    audio: &AudioEngine,
    path: &Path,
    start_ms: u64,
    duration_ms: u64,
    volume: f32,
) -> Result<(), String> {
    let full = AudioClip::decode_file(path)?;
    let clip = if duration_ms > 0 {
        Arc::new(full.slice_ms(start_ms, duration_ms))
    } else {
        Arc::new(full)
    };
    audio.play_clip(&clip, volume, 0.0, 0.0);
    Ok(())
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
        format!("studio-pack-{}", fastrand::u32(1000..9999))
    } else {
        trimmed
    }
}

fn write_mono_wav(path: &Path, clip: &AudioClip) -> Result<(), String> {
    let mut file = File::create(path).map_err(|e| format!("WAV yazılamadı: {e}"))?;
    let num_samples = clip.samples.len() as u32;
    let data_bytes = num_samples * 2;
    let riff_size = 36 + data_bytes;

    file.write_all(b"RIFF").map_err(|e| e.to_string())?;
    file.write_all(&riff_size.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(b"WAVE").map_err(|e| e.to_string())?;
    file.write_all(b"fmt ").map_err(|e| e.to_string())?;
    file.write_all(&16u32.to_le_bytes()).map_err(|e| e.to_string())?; // PCM chunk size
    file.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?; // PCM format
    file.write_all(&1u16.to_le_bytes()).map_err(|e| e.to_string())?; // mono
    file.write_all(&clip.sample_rate.to_le_bytes()).map_err(|e| e.to_string())?;
    let byte_rate = clip.sample_rate * 2;
    file.write_all(&byte_rate.to_le_bytes()).map_err(|e| e.to_string())?;
    file.write_all(&2u16.to_le_bytes()).map_err(|e| e.to_string())?; // block align
    file.write_all(&16u16.to_le_bytes()).map_err(|e| e.to_string())?; // bits per sample
    file.write_all(b"data").map_err(|e| e.to_string())?;
    file.write_all(&data_bytes.to_le_bytes()).map_err(|e| e.to_string())?;

    let mut pcm_bytes = Vec::with_capacity(clip.samples.len() * 2);
    for &s in clip.samples.iter() {
        pcm_bytes.extend_from_slice(&s.to_le_bytes());
    }
    file.write_all(&pcm_bytes).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn save_studio_pack(spec: StudioPackSpec) -> Result<SoundpackInfo, String> {
    if spec.name.trim().is_empty() {
        return Err("Paket adı boş olamaz".to_string());
    }
    if spec.mappings.is_empty() {
        return Err("En az bir tuş ses eşleştirmesi eklemelisiniz".to_string());
    }

    let root = user_soundpacks_dir();
    fs::create_dir_all(&root).map_err(|e| format!("Paket klasörü oluşturulamadı: {e}"))?;

    let base_slug = sanitize_slug(&spec.name);
    let mut slug = base_slug.clone();
    let mut dest_dir = root.join(&slug);
    if dest_dir.exists() {
        slug = format!("{}-{}", base_slug, fastrand::u32(100..999));
        dest_dir = root.join(&slug);
    }
    fs::create_dir_all(&dest_dir).map_err(|e| format!("Hedef klasör oluşturulamadı: {e}"))?;

    let mut defs = Map::<String, Value>::new();

    for (idx, m) in spec.mappings.iter().enumerate() {
        let down_src = Path::new(&m.down_path);
        let full_down = AudioClip::decode_file(down_src)?;
        let sliced_down = if m.down_duration_ms > 0 {
            full_down.slice_ms(m.down_start_ms, m.down_duration_ms)
        } else {
            full_down
        };
        let down_name = format!("{}_{}_down.wav", sanitize_slug(&m.web_code), idx);
        write_mono_wav(&dest_dir.join(&down_name), &sliced_down)?;

        let mut entry = Map::new();
        entry.insert("down".to_string(), Value::String(down_name));

        if let Some(ref up_p) = m.up_path {
            if !up_p.trim().is_empty() {
                let full_up = AudioClip::decode_file(Path::new(up_p))?;
                let sliced_up = if m.up_duration_ms > 0 {
                    full_up.slice_ms(m.up_start_ms, m.up_duration_ms)
                } else {
                    full_up
                };
                let up_name = format!("{}_{}_up.wav", sanitize_slug(&m.web_code), idx);
                write_mono_wav(&dest_dir.join(&up_name), &sliced_up)?;
                entry.insert("up".to_string(), Value::String(up_name));
            }
        }

        defs.insert(m.web_code.clone(), Value::Object(entry));
    }

    let config = json!({
        "config_version": "2",
        "id": slug,
        "name": spec.name.trim(),
        "tag": if spec.tag.trim().is_empty() { "Custom" } else { spec.tag.trim() },
        "author": if spec.author.trim().is_empty() { "sxmcaps Studio" } else { spec.author.trim() },
        "description": if spec.description.trim().is_empty() { "sxmcaps Studio ile oluşturuldu" } else { spec.description.trim() },
        "accent": "#ffffff",
        "device_type": "keyboard",
        "definitions": Value::Object(defs),
    });

    let cfg_path = dest_dir.join("config.json");
    fs::write(
        &cfg_path,
        serde_json::to_string_pretty(&config).map_err(|e| e.to_string())?,
    )
    .map_err(|e| format!("config.json yazılamadı: {e}"))?;

    let info = SoundpackInfo {
        id: slug,
        name: spec.name.trim().to_string(),
        description: spec.description.trim().to_string(),
        tag: spec.tag.trim().to_string(),
        accent: "#ffffff".to_string(),
        device_type: "keyboard".to_string(),
        author: spec.author.trim().to_string(),
        is_builtin: false,
        path: dest_dir.to_string_lossy().to_string(),
        key_count: spec.mappings.len(),
        format: "Mechvibes V2".to_string(),
    };
    load_soundpack(&info)?;
    Ok(info)
}

pub fn export_pack_zip(pack_dir: &Path, dest_zip: &Path) -> Result<(), String> {
    if !pack_dir.is_dir() {
        return Err("Paket klasörü bulunamadı".to_string());
    }
    let out_file = File::create(dest_zip).map_err(|e| format!("ZIP oluşturulamadı: {e}"))?;
    let mut zip = ZipWriter::new(out_file);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);

    for entry in fs::read_dir(pack_dir)
        .map_err(|e| format!("Klasör okunamadı: {e}"))?
        .flatten()
    {
        let p = entry.path();
        if p.is_file() {
            let name = entry.file_name().to_string_lossy().to_string();
            zip.start_file(name, options)
                .map_err(|e| format!("ZIP yazma hatası: {e}"))?;
            let mut f = File::open(&p).map_err(|e| e.to_string())?;
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zip.write_all(&buf).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| format!("ZIP tamamlanamadı: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wav_roundtrip_inspect_and_export_zip_in_temp_dir() {
        let base = std::env::temp_dir().join(format!("sxmcaps-studio-test-{}", fastrand::u32(1000..99999)));
        let pack_dir = base.join("pack");
        fs::create_dir_all(&pack_dir).expect("temp dir should be created");

        let wav_path = pack_dir.join("test_key.wav");
        let clip = AudioClip {
            samples: std::sync::Arc::from(
                (0..4800)
                    .map(|i| (((i as f32 * 0.08).sin() * 0.5) * 32767.0) as i16)
                    .collect::<Vec<_>>(),
            ),
            sample_rate: 48_000,
        };
        write_mono_wav(&wav_path, &clip).expect("wav write should succeed");

        let inspected = inspect_audio_file(&wav_path).expect("inspect should succeed");
        assert_eq!(inspected.sample_rate, 48_000);
        assert_eq!(inspected.waveform.len(), 64);
        assert!(inspected.duration_ms >= 90);

        let zip_path = base.join("pack.zip");
        export_pack_zip(&pack_dir, &zip_path).expect("zip export should succeed");
        assert!(zip_path.is_file());
        assert!(fs::metadata(&zip_path).map(|m| m.len() > 100).unwrap_or(false));

        let _ = fs::remove_dir_all(&base);
    }
}
