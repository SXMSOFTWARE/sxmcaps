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
  Wifi,
} from 'lucide-react';

interface SxBoardDevicesPanelProps {
  devices: HardwareDeviceInfo[];
  activeDeviceId: string;
  scanning: boolean;
  onSelectDevice: (id: string) => void;
  onRescan: () => void;
  onInstallPermissions: () => void;
  onOpenBoardStudio: (tab: 'rgb' | 'keys' | 'macros' | 'keyboard' | 'mouse' | 'audio') => void;
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
        return <Wifi className="h-3.5 w-3.5 text-zinc-200" />;
      case 'bluetooth':
        return <Bluetooth className="h-3.5 w-3.5 text-zinc-300" />;
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

  const kindLabel = (kind: HardwareDeviceInfo['device_kind']) => {
    switch (kind) {
      case 'keyboard':
        return t.sxb.kindKeyboard;
      case 'mouse':
        return t.sxb.kindMouse;
      case 'headset':
        return t.sxb.kindHeadset;
      case 'audio':
        return t.sxb.kindAudio;
      default:
        return t.sxb.kindPeripheral;
    }
  };

  const kindIcon = (kind: HardwareDeviceInfo['device_kind'], selected: boolean) => {
    const cls = `h-5 w-5 ${selected ? 'text-black' : 'text-zinc-200'}`;
    switch (kind) {
      case 'keyboard':
        return <Keyboard className={cls} />;
      case 'mouse':
        return <Mouse className={cls} />;
      case 'headset':
      case 'audio':
        return <Headphones className={cls} />;
      default:
        return <Cpu className={cls} />;
    }
  };

  const renderCapPills = (caps: DeviceCapabilities) => {
    const keys = (Object.keys(t.sxb.capsMap) as (keyof typeof t.sxb.capsMap)[]).filter(
      (k) => Boolean(caps[k as keyof DeviceCapabilities])
    );
    return keys.map((k) => (
      <span
        key={k}
        className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-zinc-300"
      >
        {t.sxb.capsMap[k]}
      </span>
    ));
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto pr-1">
      {/* Header Banner */}
      <div className="sxm-card-elevated flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <h2 className="text-sm font-bold tracking-[0.1em] text-white uppercase">
            {t.sxb.devicesTitle}
          </h2>
          <p className="mt-1 text-xs text-zinc-400">{t.sxb.devicesSubtitle}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onInstallPermissions}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3.5 py-2 text-xs font-semibold text-zinc-200 transition hover:border-white/35 hover:text-white"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {t.sxb.setupPerm}
          </button>
          <button
            type="button"
            disabled={scanning}
            onClick={onRescan}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-black transition hover:bg-zinc-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {t.sxb.rescanHw}
          </button>
        </div>
      </div>

      {/* Discovered Peripheral Cards */}
      {devices.length === 0 ? (
        <div className="sxm-card flex flex-1 flex-col items-center justify-center border-dashed p-10 text-center text-xs text-zinc-500">
          <Keyboard className="mb-3 h-10 w-10 text-zinc-600" />
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
                    ? 'border-white/45 bg-[#151519]'
                    : 'border-white/8 bg-[#111114] hover:border-white/25'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${
                        isSelected
                          ? 'border-white bg-white'
                          : 'border-white/12 bg-[#0b0b0d]'
                      }`}
                    >
                      {kindIcon(dev.device_kind, isSelected)}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          {dev.display_name}
                        </h3>
                        <span className="rounded-full border border-white/10 bg-[#0b0b0d] px-2 py-0.5 text-[10px] font-semibold text-zinc-300 uppercase">
                          {kindLabel(dev.device_kind)}
                        </span>
                        <span className="rounded bg-[#0b0b0d] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
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
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider uppercase ${
                        dev.online
                          ? 'border border-emerald-400/35 bg-emerald-400/10 text-emerald-300'
                          : 'border border-zinc-700 bg-zinc-800/60 text-zinc-400'
                      }`}
                    >
                      {dev.online ? t.sxb.online : t.sxb.standby}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[9px] uppercase ${
                        dev.capabilities.communication_supported
                          ? 'bg-white text-black font-bold'
                          : 'border border-amber-400/25 bg-amber-400/10 text-amber-200'
                      }`}
                    >
                      {dev.capabilities.communication_supported ? t.sxb.writable : t.sxb.readOnly}
                    </span>
                  </div>
                </div>

                <p className="text-[11px] leading-relaxed text-zinc-400">
                  {dev.notes}
                </p>

                <div className="flex flex-wrap gap-1.5">
                  {renderCapPills(dev.capabilities)}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/8 pt-2.5">
                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                    IF#{dev.interface_number} · UP 0x
                    {dev.usage_page.toString(16).padStart(4, '0')}
                    {!dev.permission_ok && ' · NO HID PERM'}
                  </span>

                  <div className="flex gap-1.5">
                    {dev.capabilities.communication_supported ? (
                      <>
                        {dev.device_kind === 'keyboard' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSelectDevice(dev.id);
                              onOpenBoardStudio('rgb');
                            }}
                            className="cursor-pointer rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white/15"
                          >
                            {t.nav.rgb}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectDevice(dev.id);
                            onOpenBoardStudio('keys');
                          }}
                          className="cursor-pointer rounded-full bg-white px-3 py-1 text-[11px] font-bold text-black hover:bg-zinc-200"
                        >
                          {t.sxb.openPanel}
                        </button>
                      </>
                    ) : dev.device_kind === 'mouse' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDevice(dev.id);
                          onOpenBoardStudio('mouse');
                        }}
                        className="cursor-pointer rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black"
                      >
                        {t.nav.mouse}
                      </button>
                    ) : dev.device_kind === 'headset' || dev.device_kind === 'audio' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDevice(dev.id);
                          onOpenBoardStudio('audio');
                        }}
                        className="cursor-pointer rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black"
                      >
                        {t.nav.audio}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectDevice(dev.id);
                          onOpenBoardStudio('keyboard');
                        }}
                        className="cursor-pointer rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-semibold text-white hover:bg-white hover:text-black"
                      >
                        {t.nav.keyboard}
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
