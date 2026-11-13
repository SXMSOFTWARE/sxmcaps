import React from 'react';
import { DeviceCapabilities, HardwareDeviceInfo } from '../types';
import { useI18n } from '../i18n';
import {
  Bluetooth,
  Cable,
  Cpu,
  Headphones,
  Keyboard,
  Mouse,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from 'lucide-react';

interface SxBoardDevicesPanelProps {
  devices: HardwareDeviceInfo[];
  activeDeviceId: string;
  scanning: boolean;
  onSelectDevice: (id: string) => void;
  onRescan: () => void;
  onInstallPermissions: () => void;
  onOpenBoardStudio: (tab: 'rgb' | 'keys' | 'macros' | 'sound') => void;
}

export const SxBoardDevicesPanel: React.FC<SxBoardDevicesPanelProps> = ({
  devices,
  activeDeviceId,
  scanning,
  onSelectDevice,
  onRescan,
  onInstallPermissions,
  onOpenBoardStudio,
}) => {
  const { t } = useI18n();

  const linkIcon = (link: HardwareDeviceInfo['link']) => {
    switch (link) {
      case 'wired':
        return <Cable className="h-3.5 w-3.5 text-emerald-400" />;
      case 'wireless_24g':
        return <Wifi className="h-3.5 w-3.5 text-purple-400" />;
      case 'bluetooth':
        return <Bluetooth className="h-3.5 w-3.5 text-sky-400" />;
      default:
        return <Cpu className="h-3.5 w-3.5 text-zinc-400" />;
    }
  };

  const linkLabel = (link: HardwareDeviceInfo['link']) => {
    switch (link) {
      case 'wired':
        return 'USB-C Wired';
      case 'wireless_24g':
        return '2.4GHz Wireless';
      case 'bluetooth':
        return 'Bluetooth';
      default:
        return 'USB HID';
    }
  };

  const kindIcon = (kind: HardwareDeviceInfo['device_kind']) => {
    switch (kind) {
      case 'keyboard':
        return <Keyboard className="h-6 w-6 text-purple-300" />;
      case 'mouse':
        return <Mouse className="h-6 w-6 text-purple-300" />;
      case 'audio':
        return <Headphones className="h-6 w-6 text-purple-300" />;
      default:
        return <Cpu className="h-6 w-6 text-purple-300" />;
    }
  };

  const renderCapPills = (caps: DeviceCapabilities) => {
    const keys = (Object.keys(t.sxb.capsMap) as (keyof typeof t.sxb.capsMap)[]).filter(
      (k) => Boolean(caps[k as keyof DeviceCapabilities])
    );
    return keys.map((k) => (
      <span
        key={k}
        className="rounded-md border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[10px] font-medium text-purple-200"
      >
        {t.sxb.capsMap[k]}
      </span>
    ));
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-purple-500/20 bg-[#110e1c] p-5">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-purple-400" />
            <h2 className="text-sm font-bold tracking-[0.12em] text-white uppercase">
              {t.sxb.devicesTitle}
            </h2>
          </div>
          <p className="mt-1 text-xs text-zinc-400">{t.sxb.devicesSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onInstallPermissions}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-purple-500/30 bg-[#171326] px-3 py-2 text-xs font-semibold text-purple-200 transition hover:border-purple-400 hover:bg-purple-500/20"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t.sxb.setupPerm}
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={onRescan}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-3.5 py-2 text-xs font-bold text-white shadow-[0_0_20px_rgba(147,51,234,0.35)] transition hover:brightness-110 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {t.sxb.rescanHw}
          </button>
        </div>
      </div>

      {/* Discovered Peripheral Cards */}
      {devices.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-purple-500/25 bg-[#100d19] p-10 text-center text-xs text-zinc-400">
          <Keyboard className="mb-3 h-10 w-10 text-purple-400/60" />
          <p className="max-w-md">{t.sxb.noDevices}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-2">
          {devices.map((dev) => {
            const isSelected = dev.id === activeDeviceId;
            return (
              <div
                key={dev.id}
                onClick={() => onSelectDevice(dev.id)}
                className={`group flex cursor-pointer flex-col justify-between gap-3 rounded-2xl border p-4 transition ${
                  isSelected
                    ? 'border-purple-400 bg-gradient-to-br from-[#19132b] to-[#110e1c] shadow-[0_0_26px_rgba(147,51,234,0.22)]'
                    : 'border-purple-500/15 bg-[#110e1c] hover:border-purple-400/45 hover:bg-[#151123]'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-xl border ${
                        isSelected
                          ? 'border-purple-400/50 bg-purple-500/20'
                          : 'border-purple-500/20 bg-[#171326]'
                      }`}
                    >
                      {kindIcon(dev.device_kind)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          {dev.display_name}
                        </h3>
                        <span className="rounded bg-[#1a1529] px-1.5 py-0.5 font-mono text-[10px] text-purple-300">
                          {dev.vid_pid}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-400">
                        <span className="inline-flex items-center gap-1">
                          {linkIcon(dev.link)}
                          {linkLabel(dev.link)}
                        </span>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-zinc-500">
                          driver: {dev.driver_id}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${
                        dev.online
                          ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                          : 'border border-zinc-600/40 bg-zinc-800/60 text-zinc-400'
                      }`}
                    >
                      {dev.online ? t.sxb.online : t.sxb.standby}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.2 font-mono text-[9px] uppercase ${
                        dev.capabilities.writable
                          ? 'bg-purple-500/20 text-purple-200'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {dev.capabilities.writable ? t.sxb.writable : t.sxb.readOnly}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-zinc-400">
                  {dev.notes}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {renderCapPills(dev.capabilities)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-purple-500/10 pt-2.5">
                  <span className="font-mono text-[10px] text-zinc-500">
                    IF#{dev.interface_number} · UP 0x
                    {dev.usage_page.toString(16).padStart(4, '0')}
                    {!dev.permission_ok && ' · NO HID PERM'}
                  </span>

                  <div className="flex gap-1.5">
                    {dev.capabilities.rgb_effects && dev.capabilities.writable ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDevice(dev.id);
                            onOpenBoardStudio('rgb');
                          }}
                          className="cursor-pointer rounded-lg border border-purple-500/35 bg-purple-500/15 px-2.5 py-1 text-[11px] font-semibold text-purple-100 hover:bg-purple-600 hover:text-white"
                        >
                          {t.nav.rgb}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDevice(dev.id);
                            onOpenBoardStudio('keys');
                          }}
                          className="cursor-pointer rounded-lg bg-gradient-to-r from-purple-600 to-violet-600 px-3 py-1 text-[11px] font-bold text-white hover:brightness-110"
                        >
                          {t.sxb.openPanel}
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDevice(dev.id);
                          onOpenBoardStudio('sound');
                        }}
                        className="cursor-pointer rounded-lg border border-purple-500/30 bg-[#1a152a] px-3 py-1 text-[11px] font-semibold text-purple-200 hover:bg-purple-500/20"
                      >
                        {t.nav.sound}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
