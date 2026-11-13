#!/usr/bin/env python3
"""
Fetches genuine, MIT-licensed recorded mechanical keyboard and mouse soundpacks
from official Mechvibes (hainguyents13/mechvibes, hainguyents13/mechvibes-electron)
and MechVibesPlusPlus (PyroCalzone/MechVibesPlusPlus), replacing any previous
synthetic packs with 20 real built-in packs + 8 real Pack Hub downloadable packs.
"""

import json
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILTIN_DIR = ROOT / "src-tauri" / "assets" / "soundpacks"
HUB_DIR = ROOT / "pack-hub"

RAW_BASE_URL = "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub"

# Metadata overrides/enrichments preserving authentic audio + key timings
MECHVIBES_V2_KB = {
    "cherrymx-brown-pbt": {
        "name": "Cherry MX Brown (PBT)",
        "tag": "Tactile",
        "description": "Authentic Cherry MX Brown switches with thick PBT keycaps (down & up recording).",
    },
    "cherrymx-brown-abs": {
        "name": "Cherry MX Brown (ABS)",
        "tag": "Tactile",
        "description": "Authentic Cherry MX Brown switches with classic ABS keycaps (down & up recording).",
    },
    "cherrymx-blue-pbt": {
        "name": "Cherry MX Blue (PBT)",
        "tag": "Clicky",
        "description": "Crisp click-jacket Cherry MX Blue switches on PBT keycaps (down & up recording).",
    },
    "cherrymx-blue-abs": {
        "name": "Cherry MX Blue (ABS)",
        "tag": "Clicky",
        "description": "Classic Cherry MX Blue switches on bright ABS keycaps (down & up recording).",
    },
    "cherrymx-black-pbt": {
        "name": "Cherry MX Black (PBT)",
        "tag": "Linear",
        "description": "Heavy Cherry MX Black linear switches with deep PBT keycaps (down & up recording).",
    },
    "cherrymx-black-abs": {
        "name": "Cherry MX Black (ABS)",
        "tag": "Linear",
        "description": "Classic Cherry MX Black linear switches on ABS keycaps (down & up recording).",
    },
    "cherrymx-red-abs": {
        "name": "Cherry MX Red (ABS)",
        "tag": "Linear",
        "description": "Smooth light Cherry MX Red linear switches on ABS keycaps (down & up recording).",
    },
    "topre-purple-hybrid-pbt": {
        "name": "Topre Purple Hybrid (PBT)",
        "tag": "Thocky",
        "description": "Real silenced electro-capacitive Topre Purple Hybrid switches with PBT keycaps.",
    },
    "eg-crystal-purple": {
        "name": "Everglide Crystal Purple",
        "tag": "Tactile",
        "description": "Authentic Everglide Crystal Purple tactile switches (down & up recording).",
    },
    "eg-oreo": {
        "name": "Everglide Oreo",
        "tag": "Tactile",
        "description": "Clean snappy Everglide Oreo tactile switches (down & up recording).",
    },
}

MECHVIBES_ELECTRON_BUILTIN = {
    "cherrymx-red-pbt": {
        "name": "Cherry MX Red (PBT)",
        "tag": "Linear",
        "description": "Authentic per-key Cherry MX Red recording with muted PBT bottom-out.",
    },
    "holy-pandas": {
        "name": "Holy Panda",
        "tag": "Tactile",
        "description": "Real Invyr + Halo True Holy Panda multi-variation recording with release sounds.",
    },
    "nk-cream": {
        "name": "NovelKeys Cream",
        "tag": "Linear",
        "description": "Real recorded NovelKeys Cream POM switches with per-key acoustic character.",
    },
    "turquoise": {
        "name": "Turquoise Tealios",
        "tag": "Linear",
        "description": "Real Tealios linear switch full-travel press & release recording.",
    },
}

