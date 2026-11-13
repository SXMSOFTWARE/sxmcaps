use crate::soundpack::{import_soundpack_zip, SoundpackInfo};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::time::Duration;

const HUB_CATALOG_URL: &str =
    "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/catalog.json";
const RELEASES_API_URL: &str =
    "https://api.github.com/repos/SXMSOFTWARE/sxmcaps/releases/latest";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HubPackEntry {
    pub id: String,
    pub name: String,
    pub tag: String,
    pub description: String,
    pub author: String,
    pub device_type: String,
    pub size_kb: f32,
    pub download_url: String,
}

#[derive(Debug, Clone, Deserialize)]
struct HubCatalogResponse {
    packs: Vec<HubPackEntry>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub latest_version: String,
    pub has_update: bool,
    pub release_url: String,
    pub notes: String,
}

fn embedded_fallback_catalog() -> Vec<HubPackEntry> {
    vec![
        HubPackEntry {
            id: "mxblack-travel".to_string(),
            name: "Cherry MX Black (Full Travel)".to_string(),
            tag: "Linear".to_string(),
            description: "Real Cherry MX Black full-travel key press & release microphone recordings.".to_string(),
            author: "Mechvibes Community".to_string(),
            device_type: "keyboard".to_string(),
            size_kb: 20.1,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mxblack-travel.zip".to_string(),
        },
        HubPackEntry {
            id: "mxblue-travel".to_string(),
            name: "Cherry MX Blue (Full Travel)".to_string(),
            tag: "Clicky".to_string(),
            description: "Real Cherry MX Blue click-jacket press & release recordings with crisp Space/Enter.".to_string(),
            author: "Mechvibes Community".to_string(),
            device_type: "keyboard".to_string(),
            size_kb: 9.9,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mxblue-travel.zip".to_string(),
        },
        HubPackEntry {
            id: "mxbrown-travel".to_string(),
            name: "Cherry MX Brown (Full Travel)".to_string(),
            tag: "Tactile".to_string(),
            description: "Real Cherry MX Brown tactile press & release recordings with 5 randomized variations.".to_string(),
            author: "Mechvibes Community".to_string(),
            device_type: "keyboard".to_string(),
            size_kb: 24.8,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mxbrown-travel.zip".to_string(),
        },
        HubPackEntry {
            id: "cream-travel".to_string(),
            name: "NovelKeys Cream (Full Travel)".to_string(),
            tag: "Linear".to_string(),
            description: "Real NovelKeys Cream full-travel POM press & release recordings.".to_string(),
            author: "Mechvibes Community".to_string(),
            device_type: "keyboard".to_string(),
            size_kb: 21.1,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/cream-travel.zip".to_string(),
        },
        HubPackEntry {
            id: "mouse-corsair-m65".to_string(),
            name: "Corsair M65 Elite".to_string(),
            tag: "Mouse".to_string(),
            description: "Real Corsair M65 Elite Omron left, right, and scroll down/up recordings.".to_string(),
            author: "Mechvibes++".to_string(),
            device_type: "mouse".to_string(),
            size_kb: 17.8,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mouse-corsair-m65.zip".to_string(),
        },
        HubPackEntry {
            id: "mouse-razer-mamba".to_string(),
            name: "Razer Mamba Elite".to_string(),
            tag: "Mouse".to_string(),
            description: "Real Razer Mamba Elite mechanical mouse switch down/up recordings.".to_string(),
            author: "Mechvibes++".to_string(),
            device_type: "mouse".to_string(),
            size_kb: 38.1,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mouse-razer-mamba.zip".to_string(),
        },
        HubPackEntry {
            id: "mouse-harpoon-rgb".to_string(),
            name: "Corsair Harpoon RGB".to_string(),
            tag: "Mouse".to_string(),
            description: "Real Corsair Harpoon RGB gaming mouse click and scroll recordings.".to_string(),
            author: "Mechvibes++".to_string(),
            device_type: "mouse".to_string(),
            size_kb: 36.0,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mouse-harpoon-rgb.zip".to_string(),
        },
        HubPackEntry {
            id: "mouse-logi-trackball".to_string(),
            name: "Logitech M570 Trackball".to_string(),
            tag: "Mouse".to_string(),
            description: "Real Logitech M570 trackball soft tactile button click recordings.".to_string(),
            author: "Mechvibes++".to_string(),
            device_type: "mouse".to_string(),
            size_kb: 23.4,
            download_url: "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub/mouse-logi-trackball.zip".to_string(),
        },
    ]
}

