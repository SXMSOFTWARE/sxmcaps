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
  plate_preset: 'neutral' | 'aluminum' | 'polycarbonate' | 'brass' | string;
  tape_mod: boolean;
  poron_foam: boolean;
  eq_low_db: number;
  eq_mid_db: number;
  eq_high_db: number;
  room_ambience: number;
  profiles_enabled: boolean;
  app_profiles: AppProfileRule[];
  autostart: boolean;
  language: string;
  sound_only_mode: boolean;
  hibernate_on_tray: boolean;
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

export type DeviceKind = 'keyboard' | 'mouse' | 'headset' | 'audio' | 'peripheral';
export type LightingCapability = 'none' | 'single_color' | 'zone_rgb' | 'per_key_host' | 'firmware_preset_only';
export type ConnectionLink = 'wired' | 'wireless_24g' | 'bluetooth' | 'usb_hid';

export interface DeviceCapabilities {
  rgb_effects: boolean;
  per_key_rgb: boolean;
  host_streaming: boolean;
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
  communication_supported: boolean;
  writable: boolean;
  lighting_mode: LightingCapability;
  led_count: number;
}

export interface LedTopologyNode {
  index: number;
  matrix_index: number;
  label: string;
  web_code: string;
  x: number;
  y: number;
  zone: string;
  is_modifier: boolean;
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

export interface MouseButtonActionOption {
  id: string;
  label_en: string;
  label_tr: string;
}

export interface MouseHardwareState {
  device_id: string;
  model_name: string;
  sensor_model: string;
  mcu_model: string;
  firmware_version: string;
  link_label: string;
  online: boolean;
  battery_pct: number;
  is_charging: boolean;
  voltage_mv: number;
  polling_rate: number;
  max_polling_rate: number;
  lod_mm: number;
  debounce_ms: number;
  active_stage: number;
  stage_count: number;
  stage_enable_mask: number;
  dpi_stages: number[];
  dpi_colors: [number, number, number][];
  angle_snap: boolean;
  motion_sync: boolean;
  ripple_control: boolean;
  sleep_timeout_min: number;
  move_light_off: boolean;
  lighting_mode: number;
  lighting_brightness: number;
  lighting_speed: number;
  button_mappings: string[];
  available_button_actions: MouseButtonActionOption[];
}

export interface MouseConfigUpdate {
  polling_rate?: number;
  lod_mm?: number;
  debounce_ms?: number;
  active_stage?: number;
  stage_count?: number;
  stage_enable_mask?: number;
  dpi_stages?: number[];
  dpi_colors?: [number, number, number][];
  angle_snap?: boolean;
  motion_sync?: boolean;
  ripple_control?: boolean;
  sleep_timeout_min?: number;
  move_light_off?: boolean;
  lighting_mode?: number;
  lighting_brightness?: number;
  lighting_speed?: number;
  button_mappings?: string[];
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
  topology: LedTopologyNode[];
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

// --- SxLighting DTOs ---
export type AnimationKind =
  | 'solid_color'
  | 'multi_color_gradient'
  | 'wasd_highlight'
  | 'rainbow_wave'
  | 'color_cycle'
  | 'breathing'
  | 'spiral'
  | 'aurora'
  | 'matrix_rain'
  | 'circular_wave'
  | 'gradient_flow'
  | 'plasma'
  | 'fire'
  | 'meteor_trail'
  | 'key_press_flash'
  | 'key_release_flash'
  | 'ripple'
  | 'multi_key_ripple'
  | 'typing_heatmap'
  | 'reactive_gradient'
  | 'audio_bass_pulse'
  | 'audio_spectrum'
  | 'audio_waveform'
  | 'audio_beat_flash';

export type LayerBlendMode = 'normal' | 'additive' | 'screen' | 'maximum' | 'multiply';
export type WaveDirection = 'left_to_right' | 'right_to_left' | 'top_to_bottom' | 'radial_out';

export interface SxLightingLayer {
  id: string;
  name: string;
  enabled: boolean;
  effect: AnimationKind;
  palette: [number, number, number][];
  opacity: number;
  speed: number;
  scale: number;
  blend_mode: LayerBlendMode;
  direction: WaveDirection;
  zone_filter: string;
}

export interface SxLightingPreset {
  magic: string;
  version: number;
  id: string;
  name: string;
  author: string;
  description: string;
  fps: number;
  max_brightness: number;
  layers: SxLightingLayer[];
}

export interface SxLightingStatus {
  active: boolean;
  hardware_streaming: boolean;
  target_device_id: string;
  actual_fps: number;
  frames_sent: number;
  frames_deduped: number;
  last_error: string | null;
  active_preset: SxLightingPreset;
}

export interface LightingPreviewFrame {
  preset_id: string;
  matrix_rgb: [number, number, number][];
  audio_peak: number;
}

// --- SxPerformance DTOs ---
export type SocdMode = 'off' | 'last_input' | 'first_input' | 'neutral';

export interface SocdPair {
  key_a: string;
  key_b: string;
}

export interface ModTapRule {
  trigger_key: string;
  tap_key: string;
  hold_key: string;
  threshold_ms: number;
  enabled: boolean;
}

export interface TapDanceRule {
  trigger_key: string;
  single_key: string;
  double_key: string;
  window_ms: number;
  enabled: boolean;
}

export interface SxPerformanceConfig {
  enabled: boolean;
  socd_mode: SocdMode;
  socd_pairs: SocdPair[];
  mod_taps: ModTapRule[];
  tap_dances: TapDanceRule[];
  one_shot_mods: string[];
  key_remaps: Record<string, string>;
  emergency_bypass_key: string;
  bypass_on_unsupported_game: boolean;
}

export interface SxPerformanceDiagnostics {
  enabled: boolean;
  uinput_ready: boolean;
  virtual_pipeline_active: boolean;
  grabbed_devices: string[];
  events_processed: number;
  socd_resolutions: number;
  mod_tap_triggers: number;
  dropped_events: number;
  reconnect_count: number;
  events_per_sec: number;
  last_proc_us: number;
  avg_proc_us: number;
  p95_proc_us: number;
  max_proc_us: number;
  last_error: string | null;
  latency_disclaimer: string;
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
  sxlighting_status: SxLightingStatus;
  sxlighting_presets: SxLightingPreset[];
  sxperformance_config: SxPerformanceConfig;
  sxperformance_diagnostics: SxPerformanceDiagnostics;
}

export interface UiInputEvent {
  web_code: string;
  is_down: boolean;
  is_mouse: boolean;
  total_keystrokes: number;
}
