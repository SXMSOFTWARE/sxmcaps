use super::aula::f75::{BT_PID, DONGLE_PID, WIRED_PID, WIRED_VID, WIRELESS_VID};
use super::furylevel::z1::is_furylevel_z1_device;
use super::{
    ConnectionLink, DeviceCapabilities, DeviceHardwareState, DeviceKind, HardwareDeviceInfo,
    KeymapEntryDto, LedTopologyNode, LightingCapability, PeripheralDriver,
};
use hidapi::{DeviceInfo, HidApi};
use std::collections::BTreeMap;
use std::ffi::CString;

/// Classify a physical HID peripheral across all of its interfaces so dual-interface gaming mice
/// (mouse + macro keyboard node) and headsets with media buttons are never mislabeled as keyboards.
fn classify_peripheral<'a>(
    vid: u16,
    pid: u16,
    ifaces: &[&'a DeviceInfo],
) -> Option<(DeviceKind, &'static str, &'a DeviceInfo)> {
    let primary_name = ifaces
        .iter()
        .find_map(|d| d.product_string().map(str::trim).filter(|s| !s.is_empty()))
        .unwrap_or("USB HID Peripheral")
        .to_lowercase();
    let manufacturer = ifaces
        .iter()
        .find_map(|d| d.manufacturer_string().map(str::trim).filter(|s| !s.is_empty()))
        .unwrap_or("")
        .to_lowercase();
    let joined = format!("{manufacturer} {primary_name}");

    // Known specific gaming mice / headsets + keyword heuristics across all interfaces
    let is_known_headset = (vid == 0x040b && pid == 0x0897)
        || joined.contains("fuxi")
        || joined.contains("xiisound")
        || joined.contains("headset")
        || joined.contains("headphone")
        || joined.contains("earphone")
        || joined.contains("kraken")
        || joined.contains("blackshark")
        || joined.contains("barracuda")
        || joined.contains("arctis")
        || joined.contains("hyperx cloud")
        || joined.contains("mic ")
        || joined.contains("audio");

    if is_known_headset {
        let rep = ifaces
            .iter()
            .copied()
            .find(|d| d.usage_page() >= 0xf000 || d.usage_page() == 0x0c)
            .unwrap_or(ifaces[0]);
        return Some((DeviceKind::Headset, "generic-headset", rep));
    }

    let has_mouse_iface = ifaces
        .iter()
        .copied()
        .find(|d| d.usage_page() == 0x01 && d.usage() == 0x02);
    let is_known_mouse = (vid == 0x04f3 && pid == 0x026e)
        || has_mouse_iface.is_some()
        || joined.contains("mouse")
        || joined.contains("furylevel")
        || joined.contains("superlight")
        || joined.contains("g502")
        || joined.contains("g305")
        || joined.contains("deathadder")
        || joined.contains("viper")
        || joined.contains("rival")
        || joined.contains("lamzu")
        || joined.contains("pulsar");

    if is_known_mouse {
        let rep = has_mouse_iface.unwrap_or(ifaces[0]);
        return Some((DeviceKind::Mouse, "generic-mouse", rep));
    }

    if let Some(kbd) = ifaces
        .iter()
        .copied()
        .find(|d| (d.usage_page() == 0x01 && d.usage() == 0x06) || joined.contains("keyboard"))
    {
        return Some((DeviceKind::Keyboard, "generic-keyboard", kbd));
    }

    if let Some(vendor) = ifaces
        .iter()
        .copied()
        .find(|d| matches!(d.usage_page(), 0x0c | 0xf100 | 0xff00..=0xffff))
    {
        return Some((DeviceKind::Peripheral, "generic-hid", vendor));
    }

    None
}

