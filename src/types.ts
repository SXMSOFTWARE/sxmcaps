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

export interface InitialStateDto {
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  input_status: InputStatus;
  audio_devices: string[];
  total_keystrokes: number;
  soundpacks_dir: string;
}

export interface UiInputEvent {
  web_code: string;
  is_down: boolean;
  is_mouse: boolean;
  total_keystrokes: number;
}
