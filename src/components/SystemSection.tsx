import React, { useState } from 'react';
import {
  ActiveWindowInfo,
  AppProfileRule,
  AppSettings,
  InputStatus,
  SoundpackInfo,
  UpdateCheckResult,
} from '../types';
import { detectSystemLanguage, useI18n } from '../i18n';
import {
  AppWindow,
  CheckCircle2,
  Cpu,
  FolderOpen,
  FolderUp,
  HardDrive,
  Languages,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from 'lucide-react';

interface SystemSectionProps {
  settings: AppSettings;
  soundpacks: SoundpackInfo[];
  inputStatus: InputStatus;
  activeWindow: ActiveWindowInfo | null;
  soundpacksDir: string;
  appVersion: string;
  onUpdateSettings: (next: AppSettings) => void;
  onEnableUdev: () => Promise<void>;
  onRescanInput: () => Promise<void>;
  onImportZip: () => void;
  onImportFolder: () => void;
  onOpenFolder: () => void;
  onCheckUpdate: () => Promise<UpdateCheckResult>;
}

export const SystemSection: React.FC<SystemSectionProps> = ({
  settings,
  soundpacks,
  inputStatus,
  activeWindow,
  soundpacksDir,
  appVersion,
  onUpdateSettings,
  onEnableUdev,
  onRescanInput,
  onImportZip,
  onImportFolder,
  onOpenFolder,
  onCheckUpdate,
}) => {
  const { t } = useI18n();
  const detectedSys = detectSystemLanguage();
  const [busy, setBusy] = useState(false);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [rulePattern, setRulePattern] = useState('');
  const [ruleName, setRuleName] = useState('');
  const [rulePackId, setRulePackId] = useState(
    settings.active_keyboard_pack || 'cherrymx-brown-pbt'
  );
  const [ruleMute, setRuleMute] = useState(false);

  const keyboardPacks = soundpacks.filter((p) => p.device_type !== 'mouse');
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

  const handleAddRule = () => {
    const pat = rulePattern.trim();
    if (!pat) return;
    const newRule: AppProfileRule = {
      id: `rule-${Date.now()}`,
      name: ruleName.trim() || pat,
      pattern: pat,
      pack_id: rulePackId,
      mute: ruleMute,
      enabled: true,
    };
    onUpdateSettings({
      ...settings,
      profiles_enabled: true,
      app_profiles: [...settings.app_profiles, newRule],
    });
    setRulePattern('');
    setRuleName('');
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    try {
      const res = await onCheckUpdate();
      setUpdateInfo(res);
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="grid h-full grid-cols-1 gap-3.5 overflow-y-auto lg:grid-cols-12">
      {/* Left: App Profiles (Per-Application Rules) */}
      <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4 lg:col-span-6">
        <div className="flex items-center justify-between border-b border-white/[0.07] pb-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
            <AppWindow className="h-3.5 w-3.5 text-white" />
            {t.system.profilesTitle}
          </div>

          <button
            type="button"
            onClick={() =>
              onUpdateSettings({
                ...settings,
                profiles_enabled: !settings.profiles_enabled,
              })
            }
            className={`relative h-5 w-10 cursor-pointer rounded-full border transition ${
              settings.profiles_enabled
                ? 'border-white bg-white'
                : 'border-white/20 bg-[#18181d]'
            }`}
          >
            <span
              className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                settings.profiles_enabled
                  ? 'translate-x-5 bg-black'
                  : 'translate-x-0.5 bg-zinc-400'
              }`}
            />
          </button>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#060608] px-3 py-2 text-[11px]">
          <span className="truncate text-zinc-400">
            {t.system.activeWindow}:{' '}
            <strong className="font-mono text-white">
              {activeWindow?.app_class ||
                activeWindow?.title ||
                t.system.detecting}
            </strong>
          </span>
          {activeWindow?.app_class && (
            <button
              type="button"
              onClick={() => {
                setRulePattern(activeWindow.app_class);
                setRuleName(activeWindow.app_class);
              }}
              className="shrink-0 cursor-pointer rounded border border-white/15 bg-white/[0.06] px-2 py-0.5 text-[10px] text-white hover:bg-white hover:text-black"
            >
              {t.system.useWindow}
            </button>
          )}
        </div>

        {/* Add Profile Rule Form */}
        <div className="space-y-2 rounded-xl border border-white/[0.08] bg-[#060608] p-3">
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={rulePattern}
              onChange={(e) => setRulePattern(e.target.value)}
              placeholder={t.system.patternPlaceholder}
              className="rounded-lg border border-white/15 bg-[#121216] px-2.5 py-1.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-white"
            />
            <select
              value={ruleMute ? '__MUTE__' : rulePackId}
              onChange={(e) => {
                if (e.target.value === '__MUTE__') {
                  setRuleMute(true);
                } else {
                  setRuleMute(false);
                  setRulePackId(e.target.value);
                }
              }}
              className="cursor-pointer rounded-lg border border-white/15 bg-[#121216] px-2.5 py-1.5 text-xs text-white outline-none focus:border-white"
            >
              <option value="__MUTE__">{t.system.autoMute}</option>
              {keyboardPacks.map((p) => (
                <option key={p.id} value={p.id}>
                  Switch: {p.name}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            disabled={!rulePattern.trim()}
            onClick={handleAddRule}
            className="inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            {t.system.addRule}
          </button>
        </div>

        {/* Rules List */}
        <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
          {settings.app_profiles.length === 0 ? (
            <div className="py-5 text-center text-[11px] text-zinc-500">
              {t.system.noRules}
            </div>
          ) : (
            settings.app_profiles.map((rule) => (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#111115] px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono font-semibold text-white">
                    {rule.pattern}
                  </div>
                  <div className="text-[10px] text-zinc-400">
                    {rule.mute
                      ? t.system.autoMute
                      : `Switch: ${
                          keyboardPacks.find((p) => p.id === rule.pack_id)
                            ?.name ?? rule.pack_id
                        }`}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        app_profiles: settings.app_profiles.map((r) =>
                          r.id === rule.id ? { ...r, enabled: !r.enabled } : r
                        ),
                      })
                    }
                    className={`cursor-pointer rounded border px-2 py-0.5 text-[10px] font-medium ${
                      rule.enabled
                        ? 'border-white bg-white text-black'
                        : 'border-white/20 text-zinc-400'
                    }`}
                  >
                    {rule.enabled ? t.system.active : t.system.paused}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateSettings({
                        ...settings,
                        app_profiles: settings.app_profiles.filter(
                          (r) => r.id !== rule.id
                        ),
                      })
                    }
                    className="cursor-pointer rounded p-1 text-zinc-500 hover:bg-white/10 hover:text-white"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: Hardware Permissions, Language, Autostart, Import & Updater */}
      <div className="flex flex-col gap-3 lg:col-span-6">
        {/* Global Input, Language & Autostart */}
        <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
              <Cpu className="h-3.5 w-3.5 text-white" />
              {t.system.hwTitle}
            </div>
            <button
              type="button"
              onClick={onRescanInput}
              className="inline-flex cursor-pointer items-center gap-1 rounded border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" />
              {t.system.refresh}
            </button>
          </div>

          <div className="rounded-xl border border-white/[0.08] bg-[#060608] p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold text-white">
                  {isGlobalActive
                    ? t.system.globalListening(inputStatus.active_devices.length)
                    : t.system.waitingPerm}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {inputStatus.desktop || 'OS'} ({inputStatus.session_type})
                </div>
              </div>
              {isGlobalActive ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-black">
                  <CheckCircle2 className="h-3 w-3" />
                  {t.system.connected}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleUdev}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-semibold text-black hover:bg-zinc-200 disabled:opacity-50"
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {busy ? t.system.applying : t.system.grantPerm}
                </button>
              )}
            </div>

            {inputStatus.active_devices.length > 0 && (
              <div className="mt-2 flex max-h-16 flex-wrap gap-1 overflow-y-auto border-t border-white/[0.06] pt-2">
                {inputStatus.active_devices.map((dev, i) => (
                  <span
                    key={`${dev}-${i}`}
                    className="rounded border border-white/10 bg-[#121216] px-1.5 py-0.5 font-mono text-[9px] text-zinc-300"
                  >
                    {dev}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Language Selector (Auto / TR / EN) */}
          <div className="flex items-center justify-between gap-2 rounded-xl border border-white/[0.08] bg-[#060608] p-2.5">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-zinc-300" />
              <span className="text-[11px] font-medium text-white">
                {t.system.language}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#111115] p-0.5">
              {(
                [
                  { id: 'auto', label: t.system.langAuto(detectedSys) },
                  { id: 'tr', label: 'Türkçe' },
                  { id: 'en', label: 'English' },
                ] as const
              ).map((opt) => {
                const active = (settings.language || 'auto') === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, language: opt.id })
                    }
                    className={`cursor-pointer rounded-md px-2 py-1 text-[10px] font-semibold transition ${
                      active
                        ? 'bg-white text-black'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060608] p-2.5">
              <div>
                <div className="text-[11px] font-medium text-white">
                  {t.system.autostart}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {t.system.autostartDesc}
                </div>
              </div>
              <button
                type="button"
                onClick={() =>
                  onUpdateSettings({
                    ...settings,
                    autostart: !settings.autostart,
                  })
                }
                className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border transition ${
                  settings.autostart
                    ? 'border-white bg-white'
                    : 'border-white/20 bg-[#18181d]'
                }`}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.autostart
                      ? 'translate-x-4.5 bg-black'
                      : 'translate-x-0.5 bg-zinc-400'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-[#060608] p-2.5">
              <div>
                <div className="text-[11px] font-medium text-white">
                  {t.system.tray}
                </div>
                <div className="text-[10px] text-zinc-500">
                  {t.system.trayDesc}
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
                className={`relative h-5 w-9 shrink-0 cursor-pointer rounded-full border transition ${
                  settings.minimize_to_tray
                    ? 'border-white bg-white'
                    : 'border-white/20 bg-[#18181d]'
                }`}
              >
                <span
                  className={`block h-3.5 w-3.5 rounded-full transition-transform ${
                    settings.minimize_to_tray
                      ? 'translate-x-4.5 bg-black'
                      : 'translate-x-0.5 bg-zinc-400'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>

        {/* Importer & Release Update Check */}
        <div className="flex flex-1 flex-col justify-between gap-2.5 rounded-2xl border border-white/10 bg-[#0b0b0e] p-4">
          <div className="flex items-center justify-between border-b border-white/[0.07] pb-2">
            <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-zinc-300 uppercase">
              <HardDrive className="h-3.5 w-3.5 text-white" />
              {t.system.importerTitle} ({appVersion})
            </div>

            <button
              type="button"
              disabled={checkingUpdate}
              onClick={handleCheckUpdate}
              className="cursor-pointer rounded border border-white/15 bg-white/[0.04] px-2 py-0.5 text-[10px] text-zinc-200 hover:bg-white hover:text-black disabled:opacity-50"
            >
              {checkingUpdate ? t.system.checking : t.system.checkUpdate}
            </button>
          </div>

          {updateInfo && (
            <div className="rounded-lg border border-white/15 bg-[#060608] px-3 py-2 text-[11px]">
              {updateInfo.has_update ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-white">
                    {t.system.newVersion}{' '}
                    <strong>{updateInfo.latest_version}</strong>
                  </span>
                  <a
                    href={updateInfo.release_url}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-black"
                  >
                    {t.system.download}
                  </a>
                </div>
              ) : (
                <span className="text-zinc-400">
                  {t.system.upToDate(
                    updateInfo.current_version,
                    updateInfo.latest_version
                  )}
                </span>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={onImportZip}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-white px-2.5 py-2 text-xs font-semibold text-black transition hover:bg-zinc-200"
            >
              <Plus className="h-3.5 w-3.5" />
              {t.system.addZip}
            </button>
            <button
              type="button"
              onClick={onImportFolder}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/20 bg-[#121216] px-2.5 py-2 text-xs font-semibold text-white transition hover:border-white hover:bg-white/10"
            >
              <FolderUp className="h-3.5 w-3.5" />
              {t.system.folder}
            </button>
            <button
              type="button"
              onClick={onOpenFolder}
              title={soundpacksDir}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-[#060608] px-2.5 py-2 text-xs text-zinc-200 transition hover:border-white"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {t.system.openDir}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
