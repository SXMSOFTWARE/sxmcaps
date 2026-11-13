import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ActiveWindowInfo,
  AppSettings,
  AudioInspectResult,
  DeviceHardwareState,
  HardwareDeviceInfo,
  HubPackEntry,
  InitialStateDto,
  InputStatus,
  KeymapEntryDto,
  RemapTargetDto,
  SoundpackInfo,
  StatsData,
  StudioPackSpec,
  SxBoardMacro,
  SxBoardPreset,
  SxBoardWorkspaceStore,
  UiInputEvent,
  UpdateCheckResult,
} from './types';
import { I18nProvider, resolveLanguage, TRANSLATIONS } from './i18n';
import { AulaF75BoardStage } from './components/AulaF75BoardStage';
import { SxBoardDevicesPanel } from './components/SxBoardDevicesPanel';
import { SxBoardRgbPanel } from './components/SxBoardRgbPanel';
import { SxBoardKeysPanel } from './components/SxBoardKeysPanel';
import { SxBoardMacrosPanel } from './components/SxBoardMacrosPanel';
import { SoundpackGrid } from './components/SoundpackGrid';
import { MouseSection } from './components/MouseSection';
import { AudioControls } from './components/AudioControls';
import { StudioSection } from './components/StudioSection';
import { StatsSection } from './components/StatsSection';
import { SystemSection } from './components/SystemSection';
import { PermissionBanner } from './components/PermissionBanner';
import {
  Activity,
  BarChart3,
  Cpu,
  Globe,
  Keyboard,
  Mouse,
  Plus,
  Save,
  Scissors,
  Settings,
  Sliders,
  Sparkles,
  Trash2,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';

type MainSection =
  | 'devices'
  | 'rgb'
  | 'keys'
  | 'macros'
  | 'sound'
  | 'stats'
  | 'system';

type SoundSubTab = 'switches' | 'mouse' | 'dsp' | 'studio';

const DEFAULT_SETTINGS: AppSettings = {
  active_keyboard_pack: 'cherrymx-brown-pbt',
  active_mouse_pack: 'mouse-logitech-gpx',
  enabled: true,
  keyboard_volume: 0.85,
  mouse_enabled: true,
  mouse_volume: 0.8,
  key_up_enabled: true,
  key_up_volume: 0.55,
  pitch_variation: 0.03,
  stereo_pan: true,
  minimize_to_tray: false,
  audio_device: null,
  plate_preset: 'neutral',
  tape_mod: false,
  poron_foam: false,
  eq_low_db: 0,
  eq_mid_db: 0,
  eq_high_db: 0,
  room_ambience: 0,
  profiles_enabled: false,
  app_profiles: [],
  autostart: false,
  language: 'auto',
};

const EMPTY_STATS: StatsData = {
  total_keystrokes: 0,
  total_mouse_clicks: 0,
  peak_wpm: 0,
  heatmap: {},
  daily: {},
};

const EMPTY_WORKSPACE: SxBoardWorkspaceStore = {
  active_preset_id: 'default',
  presets: [],
  macros: [],
};

function pickPreferredDeviceId(list: HardwareDeviceInfo[]): string {
  const wiredWritable = list.find(
    (d) =>
      d.online &&
      d.permission_ok &&
      d.link === 'wired' &&
      (d.capabilities.rgb_effects || d.capabilities.key_remapping)
  );
  if (wiredWritable) return wiredWritable.id;

  const anyWritable = list.find(
    (d) =>
      d.online &&
      d.permission_ok &&
      (d.capabilities.rgb_effects || d.capabilities.key_remapping)
  );
  if (anyWritable) return anyWritable.id;

  const anyCapable = list.find(
    (d) =>
      d.online && (d.capabilities.rgb_effects || d.capabilities.key_remapping)
  );
  if (anyCapable) return anyCapable.id;

  return list.find((d) => d.online)?.id ?? list[0]?.id ?? '';
}

function normalizeError(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export function App() {
  const [section, setSection] = useState<MainSection>('devices');
  const [soundTab, setSoundTab] = useState<SoundSubTab>('switches');

  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [soundpacks, setSoundpacks] = useState<SoundpackInfo[]>([]);
  const [hubCatalog, setHubCatalog] = useState<HubPackEntry[]>([]);
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData>(EMPTY_STATS);
  const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(
    null
  );
  const [soundpacksDir, setSoundpacksDir] = useState('');
  const [appVersion, setAppVersion] = useState('v0.3.0');
  const [inputStatus, setInputStatus] = useState<InputStatus>({
    has_permission: true,
    active_devices: [],
    denied_devices: 0,
    desktop: '',
    session_type: '',
  });

  // SxBoards hardware & workspace state
  const [devices, setDevices] = useState<HardwareDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [hwState, setHwState] = useState<DeviceHardwareState | null>(null);
  const [hwBusy, setHwBusy] = useState(false);
  const [scanningHw, setScanningHw] = useState(false);

  const [keymapLayer0, setKeymapLayer0] = useState<KeymapEntryDto[]>([]);
  const [keymapLayer1, setKeymapLayer1] = useState<KeymapEntryDto[]>([]);
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [remapTargets, setRemapTargets] = useState<RemapTargetDto[]>([]);
  const keymapLoadedDeviceRef = useRef<string>('');

  const [workspace, setWorkspace] =
    useState<SxBoardWorkspaceStore>(EMPTY_WORKSPACE);
  const [newPresetModalOpen, setNewPresetModalOpen] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');

  // Live input visualization & WPM
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [pressedMouse, setPressedMouse] = useState<Set<string>>(new Set());
  const [lastKeyLabel, setLastKeyLabel] = useState('');
  const [wpm, setWpm] = useState(0);
  const [toast, setToast] = useState<{ msg: string; error?: boolean } | null>(
    null
  );

  const keyTimestampsRef = useRef<number[]>([]);
  const lastReportedPeakRef = useRef<number>(0);

  const activeDevice = useMemo(
    () => devices.find((d) => d.id === activeDeviceId) ?? null,
    [devices, activeDeviceId]
  );

  const t = useMemo(
    () => TRANSLATIONS[resolveLanguage(settings.language)],
    [settings.language]
  );

  const showToast = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.setTimeout(() => {
      setToast((prev) => (prev?.msg === msg ? null : prev));
    }, 3200);
  }, []);

  const recordWpmTick = useCallback(() => {
    const now = Date.now();
    keyTimestampsRef.current.push(now);
    const cutoff = now - 6000;
    keyTimestampsRef.current = keyTimestampsRef.current.filter(
      (ts) => ts >= cutoff
    );
    const chars = keyTimestampsRef.current.length;
    const nextWpm = chars > 1 ? Math.round((chars / 5) * 10) : 0;
    setWpm(nextWpm);
    if (nextWpm > lastReportedPeakRef.current && nextWpm > 12) {
      lastReportedPeakRef.current = nextWpm;
      invoke('report_wpm', { wpm: nextWpm }).catch(() => {});
    }
  }, []);

  // Load device state when requested or active device switches
  const fetchDeviceHwState = useCallback(
    async (devId: string, devObj?: HardwareDeviceInfo | null) => {
      const dev = devObj ?? devices.find((d) => d.id === devId);
      if (
        !devId ||
        !dev ||
        !dev.online ||
        !dev.permission_ok ||
        (!dev.capabilities.rgb_effects && !dev.capabilities.key_remapping)
      ) {
        setHwState(null);
        return;
      }
      setHwBusy(true);
      try {
        const st = await invoke<DeviceHardwareState>(
          'get_device_hardware_state',
          { deviceId: devId }
        );
        setHwState(st);
      } catch (err) {
        showToast(normalizeError(err), true);
      } finally {
        setHwBusy(false);
      }
    },
    [devices, showToast]
  );

  const fetchDeviceKeymaps = useCallback(
    async (devId: string, layerOnly?: 0 | 1) => {
      const dev = devices.find((d) => d.id === devId);
      if (!devId || !dev || !dev.online || !dev.permission_ok || !dev.capabilities.key_remapping) {
        return;
      }
      setHwBusy(true);
      try {
        if (layerOnly === 0) {
          const l0 = await invoke<KeymapEntryDto[]>('read_device_keymap', {
            deviceId: devId,
            layer: 0,
          });
          setKeymapLayer0(l0);
        } else if (layerOnly === 1) {
          const l1 = await invoke<KeymapEntryDto[]>('read_device_keymap', {
            deviceId: devId,
            layer: 1,
          });
          setKeymapLayer1(l1);
        } else {
          const [l0, l1] = await Promise.all([
            invoke<KeymapEntryDto[]>('read_device_keymap', {
              deviceId: devId,
              layer: 0,
            }),
            invoke<KeymapEntryDto[]>('read_device_keymap', {
              deviceId: devId,
              layer: 1,
            }),
          ]);
          setKeymapLayer0(l0);
          setKeymapLayer1(l1);
          keymapLoadedDeviceRef.current = devId;
        }
      } catch (err) {
        showToast(normalizeError(err), true);
      } finally {
        setHwBusy(false);
      }
    },
    [devices, showToast]
  );

  // Initial hydrate
  useEffect(() => {
    invoke<InitialStateDto>('get_initial_state')
      .then((dto) => {
        setSettings(dto.settings);
        setSoundpacks(dto.soundpacks);
        setInputStatus(dto.input_status);
        setAudioDevices(dto.audio_devices);
        setStats(dto.stats);
        setSoundpacksDir(dto.soundpacks_dir);
        setAppVersion(dto.app_version);
        setDevices(dto.devices);
        setRemapTargets(dto.remap_targets);
        setWorkspace(dto.workspace);

        const bestId = pickPreferredDeviceId(dto.devices);
        setActiveDeviceId(bestId);
        const bestDev = dto.devices.find((d) => d.id === bestId);
        if (
          bestDev &&
          bestDev.online &&
          bestDev.permission_ok &&
          bestDev.capabilities.rgb_effects
        ) {
          fetchDeviceHwState(bestId, bestDev);
          // Default to Effects/Devices smartly: if writable keyboard found, start in rgb or keep devices
          setSection('rgb');
        }
      })
      .catch((err) => showToast(`${t.toasts.initErr}: ${err}`, true));

    invoke<ActiveWindowInfo | null>('get_active_window_info')
      .then((w) => setActiveWindow(w))
      .catch(() => {});
  }, []);

  // Lazy load keymaps when entering Keys panel
  useEffect(() => {
    if (
      section === 'keys' &&
      activeDeviceId &&
      keymapLoadedDeviceRef.current !== activeDeviceId
    ) {
      fetchDeviceKeymaps(activeDeviceId);
    }
  }, [section, activeDeviceId, fetchDeviceKeymaps]);

  // Listen to backend Tauri events
  useEffect(() => {
    const unlistenInput = listen<UiInputEvent>(
      'sxmcaps://input-event',
      (event) => {
        const ev = event.payload;
        if (ev.is_mouse) {
          setPressedMouse((prev) => {
            const next = new Set(prev);
            if (ev.is_down) next.add(ev.web_code);
            else next.delete(ev.web_code);
            return next;
          });
          if (ev.is_down) {
            setStats((prev) => ({
              ...prev,
              total_mouse_clicks: prev.total_mouse_clicks + 1,
            }));
          }
        } else {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            if (ev.is_down) next.add(ev.web_code);
            else next.delete(ev.web_code);
            return next;
          });
          if (ev.is_down) {
            setLastKeyLabel(ev.web_code);
            recordWpmTick();
            setStats((prev) => ({
              ...prev,
              total_keystrokes: ev.total_keystrokes,
              heatmap: {
                ...prev.heatmap,
                [ev.web_code]: (prev.heatmap[ev.web_code] ?? 0) + 1,
              },
            }));
          }
        }
      }
    );

    const unlistenSettings = listen<AppSettings>(
      'sxmcaps://settings-updated',
      (event) => {
        setSettings(event.payload);
      }
    );

    const unlistenWin = listen<ActiveWindowInfo | null>(
      'sxmcaps://active-window',
      (event) => {
        setActiveWindow(event.payload);
      }
    );

    return () => {
      unlistenInput.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
      unlistenWin.then((fn) => fn());
    };
  }, [recordWpmTick]);

  // Decay WPM & refresh stats on stats tab
  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = Date.now();
      const recent = keyTimestampsRef.current.filter((ts) => now - ts < 6000);
      keyTimestampsRef.current = recent;
      setWpm(recent.length > 1 ? Math.round((recent.length / 5) * 10) : 0);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (section === 'stats') {
      invoke<StatsData>('get_stats')
        .then((s) => setStats(s))
        .catch(() => {});
    }
  }, [section]);

  // Global key/mouse fallback listener when focused inside app
  useEffect(() => {
    const hasGlobal =
      inputStatus.has_permission && inputStatus.active_devices.length > 0;
    if (hasGlobal) return;

    const downSet = new Set<string>();
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.repeat ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const code = e.code;
      if (downSet.has(code)) return;
      downSet.add(code);
      setPressedKeys((prev) => new Set(prev).add(code));
      setLastKeyLabel(code);
      recordWpmTick();
      invoke<number>('trigger_test_key', { webCode: code, isDown: true })
        .then((total) => {
          setStats((prev) => ({
            ...prev,
            total_keystrokes: total,
            heatmap: { ...prev.heatmap, [code]: (prev.heatmap[code] ?? 0) + 1 },
          }));
        })
        .catch(() => {});
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        return;
      }
      const code = e.code;
      downSet.delete(code);
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      invoke('trigger_test_key', { webCode: code, isDown: false }).catch(
        () => {}
      );
    };

    const mapBtn = (b: number) =>
      b === 0
        ? 'MouseLeft'
        : b === 2
          ? 'MouseRight'
          : b === 1
            ? 'MouseMiddle'
            : 'MouseSide';
    const onMouseDown = (e: MouseEvent) => {
      const btn = mapBtn(e.button);
      setPressedMouse((prev) => new Set(prev).add(btn));
      invoke('trigger_test_mouse', { button: btn, isDown: true }).catch(
        () => {}
      );
    };
    const onMouseUp = (e: MouseEvent) => {
      const btn = mapBtn(e.button);
      setPressedMouse((prev) => {
        const next = new Set(prev);
        next.delete(btn);
        return next;
      });
      invoke('trigger_test_mouse', { button: btn, isDown: false }).catch(
        () => {}
      );
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [
    inputStatus.has_permission,
    inputStatus.active_devices.length,
    recordWpmTick,
  ]);

  // --- Hardware & SxBoards Actions ---

  const handleSelectDevice = (id: string) => {
    setActiveDeviceId(id);
    keymapLoadedDeviceRef.current = '';
    setKeymapLayer0([]);
    setKeymapLayer1([]);
    const dev = devices.find((d) => d.id === id) ?? null;
    fetchDeviceHwState(id, dev);
  };

  const handleRescanHardware = async () => {
    setScanningHw(true);
    try {
      const list = await invoke<HardwareDeviceInfo[]>('discover_hardware_devices');
      setDevices(list);
      const stillExists = list.find((d) => d.id === activeDeviceId);
      const nextId = stillExists ? activeDeviceId : pickPreferredDeviceId(list);
      setActiveDeviceId(nextId);
      const dev = list.find((d) => d.id === nextId) ?? null;
      await fetchDeviceHwState(nextId, dev);
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setScanningHw(false);
    }
  };

  const handleEnableUdev = async () => {
    const [status, list] = await invoke<[InputStatus, HardwareDeviceInfo[]]>(
      'install_sxboards_udev'
    );
    setInputStatus(status);
    setDevices(list);
    const bestId = pickPreferredDeviceId(list);
    if (bestId) {
      setActiveDeviceId(bestId);
      const dev = list.find((d) => d.id === bestId) ?? null;
      await fetchDeviceHwState(bestId, dev);
    }
    if (status.has_permission && status.active_devices.length > 0) {
      showToast(t.toasts.udevActive(status.active_devices.length));
    } else {
      showToast(t.toasts.udevWait);
    }
  };

  const handleApplyRgbEffect = async (
    effectId: number,
    brightness: number,
    speed: number,
    colorIdx: number
  ) => {
    if (!activeDeviceId) return;
    setHwBusy(true);
    try {
      const st = await invoke<DeviceHardwareState>('apply_device_rgb_effect', {
        deviceId: activeDeviceId,
        effectId,
        brightness,
        speed,
        colorIdx,
      });
      setHwState(st);
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setHwBusy(false);
    }
  };

  const handleApplyPerKey = async (
    colors: [number, number, number][],
    brightness: number
  ) => {
    if (!activeDeviceId) return;
    setHwBusy(true);
    try {
      const st = await invoke<DeviceHardwareState>('apply_device_per_key_rgb', {
        deviceId: activeDeviceId,
        colors,
        brightness,
      });
      setHwState(st);
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setHwBusy(false);
    }
  };

  const handleApplyFlags = async (flags: {
    sideMode?: number;
    knobMode?: number;
    osMode?: number;
    winLock?: boolean;
    sleepSeconds?: number;
  }) => {
    if (!activeDeviceId) return;
    setHwBusy(true);
    try {
      const st = await invoke<DeviceHardwareState>(
        'apply_device_hardware_flags',
        {
          deviceId: activeDeviceId,
          sideMode: flags.sideMode ?? null,
          knobMode: flags.knobMode ?? null,
          osMode: flags.osMode ?? null,
          winLock: flags.winLock ?? null,
          sleepSeconds: flags.sleepSeconds ?? null,
        }
      );
      setHwState(st);
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setHwBusy(false);
    }
  };

  const handleWriteKeymapEntry = async (
    layer: 0 | 1,
    matrixIndex: number,
    code: [number, number, number, number]
  ) => {
    if (!activeDeviceId) return;
    setHwBusy(true);
    try {
      const updated = await invoke<KeymapEntryDto[]>(
        'write_device_keymap_entry',
        {
          deviceId: activeDeviceId,
          layer,
          matrixIndex,
          code,
        }
      );
      if (layer === 0) setKeymapLayer0(updated);
      else setKeymapLayer1(updated);
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setHwBusy(false);
    }
  };

  const handleRestoreLayer0 = async () => {
    if (!activeDeviceId) return;
    setHwBusy(true);
    try {
      const restored = await invoke<KeymapEntryDto[]>(
        'restore_device_keymap_layer',
        { deviceId: activeDeviceId, layer: 0 }
      );
      setKeymapLayer0(restored);
      showToast('Layer 0 restored to factory defaults.');
    } catch (err) {
      showToast(normalizeError(err), true);
    } finally {
      setHwBusy(false);
    }
  };

  const handleSaveMacros = async (macros: SxBoardMacro[]) => {
    try {
      const nextWs = await invoke<SxBoardWorkspaceStore>('save_sxboard_macros', {
        macros,
      });
      setWorkspace(nextWs);
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  const handleFlashMacros = async (macros: SxBoardMacro[]) => {
    if (!activeDeviceId) return;
    try {
      await invoke('flash_macros_to_device', {
        deviceId: activeDeviceId,
        macros,
      });
      showToast('Onboard macros flashed to keyboard.');
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  // --- Preset Actions (OVERWRITE PRESET / SAVE IN ACTIVE / + NEW PRESET) ---

  const buildPresetSnapshot = (id: string, name: string): SxBoardPreset => ({
    id,
    name,
    device_id: activeDeviceId || 'aula-f75',
    effect_id: hwState?.effect_id ?? 3,
    brightness: hwState?.brightness ?? 10,
    speed: hwState?.speed ?? 3,
    color_idx: hwState?.color_idx ?? 7,
    side_mode: hwState?.side_mode ?? 1,
    knob_mode: hwState?.knob_mode ?? 0,
    os_mode: hwState?.os_mode ?? 0,
    win_lock: hwState?.win_lock ?? false,
    sleep_seconds: hwState?.sleep_seconds ?? 300,
    per_key_colors: hwState?.per_key_colors ?? [],
    keyboard_pack: settings.active_keyboard_pack,
    mouse_pack: settings.active_mouse_pack,
    plate_preset: settings.plate_preset,
  });

  const activePreset = useMemo(
    () =>
      workspace.presets.find((p) => p.id === workspace.active_preset_id) ??
      workspace.presets[0],
    [workspace]
  );

  const handleSaveInActivePreset = async () => {
    if (!activePreset) return;
    try {
      const snap = buildPresetSnapshot(activePreset.id, activePreset.name);
      const nextWs = await invoke<SxBoardWorkspaceStore>(
        'save_in_active_sxboard_preset',
        { preset: snap }
      );
      setWorkspace(nextWs);
      showToast(t.presets.saved);
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  const handleOverwritePreset = async () => {
    if (!activePreset) return;
    try {
      const snap = buildPresetSnapshot(activePreset.id, activePreset.name);
      const nextWs = await invoke<SxBoardWorkspaceStore>(
        'overwrite_sxboard_preset',
        { presetId: activePreset.id, preset: snap }
      );
      setWorkspace(nextWs);
      showToast(t.presets.saved);
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  const handleCreatePreset = async () => {
    const clean = newPresetName.trim() || t.presets.defaultName;
    try {
      const snap = buildPresetSnapshot('', clean);
      const nextWs = await invoke<SxBoardWorkspaceStore>(
        'create_sxboard_preset',
        { name: clean, preset: snap }
      );
      setWorkspace(nextWs);
      setNewPresetName('');
      setNewPresetModalOpen(false);
      showToast(t.presets.created(clean));
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  const handleSelectPreset = async (presetId: string) => {
    try {
      const [nextWs, nextHw, nextSettings] = await invoke<
        [SxBoardWorkspaceStore, DeviceHardwareState | null, AppSettings]
      >('select_and_apply_sxboard_preset', {
        presetId,
        deviceId: activeDeviceId,
      });
      setWorkspace(nextWs);
      setSettings(nextSettings);
      if (nextHw) {
        setHwState(nextHw);
        const applied = nextWs.presets.find((p) => p.id === presetId);
        showToast(t.presets.applied(applied?.name ?? presetId));
      } else {
        showToast(t.presets.noHardware);
      }
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  const handleDeleteActivePreset = async () => {
    if (!activePreset || workspace.presets.length <= 1) return;
    try {
      const nextWs = await invoke<SxBoardWorkspaceStore>(
        'delete_sxboard_preset',
        { presetId: activePreset.id }
      );
      setWorkspace(nextWs);
      showToast(t.presets.deleted);
    } catch (err) {
      showToast(normalizeError(err), true);
    }
  };

  // --- Sound & System Actions ---

  const updateSettings = async (next: AppSettings) => {
    setSettings(next);
    try {
      const saved = await invoke<AppSettings>('update_settings', {
        newSettings: next,
      });
      setSettings(saved);
    } catch (err) {
      showToast(`${t.toasts.saveErr}: ${err}`, true);
    }
  };

  const handleSelectKeyboardPack = async (packId: string) => {
    try {
      const updated = await invoke<AppSettings>('select_keyboard_pack', {
        packId,
      });
      setSettings(updated);
      const packName = soundpacks.find((p) => p.id === packId)?.name ?? packId;
      showToast(packName);
    } catch (err) {
      showToast(`${t.toasts.packLoadErr}: ${err}`, true);
    }
  };

  const handleSelectMousePack = async (packId: string) => {
    try {
      const updated = await invoke<AppSettings>('select_mouse_pack', {
        packId,
      });
      setSettings(updated);
      const packName = soundpacks.find((p) => p.id === packId)?.name ?? packId;
      showToast(packName);
    } catch (err) {
      showToast(`${t.toasts.mouseLoadErr}: ${err}`, true);
    }
  };

  const handlePreviewPack = async (packId: string) => {
    await handleSelectKeyboardPack(packId);
    const demoCodes = ['KeyS', 'KeyX', 'KeyM', 'Space'];
    demoCodes.forEach((code, idx) => {
      window.setTimeout(() => {
        invoke('trigger_test_key', { webCode: code, isDown: true }).catch(
          () => {}
        );
        setPressedKeys((prev) => new Set(prev).add(code));
        window.setTimeout(() => {
          invoke('trigger_test_key', { webCode: code, isDown: false }).catch(
            () => {}
          );
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(code);
            return next;
          });
        }, 60);
      }, idx * 85);
    });
  };

  const handleTestKey = (code: string, isDown: boolean) => {
    setPressedKeys((prev) => {
      const next = new Set(prev);
      if (isDown) next.add(code);
      else next.delete(code);
      return next;
    });
    if (isDown) {
      setLastKeyLabel(code);
      recordWpmTick();
    }
    invoke<number>('trigger_test_key', { webCode: code, isDown })
      .then((total) => {
        if (isDown) {
          setStats((prev) => ({
            ...prev,
            total_keystrokes: total,
            heatmap: { ...prev.heatmap, [code]: (prev.heatmap[code] ?? 0) + 1 },
          }));
        }
      })
      .catch(() => {});
  };

  const handleTestMouse = (button: string, isDown: boolean) => {
    setPressedMouse((prev) => {
      const next = new Set(prev);
      if (isDown) next.add(button);
      else next.delete(button);
      return next;
    });
    if (isDown) {
      setStats((prev) => ({
        ...prev,
        total_mouse_clicks: prev.total_mouse_clicks + 1,
      }));
    }
    invoke('trigger_test_mouse', { button, isDown }).catch(() => {});
  };

  const handleImportZip = async () => {
    try {
      const res = await invoke<SoundpackInfo[] | null>('pick_and_import_zip');
      if (res) {
        setSoundpacks(res);
        showToast(t.toasts.zipImported);
      }
    } catch (err) {
      showToast(`${t.toasts.zipErr}: ${err}`, true);
    }
  };

  const handleImportFolder = async () => {
    try {
      const res = await invoke<SoundpackInfo[] | null>(
        'pick_and_import_folder'
      );
      if (res) {
        setSoundpacks(res);
        showToast(t.toasts.folderImported);
      }
    } catch (err) {
      showToast(`${t.toasts.folderErr}: ${err}`, true);
    }
  };

  const handleDeleteCustom = async (packId: string) => {
    try {
      const res = await invoke<SoundpackInfo[]>('delete_soundpack', { packId });
      setSoundpacks(res);
      const refreshed = await invoke<InitialStateDto>('get_initial_state');
      setSettings(refreshed.settings);
      showToast(t.toasts.deleted);
    } catch (err) {
      showToast(`${t.toasts.deleteErr}: ${err}`, true);
    }
  };

  const handleExportZip = async (packId: string) => {
    try {
      const savedPath = await invoke<string | null>('export_soundpack_zip', {
        packId,
      });
      if (savedPath) {
        showToast(`${t.toasts.exported}: ${savedPath}`);
      }
    } catch (err) {
      showToast(`${t.toasts.exportErr}: ${err}`, true);
    }
  };

  const handleLoadHubCatalog = useCallback(async () => {
    const list = await invoke<HubPackEntry[]>('get_pack_hub_catalog');
    setHubCatalog(list);
  }, []);

  const handleInstallHubPack = async (url: string) => {
    try {
      const res = await invoke<SoundpackInfo[]>('install_hub_pack', { url });
      setSoundpacks(res);
      showToast(t.toasts.hubInstalled);
    } catch (err) {
      showToast(`${t.toasts.hubErr}: ${err}`, true);
    }
  };

  const handleSaveStudioPack = async (spec: StudioPackSpec) => {
    try {
      const created = await invoke<SoundpackInfo>('save_studio_soundpack', {
        spec,
      });
      const list = await invoke<SoundpackInfo[]>('list_soundpacks');
      setSoundpacks(list);
      const refreshed = await invoke<InitialStateDto>('get_initial_state');
      setSettings(refreshed.settings);
      setSection('sound');
      setSoundTab('switches');
      showToast(t.toasts.studioCreated(created.name));
    } catch (err) {
      showToast(`${t.toasts.studioErr}: ${err}`, true);
    }
  };

  const handleRescanInput = async () => {
    const status = await invoke<InputStatus>('rescan_input_devices');
    setInputStatus(status);
    if (status.has_permission && status.active_devices.length > 0) {
      showToast(t.toasts.rescanOk(status.active_devices.length));
    } else {
      showToast(t.toasts.rescanNone, true);
    }
  };

  const handleCycleLanguage = () => {
    const order: ('auto' | 'tr' | 'en')[] = ['auto', 'tr', 'en'];
    const cur = (settings.language || 'auto') as 'auto' | 'tr' | 'en';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    updateSettings({ ...settings, language: next });
  };

  const activeKbPack = soundpacks.find(
    (p) => p.id === settings.active_keyboard_pack
  );
  const globalReady =
    inputStatus.has_permission && inputStatus.active_devices.length > 0;

  const railNav: {
    id: MainSection;
    label: string;
    icon: typeof Cpu;
  }[] = [
    { id: 'devices', label: t.nav.devices, icon: Cpu },
    { id: 'rgb', label: t.nav.rgb, icon: Sparkles },
    { id: 'keys', label: t.nav.keys, icon: Keyboard },
    { id: 'macros', label: t.nav.macros, icon: Zap },
    { id: 'sound', label: t.nav.sound, icon: Volume2 },
    { id: 'stats', label: t.nav.stats, icon: BarChart3 },
    { id: 'system', label: t.nav.system, icon: Settings },
  ];

  const soundSubTabs: {
    id: SoundSubTab;
    label: string;
    icon: typeof Keyboard;
  }[] = [
    { id: 'switches', label: t.nav.keyboard, icon: Keyboard },
    { id: 'mouse', label: t.nav.mouse, icon: Mouse },
    { id: 'dsp', label: t.nav.audio, icon: Sliders },
    { id: 'studio', label: t.nav.studio, icon: Scissors },
  ];

  return (
    <I18nProvider preference={settings.language}>
      <div className="relative flex h-screen overflow-hidden bg-[#08070d] text-zinc-100 select-none">
        {/* LORGAR Left Vertical Icon Rail */}
        <aside className="flex w-[74px] shrink-0 flex-col items-center justify-between border-r border-purple-500/20 bg-[#0b0912] py-3">
          {/* Hex SXB Brand Mark */}
          <button
            type="button"
            onClick={() => setSection('devices')}
            title="SxBoards Platform"
            className="group relative flex h-11 w-11 cursor-pointer items-center justify-center"
          >
            <svg
              viewBox="0 0 40 40"
              className="h-11 w-11 drop-shadow-[0_0_12px_rgba(168,85,247,0.55)]"
            >
              <defs>
                <linearGradient id="sxbHexStroke" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#c084fc" />
                  <stop offset="50%" stopColor="#9333ea" />
                  <stop offset="100%" stopColor="#f472b6" />
                </linearGradient>
              </defs>
              <polygon
                points="20,2 36,11 36,29 20,38 4,29 4,11"
                fill="#140f24"
                stroke="url(#sxbHexStroke)"
                strokeWidth="2.2"
              />
            </svg>
            <span className="absolute text-[10px] font-black tracking-tighter text-white">
              SXB
            </span>
          </button>

          {/* Vertical Navigation Icons */}
          <nav className="flex w-full flex-col items-center gap-1 px-1.5">
            {railNav.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`relative flex w-full cursor-pointer flex-col items-center gap-1 rounded-xl py-2.5 text-[9px] font-bold tracking-wider uppercase transition ${
                    active
                      ? 'bg-purple-600/20 text-purple-200'
                      : 'text-zinc-500 hover:bg-purple-500/10 hover:text-zinc-200'
                  }`}
                >
                  {active && (
                    <span className="absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full bg-purple-400 shadow-[0_0_10px_#a855f7]" />
                  )}
                  <Icon
                    className={`h-4 w-4 ${active ? 'text-purple-300' : ''}`}
                  />
                  <span className="max-w-full truncate px-1">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Bottom Language + Quick Sound Controls */}
          <div className="flex w-full flex-col items-center gap-2 px-2">
            <button
              type="button"
              onClick={handleCycleLanguage}
              title="Auto / Türkçe / English"
              className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-purple-500/20 bg-[#140f24] py-1.5 text-[9px] font-bold text-purple-200 uppercase transition hover:border-purple-400"
            >
              <Globe className="h-3 w-3 text-purple-400" />
              {(settings.language || 'auto').toUpperCase()}
            </button>

            <button
              type="button"
              onClick={() =>
                updateSettings({ ...settings, enabled: !settings.enabled })
              }
              title={settings.enabled ? t.soundOn : t.muted}
              className={`flex h-9 w-full cursor-pointer items-center justify-center rounded-lg border transition ${
                settings.enabled
                  ? 'border-purple-400 bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.45)]'
                  : 'border-purple-500/25 bg-[#140f24] text-zinc-400 hover:text-white'
              }`}
            >
              {settings.enabled ? (
                <Volume2 className="h-4 w-4" />
              ) : (
                <VolumeX className="h-4 w-4" />
              )}
            </button>
          </div>
        </aside>

        {/* Right Workspace Column */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Top Preset & Hardware Toolbar (LORGAR Reference Style) */}
          <header className="flex h-14 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-purple-500/20 bg-[#0b0912] px-4">
            {/* Active Hardware Device Selector + Global Status */}
            <div className="flex items-center gap-2.5">
              <div className="flex items-center gap-2 rounded-lg border border-purple-500/25 bg-[#140f24] px-2.5 py-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    activeDevice?.online && activeDevice?.permission_ok
                      ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                      : activeDevice?.online
                        ? 'bg-amber-400'
                        : 'bg-zinc-600'
                  }`}
                />
                {devices.length > 0 ? (
                  <select
                    value={activeDeviceId}
                    onChange={(e) => handleSelectDevice(e.target.value)}
                    className="max-w-[230px] cursor-pointer bg-transparent text-xs font-bold text-white outline-none"
                  >
                    {devices.map((d) => (
                      <option
                        key={d.id}
                        value={d.id}
                        className="bg-[#140f24] text-white"
                      >
                        {d.display_name} (
                        {d.link === 'wired'
                          ? 'USB-C'
                          : d.link === 'wireless_24g'
                            ? '2.4G'
                            : d.link === 'bluetooth'
                              ? 'BT'
                              : 'HID'}
                        )
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-semibold text-zinc-300">
                    SxBoards Virtual Deck
                  </span>
                )}
              </div>

              <button
                type="button"
                onClick={() => setSection(globalReady ? 'stats' : 'system')}
                className={`hidden cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[10px] font-bold tracking-wider uppercase sm:inline-flex ${
                  globalReady
                    ? 'border-purple-500/30 bg-purple-500/10 text-purple-200'
                    : 'border-purple-500/20 bg-[#140f24] text-zinc-400'
                }`}
              >
                <Activity className="h-3 w-3 text-purple-400" />
                {globalReady
                  ? t.globalActive(inputStatus.active_devices.length)
                  : t.inWindow}
              </button>

              {wpm > 0 && (
                <div className="hidden items-center gap-1 rounded-lg border border-purple-500/20 bg-[#140f24] px-2.5 py-1 font-mono text-[10px] font-bold text-purple-300 lg:flex">
                  {wpm} WPM
                </div>
              )}
            </div>

            {/* Reference Preset Bar: Active Preset Selector + OVERWRITE PRESET + SAVE IN ACTIVE + NEW PRESET */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg border border-purple-500/25 bg-[#140f24] px-2 py-1">
                <select
                  value={activePreset?.id ?? ''}
                  onChange={(e) => handleSelectPreset(e.target.value)}
                  className="max-w-[160px] cursor-pointer bg-transparent text-xs font-semibold text-purple-100 outline-none"
                >
                  {workspace.presets.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      className="bg-[#140f24] text-white"
                    >
                      {p.name}
                    </option>
                  ))}
                </select>
                {workspace.presets.length > 1 && (
                  <button
                    type="button"
                    onClick={handleDeleteActivePreset}
                    title="Delete preset"
                    className="cursor-pointer rounded p-0.5 text-zinc-500 hover:bg-purple-500/20 hover:text-rose-300"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleOverwritePreset}
                className="hidden cursor-pointer items-center gap-1.5 rounded-lg border border-purple-500/30 bg-[#151123] px-3 py-1.5 text-[10px] font-bold tracking-wider text-zinc-200 uppercase transition hover:border-purple-400 hover:bg-purple-500/15 hover:text-white xl:inline-flex"
              >
                <Save className="h-3 w-3 text-purple-400" />
                {t.presets.overwrite}
              </button>

              <button
                type="button"
                onClick={handleSaveInActivePreset}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-purple-500/30 bg-[#151123] px-3 py-1.5 text-[10px] font-bold tracking-wider text-zinc-200 uppercase transition hover:border-purple-400 hover:bg-purple-500/15 hover:text-white"
              >
                <Save className="h-3 w-3 text-purple-400" />
                {t.presets.saveActive}
              </button>

              <button
                type="button"
                onClick={() => {
                  setNewPresetName('');
                  setNewPresetModalOpen(true);
                }}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-purple-600 px-3.5 py-1.5 text-[10px] font-extrabold tracking-wider text-white uppercase shadow-[0_0_16px_rgba(147,51,234,0.5)] transition hover:bg-purple-500"
              >
                <Plus className="h-3.5 w-3.5" />
                {t.presets.newPreset.replace(/^\+\s*/, '')}
              </button>
            </div>
          </header>

          {/* Optional Linux Input Permission Notice */}
          {!globalReady && (
            <div className="shrink-0 px-3.5 pt-2.5">
              <PermissionBanner
                status={inputStatus}
                onEnableUdev={handleEnableUdev}
                onRescan={handleRescanInput}
              />
            </div>
          )}

          {/* Main Section Canvas */}
          <main className="sxb-stage-bg min-h-0 flex-1 overflow-hidden p-3.5">
            {section === 'devices' && (
              <SxBoardDevicesPanel
                devices={devices}
                activeDeviceId={activeDeviceId}
                scanning={scanningHw}
                onSelectDevice={handleSelectDevice}
                onRescan={handleRescanHardware}
                onInstallPermissions={handleEnableUdev}
                onOpenBoardStudio={(tab) => setSection(tab)}
              />
            )}

            {section === 'rgb' && (
              <SxBoardRgbPanel
                device={activeDevice}
                hwState={hwState}
                pressedKeys={pressedKeys}
                loading={hwBusy}
                onApplyEffect={handleApplyRgbEffect}
                onApplyPerKey={handleApplyPerKey}
                onApplyFlags={handleApplyFlags}
                onRefreshState={() => fetchDeviceHwState(activeDeviceId)}
              />
            )}

            {section === 'keys' && (
              <SxBoardKeysPanel
                device={activeDevice}
                keymapLayer0={keymapLayer0}
                keymapLayer1={keymapLayer1}
                activeLayer={activeLayer}
                pressedKeys={pressedKeys}
                targets={remapTargets}
                loading={hwBusy}
                onChangeLayer={setActiveLayer}
                onWriteEntry={handleWriteKeymapEntry}
                onRestoreLayer0={handleRestoreLayer0}
                onRefreshKeymap={(layer) =>
                  fetchDeviceKeymaps(activeDeviceId, layer)
                }
              />
            )}

            {section === 'macros' && (
              <SxBoardMacrosPanel
                device={activeDevice}
                macros={workspace.macros}
                onSaveMacros={handleSaveMacros}
                onFlashToDevice={handleFlashMacros}
                onPreviewStepSound={handleTestKey}
              />
            )}

            {section === 'sound' && (
              <div className="flex h-full flex-col gap-3 overflow-hidden">
                {/* Interactive Hardware Deck synchronized with Sound Engine */}
                <div className="shrink-0">
                  <AulaF75BoardStage
                    mode="sound"
                    pressedKeys={pressedKeys}
                    effectId={hwState?.effect_id ?? 3}
                    brightness={hwState?.brightness ?? 10}
                    speed={hwState?.speed ?? 3}
                    colorIdx={hwState?.color_idx ?? 7}
                    sideMode={hwState?.side_mode ?? 1}
                    perKeyColors={hwState?.per_key_colors}
                    deviceTitle={
                      activeDevice?.display_name ??
                      `SXB-F75 (${activeKbPack?.name ?? settings.active_keyboard_pack})`
                    }
                    badgeText={activeKbPack?.name ?? settings.active_keyboard_pack}
                    wpm={wpm}
                    lastKeyLabel={lastKeyLabel}
                    showSandbox
                    onSoundKeyPress={handleTestKey}
                  />
                </div>

                {/* Unified Sound Engine Sub-navigation */}
                <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-1 rounded-xl border border-purple-500/20 bg-[#0b0912] p-1">
                    {soundSubTabs.map((st) => {
                      const Icon = st.icon;
                      const active = soundTab === st.id;
                      return (
                        <button
                          key={st.id}
                          type="button"
                          onClick={() => setSoundTab(st.id)}
                          className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                            active
                              ? 'bg-purple-600 text-white shadow-[0_0_12px_rgba(147,51,234,0.4)]'
                              : 'text-zinc-400 hover:bg-purple-500/10 hover:text-white'
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                          {st.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-purple-500/20 bg-[#0b0912] px-3 py-1.5 text-[11px] text-zinc-400">
                    <Volume2 className="h-3.5 w-3.5 text-purple-400" />
                    <span className="font-mono text-purple-200">
                      {Math.round(settings.keyboard_volume * 100)}%
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.01}
                      value={settings.keyboard_volume}
                      onChange={(e) =>
                        updateSettings({
                          ...settings,
                          keyboard_volume: parseFloat(e.target.value),
                        })
                      }
                      className="sxm-slider w-24"
                    />
                  </div>
                </div>

                {/* Sound Sub-tab Viewport */}
                <div className="min-h-0 flex-1 overflow-hidden">
                  {soundTab === 'switches' && (
                    <SoundpackGrid
                      soundpacks={soundpacks}
                      activeKeyboardPack={settings.active_keyboard_pack}
                      hubCatalog={hubCatalog}
                      onLoadHubCatalog={handleLoadHubCatalog}
                      onInstallHubPack={handleInstallHubPack}
                      onSelectKeyboard={handleSelectKeyboardPack}
                      onSelectMouse={handleSelectMousePack}
                      onPreview={handlePreviewPack}
                      onDeleteCustom={handleDeleteCustom}
                      onExportZip={handleExportZip}
                    />
                  )}
                  {soundTab === 'mouse' && (
                    <MouseSection
                      settings={settings}
                      soundpacks={soundpacks}
                      pressedMouseButtons={pressedMouse}
                      onUpdateSettings={updateSettings}
                      onSelectMousePack={handleSelectMousePack}
                      onTestMouseButton={handleTestMouse}
                      onDeleteCustom={handleDeleteCustom}
                      onExportZip={handleExportZip}
                    />
                  )}
                  {soundTab === 'dsp' && (
                    <AudioControls
                      settings={settings}
                      audioDevices={audioDevices}
                      onChange={updateSettings}
                    />
                  )}
                  {soundTab === 'studio' && (
                    <StudioSection
                      onPickAudio={() =>
                        invoke<AudioInspectResult | null>(
                          'pick_studio_audio_file'
                        )
                      }
                      onPreviewSlice={(path, startMs, durationMs) =>
                        invoke('preview_studio_slice', {
                          path,
                          startMs,
                          durationMs,
                        })
                      }
                      onSavePack={handleSaveStudioPack}
                    />
                  )}
                </div>
              </div>
            )}

            {section === 'stats' && (
              <StatsSection
                stats={stats}
                onResetStats={() =>
                  invoke<StatsData>('reset_stats')
                    .then((fresh) => {
                      setStats(fresh);
                      showToast(t.toasts.statsReset);
                    })
                    .catch((e) => showToast(`${t.toasts.statsResetErr}: ${e}`, true))
                }
              />
            )}

            {section === 'system' && (
              <SystemSection
                settings={settings}
                soundpacks={soundpacks}
                inputStatus={inputStatus}
                activeWindow={activeWindow}
                soundpacksDir={soundpacksDir}
                appVersion={appVersion}
                onUpdateSettings={updateSettings}
                onEnableUdev={handleEnableUdev}
                onRescanInput={handleRescanInput}
                onImportZip={handleImportZip}
                onImportFolder={handleImportFolder}
                onOpenFolder={() =>
                  invoke('open_soundpacks_folder').catch((e) =>
                    showToast(`${t.toasts.openDirErr}: ${e}`, true)
                  )
                }
                onCheckUpdate={() =>
                  invoke<UpdateCheckResult>('check_app_update')
                }
              />
            )}
          </main>
        </div>

        {/* Inline Modal: + NEW PRESET */}
        {newPresetModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border border-purple-500/35 bg-[#120d1e] p-5 shadow-[0_0_40px_rgba(147,51,234,0.35)]">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold tracking-wider text-white uppercase">
                  {t.presets.newPreset}
                </h3>
                <button
                  type="button"
                  onClick={() => setNewPresetModalOpen(false)}
                  className="cursor-pointer rounded p-1 text-zinc-400 hover:bg-purple-500/20 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-2 text-xs text-zinc-400">
                {t.presets.promptName}
              </p>
              <input
                type="text"
                autoFocus
                value={newPresetName}
                onChange={(e) => setNewPresetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreatePreset();
                  if (e.key === 'Escape') setNewPresetModalOpen(false);
                }}
                placeholder={t.presets.defaultName}
                className="mb-4 w-full rounded-xl border border-purple-500/30 bg-[#090710] px-3 py-2 text-xs text-white outline-none focus:border-purple-400"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNewPresetModalOpen(false)}
                  className="cursor-pointer rounded-lg border border-purple-500/25 bg-[#19132b] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white"
                >
                  ✕
                </button>
                <button
                  type="button"
                  onClick={handleCreatePreset}
                  className="cursor-pointer rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-bold text-white shadow-[0_0_12px_rgba(147,51,234,0.45)] hover:bg-purple-500"
                >
                  {t.presets.newPreset}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Toast Notification */}
        {toast && (
          <div
            className={`fixed right-5 bottom-4 z-50 rounded-xl border px-4 py-2 text-xs font-semibold shadow-2xl ${
              toast.error
                ? 'border-rose-400/50 bg-[#28121d] text-rose-100'
                : 'border-purple-400/50 bg-[#171128] text-purple-100 shadow-[0_0_24px_rgba(147,51,234,0.4)]'
            }`}
          >
            {toast.msg}
          </div>
        )}
      </div>
    </I18nProvider>
  );
}

export default App;
