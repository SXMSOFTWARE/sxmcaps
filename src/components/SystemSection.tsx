import React, { useState } from 'react';
import { AppSettings, InputStatus } from '../types';
import {
  CheckCircle2,
  Cpu,
  FolderOpen,
  FolderUp,
  HardDrive,
  Plus,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';

interface SystemSectionProps {
  settings: AppSettings;
  inputStatus: InputStatus;
  soundpacksDir: string;
  onUpdateSettings: (next: AppSettings) => void;
  onEnableUdev: () => Promise<void>;
  onRescanInput: () => Promise<void>;
  onImportZip: () => void;
  onImportFolder: () => void;
  onOpenFolder: () => void;
}

export const SystemSection: React.FC<SystemSectionProps> = ({
  settings,
  inputStatus,
  soundpacksDir,
  onUpdateSettings,
  onEnableUdev,
  onRescanInput,
  onImportZip,
  onImportFolder,
  onOpenFolder,
}) => {
  const [busy, setBusy] = useState(false);

  const isGlobalActive =
    inputStatus.has_permission && inputStatus.active_devices.length > 0;

  const handleUdev = async () => {
    setBusy(true);
    try {
      await onEnableUdev();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-2">
      {/* Left: Global Devices & Permissions */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <Cpu className="h-3.5 w-3.5 text-white" />
            Global Klavye & Fare Dinleme
          </div>

          <button
            type="button"
            onClick={onRescanInput}
            className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/15 bg-white/[0.04] px-2 py-1 text-[11px] text-zinc-200 hover:bg-white/10"
          >
            <RefreshCw className="h-3 w-3" />
            Yeniden Tara
          </button>
        </div>

        <div className="rounded-xl border border-white/[0.08] bg-[#060608] p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-white">
                {isGlobalActive
                  ? `Aktif — ${inputStatus.active_devices.length} cihaz dinleniyor`
                  : 'İzin Bekleniyor (/dev/input/event*)'}
              </div>
              <div className="text-[11px] text-zinc-500">
                Oturum: {inputStatus.desktop || 'Linux'} ({inputStatus.session_type})
              </div>
            </div>

            {isGlobalActive ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-black">
                <CheckCircle2 className="h-3 w-3" />
                BAĞLI
              </span>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleUdev}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                {busy ? 'Uygulanıyor...' : 'İzin Ver (udev)'}
              </button>
            )}
          </div>

          {inputStatus.active_devices.length > 0 && (
            <div className="mt-3 space-y-1 border-t border-white/[0.06] pt-2.5">
              <div className="text-[10px] font-medium tracking-wider text-zinc-500 uppercase">
                Algılanan Donanımlar
              </div>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {inputStatus.active_devices.map((dev, i) => (
                  <span
                    key={`${dev}-${i}`}
                    className="rounded border border-white/10 bg-[#121216] px-2 py-0.5 font-mono text-[10px] text-zinc-300"
                  >
                    {dev}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Tray behavior */}
        <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060608] p-3">
          <div>
            <div className="text-xs font-medium text-white">
              Kapatınca Sistem Tepsisine Küçült
            </div>
            <div className="text-[11px] text-zinc-500">
              Pencere kapatıldığında arka planda ses vermeye devam eder
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                minimize_to_tray: !settings.minimize_to_tray,
              })
            }
            className={`relative h-5 w-10 shrink-0 cursor-pointer rounded-full border transition ${
              settings.minimize_to_tray
                ? 'border-white bg-white'
                : 'border-white/20 bg-[#18181d]'
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                settings.minimize_to_tray
                  ? 'translate-x-5 bg-black'
                  : 'translate-x-0.5 bg-zinc-400'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Right: Mechvibes Soundpack Importer */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
        <div className="flex items-center gap-2 border-b border-white/[0.07] pb-2.5 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
          <HardDrive className="h-3.5 w-3.5 text-white" />
          Mechvibes Paket İçe Aktar & Yönet
        </div>

        <p className="text-xs leading-relaxed text-zinc-400">
          Mechvibes V1 (<code className="rounded bg-white/10 px-1 text-zinc-200">single</code> /{' '}
          <code className="rounded bg-white/10 px-1 text-zinc-200">multi</code>) ve Mechvibes V2
          ses paketlerini <code className="rounded bg-white/10 px-1 text-zinc-200">.zip</code> veya
          klasör olarak doğrudan ekleyebilirsiniz.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onImportZip}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white bg-white px-4 py-2.5 text-xs font-semibold text-black transition hover:bg-zinc-200"
          >
            <Plus className="h-4 w-4" />
            ZIP Paketi İçe Aktar
          </button>

          <button
            type="button"
            onClick={onImportFolder}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-white/20 bg-[#121216] px-4 py-2.5 text-xs font-semibold text-white transition hover:border-white hover:bg-white/10"
          >
            <FolderUp className="h-4 w-4" />
            Klasör İçe Aktar
          </button>
        </div>

        <div className="mt-auto flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#060608] p-3">
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-zinc-300">
              Özel Paket Klasörü
            </div>
            <div className="truncate font-mono text-[10px] text-zinc-500">
              {soundpacksDir}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenFolder}
            className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1.5 text-[11px] text-white hover:bg-white/15"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Klasörü Aç
          </button>
        </div>
      </div>
    </div>
  );
};
