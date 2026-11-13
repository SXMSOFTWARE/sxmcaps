#!/usr/bin/env python3
"""Generate Pack Hub catalog and downloadable .zip soundpacks for sxmcaps."""

import json
import zipfile
from pathlib import Path
import numpy as np

from generate_soundpacks import build_keyboard_pack

HUB_SPECS = [
    {
        "id": "gateron-milky-yellow",
        "name": "Gateron Milky Yellow",
        "tag": "Linear",
        "accent": "#ffffff",
        "description": "Sütlü nylon gövdeli, pürüzsüz ve kremsi klasik lineer karakter",
        "down": dict(
            body_freq=188.0, body_decay_ms=17.5, body_amp=0.78,
            clack_freq=1050.0, clack_q=1.8, clack_decay_ms=7.8, clack_amp=0.60,
            impact_offset_ms=1.0, cavity_freq=330.0, cavity_amp=0.28, lpf_cutoff=6200.0,
        ),
        "up": dict(
            body_freq=245.0, body_decay_ms=11.0, body_amp=0.28,
            clack_freq=1280.0, clack_q=1.9, clack_decay_ms=5.2, clack_amp=0.28,
            impact_offset_ms=0.8, cavity_freq=390.0, cavity_amp=0.12, lpf_cutoff=6000.0,
        ),
    },
    {
        "id": "gazzew-boba-u4t",
        "name": "Gazzew Boba U4T",
        "tag": "Thocky",
        "accent": "#ffffff",
        "description": "Keskin uzun direkli D-tümsekli sert tactile ve derin tok thock",
        "down": dict(
            body_freq=156.0, body_decay_ms=20.0, body_amp=0.90,
            clack_freq=1320.0, clack_q=2.4, clack_decay_ms=6.8, clack_amp=0.72,
            click_freq=2200.0, click_amp=0.38, click_offset_ms=0.5, impact_offset_ms=2.5,
            cavity_freq=295.0, cavity_amp=0.38, lpf_cutoff=6600.0,
        ),
        "up": dict(
            body_freq=220.0, body_decay_ms=11.5, body_amp=0.34,
            clack_freq=1200.0, clack_q=2.1, clack_decay_ms=5.0, clack_amp=0.30,
            impact_offset_ms=0.8, cavity_freq=360.0, cavity_amp=0.14, lpf_cutoff=6200.0,
        ),
    },
    {
        "id": "novelkeys-cream",
        "name": "NovelKeys Cream",
        "tag": "Linear",
        "accent": "#ffffff",
        "description": "Tam POM gövde ile keskin, net ve karakteristik clack sesi",
        "down": dict(
            body_freq=235.0, body_decay_ms=15.0, body_amp=0.68,
            clack_freq=1880.0, clack_q=2.4, clack_decay_ms=6.2, clack_amp=0.78,
            impact_offset_ms=0.9, cavity_freq=480.0, cavity_amp=0.26, lpf_cutoff=9800.0,
        ),
        "up": dict(
            body_freq=310.0, body_decay_ms=9.5, body_amp=0.30,
            clack_freq=2100.0, clack_q=2.3, clack_decay_ms=4.8, clack_amp=0.36,
            impact_offset_ms=0.7, cavity_freq=550.0, cavity_amp=0.12, lpf_cutoff=9400.0,
        ),
    },
    {
        "id": "akko-cream-blue",
        "name": "Akko V3 Cream Blue",
        "tag": "Tactile",
        "accent": "#ffffff",
        "description": "Hızlı tetiklenen hafif dokunsal tümsek ve temiz parlak clack",
        "down": dict(
            body_freq=215.0, body_decay_ms=15.5, body_amp=0.72,
            clack_freq=1560.0, clack_q=2.2, clack_decay_ms=6.8, clack_amp=0.70,
            click_freq=2650.0, click_amp=0.28, click_offset_ms=0.6, impact_offset_ms=2.6,
            cavity_freq=410.0, cavity_amp=0.25, lpf_cutoff=8400.0,
        ),
        "up": dict(
            body_freq=285.0, body_decay_ms=10.0, body_amp=0.28,
            clack_freq=1750.0, clack_q=2.1, clack_decay_ms=5.0, clack_amp=0.32,
            impact_offset_ms=0.8, cavity_freq=480.0, cavity_amp=0.11, lpf_cutoff=8200.0,
        ),
    },
]

BASE_RAW_URL = "https://raw.githubusercontent.com/SXMSOFTWARE/sxmcaps/main/pack-hub"


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    hub_dir = repo_root / "pack-hub"
    tmp_dir = hub_dir / "_tmp"
    hub_dir.mkdir(parents=True, exist_ok=True)
    tmp_dir.mkdir(parents=True, exist_ok=True)

    catalog = []
    for idx, spec in enumerate(HUB_SPECS):
        build_keyboard_pack(tmp_dir, spec, 200 + idx)
        pack_folder = tmp_dir / spec["id"]
        zip_path = hub_dir / f"{spec['id']}.zip"
        with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            for item in sorted(pack_folder.iterdir()):
                if item.is_file():
                    zf.write(item, arcname=item.name)

        catalog.append({
            "id": spec["id"],
            "name": spec["name"],
            "tag": spec["tag"],
            "description": spec["description"],
            "author": "sxmcaps Pack Hub",
            "device_type": "keyboard",
            "size_kb": round(zip_path.stat().st_size / 1024, 1),
            "download_url": f"{BASE_RAW_URL}/{spec['id']}.zip",
        })
        print(f"Built Pack Hub zip: {zip_path.name} ({catalog[-1]['size_kb']} KB)")

    # Remove temporary unzipped folders
    import shutil
    shutil.rmtree(tmp_dir, ignore_errors=True)

    (hub_dir / "catalog.json").write_text(json.dumps({"version": 1, "packs": catalog}, indent=2, ensure_ascii=False))
    print("Wrote pack-hub/catalog.json")


if __name__ == "__main__":
    main()
