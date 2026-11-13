export interface AppProfileRule {
  id: string;
  name: string;
  pattern: string;
  pack_id: string;
  mute: boolean;
  enabled: boolean;
}

export interface AppSettings {
  active_keyboard_pack: string;
  active_mouse_pack: string;
  enabled: boolean;
  keyboard_volume: number;
  mouse_enabled: boolean;
  mouse_volume: number;
  key_up_enabled: boolean;
  key_up_volume: number;
  pitch_variation: number;
  stereo_pan: boolean;
  minimize_to_tray: boolean;
  audio_device: string | null;
  // v0.2 DSP
  plate_preset: 'neutral' | 'aluminum' | 'polycarbonate' | 'brass' | string;
  tape_mod: boolean;
  poron_foam: boolean;
  eq_low_db: number;
  eq_mid_db: number;
  eq_high_db: number;
  room_ambience: number;
  // v0.2 Profiles & Autostart
  profiles_enabled: boolean;
  app_profiles: AppProfileRule[];
  autostart: boolean;
  // v0.2.1 Localization ("auto" | "tr" | "en")
  language: string;
}

export interface SoundpackInfo {
  id: string;
  name: string;
  description: string;
  tag: string;
  accent: string;
  device_type: 'keyboard' | 'mouse' | string;
  author: string;
  is_builtin: boolean;
  path: string;
  key_count: number;
  format: string;
}

export interface InputStatus {
  has_permission: boolean;
  active_devices: string[];
  denied_devices: number;
  session_type: string;
  desktop: string;
}

export interface StatsData {
  total_keystrokes: number;
  total_mouse_clicks: number;
  peak_wpm: number;
  heatmap: Record<string, number>;
  daily: Record<string, number>;
}

export interface ActiveWindowInfo {
  app_class: string;
  title: string;
}

export interface AudioInspectResult {
  path: string;
  file_name: string;
  duration_ms: number;
  sample_rate: number;
  waveform: number[];
}

export interface StudioKeyMapping {
  web_code: string;
  down_path: string;
  down_start_ms: number;
  down_duration_ms: number;
  up_path: string | null;
  up_start_ms: number;
  up_duration_ms: number;
}

export interface StudioPackSpec {
  name: string;
  tag: string;
  author: string;
  description: string;
  mappings: StudioKeyMapping[];
}

export interface HubPackEntry {
  id: string;
  name: string;
  tag: string;
  description: string;
  author: string;
  device_type: string;
  size_kb: number;
  download_url: string;
}

export interface UpdateCheckResult {
  current_version: string;
  latest_version: string;
  has_update: boolean;
  release_url: string;
  notes: string;
}

export type DeviceKind = 'keyboard' | 'mouse' | 'audio' | 'peripheral';
export type ConnectionLink = 'wired' | 'wireless_24g' | 'bluetooth' | 'usb_hid';

export interface DeviceCapabilities {
  rgb_effects: boolean;
  per_key_rgb: boolean;
  side_light: boolean;
  knob_mode: boolean;
  os_mode: boolean;
  win_lock: boolean;
  sleep_timer: boolean;
  key_remapping: boolean;
  fn_layers: boolean;
  macros: boolean;
  battery_status: boolean;
  sound_engine: boolean;
  writable: boolean;
}

export interface HardwareDeviceInfo {
  id: string;
  driver_id: string;
  brand: string;
  model: string;
  display_name: string;
  device_kind: DeviceKind;
  vendor_id: number;
  product_id: number;
  vid_pid: string;
  link: ConnectionLink;
  hid_path: string | null;
  interface_number: number;
  usage_page: number;
  online: boolean;
  permission_ok: boolean;
  capabilities: DeviceCapabilities;
  notes: string;
}

export interface EffectMetaDto {
  id: number;
  name_en: string;
  name_tr: string;
  has_speed: boolean;
  has_brightness: boolean;
  has_color: boolean;
}

export interface KeyLayoutItemDto {
  matrix_index: number;
  label: string;
  web_code: string;
  row: number;
  x: number;
  width: number;
}

export interface KeymapEntryDto {
  matrix_index: number;
  key_label: string;
  web_code: string;
  code: [number, number, number, number];
  assigned_label: string;
  is_modified: boolean;
}

export interface RemapTargetDto {
  label: string;
  code: [number, number, number, number];
  category: string;
}

export interface DeviceHardwareState {
  device_id: string;
  effect_id: number;
  effect_name: string;
  brightness: number;
  speed: number;
  color_idx: number;
  side_mode: number;
  knob_mode: number;
  os_mode: number;
  win_lock: boolean;
  sleep_seconds: number;
  per_key_colors: [number, number, number][];
  supported_effects: EffectMetaDto[];
  layout: KeyLayoutItemDto[];
  raw_config_valid: boolean;
}

export interface MacroEventStep {
  web_code: string;
  key_label: string;
  is_down: boolean;
  delay_ms: number;
}

export interface SxBoardMacro {
  id: string;
  name: string;
  category: string;
  steps: MacroEventStep[];
}

export interface SxBoardPreset {
  id: string;
  name: string;
  device_id: string;
  effect_id: number;
  brightness: number;
  speed: number;
  color_idx: number;
  side_mode: number;
  knob_mode: number;
  os_mode: number;
  win_lock: boolean;
  sleep_seconds: number;
  per_key_colors: [number, number, number][];
  keyboard_pack: string;
  mouse_pack: string;
  plate_preset: string;
}

export interface SxBoardWorkspaceStore {
  active_preset_id: string;
  presets: SxBoardPreset[];
  macros: SxBoardMacro[];
}

export interface InitialStateDto {
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  input_status: InputStatus;
  audio_devices: string[];
  stats: StatsData;
  soundpacks_dir: string;
  app_version: string;
  devices: HardwareDeviceInfo[];
  remap_targets: RemapTargetDto[];
  workspace: SxBoardWorkspaceStore;
}

export interface UiInputEvent {
  web_code: string;
  is_down: boolean;
  is_mouse: boolean;
  total_keystrokes: number;
}
