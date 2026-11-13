use crate::drivers::{
    ConnectionLink, DeviceCapabilities, DeviceHardwareState, DeviceKind, HardwareDeviceInfo,
    KeymapEntryDto, LedTopologyNode, LightingCapability, MouseButtonActionOption,
    MouseConfigUpdate, MouseHardwareState, PeripheralDriver,
};
use hidapi::{DeviceInfo, HidApi, HidDevice};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::ffi::CString;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::Mutex;
use std::thread;
use std::time::Duration;

// USB VID:PIDs confirmed for Furylevel Z1 / Fevell Z1 (PAW3395 / BK3633)
pub const FURY_VID: u16 = 0x04f3;
pub const FURY_WIRED_PID: u16 = 0x026e;
pub const FURY_DONGLE_PID: u16 = 0x026f;
pub const FURY_DONGLE_4K_PID: u16 = 0x026d;

pub const HS6209_DONGLE_VID: u16 = 0x32c2;
pub const HS6209_DONGLE_PID: u16 = 0x0018;

// HID Feature & Input Report IDs (GamingMS.exe protocol)
pub const REPORT_INPUT_STATUS: u8 = 0x04;
pub const REPORT_STATUS: u8 = 0x05;
pub const REPORT_FEATURE_CMD: u8 = 0x06;
pub const REPORT_WAKE: u8 = 0xbc;
pub const REPORT_STATE_READ: u8 = 0xbd;

pub const PACKET_FEATURE_LEN: usize = 32;
pub const PACKET_WAKE_LEN: usize = 8;
pub const PACKET_STATE_LEN: usize = 136;

pub const DPI_MIN: u16 = 50;
pub const DPI_MAX: u16 = 26_000;
pub const DPI_STEP: u16 = 50;
pub const MAX_DPI_STAGES: usize = 6;

pub mod cmd {
    pub const KEY_MAPPING: u8 = 0x01;
    pub const SET_DPI: u8 = 0x02;
    pub const SET_DPI_COLORS: u8 = 0x03;
    pub const SET_POLLING_RATE: u8 = 0x04;
    pub const SET_LOD: u8 = 0x05;
    pub const SET_LIGHTING: u8 = 0x06;
    pub const SET_POWER_SLEEP: u8 = 0x07;
    pub const SET_SENSOR_ADVANCED: u8 = 0x08;
    pub const FACTORY_RESET: u8 = 0x0f;
}

pub fn is_furylevel_z1_device(vid: u16, pid: u16) -> bool {
    (vid == FURY_VID && matches!(pid, FURY_WIRED_PID | FURY_DONGLE_PID | FURY_DONGLE_4K_PID))
        || (vid == HS6209_DONGLE_VID && pid == HS6209_DONGLE_PID)
}

pub fn default_dpi_stages() -> Vec<u16> {
    vec![400, 800, 1600, 3200, 6400, 12000]
}

pub fn default_dpi_colors() -> Vec<[u8; 3]> {
    vec![
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
        [255, 255, 0],
        [0, 255, 255],
        [255, 0, 255],
        [255, 255, 255],
        [255, 255, 255],
    ]
}

pub fn default_button_mappings() -> Vec<String> {
    vec![
        "left_click".into(),
        "right_click".into(),
        "middle_click".into(),
        "forward".into(),
        "back".into(),
        "dpi_loop".into(),
    ]
}

pub fn button_action_code(action_id: &str) -> [u8; 3] {
    match action_id {
        "left_click" => [0x10, 0x01, 0x00],
        "right_click" => [0x10, 0x02, 0x00],
        "middle_click" => [0x10, 0x04, 0x00],
        "back" => [0x10, 0x08, 0x00],
        "forward" => [0x10, 0x10, 0x00],
        "dpi_loop" => [0x40, 0x01, 0x00],
        "dpi_plus" => [0x40, 0x02, 0x00],
        "dpi_minus" => [0x40, 0x03, 0x00],
        "multimedia_play" => [0x20, 0xcd, 0x00],
        "multimedia_vol_up" => [0x20, 0xe9, 0x00],
        "multimedia_vol_down" => [0x20, 0xea, 0x00],
        "multimedia_mute" => [0x20, 0xe2, 0x00],
        "disabled" => [0x00, 0x00, 0x00],
        _ => [0x10, 0x01, 0x00],
    }
}

pub fn available_button_actions() -> Vec<MouseButtonActionOption> {
    vec![
        ("left_click", "Left Click", "Sol Tık"),
        ("right_click", "Right Click", "Sağ Tık"),
        ("middle_click", "Middle Click", "Orta Tık (Tekerlek)"),
        ("forward", "Forward (Side 1)", "İleri (Yan Tuş 1)"),
        ("back", "Back (Side 2)", "Geri (Yan Tuş 2)"),
        ("dpi_loop", "DPI Cycle", "DPI Döngüsü"),
        ("dpi_plus", "DPI +", "DPI Artır (+)"),
        ("dpi_minus", "DPI -", "DPI Azalt (-)"),
        ("multimedia_play", "Play / Pause", "Medya Oynat / Duraklat"),
        ("multimedia_vol_up", "Volume +", "Ses Artır (+)"),
        ("multimedia_vol_down", "Volume -", "Ses Azalt (-)"),
        ("multimedia_mute", "Mute", "Sesi Kapat (Mute)"),
        ("disabled", "Disabled", "Devre Dışı"),
    ]
    .into_iter()
    .map(|(id, label_en, label_tr)| MouseButtonActionOption {
        id: id.into(),
        label_en: label_en.into(),
        label_tr: label_tr.into(),
    })
    .collect()
}

pub fn calculate_feature_checksum(packet: &[u8]) -> u8 {
    packet
        .iter()
        .take(PACKET_FEATURE_LEN)
        .enumerate()
        .filter(|&(i, _)| i != 4)
        .fold(0u8, |acc, (_, &b)| acc.wrapping_add(b))
}

