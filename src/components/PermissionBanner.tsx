import React, { useState } from 'react';
import { InputStatus } from '../types';
import { useI18n } from '../i18n';
import { AlertCircle, Check, Copy, RefreshCw, ShieldCheck } from 'lucide-react';

interface PermissionBannerProps {
  status: InputStatus;
  onEnableUdev: () => Promise<void>;
  onRescan: () => Promise<void>;
}

export const PermissionBanner: React.FC<PermissionBannerProps> = ({
  status,
  onEnableUdev,
  onRescan,
}) => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (status.has_permission && status.active_devices.length > 0) {
    return null;
  }

  const manualCmd = 'sudo usermod -aG input $USER';

  const handleEnable = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await onEnableUdev();
    } catch (err) {
      setErrorMsg(String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(manualCmd);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="rounded-xl border border-purple-500/30 bg-[#130f22] px-4 py-3 text-xs text-zinc-200 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
          <div className="space-y-0.5">
            <div className="font-semibold text-white">
              {t.banner.title(status.desktop || 'Wayland')}
            </div>
            <p className="max-w-2xl text-[11px] leading-relaxed text-zinc-400">
              {t.banner.body}
            </p>
            {errorMsg && (
              <p className="text-[11px] text-rose-300 underline decoration-rose-400/40">
                {t.banner.errorPrefix}: {errorMsg}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleEnable}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-semibold text-white shadow-[0_0_12px_rgba(147,51,234,0.4)] transition hover:bg-purple-500 disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {busy ? t.banner.enabling : t.banner.enableBtn}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-purple-500/20 bg-[#0a0812] px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:border-purple-400/50 hover:text-white"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {manualCmd}
          </button>

          <button
            type="button"
            onClick={onRescan}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-purple-500/20 bg-purple-500/10 px-2.5 py-1.5 text-xs text-purple-100 hover:bg-purple-500/20"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.banner.refresh}
          </button>
        </div>
      </div>
    </div>
  );
};
