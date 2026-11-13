use super::aula::f75::{BT_PID, DONGLE_PID, WIRED_PID, WIRED_VID, WIRELESS_VID};
use super::{
    ConnectionLink, DeviceCapabilities, DeviceHardwareState, DeviceKind, HardwareDeviceInfo,
    KeymapEntryDto, PeripheralDriver,
};
use hidapi::HidApi;
use std::collections::HashSet;
use std::ffi::CString;

/// Discovers non-driver-specific USB HID keyboards, mice, and audio/RGB peripherals
/// so SxBoards displays every connected peripheral accurately without faking unsupported controls.
pub fn discover_generic_devices(api: &HidApi) -> Vec<HardwareDeviceInfo> {
    let mut seen: HashSet<(u16, u16)> = HashSet::new();
    let mut out = Vec::new();

    for d in api.device_list() {
        let vid = d.vendor_id();
        let pid = d.product_id();

        // Skip AULA F75 devices handled by dedicated AulaF75Driver
        if (vid == WIRED_VID && pid == WIRED_PID)
            || (vid == WIRELESS_VID && (pid == DONGLE_PID || pid == BT_PID))
        {
            continue;
        }
        if !seen.insert((vid, pid)) {
            continue;
        }

        let product = d
            .product_string()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("USB HID Peripheral")
            .to_string();
        let manufacturer = d
            .manufacturer_string()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("Generic HID")
            .to_string();
        let lower = product.to_lowercase();

        let (kind, driver_id) = if d.usage_page() == 0x01 && d.usage() == 0x02
            || lower.contains("mouse")
            || lower.contains("furylevel")
            || lower.contains("g502")
            || lower.contains("deathadder")
        {
            (DeviceKind::Mouse, "generic-mouse")
        } else if (d.usage_page() == 0x01 && d.usage() == 0x06) || lower.contains("keyboard") {
            (DeviceKind::Keyboard, "generic-keyboard")
        } else if lower.contains("headset")
            || lower.contains("fuxi")
            || lower.contains("audio")
            || lower.contains("mic")
        {
            (DeviceKind::Audio, "generic-hid")
        } else {
            // Heuristic: filter hub/misc by checking usage pages typical for mouse/kbd/vendor
            match (d.usage_page(), d.usage()) {
                (0x01, 0x02) => (DeviceKind::Mouse, "generic-mouse"),
                (0x01, 0x06) => (DeviceKind::Keyboard, "generic-keyboard"),
                (0x0c, _) | (0xf100, _) | (0xff00..=0xffff, _) => {
                    if lower.contains("mouse") || lower.contains("z1") {
                        (DeviceKind::Mouse, "generic-mouse")
                    } else {
                        (DeviceKind::Peripheral, "generic-hid")
                    }
                }
                _ => continue,
            }
        };

        let path = d.path().to_string_lossy().into_owned();
        let permission_ok = CString::new(path.as_str())
            .ok()
            .and_then(|c| api.open_path(&c).ok())
            .is_some();

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
            interface_number: d.interface_number(),
            usage_page: d.usage_page(),
            online: true,
            permission_ok,
            capabilities: DeviceCapabilities {
                rgb_effects: false,
                per_key_rgb: false,
                side_light: false,
                knob_mode: false,
                os_mode: false,
                win_lock: false,
                sleep_timer: false,
                key_remapping: false,
                fn_layers: false,
                macros: false,
                battery_status: false,
                sound_engine: true,
                writable: false,
            },
            notes: "Generic HID discovery: SxMCaps sound & global telemetry active; vendor protocol module not loaded.".to_string(),
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
            effect_name: "Generic HID".to_string(),
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
            raw_config_valid: false,
        })
    }

    fn apply_rgb_effect(&self, _: u8, _: u8, _: u8, _: u8) -> Result<DeviceHardwareState, String> {
        Err(format!("{} does not have a writable RGB driver yet.", self.info.display_name))
    }

    fn apply_per_key_rgb(&self, _: Vec<[u8; 3]>, _: u8) -> Result<DeviceHardwareState, String> {
        Err(format!("{} does not support per-key RGB writes.", self.info.display_name))
    }

    fn set_realtime_rgb(&self, _: Vec<[u8; 3]>) -> Result<(), String> {
        Err("Realtime RGB streaming unsupported on generic driver.".to_string())
    }

    fn apply_hardware_flags(
        &self,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<u8>,
        _: Option<bool>,
        _: Option<u16>,
    ) -> Result<DeviceHardwareState, String> {
        Err("Hardware flags unsupported on generic driver.".to_string())
    }

    fn read_keymap(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Ok(Vec::new())
    }

    fn write_keymap_entry(&self, _: u8, _: u8, _: [u8; 4]) -> Result<Vec<KeymapEntryDto>, String> {
        Err("Key remapping unsupported on generic driver.".to_string())
    }

    fn restore_default_layer(&self, _: u8) -> Result<Vec<KeymapEntryDto>, String> {
        Err("Layer restore unsupported on generic driver.".to_string())
    }

    fn write_macros(&self, _: &[crate::sxboards_presets::SxBoardMacro]) -> Result<(), String> {
        Err("Onboard macro flashing unsupported on generic driver.".to_string())
    }
}
