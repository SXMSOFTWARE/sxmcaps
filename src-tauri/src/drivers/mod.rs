pub mod aula;
pub mod generic;

use aula::f75::{remap_targets, AulaF75Driver};
use generic::{discover_generic_devices, GenericDriver};
use hidapi::HidApi;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceKind {
    Keyboard,
    Mouse,
    Audio,
    Peripheral,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ConnectionLink {
    Wired,
    #[serde(rename = "wireless_24g")]
    Wireless24G,
    Bluetooth,
    UsbHid,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceCapabilities {
    pub rgb_effects: bool,
    pub per_key_rgb: bool,
    pub side_light: bool,
    pub knob_mode: bool,
    pub os_mode: bool,
    pub win_lock: bool,
    pub sleep_timer: bool,
    pub key_remapping: bool,
    pub fn_layers: bool,
    pub macros: bool,
    pub battery_status: bool,
    pub sound_engine: bool,
    pub writable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HardwareDeviceInfo {
    pub id: String,
    pub driver_id: String,
    pub brand: String,
    pub model: String,
    pub display_name: String,
    pub device_kind: DeviceKind,
    pub vendor_id: u16,
    pub product_id: u16,
    pub vid_pid: String,
    pub link: ConnectionLink,
    pub hid_path: Option<String>,
    pub interface_number: i32,
    pub usage_page: u16,
    pub online: bool,
    pub permission_ok: bool,
    pub capabilities: DeviceCapabilities,
    pub notes: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EffectMetaDto {
    pub id: u8,
    pub name_en: String,
    pub name_tr: String,
    pub has_speed: bool,
    pub has_brightness: bool,
    pub has_color: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyLayoutItemDto {
    pub matrix_index: usize,
    pub label: String,
    pub web_code: String,
    pub row: u8,
    pub x: f32,
    pub width: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeymapEntryDto {
    pub matrix_index: usize,
    pub key_label: String,
    pub web_code: String,
    pub code: [u8; 4],
    pub assigned_label: String,
    pub is_modified: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemapTargetDto {
    pub label: String,
    pub code: [u8; 4],
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceHardwareState {
    pub device_id: String,
    pub effect_id: u8,
    pub effect_name: String,
    pub brightness: u8,
    pub speed: u8,
    pub color_idx: u8,
    pub side_mode: u8,
    pub knob_mode: u8,
    pub os_mode: u8,
    pub win_lock: bool,
    pub sleep_seconds: u16,
    pub per_key_colors: Vec<[u8; 3]>,
    pub supported_effects: Vec<EffectMetaDto>,
    pub layout: Vec<KeyLayoutItemDto>,
    pub raw_config_valid: bool,
}

pub trait PeripheralDriver: Send + Sync {
    fn driver_id(&self) -> &'static str;
    fn device_info(&self) -> HardwareDeviceInfo;
    fn read_state(&self) -> Result<DeviceHardwareState, String>;
    fn apply_rgb_effect(
        &self,
        effect_id: u8,
        brightness: u8,
        speed: u8,
        color_idx: u8,
    ) -> Result<DeviceHardwareState, String>;
    fn apply_per_key_rgb(
        &self,
        colors: Vec<[u8; 3]>,
        brightness: u8,
    ) -> Result<DeviceHardwareState, String>;
    fn set_realtime_rgb(&self, colors: Vec<[u8; 3]>) -> Result<(), String>;
    fn apply_hardware_flags(
        &self,
        side_mode: Option<u8>,
        knob_mode: Option<u8>,
        os_mode: Option<u8>,
        win_lock: Option<bool>,
        sleep_seconds: Option<u16>,
    ) -> Result<DeviceHardwareState, String>;
    fn read_keymap(&self, layer: u8) -> Result<Vec<KeymapEntryDto>, String>;
    fn write_keymap_entry(
        &self,
        layer: u8,
        matrix_index: u8,
        code: [u8; 4],
    ) -> Result<Vec<KeymapEntryDto>, String>;
    fn restore_default_layer(&self, layer: u8) -> Result<Vec<KeymapEntryDto>, String>;
    fn write_macros(&self, macros: &[crate::sxboards_presets::SxBoardMacro]) -> Result<(), String>;
}

pub fn discover_all_devices() -> Vec<HardwareDeviceInfo> {
    let Ok(api) = HidApi::new() else {
        return Vec::new();
    };
    let mut list = AulaF75Driver::discover_with_api(&api);
    list.extend(discover_generic_devices(&api));
    list
}

pub fn open_driver_for_device(device_id: &str) -> Result<Box<dyn PeripheralDriver>, String> {
    let devices = discover_all_devices();
    let info = if device_id.is_empty() {
        devices
            .iter()
            .find(|d| d.driver_id == "aula-f75" && d.online && d.capabilities.writable)
            .or_else(|| devices.iter().find(|d| d.driver_id == "aula-f75"))
            .or_else(|| devices.first())
            .cloned()
            .ok_or_else(|| "No supported HID peripheral detected".to_string())?
    } else {
        devices
            .into_iter()
            .find(|d| d.id == device_id)
            .ok_or_else(|| format!("Hardware device not connected: {device_id}"))?
    };

    match info.driver_id.as_str() {
        "aula-f75" => Ok(Box::new(AulaF75Driver::open_from_info(info)?)),
        _ => Ok(Box::new(GenericDriver::new(info))),
    }
}

pub fn list_f75_remap_targets() -> Vec<RemapTargetDto> {
    remap_targets()
}

pub fn install_sxboards_udev_rules() -> Result<(), String> {
    #[cfg(target_os = "linux")]
    {
        let input_rule = r#"KERNEL=="event*", SUBSYSTEM=="input", TAG+="uaccess""#;
        let hid_rule = [
            "# SxBoards Universal HID Access Rules",
            r#"SUBSYSTEM=="hidraw", ATTRS{idVendor}=="258a", MODE="0666", TAG+="uaccess""#,
            r#"SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="fa09", MODE="0666", TAG+="uaccess""#,
            r#"SUBSYSTEM=="hidraw", ATTRS{idVendor}=="3554", ATTRS{idProduct}=="fa08", MODE="0666", TAG+="uaccess""#,
            r#"SUBSYSTEM=="hidraw", ATTRS{idVendor}=="04f3", ATTRS{idProduct}=="026e", MODE="0666", TAG+="uaccess""#,
        ]
        .join("\n");

        let cmd = format!(
            "printf '%s\\n' '{}' > /etc/udev/rules.d/65-sxmcaps-input.rules && printf '%s\\n' '{}' > /etc/udev/rules.d/70-sxboards-hid.rules && udevadm control --reload-rules && udevadm trigger",
            input_rule,
            hid_rule.replace('\'', "'\\''")
        );

        let status = std::process::Command::new("pkexec")
            .args(["sh", "-c", &cmd])
            .status()
            .map_err(|e| format!("pkexec launch failed: {e}"))?;

        if !status.success() {
            return Err("udev permission setup cancelled or failed.".to_string());
        }
        Ok(())
    }
    #[cfg(not(target_os = "linux"))]
    {
        Ok(())
    }
}