MECHVIBES_V2_MOUSE = {
    "wooden": {
        "id": "mouse-wooden",
        "name": "Wooden Click",
        "tag": "Thocky",
        "description": "Warm organic wooden mechanical mouse switch recording (down & up).",
    },
    "ping": {
        "id": "mouse-ping",
        "name": "Ping Crisp",
        "tag": "Clicky",
        "description": "Crisp metallic microswitch left/right click recording (down & up).",
    },
    "chat": {
        "id": "mouse-chat",
        "name": "Chat Soft",
        "tag": "Soft",
        "description": "Soft muted UI/mouse click recording for quiet sessions.",
    },
    "vibrate": {
        "id": "mouse-vibrate",
        "name": "Vibrate Tactile",
        "tag": "Tactile",
        "description": "Textured tactile click impulse recording (down & up).",
    },
}

MVPP_MOUSE_BUILTIN = {
    "logi-g502": {
        "id": "mouse-logi-g502",
        "name": "Logitech G502 Lightspeed",
        "tag": "Gaming",
        "description": "Real Logitech G502 Lightspeed Omron switch left, right, and scroll down/up recording.",
    },
    "apple-magic-mouse": {
        "id": "mouse-apple-magic",
        "name": "Apple Magic Mouse",
        "tag": "Minimal",
        "description": "Real Apple Magic Mouse crisp click & release recording.",
    },
}

HUB_ELECTRON_PACKS = {
    "mxblack-travel": {
        "name": "Cherry MX Black (Full Travel)",
        "tag": "Linear",
        "description": "Real Cherry MX Black full-travel key press & release microphone recordings.",
    },
    "mxblue-travel": {
        "name": "Cherry MX Blue (Full Travel)",
        "tag": "Clicky",
        "description": "Real Cherry MX Blue click-jacket press & release recordings with crisp Space/Enter.",
    },
    "mxbrown-travel": {
        "name": "Cherry MX Brown (Full Travel)",
        "tag": "Tactile",
        "description": "Real Cherry MX Brown tactile press & release recordings with 5 randomized variations.",
    },
    "cream-travel": {
        "name": "NovelKeys Cream (Full Travel)",
        "tag": "Linear",
        "description": "Real NovelKeys Cream full-travel POM press & release recordings.",
    },
}

HUB_MVPP_MOUSE = {
    "corsair-m65-elite": {
        "id": "mouse-corsair-m65",
        "name": "Corsair M65 Elite",
        "tag": "Mouse",
        "description": "Real Corsair M65 Elite Omron left, right, and scroll down/up recordings.",
    },
    "mamba-elite": {
        "id": "mouse-razer-mamba",
        "name": "Razer Mamba Elite",
        "tag": "Mouse",
        "description": "Real Razer Mamba Elite mechanical mouse switch down/up recordings.",
    },
    "harpoon-rgb": {
        "id": "mouse-harpoon-rgb",
        "name": "Corsair Harpoon RGB",
        "tag": "Mouse",
        "description": "Real Corsair Harpoon RGB gaming mouse click and scroll recordings.",
    },
    "logi-trackball": {
        "id": "mouse-logi-trackball",
        "name": "Logitech M570 Trackball",
        "tag": "Mouse",
        "description": "Real Logitech M570 trackball soft tactile button click recordings.",
    },
}

AUDIO_EXTS = {".ogg", ".mp3", ".wav", ".flac", ".m4a"}


def clone_shallow(repo: str, dest: Path) -> None:
    subprocess.run(
        ["git", "clone", "--depth", "1", "--quiet", f"https://github.com/{repo}.git", str(dest)],
        check=True,
    )


def convert_to_ogg_if_needed(src: Path, dst_dir: Path) -> str:
    if src.suffix.lower() in {".ogg", ".mp3", ".wav", ".flac"}:
        out = dst_dir / src.name
        shutil.copy2(src, out)
        return src.name
    # Convert .m4a -> .ogg so rodio decodes natively on all OSes without AAC plugins
    out_name = f"{src.stem}.ogg"
    out = dst_dir / out_name
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-c:a", "libvorbis", "-q:a", "6", str(out)],
        check=True,
    )
    return out_name