pub fn build_feature_packet(cmd_id: u8, seq: u8, subcmd: u8, payload: &[u8]) -> [u8; PACKET_FEATURE_LEN] {
    let mut pkt = [0u8; PACKET_FEATURE_LEN];
    pkt[0] = REPORT_FEATURE_CMD;
    pkt[1] = cmd_id;
    pkt[2] = seq;
    pkt[3] = subcmd;
    let copy_len = payload.len().min(27);
    pkt[5..5 + copy_len].copy_from_slice(&payload[..copy_len]);
    pkt[4] = calculate_feature_checksum(&pkt);
    pkt
}

pub fn encode_dpi_step(dpi: u16) -> u16 {
    let clamped = dpi.clamp(DPI_MIN, DPI_MAX);
    (clamped / DPI_STEP).saturating_sub(1)
}

pub fn decode_dpi_step(raw_step: u16) -> u16 {
    raw_step
        .saturating_add(1)
        .saturating_mul(DPI_STEP)
        .clamp(DPI_MIN, DPI_MAX)
}

pub fn polling_rate_to_code(hz: u16) -> u8 {
    match hz {
        125 => 0x08,
        250 => 0x04,
        500 => 0x02,
        2000 => 0x11,
        4000 => 0x12,
        8000 => 0x14,
        _ => 0x01,
    }
}

pub fn code_to_polling_rate(code: u8) -> u16 {
    match code {
        0x08 | 0 => 125,
        0x04 => 250,
        0x02 => 500,
        0x11 => 2000,
        0x12 => 4000,
        0x14 => 8000,
        _ => 1000,
    }
}

pub fn sleep_minutes_to_unit(mins: u16) -> u8 {
    match mins {
        1 => 10,
        3 => 30,
        5 => 50,
        10 => 100,
        15 => 150,
        30 => 250,
        other => (other.clamp(1, 25).saturating_mul(10)) as u8,
    }
}

pub fn build_feature_dpi_packet(
    seq: u8,
    stages: &[u16],
    active_stage: u8,
    enable_mask: Option<u8>,
) -> [u8; PACKET_FEATURE_LEN] {
    let count = stages.len().clamp(1, MAX_DPI_STAGES);
    let mask = match enable_mask {
        Some(m) if (m & 0x3f) != 0 => m & 0x3f,
        _ => ((1u16 << count) - 1) as u8,
    };
    let defs = default_dpi_stages();
    let mut payload = [0u8; 18];
    payload[0] = active_stage.min((MAX_DPI_STAGES - 1) as u8);
    payload[1] = mask;
    for i in 0..MAX_DPI_STAGES {
        let dpi = stages.get(i).copied().unwrap_or(defs[i]);
        let step = encode_dpi_step(dpi);
        payload[2 + i * 2] = (step & 0xff) as u8;
        payload[3 + i * 2] = (step >> 8) as u8;
    }
    build_feature_packet(cmd::SET_DPI, seq, 0x01, &payload)
}

pub fn build_feature_dpi_colors_packet(seq: u8, colors: &[[u8; 3]]) -> [u8; PACKET_FEATURE_LEN] {
    let defs = default_dpi_colors();
    let mut payload = [0u8; 24];
    for i in 0..8 {
        let rgb = colors.get(i).copied().unwrap_or(defs[i]);
        payload[i * 3] = rgb[0];
        payload[i * 3 + 1] = rgb[1];
        payload[i * 3 + 2] = rgb[2];
    }
    build_feature_packet(cmd::SET_DPI_COLORS, seq, 0x01, &payload)
}

pub fn build_feature_polling_packet(seq: u8, hz: u16) -> [u8; PACKET_FEATURE_LEN] {
    build_feature_packet(cmd::SET_POLLING_RATE, seq, 0x01, &[polling_rate_to_code(hz)])
}

pub fn build_feature_lod_packet(seq: u8, lod_mm: u8) -> [u8; PACKET_FEATURE_LEN] {
    let code = if lod_mm <= 1 { 0x01 } else { 0x02 };
    build_feature_packet(cmd::SET_LOD, seq, 0x01, &[code])
}

pub fn build_feature_lighting_packet(
    seq: u8,
    mode: u8,
    brightness: u8,
    speed: u8,
) -> [u8; PACKET_FEATURE_LEN] {
    let mut payload = [0u8; 25];
    payload[0] = 0x00;
    payload[1] = mode.min(9);
    let b_nib = brightness.clamp(1, 4);
    let s_nib = speed.clamp(1, 4);
    payload[2] = (b_nib << 4) | s_nib;
    payload[3] = 0x00;
    build_feature_packet(cmd::SET_LIGHTING, seq, 0x01, &payload)
}

pub fn build_feature_power_sleep_packet(
    seq: u8,
    sleep_timeout_min: u16,
    move_light_off: bool,
) -> [u8; PACKET_FEATURE_LEN] {
    let unit = sleep_minutes_to_unit(sleep_timeout_min);
    let mv = if move_light_off { 0x01 } else { 0x00 };
    build_feature_packet(cmd::SET_POWER_SLEEP, seq, 0x01, &[unit, mv])
}

pub fn build_feature_sensor_advanced_packet(
    seq: u8,
    angle_snap: bool,
    motion_sync: bool,
    ripple_control: bool,
) -> [u8; PACKET_FEATURE_LEN] {
    build_feature_packet(
        cmd::SET_SENSOR_ADVANCED,
        seq,
        0x01,
        &[
            u8::from(angle_snap),
            u8::from(motion_sync),
            u8::from(ripple_control),
        ],
    )
}

