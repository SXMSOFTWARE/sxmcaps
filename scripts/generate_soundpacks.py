#!/usr/bin/env python3
"""Generate realistic, multi-layered mechanical switch & mouse soundpacks for sxmcaps."""

import json
import math
import os
import struct
import wave
from pathlib import Path
import numpy as np

SAMPLE_RATE = 44100


def biquad_bandpass(signal: np.ndarray, freq: float, q: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Apply a resonant biquad bandpass filter."""
    w0 = 2.0 * math.pi * min(freq, sr * 0.45) / sr
    alpha = math.sin(w0) / (2.0 * max(q, 0.1))
    b0 = alpha
    b1 = 0.0
    b2 = -alpha
    a0 = 1.0 + alpha
    a1 = -2.0 * math.cos(w0)
    a2 = 1.0 - alpha

    b0 /= a0
    b2 /= a0
    a1 /= a0
    a2 /= a0

    out = np.zeros_like(signal)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(signal)):
        x0 = float(signal[i])
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = y0
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def biquad_lowpass(signal: np.ndarray, freq: float, q: float = 0.707, sr: int = SAMPLE_RATE) -> np.ndarray:
    """Apply a biquad lowpass filter."""
    w0 = 2.0 * math.pi * min(freq, sr * 0.45) / sr
    cos_w0 = math.cos(w0)
    alpha = math.sin(w0) / (2.0 * max(q, 0.1))
    b0 = (1.0 - cos_w0) * 0.5
    b1 = 1.0 - cos_w0
    b2 = (1.0 - cos_w0) * 0.5
    a0 = 1.0 + alpha
    a1 = -2.0 * cos_w0
    a2 = 1.0 - alpha

    b0 /= a0
    b1 /= a0
    b2 /= a0
    a1 /= a0
    a2 /= a0

    out = np.zeros_like(signal)
    x1 = x2 = y1 = y2 = 0.0
    for i in range(len(signal)):
        x0 = float(signal[i])
        y0 = b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        out[i] = y0
        x2, x1 = x1, x0
        y2, y1 = y1, y0
    return out


def write_wav(path: Path, samples: np.ndarray) -> None:
    """Write normalized mono float32 array to 16-bit PCM WAV."""
    peak = float(np.max(np.abs(samples)))
    if peak > 0.92:
        samples = samples * (0.92 / peak)
    clipped = np.clip(samples, -1.0, 1.0)
    pcm = (clipped * 32767.0).astype(np.int16)
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())


def synth_switch_hit(
    rng: np.random.Generator,
    *,
    duration_ms: float = 95.0,
    body_freq: float = 220.0,
    body_decay_ms: float = 16.0,
    body_amp: float = 0.70,
    clack_freq: float = 1350.0,
    clack_q: float = 2.2,
    clack_decay_ms: float = 7.5,
    clack_amp: float = 0.65,
    click_freq: float = 0.0,
    click_amp: float = 0.0,
    click_offset_ms: float = 0.0,
    impact_offset_ms: float = 3.5,
    ping_freq: float = 0.0,
    ping_amp: float = 0.0,
    ping_decay_ms: float = 55.0,
    cavity_freq: float = 420.0,
    cavity_amp: float = 0.25,
    lpf_cutoff: float = 9500.0,
    stab_rattle: float = 0.0,
) -> np.ndarray:
    """Synthesize a physical-modeled keystroke transient."""
    n = int(SAMPLE_RATE * duration_ms / 1000.0)
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    out = np.zeros(n, dtype=np.float64)

    # 1. Pre-travel tactile / click jacket transient
    if click_amp > 0.0 and click_freq > 0.0:
        off = int(SAMPLE_RATE * click_offset_ms / 1000.0)
        tc = np.maximum(0.0, t - click_offset_ms / 1000.0)
        mask = (np.arange(n) >= off).astype(np.float64)
        noise = rng.standard_normal(n)
        click_bp = biquad_bandpass(noise, click_freq, 3.8)
        env = np.exp(-tc / 0.0018) * mask
        impulse = np.sin(2.0 * math.pi * click_freq * tc) * np.exp(-tc / 0.0012) * mask
        out += click_amp * (0.65 * click_bp * env + 0.45 * impulse)

    # 2. Main bottom-out impact (thock body + stem clack)
    imp_s = impact_offset_ms / 1000.0
    imp_idx = int(SAMPLE_RATE * imp_s)
    ti = np.maximum(0.0, t - imp_s)
    mask_i = (np.arange(n) >= imp_idx).astype(np.float64)

    # Pitch-drop thump for authentic plastic-on-plate impact
    pitch_sweep = body_freq * (1.0 + 0.9 * np.exp(-ti / 0.0035))
    phase = 2.0 * math.pi * np.cumsum(pitch_sweep) / SAMPLE_RATE
    body_wave = np.sin(phase) * np.exp(-ti / (body_decay_ms / 1000.0)) * mask_i
    out += body_amp * body_wave

    # Keycap cavity mode
    if cavity_amp > 0.0:
        cav_noise = biquad_bandpass(rng.standard_normal(n), cavity_freq, 4.0)
        cav_wave = np.sin(2.0 * math.pi * cavity_freq * ti) * 0.5 + cav_noise * 0.8
        out += cavity_amp * cav_wave * np.exp(-ti / 0.018) * mask_i

    # Crisp clack burst
    clack_noise = biquad_bandpass(rng.standard_normal(n), clack_freq, clack_q)
    clack_env = np.exp(-ti / (clack_decay_ms / 1000.0)) * mask_i
    # Add micro attack transient
    attack = np.minimum(1.0, ti / 0.0005)
    out += clack_amp * clack_noise * clack_env * attack

    # 3. Optional spring ping
    if ping_amp > 0.0 and ping_freq > 0.0:
        ping = (
            np.sin(2.0 * math.pi * ping_freq * ti)
            + 0.4 * np.sin(2.0 * math.pi * ping_freq * 1.48 * ti)
        ) * np.exp(-ti / (ping_decay_ms / 1000.0)) * mask_i
        out += ping_amp * ping

    # 4. Optional stabilizer wire micro-rattle (for Space/Enter)
    if stab_rattle > 0.0:
        r_s = imp_s + 0.0028
        tr = np.maximum(0.0, t - r_s)
        mask_r = (t >= r_s).astype(np.float64)
        rattle = biquad_bandpass(rng.standard_normal(n), clack_freq * 1.35, 3.2)
        out += stab_rattle * rattle * np.exp(-tr / 0.0055) * mask_r

    out = biquad_lowpass(out, lpf_cutoff, 0.75)

    # Smooth fade out at end of buffer to prevent clicks
    fade_len = min(220, n // 4)
    if fade_len > 0:
        out[-fade_len:] *= np.linspace(1.0, 0.0, fade_len)
    return out


def synth_mouse_click(rng: np.random.Generator, *, bright: float = 1.0, amp: float = 0.85, is_up: bool = False) -> np.ndarray:
    """Synthesize a crisp Omron-style or silent tactile mouse microswitch click."""
    dur = 38.0 if not is_up else 30.0
    n = int(SAMPLE_RATE * dur / 1000.0)
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    noise = rng.standard_normal(n)

    hi_freq = (3600.0 if not is_up else 2900.0) * bright
    lo_freq = (680.0 if not is_up else 520.0) * (0.7 + 0.3 * bright)

    snap = biquad_bandpass(noise, hi_freq, 3.5) * np.exp(-t / 0.0018)
    shell = np.sin(2.0 * math.pi * lo_freq * t) * np.exp(-t / 0.005)
    body = biquad_bandpass(rng.standard_normal(n), 1450.0 * bright, 2.0) * np.exp(-t / 0.0032)

    out = amp * (0.75 * snap + 0.40 * shell + 0.45 * body)
    out = biquad_lowpass(out, 9000.0 * max(0.35, bright), 0.75)
    fade = min(150, n // 4)
    out[-fade:] *= np.linspace(1.0, 0.0, fade)
    return out


KEYBOARD_PACKS = [
    {
        "id": "cherry-mx-blue",
        "name": "Cherry MX Blue",
        "tag": "Clicky",
        "accent": "#38bdf8",
        "description": "Keskin click-jacket çıtırtısı ve parlak mekanik tepki",
        "down": dict(
            body_freq=250.0, body_decay_ms=14.0, body_amp=0.55,
            clack_freq=1750.0, clack_q=2.4, clack_decay_ms=6.5, clack_amp=0.72,
            click_freq=4100.0, click_amp=0.95, click_offset_ms=0.6, impact_offset_ms=3.6,
            ping_freq=2700.0, ping_amp=0.04, ping_decay_ms=42.0,
            cavity_freq=520.0, cavity_amp=0.22, lpf_cutoff=11000.0,
        ),
        "up": dict(
            body_freq=340.0, body_decay_ms=9.0, body_amp=0.25,
            clack_freq=2200.0, clack_q=2.6, clack_decay_ms=4.5, clack_amp=0.38,
            click_freq=3500.0, click_amp=0.42, click_offset_ms=0.4, impact_offset_ms=2.2,
            cavity_freq=610.0, cavity_amp=0.10, lpf_cutoff=10500.0,
        ),
    },
    {
        "id": "cherry-mx-red",
        "name": "Cherry MX Red",
        "tag": "Linear",
        "accent": "#f43f5e",
        "description": "Akıcı, hafif ve temiz lineer bottom-out sesi",
        "down": dict(
            body_freq=265.0, body_decay_ms=13.5, body_amp=0.62,
            clack_freq=1450.0, clack_q=2.0, clack_decay_ms=7.0, clack_amp=0.72,
            click_freq=0.0, click_amp=0.0, impact_offset_ms=1.0,
            cavity_freq=460.0, cavity_amp=0.24, lpf_cutoff=9200.0,
        ),
        "up": dict(
            body_freq=330.0, body_decay_ms=9.0, body_amp=0.26,
            clack_freq=1850.0, clack_q=2.2, clack_decay_ms=5.0, clack_amp=0.34,
            impact_offset_ms=0.8, cavity_freq=540.0, cavity_amp=0.12, lpf_cutoff=8800.0,
        ),
    },
    {
        "id": "cherry-mx-brown",
        "name": "Cherry MX Brown",
        "tag": "Tactile",
        "accent": "#d97706",
        "description": "Yumuşak dokunsal tümsek ve dengeli sıcak clack",
        "down": dict(
            body_freq=225.0, body_decay_ms=15.0, body_amp=0.68,
            clack_freq=1220.0, clack_q=2.1, clack_decay_ms=7.5, clack_amp=0.64,
            click_freq=2100.0, click_amp=0.22, click_offset_ms=0.8, impact_offset_ms=3.2,
            cavity_freq=390.0, cavity_amp=0.26, lpf_cutoff=7800.0,
        ),
        "up": dict(
            body_freq=290.0, body_decay_ms=10.0, body_amp=0.28,
            clack_freq=1550.0, clack_q=2.2, clack_decay_ms=5.2, clack_amp=0.32,
            impact_offset_ms=1.0, cavity_freq=470.0, cavity_amp=0.11, lpf_cutoff=7600.0,
        ),
    },
    {
        "id": "cherry-mx-black",
        "name": "Cherry MX Black",
        "tag": "Linear",
        "accent": "#a1a1aa",
        "description": "Ağır yaylı, tok ve derin lineer darbe karakteri",
        "down": dict(
            body_freq=185.0, body_decay_ms=17.5, body_amp=0.80,
            clack_freq=980.0, clack_q=1.8, clack_decay_ms=8.5, clack_amp=0.58,
            impact_offset_ms=1.0, cavity_freq=320.0, cavity_amp=0.28, lpf_cutoff=6500.0,
        ),
        "up": dict(
            body_freq=245.0, body_decay_ms=11.0, body_amp=0.32,
            clack_freq=1250.0, clack_q=2.0, clack_decay_ms=5.8, clack_amp=0.30,
            impact_offset_ms=0.8, cavity_freq=390.0, cavity_amp=0.12, lpf_cutoff=6500.0,
        ),
    },
    {
        "id": "holy-panda",
        "name": "Holy Panda",
        "tag": "Thocky",
        "accent": "#fb923c",
        "description": "Uzun gövdeli POM ses, dolgun ve tok tactile 'thock'",
        "down": dict(
            body_freq=170.0, body_decay_ms=19.0, body_amp=0.86,
            clack_freq=1520.0, clack_q=2.5, clack_decay_ms=6.5, clack_amp=0.76,
            click_freq=2450.0, click_amp=0.34, click_offset_ms=0.7, impact_offset_ms=2.8,
            cavity_freq=335.0, cavity_amp=0.36, lpf_cutoff=7400.0,
        ),
        "up": dict(
            body_freq=235.0, body_decay_ms=11.5, body_amp=0.34,
            clack_freq=1400.0, clack_q=2.3, clack_decay_ms=5.0, clack_amp=0.34,
            impact_offset_ms=0.9, cavity_freq=410.0, cavity_amp=0.15, lpf_cutoff=7000.0,
        ),
    },
    {
        "id": "gateron-oil-king",
        "name": "Gateron Oil King",
        "tag": "Thocky",
        "accent": "#a855f7",
        "description": "Yağlanmış kremsi hissiyat, ultra derin bass ağırlıklı thock",
        "down": dict(
            body_freq=140.0, body_decay_ms=21.0, body_amp=0.92,
            clack_freq=780.0, clack_q=1.7, clack_decay_ms=9.0, clack_amp=0.52,
            impact_offset_ms=1.0, cavity_freq=260.0, cavity_amp=0.35, lpf_cutoff=4800.0,
        ),
        "up": dict(
            body_freq=195.0, body_decay_ms=12.0, body_amp=0.30,
            clack_freq=920.0, clack_q=1.9, clack_decay_ms=5.8, clack_amp=0.24,
            impact_offset_ms=0.8, cavity_freq=310.0, cavity_amp=0.14, lpf_cutoff=4600.0,
        ),
    },
    {
        "id": "topre-45g",
        "name": "Topre 45g",
        "tag": "Electro-Capacitive",
        "accent": "#2dd4bf",
        "description": "Klasik HHKB/Realforce kauçuk kubbe 'thocc' karakteri",
        "down": dict(
            body_freq=152.0, body_decay_ms=20.0, body_amp=0.90,
            clack_freq=640.0, clack_q=1.5, clack_decay_ms=9.5, clack_amp=0.45,
            impact_offset_ms=1.2, cavity_freq=285.0, cavity_amp=0.30, lpf_cutoff=3900.0,
        ),
        "up": dict(
            body_freq=210.0, body_decay_ms=11.0, body_amp=0.28,
            clack_freq=780.0, clack_q=1.6, clack_decay_ms=6.0, clack_amp=0.20,
            impact_offset_ms=0.8, cavity_freq=320.0, cavity_amp=0.10, lpf_cutoff=3800.0,
        ),
    },
    {
        "id": "ibm-model-m",
        "name": "IBM Model M",
        "tag": "Buckling Spring",
        "accent": "#eab308",
        "description": "Efsanevi bükülen yay metalik tınısı ve ağır kasa sesi",
        "down": dict(
            body_freq=210.0, body_decay_ms=18.0, body_amp=0.72,
            clack_freq=1650.0, clack_q=2.3, clack_decay_ms=7.0, clack_amp=0.75,
            click_freq=3200.0, click_amp=0.88, click_offset_ms=0.8, impact_offset_ms=3.4,
            ping_freq=2350.0, ping_amp=0.11, ping_decay_ms=68.0,
            cavity_freq=410.0, cavity_amp=0.30, lpf_cutoff=10000.0,
        ),
        "up": dict(
            body_freq=280.0, body_decay_ms=11.0, body_amp=0.28,
            clack_freq=1850.0, clack_q=2.2, clack_decay_ms=5.0, clack_amp=0.32,
            ping_freq=2400.0, ping_amp=0.05, ping_decay_ms=35.0,
            impact_offset_ms=1.0, cavity_freq=460.0, cavity_amp=0.12, lpf_cutoff=9500.0,
        ),
    },
]


def build_keyboard_pack(base_dir: Path, spec: dict, seed_idx: int) -> None:
    pack_dir = base_dir / spec["id"]
    pack_dir.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1000 + seed_idx * 97)

    # Normal keys: 4 down variations, 3 up variations
    for i in range(4):
        p = dict(spec["down"])
        p["body_freq"] *= rng.uniform(0.95, 1.05)
        p["clack_freq"] *= rng.uniform(0.94, 1.06)
        if p.get("click_freq", 0) > 0:
            p["click_freq"] *= rng.uniform(0.96, 1.04)
        samples = synth_switch_hit(rng, **p)
        write_wav(pack_dir / f"normal_down_{i}.wav", samples)

    for i in range(3):
        p = dict(spec["up"])
        p["body_freq"] *= rng.uniform(0.95, 1.05)
        p["clack_freq"] *= rng.uniform(0.94, 1.06)
        samples = synth_switch_hit(rng, **p)
        write_wav(pack_dir / f"normal_up_{i}.wav", samples)

    # Spacebar (deeper resonant cavity + subtle stab rattle)
    for i in range(2):
        p = dict(spec["down"])
        p["body_freq"] *= 0.72 * rng.uniform(0.97, 1.03)
        p["clack_freq"] *= 0.78
        p["cavity_freq"] *= 0.68
        p["body_decay_ms"] *= 1.35
        p["body_amp"] *= 1.15
        p["stab_rattle"] = 0.22
        write_wav(pack_dir / f"space_down_{i}.wav", synth_switch_hit(rng, **p))

    p_su = dict(spec["up"])
    p_su["body_freq"] *= 0.75
    p_su["clack_freq"] *= 0.80
    p_su["stab_rattle"] = 0.12
    write_wav(pack_dir / "space_up_0.wav", synth_switch_hit(rng, **p_su))

    # Enter / Backspace (stabilized)
    p_ed = dict(spec["down"])
    p_ed["body_freq"] *= 0.82
    p_ed["clack_freq"] *= 0.88
    p_ed["cavity_freq"] *= 0.78
    p_ed["stab_rattle"] = 0.14
    write_wav(pack_dir / "enter_down_0.wav", synth_switch_hit(rng, **p_ed))

    p_eu = dict(spec["up"])
    p_eu["body_freq"] *= 0.84
    p_eu["stab_rattle"] = 0.08
    write_wav(pack_dir / "enter_up_0.wav", synth_switch_hit(rng, **p_eu))

    # Modifiers (Shift, Ctrl, Alt, Tab, Caps)
    p_md = dict(spec["down"])
    p_md["body_freq"] *= 0.90
    p_md["clack_freq"] *= 0.92
    p_md["stab_rattle"] = 0.07
    write_wav(pack_dir / "mod_down_0.wav", synth_switch_hit(rng, **p_md))

    p_mu = dict(spec["up"])
    p_mu["body_freq"] *= 0.92
    write_wav(pack_dir / "mod_up_0.wav", synth_switch_hit(rng, **p_mu))

    config = {
        "config_version": "2",
        "id": spec["id"],
        "name": spec["name"],
        "description": spec["description"],
        "tag": spec["tag"],
        "accent": spec["accent"],
        "device_type": "keyboard",
        "author": "sxmcaps",
        "sxmcaps_variants": {
            "normal_down": [f"normal_down_{i}.wav" for i in range(4)],
            "normal_up": [f"normal_up_{i}.wav" for i in range(3)],
            "space_down": ["space_down_0.wav", "space_down_1.wav"],
            "space_up": ["space_up_0.wav"],
            "enter_down": ["enter_down_0.wav"],
            "enter_up": ["enter_up_0.wav"],
            "mod_down": ["mod_down_0.wav"],
            "mod_up": ["mod_up_0.wav"],
        },
        "definitions": {
            "Default": {"down": "normal_down_0.wav", "up": "normal_up_0.wav"},
            "Space": {"down": "space_down_0.wav", "up": "space_up_0.wav"},
            "Enter": {"down": "enter_down_0.wav", "up": "enter_up_0.wav"},
            "Backspace": {"down": "enter_down_0.wav", "up": "enter_up_0.wav"},
            "ShiftLeft": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "ShiftRight": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "Tab": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "CapsLock": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "ControlLeft": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "ControlRight": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "AltLeft": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
            "AltRight": {"down": "mod_down_0.wav", "up": "mod_up_0.wav"},
        },
    }
    (pack_dir / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False))


def build_mouse_packs(base_dir: Path) -> None:
    specs = [
        {
            "id": "mouse-omron",
            "name": "Omron Microswitch",
            "tag": "Mouse Crisp",
            "accent": "#22d3ee",
            "description": "Klasik oyuncu faresi mikro anahtar tıklaması",
            "bright": 1.0,
            "amp": 0.85,
        },
        {
            "id": "mouse-silent",
            "name": "Kailh Silent Mouse",
            "tag": "Mouse Silent",
            "accent": "#818cf8",
            "description": "Yumuşak ve tok sessiz fare tıklaması",
            "bright": 0.42,
            "amp": 0.55,
        },
    ]
    for idx, spec in enumerate(specs):
        pack_dir = base_dir / spec["id"]
        pack_dir.mkdir(parents=True, exist_ok=True)
        rng = np.random.default_rng(5000 + idx * 41)
        write_wav(pack_dir / "left_down.wav", synth_mouse_click(rng, bright=spec["bright"], amp=spec["amp"], is_up=False))
        write_wav(pack_dir / "left_up.wav", synth_mouse_click(rng, bright=spec["bright"], amp=spec["amp"] * 0.48, is_up=True))
        write_wav(pack_dir / "right_down.wav", synth_mouse_click(rng, bright=spec["bright"] * 0.92, amp=spec["amp"] * 0.95, is_up=False))
        write_wav(pack_dir / "right_up.wav", synth_mouse_click(rng, bright=spec["bright"] * 0.92, amp=spec["amp"] * 0.45, is_up=True))
        write_wav(pack_dir / "middle_down.wav", synth_mouse_click(rng, bright=spec["bright"] * 0.78, amp=spec["amp"] * 0.9, is_up=False))
        write_wav(pack_dir / "middle_up.wav", synth_mouse_click(rng, bright=spec["bright"] * 0.78, amp=spec["amp"] * 0.4, is_up=True))

        config = {
            "config_version": "2",
            "id": spec["id"],
            "name": spec["name"],
            "description": spec["description"],
            "tag": spec["tag"],
            "accent": spec["accent"],
            "device_type": "mouse",
            "author": "sxmcaps",
            "definitions": {
                "MouseLeft": {"down": "left_down.wav", "up": "left_up.wav"},
                "MouseRight": {"down": "right_down.wav", "up": "right_up.wav"},
                "MouseMiddle": {"down": "middle_down.wav", "up": "middle_up.wav"},
            },
        }
        (pack_dir / "config.json").write_text(json.dumps(config, indent=2, ensure_ascii=False))


def main() -> None:
    out_dir = Path(__file__).resolve().parent.parent / "src-tauri" / "assets" / "soundpacks"
    out_dir.mkdir(parents=True, exist_ok=True)
    for idx, spec in enumerate(KEYBOARD_PACKS):
        build_keyboard_pack(out_dir, spec, idx)
        print(f"Generated keyboard pack: {spec['id']}")
    build_mouse_packs(out_dir)
    print("Generated mouse packs: mouse-omron, mouse-silent")


if __name__ == "__main__":
    main()