def copy_pack_tree(src_dir: Path, dst_dir: Path, meta: dict, pack_id: str, device_type: str, author: str) -> None:
    if dst_dir.exists():
        shutil.rmtree(dst_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)

    for root, _, files in os.walk(src_dir):
        rel_root = Path(root).relative_to(src_dir)
        for fname in files:
            fpath = Path(root) / fname
            if fpath.suffix.lower() in AUDIO_EXTS:
                target_sub = dst_dir / rel_root
                target_sub.mkdir(parents=True, exist_ok=True)
                shutil.copy2(fpath, target_sub / fname)

    cfg_path = src_dir / "config.json"
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    cfg["id"] = pack_id
    cfg["name"] = meta["name"]
    cfg["tag"] = meta["tag"]
    cfg["description"] = meta["description"]
    cfg["device_type"] = device_type
    cfg["author"] = cfg.get("author") or author
    cfg["accent"] = "#ffffff"

    with open(dst_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def build_mvpp_mouse_pack(src_dir: Path, dst_dir: Path, meta: dict, author: str) -> None:
    if dst_dir.exists():
        shutil.rmtree(dst_dir)
    dst_dir.mkdir(parents=True, exist_ok=True)

    file_map = {
        "1": ("MouseLeft", "down"),
        "01": ("MouseLeft", "up"),
        "2": ("MouseRight", "down"),
        "02": ("MouseRight", "up"),
        "3": ("MouseMiddle", "down"),
        "03": ("MouseMiddle", "up"),
    }

    with open(src_dir / "config.json", "r", encoding="utf-8") as f:
        raw_cfg = json.load(f)
    defines = raw_cfg.get("defines", {})

    defs = {}
    for raw_k, (web_code, phase) in file_map.items():
        fname = defines.get(raw_k)
        if not fname:
            continue
        src_file = src_dir / fname
        if src_file.is_file():
            out_name = convert_to_ogg_if_needed(src_file, dst_dir)
            defs.setdefault(web_code, {})[phase] = out_name

    # Re-use MouseLeft/MouseRight for extra/side buttons so gaming mice sound great on side clicks too
    if "MouseRight" in defs:
        defs["MouseSide"] = dict(defs["MouseRight"])
        defs["MouseExtra"] = dict(defs["MouseRight"])

    cfg = {
        "config_version": "2",
        "id": meta["id"],
        "name": meta["name"],
        "tag": meta["tag"],
        "author": author,
        "description": meta["description"],
        "accent": "#ffffff",
        "device_type": "mouse",
        "definitions": defs,
    }
    with open(dst_dir / "config.json", "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def zip_pack_dir(pack_dir: Path, zip_path: Path) -> float:
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in sorted(pack_dir.rglob("*")):
            if file_path.is_file():
                rel = file_path.relative_to(pack_dir).as_posix()
                zf.write(file_path, rel)
    return round(zip_path.stat().st_size / 1024.0, 1)


def main() -> None:
    if BUILTIN_DIR.exists():
        shutil.rmtree(BUILTIN_DIR)
    BUILTIN_DIR.mkdir(parents=True, exist_ok=True)

    if HUB_DIR.exists():
        shutil.rmtree(HUB_DIR)
    HUB_DIR.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="sxmcaps-mv-") as tmp:
        tmp_path = Path(tmp)
        mv_repo = tmp_path / "mechvibes"
        mve_repo = tmp_path / "mechvibes-electron"
        mvpp_repo = tmp_path / "mechvibes-pp"

        print("Cloning MIT-licensed soundpack sources...")
        clone_shallow("hainguyents13/mechvibes", mv_repo)
        clone_shallow("hainguyents13/mechvibes-electron", mve_repo)
        clone_shallow("PyroCalzone/MechVibesPlusPlus", mvpp_repo)

        # 1. Built-in Keyboard Packs from hainguyents13/mechvibes (10)
        for pack_id, meta in MECHVIBES_V2_KB.items():
            copy_pack_tree(
                mv_repo / "soundpacks" / "keyboard" / pack_id,
                BUILTIN_DIR / pack_id,
                meta,
                pack_id,
                "keyboard",
                "Mechvibes",
            )
            print(f"[builtin kb] {pack_id}")

        # 2. Extra Built-in Keyboard Packs from hainguyents13/mechvibes-electron (4)
        for pack_id, meta in MECHVIBES_ELECTRON_BUILTIN.items():
            copy_pack_tree(
                mve_repo / "src" / "audio" / pack_id,
                BUILTIN_DIR / pack_id,
                meta,
                pack_id,
                "keyboard",
                "Mechvibes",
            )
            print(f"[builtin kb] {pack_id}")

        # 3. Built-in Mouse Packs from hainguyents13/mechvibes (4)
        for folder, meta in MECHVIBES_V2_MOUSE.items():
            copy_pack_tree(
                mv_repo / "soundpacks" / "mouse" / folder,
                BUILTIN_DIR / meta["id"],
                meta,
                meta["id"],
                "mouse",
                "Mechvibes",
            )
            print(f"[builtin mouse] {meta['id']}")

        # 4. Built-in Mouse Packs from MechVibesPlusPlus (2)
        for folder, meta in MVPP_MOUSE_BUILTIN.items():
            build_mvpp_mouse_pack(
                mvpp_repo / "src" / "sounds" / "mouse" / folder,
                BUILTIN_DIR / meta["id"],
                meta,
                "Mechvibes++",
            )
            print(f"[builtin mouse] {meta['id']}")

        # 5. Pack Hub Downloadable Packs (8 real packs: 4 travel keyboards + 4 gaming mice)
        staging = tmp_path / "hub-staging"
        catalog = []

        for pack_id, meta in HUB_ELECTRON_PACKS.items():
            pdir = staging / pack_id
            copy_pack_tree(
                mve_repo / "src" / "audio" / pack_id,
                pdir,
                meta,
                pack_id,
                "keyboard",
                "Mechvibes Community",
            )
            size_kb = zip_pack_dir(pdir, HUB_DIR / f"{pack_id}.zip")
            catalog.append({
                "id": pack_id,
                "name": meta["name"],
                "tag": meta["tag"],
                "description": meta["description"],
                "author": "Mechvibes Community",
                "device_type": "keyboard",
                "size_kb": size_kb,
                "download_url": f"{RAW_BASE_URL}/{pack_id}.zip",
            })
            print(f"[hub kb] {pack_id}.zip ({size_kb} KB)")

        for folder, meta in HUB_MVPP_MOUSE.items():
            pack_id = meta["id"]
            pdir = staging / pack_id
            build_mvpp_mouse_pack(
                mvpp_repo / "src" / "sounds" / "mouse" / folder,
                pdir,
                meta,
                "Mechvibes++",
            )
            size_kb = zip_pack_dir(pdir, HUB_DIR / f"{pack_id}.zip")
            catalog.append({
                "id": pack_id,
                "name": meta["name"],
                "tag": meta["tag"],
                "description": meta["description"],
                "author": "Mechvibes++",
                "device_type": "mouse",
                "size_kb": size_kb,
                "download_url": f"{RAW_BASE_URL}/{pack_id}.zip",
            })
            print(f"[hub mouse] {pack_id}.zip ({size_kb} KB)")

        with open(HUB_DIR / "catalog.json", "w", encoding="utf-8") as f:
            json.dump({"packs": catalog}, f, indent=2, ensure_ascii=False)

    print("Done! Built-in packs:", len(list(BUILTIN_DIR.iterdir())), "| Hub packs:", len(catalog))


if __name__ == "__main__":
    main()