pub fn build_feature_key_mapping_packet(seq: u8, button_keys: &[String]) -> [u8; PACKET_FEATURE_LEN] {
    let defs = default_button_mappings();
    // Hardware slot order in GamingMS.exe: [Left, Right, Middle, Back, Forward, DPI]
    const HW_ORDER: [usize; 6] = [0, 1, 2, 4, 3, 5];
    let mut payload = [0u8; 18];
    for (slot_idx, &btn_idx) in HW_ORDER.iter().enumerate() {
        let action_id = button_keys
            .get(btn_idx)
            .map(String::as_str)
            .unwrap_or(&defs[btn_idx]);
        let bytes = button_action_code(action_id);
        payload[slot_idx * 3..slot_idx * 3 + 3].copy_from_slice(&bytes);
    }
    build_feature_packet(cmd::KEY_MAPPING, seq, 0x01, &payload)
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedStatus05 {
    pub online: bool,
    pub max_rate_hz: u16,
    pub battery_pct: u8,
    pub has_magic_1010: bool,
}

pub fn parse_feature_status_05(report: &[u8]) -> Option<ParsedStatus05> {
    if report.len() < 8 || report[0] != REPORT_STATUS {
        return None;
    }
    let has_magic_1010 = &report[1..5] == b"1010";
    let online = report[5] != 0;
    let max_rate_hz = match report[6] {
        8 => 8000,
        4 => 4000,
        _ => 1000,
    };
    let battery_pct = report[7].min(100);
    Some(ParsedStatus05 {
        online,
        max_rate_hz,
        battery_pct,
        has_magic_1010,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedInput04 {
    pub active_stage: u8,
    pub polling_rate: u16,
    pub battery_pct: u8,
    pub is_charging: bool,
    pub lod_mm: u8,
}

pub fn parse_input_status_report(report: &[u8]) -> Option<ParsedInput04> {
    if report.len() < 7 || report[0] != REPORT_INPUT_STATUS {
        return None;
    }
    if report[1..7].iter().all(|&b| b == 0) {
        return None;
    }
    let active_stage = report[2].min((MAX_DPI_STAGES - 1) as u8);
    let polling_rate = code_to_polling_rate(report[3]);
    let mut battery_pct = report[4].min(100);
    let is_charging = match report[5] {
        2 => {
            battery_pct = 100;
            true
        }
        1 => true,
        _ => false,
    };
    let lod_mm = if report[6] == 1 { 1 } else { 2 };
    Some(ParsedInput04 {
        active_stage,
        polling_rate,
        battery_pct,
        is_charging,
        lod_mm,
    })
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedStateBd {
    pub active_stage: u8,
    pub stage_enable_mask: u8,
    pub stage_count: u8,
    pub polling_rate: u16,
    pub lod_mm: u8,
    pub debounce_ms: u8,
    pub dpi_stages: Vec<u16>,
}

pub fn parse_state_report_bd(report: &[u8]) -> Option<ParsedStateBd> {
    if report.len() < 19 || report[0] != REPORT_STATE_READ {
        return None;
    }
    let has_non_zero_stage = (0..MAX_DPI_STAGES).any(|i| {
        let off = 7 + i * 2;
        off + 1 < report.len() && u16::from_le_bytes([report[off], report[off + 1]]) > 0
    });
    // Firmware on 04f3:026e USB-C / 2.4G often answers GET_FEATURE(0xBD) with
    // [0xBD, 0x01, 0x00, 0x00, ...]. Returning None avoids clobbering DPI stages
    // with 50 DPI / 125 Hz when hardware state-read is unpopulated.
    if !has_non_zero_stage {
        return None;
    }
    let active_stage = if (report[2] as usize) < MAX_DPI_STAGES {
        report[2]
    } else {
        1
    };
    let mask_raw = report[3] & 0x3f;
    let mask = if mask_raw == 0 { 0x0f } else { mask_raw };
    let polling_rate = code_to_polling_rate(report[4]);
    let lod_mm = if report[5] == 2 { 2 } else { 1 };
    let debounce_ms = if report[6] <= 30 { report[6] } else { 8 };
    let mut stages = Vec::with_capacity(MAX_DPI_STAGES);
    let defs = default_dpi_stages();
    for i in 0..MAX_DPI_STAGES {
        let off = 7 + i * 2;
        let raw_step = u16::from_le_bytes([report[off], report[off + 1]]);
        if raw_step > 0 {
            stages.push(decode_dpi_step(raw_step));
        } else {
            stages.push(defs[i]);
        }
    }
    let stage_count = (mask.count_ones() as u8).clamp(1, MAX_DPI_STAGES as u8);
    Some(ParsedStateBd {
        active_stage: active_stage.min(stage_count.saturating_sub(1)),
        stage_enable_mask: mask,
        stage_count,
        polling_rate,
        lod_mm,
        debounce_ms,
        dpi_stages: stages,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PersistedZ1Profile {
    polling_rate: u16,
    lod_mm: u8,
    debounce_ms: u8,
    active_stage: u8,
    stage_count: u8,
    stage_enable_mask: u8,
    dpi_stages: Vec<u16>,
    dpi_colors: Vec<[u8; 3]>,
    angle_snap: bool,
    motion_sync: bool,
    ripple_control: bool,
    sleep_timeout_min: u16,
    move_light_off: bool,
    lighting_mode: u8,
    lighting_brightness: u8,
    lighting_speed: u8,
    button_mappings: Vec<String>,
    battery_pct: u8,
    is_charging: bool,
}

impl Default for PersistedZ1Profile {
    fn default() -> Self {
        Self {
            polling_rate: 1000,
            lod_mm: 1,
            debounce_ms: 8,
            active_stage: 1,
            stage_count: 4,
            stage_enable_mask: 0x0f,
            dpi_stages: default_dpi_stages(),
            dpi_colors: default_dpi_colors(),
            angle_snap: false,
            motion_sync: true,
            ripple_control: false,
            sleep_timeout_min: 1,
            move_light_off: true,
            lighting_mode: 1,
            lighting_brightness: 3,
            lighting_speed: 2,
            button_mappings: default_button_mappings(),
            battery_pct: 100,
            is_charging: false,
        }
    }
}

pub struct FurylevelZ1Driver {
    info: HardwareDeviceInfo,
    feature_path: String,
    input_path: Option<String>,
    link: ConnectionLink,
    seq: AtomicU8,
    io_lock: Mutex<PersistedZ1Profile>,
    feature_dev: Mutex<Option<HidDevice>>,
    input_dev: Mutex<Option<HidDevice>>,
}

impl FurylevelZ1Driver {
    fn profile_path() -> PathBuf {
        let dir = crate::settings::config_dir();
        let _ = std::fs::create_dir_all(&dir);
        dir.join("furylevel_z1_profile.json")
    }

    fn load_profile(link: &ConnectionLink) -> PersistedZ1Profile {
        let mut p = std::fs::read_to_string(Self::profile_path())
            .ok()
            .and_then(|s| serde_json::from_str::<PersistedZ1Profile>(&s).ok())
            .unwrap_or_default();
        let defs = default_dpi_stages();
        while p.dpi_stages.len() < MAX_DPI_STAGES {
            p.dpi_stages.push(defs[p.dpi_stages.len()]);
        }
        // Auto-heal the v0.4.1 empty-0xBD artifact where stage 0 became 50 DPI.
        if p.dpi_stages.first() == Some(&50) {
            p.dpi_stages[0] = defs[0];
        }
        p.active_stage = p.active_stage.min((MAX_DPI_STAGES - 1) as u8);
        if p.stage_enable_mask & 0x3f == 0 {
            p.stage_enable_mask = 0x0f;
        }
        p.stage_enable_mask |= 1u8 << p.active_stage;
        p.stage_count = ((p.stage_enable_mask & 0x3f).count_ones() as u8).clamp(1, MAX_DPI_STAGES as u8);
        if *link == ConnectionLink::Wired {
            p.is_charging = true;
        }
        p
    }

    fn save_profile(p: &PersistedZ1Profile) {
        if let Ok(json) = serde_json::to_string_pretty(p) {
            let _ = std::fs::write(Self::profile_path(), json);
        }
    }

    pub fn discover_with_api(api: &HidApi) -> Vec<HardwareDeviceInfo> {
        let mut grouped: BTreeMap<(u16, u16), Vec<&DeviceInfo>> = BTreeMap::new();
        for d in api.device_list() {
            let vid = d.vendor_id();
            let pid = d.product_id();
            if is_furylevel_z1_device(vid, pid) {
                grouped.entry((vid, pid)).or_default().push(d);
            }
        }

        let mut out = Vec::new();
        for ((vid, pid), ifaces) in grouped {
            // On Windows hidclass.sys splits Interface 1 into separate TLCs:
            // prioritize vendor Feature TLC (0xff00), never Keyboard (0x0001) or Consumer (0x000c).
            let vendor_iface = ifaces
                .iter()
                .copied()
                .find(|d| d.usage_page() == 0xff00)
                .or_else(|| {
                    ifaces.iter().copied().find(|d| {
                        d.interface_number() == 1
                            && d.usage_page() != 0x0001
                            && d.usage_page() != 0x000c
                    })
                })
                .or_else(|| ifaces.iter().copied().find(|d| d.interface_number() == 1))
                .unwrap_or(ifaces[0]);
            let path = vendor_iface.path().to_string_lossy().into_owned();
            let cpath = CString::new(path.as_str()).ok();
            let opened = cpath.as_ref().and_then(|c| api.open_path(c).ok());
            let permission_ok = opened.is_some();

            let (link, link_tag, display_suffix, default_rate) = if vid == FURY_VID && pid == FURY_WIRED_PID {
                (ConnectionLink::Wired, "wired", "USB-C Wired", 1000u16)
            } else if vid == FURY_VID && pid == FURY_DONGLE_4K_PID {
                (ConnectionLink::Wireless24G, "24g-4k", "4K/8K Wireless", 4000u16)
            } else {
                (ConnectionLink::Wireless24G, "24g", "2.4G Wireless", 1000u16)
            };

            let mut online = link == ConnectionLink::Wired;
            let mut rate_info = default_rate;
            if let Some(dev) = opened {
                let mut wake = [0u8; PACKET_WAKE_LEN];
                wake[0] = REPORT_WAKE;
                let _ = dev.send_feature_report(&wake);
                let mut r5 = [0u8; PACKET_FEATURE_LEN];
                r5[0] = REPORT_STATUS;
                if let Ok(n) = dev.get_feature_report(&mut r5) {
                    if let Some(st) = parse_feature_status_05(&r5[..n]) {
                        online = st.online || link == ConnectionLink::Wired;
                        rate_info = st.max_rate_hz;
                    }
                }
            }

            let notes = if !permission_ok {
                format!(
                    "Furylevel Z1 ({vid:04x}:{pid:04x}) algılandı ancak Linux HID izni yok. Sistem/SxBoards'tan 'HID İzni Ver (udev)' ile PAW3395 / BK3633 ayarlarını açabilirsin."
                )
            } else {
                format!(
                    "Furylevel Z1 ({vid:04x}:{pid:04x}, PAW3395 / BK3633, {rate_info} Hz) yerel HID sürücüsü aktif."
                )
            };

            out.push(HardwareDeviceInfo {
                id: format!("furylevel-z1:{link_tag}:{vid:04x}:{pid:04x}"),
                driver_id: "furylevel-z1".to_string(),
                brand: "Furylevel".to_string(),
                model: "Z1".to_string(),
                display_name: format!("Furylevel Z1 ({display_suffix})"),
                device_kind: DeviceKind::Mouse,
                vendor_id: vid,
                product_id: pid,
                vid_pid: format!("{vid:04x}:{pid:04x}"),
                link,
                hid_path: Some(path),
                interface_number: vendor_iface.interface_number(),
                usage_page: vendor_iface.usage_page(),
                online,
                permission_ok,
                capabilities: DeviceCapabilities {
                    rgb_effects: true,
                    per_key_rgb: false,
                    host_streaming: false,
                    side_light: false,
                    knob_mode: false,
                    os_mode: false,
                    win_lock: false,
                    sleep_timer: true,
                    key_remapping: true,
                    fn_layers: false,
                    macros: false,
                    battery_status: true,
                    sound_engine: true,
                    communication_supported: true,
                    writable: permission_ok && online,
                    lighting_mode: LightingCapability::ZoneRgb,
                    led_count: 1,
                },
                notes,
            });
        }
        out
    }

    pub fn open_from_info(info: HardwareDeviceInfo) -> Result<Self, String> {
        let feature_path = info
            .hid_path
            .clone()
            .ok_or_else(|| "Furylevel Z1 HID path missing".to_string())?;
        // On Windows, Input Report 0x04 lives on its own TLC (usage_page 0x000a) separate from
        // the Feature TLC (0xff00). On Linux both live on /dev/hidraw1, so input_path stays None.
        let input_path = HidApi::new().ok().and_then(|api| {
            api.device_list()
                .find(|d| {
                    d.vendor_id() == info.vendor_id
                        && d.product_id() == info.product_id
                        && d.usage_page() == 0x000a
                })
                .map(|d| d.path().to_string_lossy().into_owned())
                .filter(|p| p != &feature_path)
        });
        let link = info.link.clone();
        let profile = Self::load_profile(&link);
        Ok(Self {
            info,
            feature_path,
            input_path,
            link,
            seq: AtomicU8::new(1),
            io_lock: Mutex::new(profile),
            feature_dev: Mutex::new(None),
            input_dev: Mutex::new(None),
        })
    }

    fn next_seq(&self) -> u8 {
        self.seq.fetch_add(1, Ordering::Relaxed)
    }

    fn open_path_raw(path: &str) -> Result<HidDevice, String> {
        let api = HidApi::new().map_err(|e| format!("HID init failed: {e}"))?;
        let cpath = CString::new(path).map_err(|e| e.to_string())?;
        api.open_path(&cpath).map_err(|e| {
            format!("Furylevel Z1 HID açma hatası ({path}): {e}. udev kurallarını yükleyin.")
        })
    }

    fn with_feature_dev<F, R>(&self, f: F) -> Result<R, String>
    where
        F: FnOnce(&HidDevice) -> Result<R, String>,
    {
        let mut guard = self
            .feature_dev
            .lock()
            .map_err(|_| "Furylevel feature handle mutex poisoned".to_string())?;
        if guard.is_none() {
            *guard = Some(Self::open_path_raw(&self.feature_path)?);
        }
        let res = f(guard.as_ref().expect("just populated"));
        if res.is_err() {
            // Force clean re-open if device was replugged or handle became stale.
            *guard = None;
        }
        res
    }

    fn drain_input_reports(&self, prof: &mut PersistedZ1Profile) -> bool {
        let mut saw_change = false;
        let mut read_loop = |dev: &HidDevice| -> Result<(), hidapi::HidError> {
            let mut buf = [0u8; PACKET_FEATURE_LEN];
            for _ in 0..8 {
                match dev.read_timeout(&mut buf, 0) {
                    Ok(n) if n >= 7 => {
                        if let Some(inp) = parse_input_status_report(&buf[..n]) {
                            prof.active_stage = inp.active_stage.min((MAX_DPI_STAGES - 1) as u8);
                            prof.stage_enable_mask |= 1u8 << prof.active_stage;
                            prof.stage_count = ((prof.stage_enable_mask & 0x3f).count_ones() as u8)
                                .clamp(1, MAX_DPI_STAGES as u8);
                            prof.polling_rate = inp.polling_rate;
                            prof.lod_mm = inp.lod_mm;
                            prof.battery_pct = inp.battery_pct;
                            prof.is_charging = inp.is_charging;
                            saw_change = true;
                        }
                    }
                    Ok(_) => break,
                    Err(e) => return Err(e),
                }
            }
            Ok(())
        };

        if let Some(ref in_path) = self.input_path {
            if let Ok(mut guard) = self.input_dev.lock() {
                if guard.is_none() {
                    *guard = Self::open_path_raw(in_path).ok();
                }
                if let Some(dev) = guard.as_ref() {
                    if read_loop(dev).is_err() {
                        *guard = None;
                    }
                }
            }
        } else if let Ok(mut guard) = self.feature_dev.lock() {
            if guard.is_none() {
                *guard = Self::open_path_raw(&self.feature_path).ok();
            }
            if let Some(dev) = guard.as_ref() {
                if read_loop(dev).is_err() {
                    *guard = None;
                }
            }
        }
        saw_change
    }

    fn send_feature_command(&self, dev: &HidDevice, packet: &[u8; PACKET_FEATURE_LEN]) -> Result<(), String> {
        for _attempt in 0..3 {
            dev.send_feature_report(packet)
                .map_err(|e| format!("Furylevel Z1 Feature Report yazma hatası: {e}"))?;
            thread::sleep(Duration::from_millis(55));
            let mut ack = [0u8; PACKET_FEATURE_LEN];
            ack[0] = REPORT_FEATURE_CMD;
            if let Ok(n) = dev.get_feature_report(&mut ack) {
                if n >= 2 && ack[1] != 0x00 {
                    return Ok(());
                }
            } else {
                return Ok(());
            }
        }
        Ok(())
    }

    fn sync_from_hardware_locked(
        &self,
        dev: &HidDevice,
        prof: &mut PersistedZ1Profile,
    ) -> (String, u16, bool) {
        let mut wake = [0u8; PACKET_WAKE_LEN];
        wake[0] = REPORT_WAKE;
        let _ = dev.send_feature_report(&wake);

        let mut fw = "BK3633 PAW3395".to_string();
        let mut max_rate = 1000u16;
        let mut online = self.link == ConnectionLink::Wired;

        let mut r5 = [0u8; PACKET_FEATURE_LEN];
        r5[0] = REPORT_STATUS;
        if let Ok(n) = dev.get_feature_report(&mut r5) {
            if let Some(st) = parse_feature_status_05(&r5[..n]) {
                if st.has_magic_1010 {
                    fw = "1010 (v1.0.1.0)".to_string();
                }
                online = st.online || self.link == ConnectionLink::Wired;
                max_rate = st.max_rate_hz;
                if st.battery_pct > 0 {
                    prof.battery_pct = st.battery_pct;
                }
            }
        }

        // Try Feature Report 0xBD full state readout if firmware returns it cleanly
        let mut rbd = [0u8; PACKET_STATE_LEN];
        rbd[0] = REPORT_STATE_READ;
        if let Ok(n) = dev.get_feature_report(&mut rbd) {
            if let Some(bd) = parse_state_report_bd(&rbd[..n]) {
                prof.active_stage = bd.active_stage;
                prof.stage_enable_mask = bd.stage_enable_mask;
                prof.stage_count = bd.stage_count;
                prof.polling_rate = bd.polling_rate;
                prof.lod_mm = bd.lod_mm;
                prof.debounce_ms = bd.debounce_ms;
                prof.dpi_stages = bd.dpi_stages;
            }
        }

        (fw, max_rate, online)
    }

    fn build_mouse_dto(&self, prof: &PersistedZ1Profile, fw: String, max_rate: u16, online: bool) -> MouseHardwareState {
        let voltage_mv = if prof.is_charging {
            4200
        } else {
            3400 + ((u16::from(prof.battery_pct) * 750) / 100)
        };
        let link_label = match self.link {
            ConnectionLink::Wired => "USB-C Wired (04f3:026e)",
            ConnectionLink::Wireless24G if max_rate >= 4000 => "4K/8K Wireless",
            ConnectionLink::Wireless24G => "2.4GHz Wireless",
            _ => "USB HID",
        };
        MouseHardwareState {
            device_id: self.info.id.clone(),
            model_name: "Furylevel Z1".to_string(),
            sensor_model: "PixArt PAW3395 (26,000 DPI · 650 IPS · 50G)".to_string(),
            mcu_model: "Beken BK3633 (Tri-Mode 2.4G / BT / USB-C)".to_string(),
            firmware_version: fw,
            link_label: link_label.to_string(),
            online,
            battery_pct: prof.battery_pct,
            is_charging: prof.is_charging || self.link == ConnectionLink::Wired,
            voltage_mv,
            polling_rate: prof.polling_rate,
            max_polling_rate: max_rate,
            lod_mm: prof.lod_mm,
            debounce_ms: prof.debounce_ms,
            active_stage: prof.active_stage,
            stage_count: prof.stage_count,
            stage_enable_mask: prof.stage_enable_mask,
            dpi_stages: prof.dpi_stages.clone(),
            dpi_colors: prof.dpi_colors.clone(),
            angle_snap: prof.angle_snap,
            motion_sync: prof.motion_sync,
            ripple_control: prof.ripple_control,
            sleep_timeout_min: prof.sleep_timeout_min,
            move_light_off: prof.move_light_off,
            lighting_mode: prof.lighting_mode,
            lighting_brightness: prof.lighting_brightness,
            lighting_speed: prof.lighting_speed,
            button_mappings: prof.button_mappings.clone(),
            available_button_actions: available_button_actions(),
        }
    }
}

impl PeripheralDriver for FurylevelZ1Driver {
    fn driver_id(&self) -> &'static str {
        "furylevel-z1"
    }

    fn device_info(&self) -> HardwareDeviceInfo {
        self.info.clone()
    }

    fn read_state(&self) -> Result<DeviceHardwareState, String> {
        Ok(DeviceHardwareState {
            device_id: self.info.id.clone(),
            effect_id: 0,
            effect_name: "Furylevel Z1 Native Protocol".to_string(),
            brightness: 4,
            speed: 2,
            color_idx: 0,
            side_mode: 0,
            knob_mode: 0,
            os_mode: 0,
            win_lock: false,
            sleep_seconds: 60,
            per_key_colors: Vec::new(),
            supported_effects: Vec::new(),
            layout: Vec::new(),
            topology: Vec::new(),
            raw_config_valid: true,
        })
    }

    fn poll_live_state(&self) -> Result<Option<DeviceHardwareState>, String> {
        Ok(None)
    }

    fn poll_live_mouse_state(&self) -> Result<Option<MouseHardwareState>, String> {
        if !self.info.permission_ok {
            return Ok(None);
        }
        let Ok(mut prof) = self.io_lock.try_lock() else {
            return Ok(None);
        };
        if !self.drain_input_reports(&mut prof) {
            return Ok(None);
        }
        Self::save_profile(&prof);
        Ok(Some(self.build_mouse_dto(
            &prof,
            "1010 (v1.0.1.0)".to_string(),
            if self.info.product_id == FURY_DONGLE_4K_PID { 4000 } else { 1000 },
            self.info.online,
        )))
    }

    fn read_mouse_state(&self) -> Result<Option<MouseHardwareState>, String> {
        let mut prof = self
            .io_lock
            .lock()
            .map_err(|_| "Furylevel mutex poisoned".to_string())?;
        if !self.info.permission_ok {
            return Ok(Some(self.build_mouse_dto(
                &prof,
                "HID Permission Required".to_string(),
                1000,
                self.info.online,
            )));
        }
        let (fw, max_rate, online) =
            self.with_feature_dev(|dev| Ok(self.sync_from_hardware_locked(dev, &mut prof)))?;
        self.drain_input_reports(&mut prof);
        Self::save_profile(&prof);
        Ok(Some(self.build_mouse_dto(&prof, fw, max_rate, online)))
    }

    fn apply_mouse_settings(&self, cfg: MouseConfigUpdate) -> Result<Option<MouseHardwareState>, String> {
        if !self.info.permission_ok {
            return Err("Furylevel Z1 HID izni yok. Önce udev izni verin.".to_string());
        }
        let mut prof = self
            .io_lock
            .lock()
            .map_err(|_| "Furylevel mutex poisoned".to_string())?;
        self.with_feature_dev(|dev| {

        let mut send_dpi = false;
        if let Some(stages) = cfg.dpi_stages {
            let mut normalized: Vec<u16> = stages
                .into_iter()
                .take(MAX_DPI_STAGES)
                .map(|d| (((d.clamp(DPI_MIN, DPI_MAX) + DPI_STEP / 2) / DPI_STEP) * DPI_STEP).clamp(DPI_MIN, DPI_MAX))
                .collect();
            let defs = default_dpi_stages();
            while normalized.len() < MAX_DPI_STAGES {
                let idx = normalized.len();
                normalized.push(prof.dpi_stages.get(idx).copied().unwrap_or(defs[idx]));
            }
            prof.dpi_stages = normalized;
            send_dpi = true;
        }
        if let Some(count) = cfg.stage_count {
            prof.stage_count = count.clamp(1, MAX_DPI_STAGES as u8);
            prof.stage_enable_mask = ((1u16 << prof.stage_count) - 1) as u8;
            if prof.active_stage >= prof.stage_count {
                prof.active_stage = prof.stage_count.saturating_sub(1);
            }
            send_dpi = true;
        }
        if let Some(mask) = cfg.stage_enable_mask {
            let m = mask & 0x3f;
            if m != 0 {
                prof.stage_enable_mask = m;
                prof.stage_count = (m.count_ones() as u8).clamp(1, MAX_DPI_STAGES as u8);
                send_dpi = true;
            }
        }
        if let Some(active) = cfg.active_stage {
            prof.active_stage = active.min((MAX_DPI_STAGES - 1) as u8);
            send_dpi = true;
        }
        if send_dpi {
            let pkt = build_feature_dpi_packet(
                self.next_seq(),
                &prof.dpi_stages,
                prof.active_stage,
                Some(prof.stage_enable_mask),
            );
            self.send_feature_command(&dev, &pkt)?;
        }

        if let Some(colors) = cfg.dpi_colors {
            let defs = default_dpi_colors();
            let mut norm = colors.into_iter().take(8).collect::<Vec<_>>();
            while norm.len() < 8 {
                norm.push(defs[norm.len()]);
            }
            prof.dpi_colors = norm;
            let pkt = build_feature_dpi_colors_packet(self.next_seq(), &prof.dpi_colors);
            self.send_feature_command(&dev, &pkt)?;
        }

        if let Some(hz) = cfg.polling_rate {
            prof.polling_rate = match hz {
                125 | 250 | 500 | 1000 | 2000 | 4000 | 8000 => hz,
                _ => 1000,
            };
            let pkt = build_feature_polling_packet(self.next_seq(), prof.polling_rate);
            self.send_feature_command(&dev, &pkt)?;
        }

        if let Some(lod) = cfg.lod_mm {
            prof.lod_mm = if lod <= 1 { 1 } else { 2 };
            let pkt = build_feature_lod_packet(self.next_seq(), prof.lod_mm);
            self.send_feature_command(&dev, &pkt)?;
        }

        if let Some(db) = cfg.debounce_ms {
            prof.debounce_ms = db.min(30);
        }

        if cfg.lighting_mode.is_some()
            || cfg.lighting_brightness.is_some()
            || cfg.lighting_speed.is_some()
        {
            if let Some(m) = cfg.lighting_mode {
                prof.lighting_mode = m.min(9);
            }
            if let Some(b) = cfg.lighting_brightness {
                prof.lighting_brightness = b.clamp(1, 4);
            }
            if let Some(s) = cfg.lighting_speed {
                prof.lighting_speed = s.clamp(1, 4);
            }
            let pkt = build_feature_lighting_packet(
                self.next_seq(),
                prof.lighting_mode,
                prof.lighting_brightness,
                prof.lighting_speed,
            );
            self.send_feature_command(&dev, &pkt)?;
        }

        if cfg.sleep_timeout_min.is_some() || cfg.move_light_off.is_some() {
            if let Some(m) = cfg.sleep_timeout_min {
                prof.sleep_timeout_min = m.clamp(1, 30);
            }
            if let Some(mv) = cfg.move_light_off {
                prof.move_light_off = mv;
            }
            let pkt = build_feature_power_sleep_packet(
                self.next_seq(),
                prof.sleep_timeout_min,
                prof.move_light_off,
            );
            self.send_feature_command(&dev, &pkt)?;
        }

        if cfg.angle_snap.is_some()
            || cfg.motion_sync.is_some()
            || cfg.ripple_control.is_some()
        {
            if let Some(v) = cfg.angle_snap {
                prof.angle_snap = v;
            }
            if let Some(v) = cfg.motion_sync {
                prof.motion_sync = v;
            }
            if let Some(v) = cfg.ripple_control {
                prof.ripple_control = v;
            }
            let pkt = build_feature_sensor_advanced_packet(
                self.next_seq(),
                prof.angle_snap,
                prof.motion_sync,
                prof.ripple_control,
            );
            self.send_feature_command(&dev, &pkt)?;
        }

        if let Some(btns) = cfg.button_mappings {
            if btns.len() >= 6 {
                prof.button_mappings = btns.into_iter().take(6).collect();
                let pkt = build_feature_key_mapping_packet(self.next_seq(), &prof.button_mappings);
                self.send_feature_command(dev, &pkt)?;
            }
        }

        Ok(())
        })?;

        Self::save_profile(&prof);
        Ok(Some(self.build_mouse_dto(
            &prof,
            "1010 (v1.0.1.0)".to_string(),
            if self.info.product_id == FURY_DONGLE_4K_PID { 4000 } else { 1000 },
            true,
        )))
    }

    fn factory_reset_mouse(&self) -> Result<Option<MouseHardwareState>, String> {
        if !self.info.permission_ok {
            return Err("Furylevel Z1 HID izni yok. Önce udev izni verin.".to_string());
        }
        let mut prof = self
            .io_lock
            .lock()
            .map_err(|_| "Furylevel mutex poisoned".to_string())?;
        let pkt = build_feature_packet(cmd::FACTORY_RESET, self.next_seq(), 0x01, &[0xff]);
        self.with_feature_dev(|dev| self.send_feature_command(dev, &pkt))?;
        *prof = PersistedZ1Profile::default();
        if self.link == ConnectionLink::Wired {
            prof.is_charging = true;
        }
        Self::save_profile(&prof);
        Ok(Some(self.build_mouse_dto(
            &prof,
            "1010 (v1.0.1.0)".to_string(),
            1000,
            true,
        )))
    }

    fn get_led_topology(&self) -> Vec<LedTopologyNode> {
        Vec::new()
    }

    fn apply_rgb_effect(&self, _: u8, _: u8, _: u8, _: u8) -> Result<DeviceHardwareState, String> {
        Err("Use mouse settings panel for Furylevel Z1 DPI LED indicator".to_string())
    }

    fn apply_per_key_rgb(&self, _: Vec<[u8; 3]>, _: u8) -> Result<DeviceHardwareState, String> {
        Err("Mouse has no per-key RGB matrix".to_string())
    }

    fn set_realtime_rgb(&self, _: Vec<[u8; 3]>) -> Result<(), String> {
        Err("Mouse does not support host key-matrix RGB streaming".to_string())
    }

    fn apply_hardware_flags(
        &self,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<bool>,
        _: Option<u16>,
    ) -> Result<DeviceHardwareState, String> {
        Err("Use mouse settings panel for Furylevel Z1".to_string())
    }

    fn read_keymap(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Ok(Vec::new())
    }

    fn write_keymap_entry(&self, _: u8, _: u8, _: [u8; 4]) -> Result<Vec<KeymapEntryDto>, String> {
        Err("Use Furylevel Z1 6-button mapping panel".to_string())
    }

    fn restore_default_layer(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Err("Use Furylevel Z1 factory reset".to_string())
    }

    fn write_macros(&self, _: &[crate::sxboards_presets::SxBoardMacro]) -> Result<(), String> {
        Err("Use Furylevel Z1 button mapping panel".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dpi_step_encoding_matches_paw3395_table() {
        assert_eq!(encode_dpi_step(50), 0x0000);
        assert_eq!(encode_dpi_step(400), 0x0007);
        assert_eq!(encode_dpi_step(800), 0x000f);
        assert_eq!(encode_dpi_step(1600), 0x001f);
        assert_eq!(encode_dpi_step(3200), 0x003f);
        assert_eq!(decode_dpi_step(0x000f), 800);
        assert_eq!(decode_dpi_step(0x0207), 26_000);
    }

    #[test]
    fn feature_packet_checksum_matches_gamingms_spec() {
        let pkt = build_feature_dpi_packet(3, &[400, 800, 1600, 3200, 6400, 12000], 1, Some(0x0f));
        assert_eq!(pkt[0], REPORT_FEATURE_CMD);
        assert_eq!(pkt[1], cmd::SET_DPI);
        assert_eq!(pkt[2], 3);
        assert_eq!(pkt[3], 0x01);
        assert_eq!(pkt[5], 1); // active stage
        assert_eq!(pkt[6], 0x0f); // 4-stage mask
        assert_eq!(u16::from_le_bytes([pkt[7], pkt[8]]), 0x0007); // 400 DPI
        assert_eq!(u16::from_le_bytes([pkt[9], pkt[10]]), 0x000f); // 800 DPI
        assert_eq!(pkt[4], calculate_feature_checksum(&pkt));
    }

    #[test]
    fn button_mapping_respects_hw_slot_order_back_before_forward() {
        let btns = vec![
            "left_click".into(),
            "right_click".into(),
            "middle_click".into(),
            "forward".into(),
            "back".into(),
            "dpi_loop".into(),
        ];
        let pkt = build_feature_key_mapping_packet(1, &btns);
        assert_eq!(pkt[1], cmd::KEY_MAPPING);
        // slot 3 = back (0x10 0x08 0x00), slot 4 = forward (0x10 0x10 0x00)
        assert_eq!(&pkt[5 + 9..5 + 12], &[0x10, 0x08, 0x00]);
        assert_eq!(&pkt[5 + 12..5 + 15], &[0x10, 0x10, 0x00]);
    }

    #[test]
    fn input_04_and_bd_parsers_decode_telemetry() {
        let r5 = [0x05, b'1', b'0', b'1', b'0', 1, 1, 85];
        let st = parse_feature_status_05(&r5).unwrap();
        assert!(st.online && st.has_magic_1010 && st.battery_pct == 85);

        let inp = [0x04, 0, 2, 0x02, 72, 1, 1];
        let parsed = parse_input_status_report(&inp).unwrap();
        assert_eq!(parsed.active_stage, 2);
        assert_eq!(parsed.polling_rate, 500);
        assert_eq!(parsed.battery_pct, 72);
        assert!(parsed.is_charging);
        assert_eq!(parsed.lod_mm, 1);

        let mut bd = [0u8; 32];
        bd[0] = REPORT_STATE_READ;
        bd[2] = 1;
        bd[3] = 0x0f;
        bd[4] = 0x01; // 1000Hz
        bd[5] = 1; // 1mm
        bd[6] = 6; // 6ms debounce
        bd[7..9].copy_from_slice(&7u16.to_le_bytes()); // 400
        bd[9..11].copy_from_slice(&15u16.to_le_bytes()); // 800
        let state = parse_state_report_bd(&bd).unwrap();
        assert_eq!(state.polling_rate, 1000);
        assert_eq!(state.dpi_stages[0], 400);
        assert_eq!(state.dpi_stages[1], 800);
        assert_eq!(state.debounce_ms, 6);
    }

    #[test]
    fn empty_zero_bd_report_returns_none_instead_of_corrupting_dpi_to_50() {
        // Real 04f3:026e USB-C / 2.4G firmware answers GET_FEATURE(0xBD) with [0xBD, 0x01, 0x00...]
        let mut empty_bd = [0u8; PACKET_STATE_LEN];
        empty_bd[0] = REPORT_STATE_READ;
        empty_bd[1] = 0x01;
        assert!(parse_state_report_bd(&empty_bd).is_none());
    }
}