/// Discovers non-AULA HID mice, headsets, keyboards, and peripherals truthfully without faking drivers.
pub fn discover_generic_devices(api: &HidApi) -> Vec<HardwareDeviceInfo> {
    let mut grouped: BTreeMap<(u16, u16), Vec<&DeviceInfo>> = BTreeMap::new();

    for d in api.device_list() {
        let vid = d.vendor_id();
        let pid = d.product_id();
        // Skip AULA F75 & Furylevel Z1 devices handled by dedicated native drivers
        if (vid == WIRED_VID && pid == WIRED_PID)
            || (vid == WIRELESS_VID && (pid == DONGLE_PID || pid == BT_PID))
            || is_furylevel_z1_device(vid, pid)
        {
            continue;
        }
        grouped.entry((vid, pid)).or_default().push(d);
    }

    let mut out = Vec::new();
    for ((vid, pid), ifaces) in grouped {
        let Some((kind, driver_id, rep)) = classify_peripheral(vid, pid, &ifaces) else {
            continue;
        };

        let product = ifaces
            .iter()
            .find_map(|d| d.product_string().map(str::trim).filter(|s| !s.is_empty()))
            .unwrap_or("USB HID Peripheral")
            .to_string();
        let manufacturer = ifaces
            .iter()
            .find_map(|d| d.manufacturer_string().map(str::trim).filter(|s| !s.is_empty()))
            .unwrap_or("Generic HID")
            .to_string();

        let path = rep.path().to_string_lossy().into_owned();
        let permission_ok = CString::new(path.as_str())
            .ok()
            .and_then(|c| api.open_path(&c).ok())
            .is_some();

        let notes = match kind {
            DeviceKind::Mouse => format!(
                "{product} ({vid:04x}:{pid:04x}) mouse olarak algılandı. Üretici HID DPI/RGB protokolü henüz tanımlı değil; SxmCaps fare tıklama sesleri ve global buton izleme aktif."
            ),
            DeviceKind::Headset | DeviceKind::Audio => format!(
                "{product} ({vid:04x}:{pid:04x}) kulaklık/ses cihazı olarak algılandı. Donanım iletişim/EQ protokolü sunmuyor; ses yönlendirmesi kullanılabilir."
            ),
            DeviceKind::Keyboard => format!(
                "{product} ({vid:04x}:{pid:04x}) klavye olarak algılandı. Özel sürücü protokolü henüz tanımlı değil; SxmCaps ses ve SxPerformance global giriş aktif."
            ),
            DeviceKind::Peripheral => format!(
                "{product} ({vid:04x}:{pid:04x}) salt-okunur HID cihazı. Yapılandırma iletişim katmanı desteklenmiyor."
            ),
        };

        out.push(HardwareDeviceInfo {
            id: format!("{driver_id}:{vid:04x}:{pid:04x}"),
            driver_id: driver_id.to_string(),
            brand: manufacturer,
            model: product.clone(),
            display_name: product,
            device_kind: kind,
            vendor_id: vid,
            product_id: pid,
            vid_pid: format!("{vid:04x}:{pid:04x}"),
            link: ConnectionLink::UsbHid,
            hid_path: Some(path),
            interface_number: rep.interface_number(),
            usage_page: rep.usage_page(),
            online: true,
            permission_ok,
            capabilities: DeviceCapabilities {
                sound_engine: true,
                communication_supported: false,
                writable: false,
                lighting_mode: LightingCapability::None,
                led_count: 0,
                ..Default::default()
            },
            notes,
        });
    }

    out
}

pub struct GenericDriver {
    info: HardwareDeviceInfo,
}

impl GenericDriver {
    pub fn new(info: HardwareDeviceInfo) -> Self {
        Self { info }
    }
}

impl PeripheralDriver for GenericDriver {
    fn driver_id(&self) -> &'static str {
        "generic-hid"
    }

    fn device_info(&self) -> HardwareDeviceInfo {
        self.info.clone()
    }

    fn read_state(&self) -> Result<DeviceHardwareState, String> {
        Ok(DeviceHardwareState {
            device_id: self.info.id.clone(),
            effect_id: 0,
            effect_name: "No Vendor Protocol".to_string(),
            brightness: 0,
            speed: 0,
            color_idx: 0,
            side_mode: 0,
            knob_mode: 0,
            os_mode: 0,
            win_lock: false,
            sleep_seconds: 0,
            per_key_colors: Vec::new(),
            supported_effects: Vec::new(),
            layout: Vec::new(),
            topology: Vec::new(),
            raw_config_valid: false,
        })
    }

    fn poll_live_state(&self) -> Result<Option<DeviceHardwareState>, String> {
        Ok(None)
    }

    fn get_led_topology(&self) -> Vec<LedTopologyNode> {
        Vec::new()
    }

    fn apply_rgb_effect(&self, _: u8, _: u8, _: u8, _: u8) -> Result<DeviceHardwareState, String> {
        Err(format!(
            "{} iletişim/RGB sürücü protokolünü desteklemiyor.",
            self.info.display_name
        ))
    }

    fn apply_per_key_rgb(&self, _: Vec<[u8; 3]>, _: u8) -> Result<DeviceHardwareState, String> {
        Err(format!(
            "{} tuş bazlı RGB protokolünü desteklemiyor.",
            self.info.display_name
        ))
    }

    fn set_realtime_rgb(&self, _: Vec<[u8; 3]>) -> Result<(), String> {
        Err(format!(
            "{} canlı RGB akışını desteklemiyor.",
            self.info.display_name
        ))
    }

    fn apply_hardware_flags(
        &self,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<bool>,
        _: Option<u16>,
    ) -> Result<DeviceHardwareState, String> {
        Err(format!(
            "{} donanım bayraklarını desteklemiyor.",
            self.info.display_name
        ))
    }

    fn read_keymap(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Ok(Vec::new())
    }

    fn write_keymap_entry(&self, _: u8, _: u8, _: [u8; 4]) -> Result<Vec<KeymapEntryDto>, String> {
        Err(format!(
            "{} tuş yeniden atama protokolünü desteklemiyor.",
            self.info.display_name
        ))
    }

    fn restore_default_layer(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Err(format!(
            "{} katman sıfırlamayı desteklemiyor.",
            self.info.display_name
        ))
    }

    fn write_macros(&self, _: &[crate::sxboards_presets::SxBoardMacro]) -> Result<(), String> {
        Err(format!(
            "{} donanım makrosu yazmayı desteklemiyor.",
            self.info.display_name
        ))
    }
}
