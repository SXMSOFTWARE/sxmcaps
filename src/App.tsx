import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import {
  AppSettings,
  InitialStateDto,
  InputStatus,
  SoundpackInfo,
  UiInputEvent,
} from './types';
import { KeyboardVisualizer } from './components/KeyboardVisualizer';
import { SoundpackGrid } from './components/SoundpackGrid';
import { MouseSection } from './components/MouseSection';
import { AudioControls } from './components/AudioControls';
import { SystemSection } from './components/SystemSection';
import { PermissionBanner } from './components/PermissionBanner';
import {
  Activity,
  Cpu,
  Keyboard,
  Mouse,
  Power,
  Sliders,
  Volume2,
  VolumeX,
} from 'lucide-react';

type ActiveSection = 'keyboard' | 'mouse' | 'audio' | 'system';

export function App() {
  const [section, setSection] = useState<ActiveSection>('keyboard');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [soundpacks, setSoundpacks] = useState<SoundpackInfo[]>([]);
  const [soundpacksDir, setSoundpacksDir] = useState('');
  const [inputStatus, setInputStatus] = useState<InputStatus>({
    has_permission: true,
    active_devices: [],
    denied_devices: 0,
    session_type: 'wayland',
    desktop: 'Hyprland',
  });
  const [audioDevices, setAudioDevices] = useState<string[]>([]);
  const [totalKeystrokes, setTotalKeystrokes] = useState(0);
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
    setWpm(Math.round((arr.length / 5) * 6));
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
        setTotalKeystrokes(dto.total_keystrokes);
        setSoundpacksDir(dto.soundpacks_dir);
      })
      .catch((err) => showToast(`Başlatma hatası: ${err}`, true));

    const unlistenInput = listen<UiInputEvent>(
      'sxmcaps://input-event',
      (event) => {
        const {
          web_code,
          is_down,
          is_mouse,
          total_keystrokes: total,
        } = event.payload;
        setTotalKeystrokes(total);
        if (is_mouse) {
          setPressedMouseButtons((prev) => {
            const next = new Set(prev);
            if (is_down) next.add(web_code);
            else next.delete(web_code);
            return next;
          });
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

    return () => {
      unlistenInput.then((fn) => fn());
      unlistenSettings.then((fn) => fn());
    };
  }, [recordKeystrokeForWpm, showToast]);

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
      const code = e.code || 'KeyA';
      setPressedKeys((prev) => new Set(prev).add(code));
      setLastKeyLabel(code);
      setTotalKeystrokes((n) => n + 1);
      recordKeystrokeForWpm();
      invoke('trigger_test_key', { webCode: code, isDown: true }).catch(
        () => {}
      );
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
      setTotalKeystrokes((n) => n + 1);
      recordKeystrokeForWpm();
    }
    invoke('trigger_test_key', { webCode: code, isDown }).catch(() => {});
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
    { id: 'keyboard', label: 'Klavye Switchleri', icon: Keyboard },
    {
      id: 'mouse',
      label: 'Fare & Tıklama',
      icon: Mouse,
      badge: settings.mouse_enabled ? 'AÇIK' : 'KAPALI',
    },
    { id: 'audio', label: 'Akustik & Mikser', icon: Sliders },
    {
      id: 'system',
      label: 'Sistem & Paketler',
      icon: Cpu,
      badge: isGlobalActive ? `${inputStatus.active_devices.length}` : '!',
    },
  ];

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-[#050506] text-zinc-100">
      {/* Top Monochrome Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#09090b] px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/25 bg-white text-black shadow-[0_2px_0_#71717a]">
            <span className="font-mono text-[11px] font-black tracking-tighter">
              SXM
            </span>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-white">
              sxmcaps
            </h1>
            <p className="text-[11px] text-zinc-500">
              Monochrome Mechanical Sound Studio
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Global Listener Status Pill */}
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
              ? `Global Aktif (${inputStatus.active_devices.length} cihaz)`
              : 'Yalnızca Pencere İçi'}
          </button>

          {/* Total keystrokes */}
          <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-[#0e0e11] px-3 py-1 font-mono text-[11px] text-zinc-300">
            <Activity className="h-3.5 w-3.5 text-white" />
            <span>{totalKeystrokes.toLocaleString('tr-TR')} vuruş</span>
          </div>

          {/* Master Power / Mute */}
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

        {/* Categorized Segmented Navigation Bar */}
        <nav className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#0b0b0e] p-1.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`inline-flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                  active
                    ? 'bg-white text-black shadow-sm'
                    : 'text-zinc-400 hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className={`rounded px-1.5 py-0.2 font-mono text-[10px] ${
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

        {/* Categorized Active Panel */}
        <div className="min-h-0 flex-1">
          {section === 'keyboard' && (
            <SoundpackGrid
              soundpacks={soundpacks}
              activeKeyboardPack={settings.active_keyboard_pack}
              onSelectKeyboard={handleSelectKeyboardPack}
              onPreview={handlePreviewKeyboardPack}
              onDeleteCustom={handleDeleteCustom}
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

          {section === 'system' && (
            <SystemSection
              settings={settings}
              inputStatus={inputStatus}
              soundpacksDir={soundpacksDir}
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
