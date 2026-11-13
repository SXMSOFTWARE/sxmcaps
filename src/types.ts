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

export interface InitialStateDto {
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  input_status: InputStatus;
  audio_devices: string[];
  stats: StatsData;
  soundpacks_dir: string;
  app_version: string;
}

export interface UiInputEvent {
  web_code: string;
  is_down: boolean;
  is_mouse: boolean;
  total_keystrokes: number;
}