pub fn fetch_hub_catalog() -> Vec<HubPackEntry> {
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(6))
        .build();
    if let Ok(resp) = agent.get(HUB_CATALOG_URL).call() {
        if let Ok(text) = resp.into_string() {
            if let Ok(parsed) = serde_json::from_str::<HubCatalogResponse>(&text) {
                if !parsed.packs.is_empty() {
                    return parsed.packs;
                }
            }
        }
    }
    embedded_fallback_catalog()
}

pub fn install_pack_from_url(url: &str) -> Result<SoundpackInfo, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") {
        return Err("Geçerli bir HTTP/HTTPS .zip bağlantısı girin".to_string());
    }

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(20))
        .build();
    let resp = agent
        .get(trimmed)
        .set("User-Agent", "sxmcaps/0.2.0")
        .call()
        .map_err(|e| format!("Paket indirilemedi: {e}"))?;

    let mut bytes = Vec::new();
    resp.into_reader()
        .take(32 * 1024 * 1024)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("İndirme okunamadı: {e}"))?;

    if bytes.is_empty() {
        return Err("İndirilen dosya boş".to_string());
    }

    let tmp_zip = std::env::temp_dir().join(format!("sxmcaps-hub-{}.zip", fastrand::u32(1000..99999)));
    fs::write(&tmp_zip, &bytes).map_err(|e| format!("Geçici dosya yazılamadı: {e}"))?;
    let res = import_soundpack_zip(&tmp_zip);
    let _ = fs::remove_file(&tmp_zip);
    res
}

fn parse_semver(v: &str) -> (u32, u32, u32) {
    let clean = v.trim().trim_start_matches('v');
    let mut parts = clean.split('.').map(|s| s.parse::<u32>().unwrap_or(0));
    (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    )
}

pub fn check_latest_release() -> Result<UpdateCheckResult, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();
    let resp = agent
        .get(RELEASES_API_URL)
        .set("User-Agent", "sxmcaps-updater")
        .set("Accept", "application/vnd.github+json")
        .call()
        .map_err(|e| format!("GitHub sürüm kontrolü başarısız: {e}"))?;

    let text = resp
        .into_string()
        .map_err(|e| format!("Yanıt okunamadı: {e}"))?;
    let val: serde_json::Value =
        serde_json::from_str(&text).map_err(|e| format!("JSON hatası: {e}"))?;

    let tag = val
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or(&current)
        .to_string();
    let release_url = val
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://github.com/SXMSOFTWARE/sxmcaps/releases")
        .to_string();
    let notes = val
        .get("body")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .lines()
        .take(4)
        .collect::<Vec<_>>()
        .join("\n");

    let has_update = parse_semver(&tag) > parse_semver(&current);

    Ok(UpdateCheckResult {
        current_version: format!("v{current}"),
        latest_version: tag,
        has_update,
        release_url,
        notes,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn semver_comparison_works() {
        assert!(parse_semver("v0.2.0") > parse_semver("0.1.0"));
        assert!(parse_semver("v1.0.0") > parse_semver("v0.9.9"));
        assert_eq!(parse_semver("v0.2.0"), parse_semver("0.2.0"));
    }

    #[test]
    fn embedded_hub_catalog_contains_eight_real_packs() {
        let cat = embedded_fallback_catalog();
        assert_eq!(cat.len(), 8);
        assert!(cat.iter().all(|p| p.download_url.ends_with(".zip")));
    }
}
