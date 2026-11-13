use crate::settings::data_dir;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct StatsData {
    pub total_keystrokes: u64,
    pub total_mouse_clicks: u64,
    pub peak_wpm: u32,
    pub heatmap: HashMap<String, u64>,
    pub daily: BTreeMap<String, u64>,
}

pub struct StatsManager {
    data: Mutex<StatsData>,
    last_saved: Mutex<Instant>,
    dirty: Mutex<bool>,
}

impl StatsManager {
    pub fn load() -> Self {
        let path = stats_file_path();
        let data = fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str::<StatsData>(&s).ok())
            .unwrap_or_default();
        Self {
            data: Mutex::new(data),
            last_saved: Mutex::new(Instant::now()),
            dirty: Mutex::new(false),
        }
    }

    pub fn record_key(&self, web_code: &str) -> u64 {
        let mut total = 0;
        if let Ok(mut g) = self.data.lock() {
            g.total_keystrokes += 1;
            total = g.total_keystrokes;
            *g.heatmap.entry(web_code.to_string()).or_insert(0) += 1;
            let today = today_iso_date();
            *g.daily.entry(today).or_insert(0) += 1;
            // Keep up to 30 days of daily history
            while g.daily.len() > 30 {
                if let Some(first_key) = g.daily.keys().next().cloned() {
                    g.daily.remove(&first_key);
                } else {
                    break;
                }
            }
        }
        self.mark_dirty_and_maybe_flush();
        total
    }

    pub fn record_mouse(&self) {
        if let Ok(mut g) = self.data.lock() {
            g.total_mouse_clicks += 1;
        }
        self.mark_dirty_and_maybe_flush();
    }

    pub fn update_peak_wpm(&self, wpm: u32) {
        if let Ok(mut g) = self.data.lock() {
            if wpm > g.peak_wpm {
                g.peak_wpm = wpm;
                if let Ok(mut d) = self.dirty.lock() {
                    *d = true;
                }
            }
        }
    }

    pub fn snapshot(&self) -> StatsData {
        self.data.lock().map(|g| g.clone()).unwrap_or_default()
    }

    pub fn reset(&self) -> Result<StatsData, String> {
        let fresh = StatsData::default();
        if let Ok(mut g) = self.data.lock() {
            *g = fresh.clone();
        }
        self.save_now()?;
        Ok(fresh)
    }

    pub fn save_now(&self) -> Result<(), String> {
        let snap = self.snapshot();
        let path = stats_file_path();
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| format!("İstatistik klasörü oluşturulamadı: {e}"))?;
        }
        let json = serde_json::to_string_pretty(&snap)
            .map_err(|e| format!("İstatistikler serileştirilemedi: {e}"))?;
        fs::write(&path, json).map_err(|e| format!("İstatistikler kaydedilemedi: {e}"))?;
        if let Ok(mut d) = self.dirty.lock() {
            *d = false;
        }
        if let Ok(mut ls) = self.last_saved.lock() {
            *ls = Instant::now();
        }
        Ok(())
    }

    fn mark_dirty_and_maybe_flush(&self) {
        if let Ok(mut d) = self.dirty.lock() {
            *d = true;
        }
        let should_save = self
            .last_saved
            .lock()
            .map(|ls| ls.elapsed().as_secs() >= 8)
            .unwrap_or(false);
        if should_save {
            let _ = self.save_now();
        }
    }
}

pub fn stats_file_path() -> PathBuf {
    data_dir().join("stats.json")
}

/// Convert UNIX epoch seconds to YYYY-MM-DD (Howard Hinnant civil-from-days algorithm)
pub fn today_iso_date() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let days = secs.div_euclid(86_400);
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = mp + if mp < 10 { 3 } else { -9 };
    let year = y + if m <= 2 { 1 } else { 0 };
    format!("{year:04}-{m:02}-{d:02}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn today_iso_date_has_valid_format() {
        let date = today_iso_date();
        assert_eq!(date.len(), 10);
        let parts: Vec<&str> = date.split('-').collect();
        assert_eq!(parts.len(), 3);
        let year: u32 = parts[0].parse().expect("year should be numeric");
        let month: u32 = parts[1].parse().expect("month should be numeric");
        let day: u32 = parts[2].parse().expect("day should be numeric");
        assert!(year >= 2024);
        assert!((1..=12).contains(&month));
        assert!((1..=31).contains(&day));
    }

    #[test]
    fn stats_manager_records_keys_clicks_and_peak_wpm() {
        let mgr = StatsManager {
            data: Mutex::new(StatsData::default()),
            last_saved: Mutex::new(Instant::now()),
            dirty: Mutex::new(false),
        };
        assert_eq!(mgr.record_key("Space"), 1);
        assert_eq!(mgr.record_key("Space"), 2);
        assert_eq!(mgr.record_key("KeyA"), 3);
        mgr.record_mouse();
        mgr.update_peak_wpm(84);
        mgr.update_peak_wpm(50);

        let snap = mgr.snapshot();
        assert_eq!(snap.total_keystrokes, 3);
        assert_eq!(snap.total_mouse_clicks, 1);
        assert_eq!(snap.peak_wpm, 84);
        assert_eq!(snap.heatmap.get("Space").copied(), Some(2));
        assert_eq!(snap.heatmap.get("KeyA").copied(), Some(1));
        assert_eq!(snap.daily.get(&today_iso_date()).copied(), Some(3));
    }
}
