import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  ActiveWindowInfo,
  AppSettings,
  AudioInspectResult,
  HubPackEntry,
  InitialStateDto,
  InputStatus,
  SoundpackInfo,
  StatsData,
  StudioPackSpec,
  UiInputEvent,
  UpdateCheckResult,
} from './types';
import { KeyboardVisualizer } from './components/KeyboardVisualizer';
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
  Keyboard,
  Mouse,
  Power,
  Scissors,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';

type ActiveSection =
  | 'keyboard'
  | 'mouse'
  | 'audio'
  | 'studio'
  | 'stats'
  | 'system';

export function App() {
  const [section, setSection] = useState<ActiveSection>('keyboard');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [soundpacks, setSoundpacks] = useState<SoundpackInfo[]>([]);
  const [hubCatalog, setHubCatalog] = useState<HubPackEntry[]>([]);
  const [soundpacksDir, setSoundpacksDir] = useState('');
  const [appVersion, setAppVersion] = useState('v0.2.0');
  const [inputStatus, setInputStatus] = useState<InputStatus>({
    has_permission: true,
    active_devices: [],
    denied_devices: 0,
    session_type: 'wayland',
    desktop: 'Hyprland',
  });
  const [activeWindow, setActiveWindow] = useState<ActiveWindowInfo | null>(
    null
  );
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [stats, setStats] = useState<StatsData>({
    total_keystrokes: 0,
    total_mouse_clicks: 0,
    peak_wpm: 0,
    heatmap: {},
    daily: {},
  });
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [pressedMouseButtons, setPressedMouseButtons] = useState<Set<string>>(
    new Set()
  );
  const [lastKeyLabel, setLastKeyLabel] = useState<string | null>(null);
  const [wpm, setWpm] = useState(0);
  const [toast, setToast] = useState<{ text: string; isError?: boolean } | null>(
    null
  );

  const keystrokeTimestampsRef = useRef<number[]>([]);
  const globalActiveRef = useRef(false);

  const showToast = useCallback((text: string, isError = false) => {
    setToast({ text, isError });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3400);
  }, []);

  const recordKeystrokeForWpm = useCallback(() => {
    const now = Date.now();
    const cutoff = now - 10_000;
    const arr = keystrokeTimestampsRef.current.filter((t) => t > cutoff);
    arr.push(now);
    keystrokeTimestampsRef.current = arr;
    const nextWpm = Math.round((arr.length / 5) * 6);
    setWpm(nextWpm);
    if (nextWpm > 0) {
      invoke('report_wpm', { wpm: nextWpm }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      const cutoff = Date.now() - 10_000;
      const arr = keystrokeTimestampsRef.current.filter((t) => t > cutoff);
      keystrokeTimestampsRef.current = arr;
      setWpm(Math.round((arr.length / 5) * 6));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
      })
      .catch((err) => showToast(`Başlatma hatası: ${err}`, true));

    invoke<ActiveWindowInfo | null>('get_active_window_info')
      .then((w) => setActiveWindow(w))
      .catch(() => {});

    const unlistenInput = listen<UiInputEvent>(
      'sxmcaps://input-event',
      (event) => {
        const {
          web_code,
          is_down,
          is_mouse,
          total_keystrokes: total,
        } = event.payload;

        if (is_mouse) {
          setPressedMouseButtons((prev) => {
            const next = new Set(prev);
            if (is_down) next.add(web_code);
            else next.delete(web_code);
            return next;
          });
          if (is_down) {
            setStats((prev) => ({
              ...prev,
              total_mouse_clicks: prev.total_mouse_clicks + 1,
            }));
          }
        } else {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            if (is_down) next.add(web_code);
            else next.delete(web_code);
            return next;
          });
          if (is_down) {
            setLastKeyLabel(web_code);
            recordKeystrokeForWpm();
            setStats((prev) => ({
              ...prev,
              total_keystrokes: total,
              heatmap: {
                ...prev.heatmap,
                [web_code]: (prev.heatmap[web_code] ?? 0) + 1,
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
  }, [recordKeystrokeForWpm, showToast]);

  // Refresh full stats snapshot whenever switching to Stats tab
  useEffect(() => {
    if (section === 'stats') {
      invoke<StatsData>('get_stats')
        .then((s) => setStats(s))
        .catch(() => {});
    }
  }, [section]);

  const isGlobalActive =
    inputStatus.has_permission && inputStatus.active_devices.length > 0;
  globalActiveRef.current = isGlobalActive;

  // Fallback in-window keyboard & mouse listeners when global evdev isn't active yet
  useEffect(() => {
    const mapMouseBtn = (btn: number): string => {
      if (btn === 1) return 'MouseMiddle';
      if (btn === 2) return 'MouseRight';
      if (btn === 3) return 'MouseSide';
      if (btn === 4) return 'MouseExtra';
      return 'MouseLeft';
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || globalActiveRef.current) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !target.dataset.sandbox
      ) {
        // Still allow sound when typing in studio/search? Actually let typing test sandbox play always, skip form inputs only if needed
      }
      const code = e.code || 'KeyA';
      setPressedKeys((prev) => new Set(prev).add(code));
      setLastKeyLabel(code);
      recordKeystrokeForWpm();
      invoke<number>('trigger_test_key', { webCode: code, isDown: true })
        .then((total) => {
          setStats((prev) => ({
            ...prev,
            total_keystrokes: total,
            heatmap: {
              ...prev.heatmap,
              [code]: (prev.heatmap[code] ?? 0) + 1,
            },
          }));
        })
        .catch(() => {});
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (globalActiveRef.current) return;
      const code = e.code || 'KeyA';
      setPressedKeys((prev) => {
        const next = new Set(prev);
        next.delete(code);
        return next;
      });
      invoke('trigger_test_key', { webCode: code, isDown: false }).catch(
        () => {}
      );
    };

    const onMouseDown = (e: MouseEvent) => {
      if (globalActiveRef.current) return;
      const btn = mapMouseBtn(e.button);
      setPressedMouseButtons((prev) => new Set(prev).add(btn));
      invoke('trigger_test_mouse', { button: btn, isDown: true }).catch(
        () => {}
      );
    };

    const onMouseUp = (e: MouseEvent) => {
      if (globalActiveRef.current) return;
      const btn = mapMouseBtn(e.button);
      setPressedMouseButtons((prev) => {
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
  }, [recordKeystrokeForWpm]);

  const activePack = useMemo(() => {
    if (!settings) return null;
    return (
      soundpacks.find((p) => p.id === settings.active_keyboard_pack) ??
      soundpacks.find((p) => p.device_type !== 'mouse') ??
      null
    );
  }, [soundpacks, settings]);

  const handleUpdateSettings = async (next: AppSettings) => {
    setSettings(next);
    try {
      const saved = await invoke<AppSettings>('update_settings', {
        newSettings: next,
      });
      setSettings(saved);
    } catch (err) {
      showToast(`Ayar kaydedilemedi: ${err}`, true);
    }
  };

  const handleSelectKeyboardPack = async (packId: string) => {
    try {
      const updated = await invoke<AppSettings>('select_keyboard_pack', {
        packId,
      });
      setSettings(updated);
    } catch (err) {
      showToast(`Paket yüklenemedi: ${err}`, true);
    }
  };

  const handleSelectMousePack = async (packId: string) => {
    try {
      const updated = await invoke<AppSettings>('select_mouse_pack', {
        packId,
      });
      setSettings(updated);
    } catch (err) {
      showToast(`Fare paketi yüklenemedi: ${err}`, true);
    }
  };

  const handlePreviewKeyboardPack = async (packId: string) => {
    await handleSelectKeyboardPack(packId);
    const demo = ['KeyS', 'KeyX', 'KeyM', 'Space'];
    demo.forEach((code, idx) => {
      setTimeout(() => {
        setPressedKeys((prev) => new Set(prev).add(code));
        invoke('trigger_test_key', { webCode: code, isDown: true }).catch(
          () => {}
        );
        setTimeout(() => {
          setPressedKeys((prev) => {
            const next = new Set(prev);
            next.delete(code);
            return next;
          });
          invoke('trigger_test_key', { webCode: code, isDown: false }).catch(
            () => {}
          );
        }, 60);
      }, idx * 85);
    });
  };

  const handleKeyPressVisual = (code: string, isDown: boolean) => {
    setPressedKeys((prev) => {
      const next = new Set(prev);
      if (isDown) next.add(code);
      else next.delete(code);
      return next;
    });
    if (isDown) {
      setLastKeyLabel(code);
      recordKeystrokeForWpm();
    }
    invoke<number>('trigger_test_key', { webCode: code, isDown })
      .then((total) => {
        if (isDown) {
          setStats((prev) => ({
            ...prev,
            total_keystrokes: total,
            heatmap: {
              ...prev.heatmap,
              [code]: (prev.heatmap[code] ?? 0) + 1,
            },
          }));
        }
      })
      .catch(() => {});
  };

  const handleTestMouseButton = (button: string, isDown: boolean) => {
    setPressedMouseButtons((prev) => {
      const next = new Set(prev);
      if (isDown) next.add(button);
      else next.delete(button);
      return next;
    });
    invoke('trigger_test_mouse', { button, isDown }).catch(() => {});
  };

  const handleImportZip = async () => {
    try {
      const res = await invoke<SoundpackInfo[] | null>('pick_and_import_zip');
      if (res) {
        setSoundpacks(res);
        showToast('ZIP ses paketi başarıyla içe aktarıldı.');
      }
    } catch (err) {
      showToast(`ZIP içe aktarma hatası: ${err}`, true);
    }
  };

  const handleImportFolder = async () => {
    try {
      const res = await invoke<SoundpackInfo[] | null>('pick_and_import_folder');
      if (res) {
        setSoundpacks(res);
        showToast('Ses paketi klasörü başarıyla içe aktarıldı.');
      }
    } catch (err) {
      showToast(`Klasör içe aktarma hatası: ${err}`, true);
    }
  };

  const handleDeleteCustom = async (packId: string) => {
    try {
      const res = await invoke<SoundpackInfo[]>('delete_soundpack', { packId });
      setSoundpacks(res);
      const refreshed = await invoke<InitialStateDto>('get_initial_state');
      setSettings(refreshed.settings);
      showToast('Özel ses paketi silindi.');
    } catch (err) {
      showToast(`Silinemedi: ${err}`, true);
    }
  };

  const handleExportZip = async (packId: string) => {
    try {
      const savedPath = await invoke<string | null>('export_soundpack_zip', {
        packId,
      });
      if (savedPath) {
        showToast(`Paket dışa aktarıldı: ${savedPath}`);
      }
    } catch (err) {
      showToast(`Dışa aktarma hatası: ${err}`, true);
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
      showToast('Pack Hub paketi indirildi ve kuruldu.');
    } catch (err) {
      showToast(`Kurulum hatası: ${err}`, true);
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
      setSection('keyboard');
      showToast(`"${created.name}" oluşturuldu ve aktifleştirildi.`);
    } catch (err) {
      showToast(`Paket oluşturulamadı: ${err}`, true);
    }
  };

  const handleEnableUdev = async () => {
    const status = await invoke<InputStatus>('enable_global_input_udev');
    setInputStatus(status);
    if (status.has_permission && status.active_devices.length > 0) {
      showToast(
        `Global dinleme aktif edildi! (${status.active_devices.length} cihaz)`
      );
    } else {
      showToast(
        'udev kuralı yazıldı ancak cihaz henüz açılmadı. Yenile butonuna basın veya oturumu kapatıp açın.',
        true
      );
    }
  };

  const handleRescanInput = async () => {
    const status = await invoke<InputStatus>('rescan_input_devices');
    setInputStatus(status);
    if (status.has_permission && status.active_devices.length > 0) {
      showToast(`${status.active_devices.length} giriş cihazı aktif.`);
    } else {
      showToast('Henüz global giriş izni algılanamadı.', true);
    }
  };

  if (!settings) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#050506] text-xs tracking-widest text-zinc-400 uppercase">
        sxmcaps yükleniyor...
      </div>
    );
  }

  const navItems: {
    id: ActiveSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[] = [
    { id: 'keyboard', label: 'Switchler', icon: Keyboard },
    {
      id: 'mouse',
      label: 'Fare',
      icon: Mouse,
      badge: settings.mouse_enabled ? 'AÇIK' : 'KAPALI',
    },
    { id: 'audio', label: 'Akustik DSP', icon: Sliders },
    { id: 'studio', label: 'Stüdyo', icon: Scissors },
    { id: 'stats', label: 'İstatistik', icon: BarChart3 },
    {
      id: 'system',
      label: 'Sistem',
      icon: Cpu,
      badge: isGlobalActive ? `${inputStatus.active_devices.length}` : '!',
    },
  ];

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#050506] text-zinc-100">
      {/* Top Monochrome Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#09090b] px-5 py-2.5">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white text-black shadow-[0_2px_0_#71717a]">
            <span className="font-mono text-[11px] font-black tracking-tighter">
              SXM
            </span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">
                sxmcaps
              </h1>
              <span className="rounded border border-white/15 bg-white/[0.04] px-1.5 py-0.2 font-mono text-[10px] text-zinc-400">
                {appVersion}
              </span>
            </div>
            <p className="text-[11px] text-zinc-500">
              Monochrome Mechanical Sound Studio
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSection('system')}
            title={
              inputStatus.active_devices.length > 0
                ? `Dinlenen cihazlar: ${inputStatus.active_devices.join(', ')}`
                : 'Global dinleme izni gerekiyor'
            }
            className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-medium transition ${
              isGlobalActive
                ? 'border-white/25 bg-white/[0.06] text-white hover:border-white/50'
                : 'border-white/20 bg-black text-zinc-400 hover:border-white/40 hover:text-white'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isGlobalActive
                  ? 'animate-pulse bg-white shadow-[0_0_8px_#fff]'
                  : 'border border-zinc-400 bg-transparent'
              }`}
            />
            {isGlobalActive
              ? `Global Aktif (${inputStatus.active_devices.length})`
              : 'Pencere İçi'}
          </button>

          <button
            type="button"
            onClick={() => setSection('stats')}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-[#0e0e11] px-3 py-1 font-mono text-[11px] text-zinc-300 hover:border-white/30"
          >
            <Activity className="h-3.5 w-3.5 text-white" />
            <span>{stats.total_keystrokes.toLocaleString('tr-TR')} vuruş</span>
          </button>

          <button
            type="button"
            onClick={() =>
              handleUpdateSettings({ ...settings, enabled: !settings.enabled })
            }
            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3.5 py-1.5 text-xs font-semibold transition ${
              settings.enabled
                ? 'border-white bg-white text-black hover:bg-zinc-200'
                : 'border-white/15 bg-[#121216] text-zinc-400 hover:border-white/30 hover:text-white'
            }`}
          >
            {settings.enabled ? (
              <>
                <Volume2 className="h-3.5 w-3.5" />
                Ses Aktif
              </>
            ) : (
              <>
                <VolumeX className="h-3.5 w-3.5" />
                Susturuldu
              </>
            )}
            <Power className="ml-0.5 h-3 w-3 opacity-70" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4">
        <PermissionBanner
          status={inputStatus}
          onEnableUdev={handleEnableUdev}
          onRescan={handleRescanInput}
        />

        <KeyboardVisualizer
          pressedKeys={pressedKeys}
          activePackName={activePack?.name ?? 'Holy Panda'}
          activePackTag={activePack?.tag ?? 'Tactile'}
          wpm={wpm}
          lastKeyLabel={lastKeyLabel}
          onKeyPress={handleKeyPressVisual}
        />

        {/* Categorized 6-Tab Navigation Bar */}
        <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-[#0b0b0e] p-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  active
                    ? 'bg-white text-black shadow-sm'
                    : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span
                    className={`rounded px-1.5 py-0.2 font-mono text-[9px] ${
                      active
                        ? 'bg-black text-white'
                        : 'border border-white/15 bg-black/50 text-zinc-300'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Active Section */}
        <div className="min-h-0 flex-1">
          {section === 'keyboard' && (
            <SoundpackGrid
              soundpacks={soundpacks}
              activeKeyboardPack={settings.active_keyboard_pack}
              hubCatalog={hubCatalog}
              onLoadHubCatalog={handleLoadHubCatalog}
              onInstallHubPack={handleInstallHubPack}
              onSelectKeyboard={handleSelectKeyboardPack}
              onPreview={handlePreviewKeyboardPack}
              onDeleteCustom={handleDeleteCustom}
              onExportZip={handleExportZip}
            />
          )}

          {section === 'mouse' && (
            <MouseSection
              settings={settings}
              soundpacks={soundpacks}
              pressedMouseButtons={pressedMouseButtons}
              onUpdateSettings={handleUpdateSettings}
              onSelectMousePack={handleSelectMousePack}
              onTestMouseButton={handleTestMouseButton}
            />
          )}

          {section === 'audio' && (
            <AudioControls
              settings={settings}
              audioDevices={audioDevices}
              onChange={handleUpdateSettings}
            />
          )}

          {section === 'studio' && (
            <StudioSection
              onPickAudio={() =>
                invoke<AudioInspectResult | null>('pick_studio_audio_file')
              }
              onPreviewSlice={(path, startMs, durationMs) =>
                invoke('preview_studio_slice', { path, startMs, durationMs })
              }
              onSavePack={handleSaveStudioPack}
            />
          )}

          {section === 'stats' && (
            <StatsSection
              stats={stats}
              onResetStats={() => {
                invoke<StatsData>('reset_stats')
                  .then((fresh) => {
                    setStats(fresh);
                    showToast('İstatistikler sıfırlandı.');
                  })
                  .catch((e) => showToast(`Sıfırlanamadı: ${e}`, true));
              }}
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
              onUpdateSettings={handleUpdateSettings}
              onEnableUdev={handleEnableUdev}
              onRescanInput={handleRescanInput}
              onImportZip={handleImportZip}
              onImportFolder={handleImportFolder}
              onOpenFolder={() =>
                invoke('open_soundpacks_folder').catch((e) =>
                  showToast(`Klasör açılamadı: ${e}`, true)
                )
              }
              onCheckUpdate={() => invoke<UpdateCheckResult>('check_app_update')}
            />
          )}
        </div>
      </main>

      {/* Monochrome Toast Notification */}
      {toast && (
        <div
          className={`fixed right-5 bottom-5 z-50 rounded-xl border px-4 py-2.5 text-xs font-medium shadow-2xl ${
            toast.isError
              ? 'border-white/40 bg-[#141418] text-white'
              : 'border-white bg-white text-black'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default App;
