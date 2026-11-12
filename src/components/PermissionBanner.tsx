import React, { useState } from 'react';
import { InputStatus } from '../types';
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
    <div className="rounded-xl border border-white/25 bg-[#0e0e11] px-4 py-3 text-xs text-zinc-200 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-white" />
          <div className="space-y-0.5">
            <div className="font-semibold text-white">
              Arka Plan (Global) Dinleme İzni Gerekli — {status.desktop || 'Wayland'}
            </div>
            <p className="max-w-2xl text-[11px] leading-relaxed text-zinc-400">
              Başka uygulamalarda yazarken ve fareye tıklarken seslerin çalması için{' '}
              <code className="rounded bg-white/10 px-1 text-zinc-200">/dev/input/event*</code>{' '}
              izni gereklidir. Tek tıkla <code className="rounded bg-white/10 px-1 text-zinc-200">udev</code> kuralı ekleyebilirsiniz.
            </p>
            {errorMsg && (
              <p className="text-[11px] text-zinc-300 underline decoration-white/40">
                Hata: {errorMsg}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={handleEnable}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            {busy ? 'Yetki Veriliyor...' : 'Global Dinlemeyi Etkinleştir'}
          </button>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-black/50 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 hover:border-white/30 hover:text-white"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-white" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
            {manualCmd}
          </button>

          <button
            type="button"
            onClick={onRescan}
            className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/[0.04] px-2.5 py-1.5 text-xs text-zinc-200 hover:bg-white/10"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </button>
        </div>
      </div>
    </div>
  );
};
