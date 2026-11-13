use crate::drivers::{
    ConnectionLink, DeviceCapabilities, DeviceHardwareState, DeviceKind, EffectMetaDto,
    HardwareDeviceInfo, KeyLayoutItemDto, KeymapEntryDto, LedTopologyNode, LightingCapability,
    PeripheralDriver, RemapTargetDto,
};
use hidapi::{HidApi, HidDevice};
use std::ffi::CString;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

pub const WIRED_VID: u16 = 0x258a;
pub const WIRED_PID: u16 = 0x010c;
pub const WIRELESS_VID: u16 = 0x3554;
pub const DONGLE_PID: u16 = 0xfa09;
pub const BT_PID: u16 = 0xfa08;

pub const LED_COUNT: usize = 126; // 21 columns * 6 rows
pub const MATRIX_LEN: usize = 128; // KB.ini MatrixLen
pub const LED_BLOCK_LEN: usize = 128;
pub const KEYMAP_LEN: usize = MATRIX_LEN * 4; // 512 bytes
pub const CUSTOM_LEN: usize = MATRIX_LEN * 3; // 384 bytes planar (R[126], G[126], B[126], 6B pad)
pub const REALTIME_LEN: usize = LED_COUNT * 3; // 378 bytes interleaved

// 2.4G wireless protocol (CDev3632)
const WL_REPORT_ID: u8 = 0x13;
const WL_PACKET_LEN: usize = 20;
const WL_CHUNK: usize = 14;
const WL_ONLINE_CMD: u8 = 0x07;
const WL_READ_FLAG: u8 = 0x40;

// Wired protocol (CDevG5KB)
const WD_REPORT_ID: u8 = 0x06;
const WD_PACKET_LEN: usize = 520;
const WD_CHUNK: usize = 512;
const WD_READ_FLAG: u8 = 0x80;

// Minimum inter-frame gap (ms) to prevent starving the 8051 scan loop
const MIN_WIRED_STREAM_GAP_MS: u64 = 46;
const MIN_DONGLE_STREAM_GAP_MS: u64 = 92;

// LED block offsets (128 bytes ending with 0x5A 0xA5)
const LED_MAGIC: [u8; 2] = [0x5a, 0xa5];
const OFF_PER_KEY_FLAG: usize = 9;
const OFF_EFFECT_ID: usize = 10;
const OFF_WIN_LOCK: usize = 15;
const OFF_SIDE_MODE: usize = 18;
const OFF_SLEEP: usize = 24;
const OFF_KNOB_MODE: usize = 26;
const OFF_OS_MODE: usize = 27;
const OFF_SLOTS_BASE: usize = 0x3a; // 58

pub const CUSTOM_MODE: u8 = 21;

/// Firmware effects: (hw_id, name_en, name_tr, has_speed, has_brightness, has_color)
pub const EFFECTS: &[(u8, &str, &str, bool, bool, bool)] = &[
    (1, "Fixed On", "Sabit Işık", false, true, true),
    (2, "Respire", "Nefes Alma", true, true, true),
    (3, "Rainbow", "Gökkuşağı", true, true, false),
    (4, "Flash Away", "Tuştan Sönen", true, true, true),
    (5, "Raindrops", "Yağmur Damlaları", true, true, true),
    (6, "Rainbow Wheel", "Dönen Gökkuşağı", true, true, false),
    (7, "Ripples", "Dalga Yayılımı", true, true, true),
    (8, "Stars Twinkle", "Yıldız Parıltısı", true, true, true),
    (9, "Shadow Fade", "Gölge Solması", true, true, true),
    (10, "Retro Snake", "Retro Yılan", true, true, true),
    (11, "Neon Stream", "Neon Akış", true, true, true),
    (12, "Reaction", "Tepkisel Tuş", true, true, true),
    (13, "Sine Wave", "Sinüs Dalgası", true, true, true),
    (14, "Scanner", "Tarayıcı Işık", true, true, true),
    (15, "Windmill", "Yel Değirmeni", true, true, false),
    (16, "Waterfall", "Şelale", true, true, false),
    (17, "Blossoming", "Çiçeklenme", true, true, false),
    (18, "Storm", "Fırtına", true, true, true),
    (21, "Per-Key RGB", "Tuş Bazlı RGB", false, true, false),
    (0, "Off", "Kapalı", false, false, false),
];

/// Sleep choices supported by F75 firmware: seconds -> hardware unit (seconds / 30).
const SLEEP_STEPS: &[(u16, u8)] = &[
    (0, 0),
    (60, 2),
    (90, 3),
    (120, 4),
    (180, 6),
    (240, 8),
    (300, 10),
    (600, 20),
    (900, 30),
    (1200, 40),
];

/// Physical F75 key matrix entry: (matrix_idx, key_name, label, web_code, row, width_u, x_u)
#[rustfmt::skip]
const F75_MATRIX_ROWS: &[&[(usize, &str, &str, f32)]] = &[
    &[
        (0,  "Esc",       "Escape",    1.0),
        (12, "F1",        "F1",        1.0),
        (18, "F2",        "F2",        1.0),
        (24, "F3",        "F3",        1.0),
        (30, "F4",        "F4",        1.0),
        (36, "F5",        "F5",        1.0),
        (42, "F6",        "F6",        1.0),
        (48, "F7",        "F7",        1.0),
        (54, "F8",        "F8",        1.0),
        (60, "F9",        "F9",        1.0),
        (66, "F10",       "F10",       1.0),
        (72, "F11",       "F11",       1.0),
        (78, "F12",       "F12",       1.0),
        (84, "Knob",      "Knob",      1.0),
    ],
    &[
        (1,  "`",         "Backquote", 1.0),
        (7,  "1",         "Digit1",    1.0),
        (13, "2",         "Digit2",    1.0),
        (19, "3",         "Digit3",    1.0),
        (25, "4",         "Digit4",    1.0),
        (31, "5",         "Digit5",    1.0),
        (37, "6",         "Digit6",    1.0),
        (43, "7",         "Digit7",    1.0),
        (49, "8",         "Digit8",    1.0),
        (55, "9",         "Digit9",    1.0),
        (61, "0",         "Digit0",    1.0),
        (67, "-",         "Minus",     1.0),
        (73, "=",         "Equal",     1.0),
        (79, "Backspace", "Backspace", 2.0),
        (85, "Del",       "Delete",    1.0),
    ],
    &[
        (2,  "Tab",       "Tab",          1.5),
        (8,  "Q",         "KeyQ",         1.0),
        (14, "W",         "KeyW",         1.0),
        (20, "E",         "KeyE",         1.0),
        (26, "R",         "KeyR",         1.0),
        (32, "T",         "KeyT",         1.0),
        (38, "Y",         "KeyY",         1.0),
        (44, "U",         "KeyU",         1.0),
        (50, "I",         "KeyI",         1.0),
        (56, "O",         "KeyO",         1.0),
        (62, "P",         "KeyP",         1.0),
        (68, "[",         "BracketLeft",  1.0),
        (74, "]",         "BracketRight", 1.0),
        (80, "\\",        "Backslash",    1.5),
        (86, "PgUp",      "PageUp",       1.0),
    ],
    &[
        (3,  "Caps",      "CapsLock",  1.75),
        (9,  "A",         "KeyA",      1.0),
        (15, "S",         "KeyS",      1.0),
        (21, "D",         "KeyD",      1.0),
        (27, "F",         "KeyF",      1.0),
        (33, "G",         "KeyG",      1.0),
        (39, "H",         "KeyH",      1.0),
        (45, "J",         "KeyJ",      1.0),
        (51, "K",         "KeyK",      1.0),
        (57, "L",         "KeyL",      1.0),
        (63, ";",         "Semicolon", 1.0),
        (69, "'",         "Quote",     1.0),
        (81, "Enter",     "Enter",     2.25),
        (87, "PgDn",      "PageDown",  1.0),
    ],
    &[
        (4,  "LShift",    "ShiftLeft",  2.25),
        (10, "Z",         "KeyZ",       1.0),
        (16, "X",         "KeyX",       1.0),
        (22, "C",         "KeyC",       1.0),
        (28, "V",         "KeyV",       1.0),
        (34, "B",         "KeyB",       1.0),
        (40, "N",         "KeyN",       1.0),
        (46, "M",         "KeyM",       1.0),
        (52, ",",         "Comma",      1.0),
        (58, ".",         "Period",     1.0),
        (64, "/",         "Slash",      1.0),
        (70, "RShift",    "ShiftRight", 1.75),
        (82, "Up",        "ArrowUp",    1.0),
        (88, "End",       "End",        1.0),
    ],
    &[
        (5,  "LCtrl",     "ControlLeft",  1.25),
        (11, "LWin",      "MetaLeft",     1.25),
        (17, "LAlt",      "AltLeft",      1.25),
        (35, "Space",     "Space",        6.25),
        (53, "RAlt",      "AltRight",     1.0),
        (59, "Fn",        "Fn",           1.0),
        (71, "RCtrl",     "ControlRight", 1.0),
        (77, "Left",      "ArrowLeft",    1.0),
        (83, "Down",      "ArrowDown",    1.0),
        (89, "Right",     "ArrowRight",   1.0),
    ],
];

/// Factory Layer-0 HID usage defaults per matrix index for AULA F75
fn factory_layer0_code(idx: usize) -> Option<[u8; 4]> {
    let usage = match idx {
        0 => 0x29,  // Esc
        12 => 0x3a, // F1
        18 => 0x3b,
        24 => 0x3c,
        30 => 0x3d,
        36 => 0x3e,
        42 => 0x3f,
        48 => 0x40,
        54 => 0x41,
        60 => 0x42,
        66 => 0x43,
        72 => 0x44,
        78 => 0x45, // F12
        1 => 0x35,  // `
        7 => 0x1e,  // 1
        13 => 0x1f,
        19 => 0x20,
        25 => 0x21,
        31 => 0x22,
        37 => 0x23,
        43 => 0x24,
        49 => 0x25,
        55 => 0x26,
        61 => 0x27, // 0
        67 => 0x2d, // -
        73 => 0x2e, // =
        79 => 0x2a, // Backspace
        85 => 0x4c, // Del
        2 => 0x2b,  // Tab
        8 => 0x14,  // Q
        14 => 0x1a, // W
        20 => 0x08, // E
        26 => 0x15, // R
        32 => 0x17, // T
        38 => 0x1c, // Y
        44 => 0x18, // U
        50 => 0x0c, // I
        56 => 0x12, // O
        62 => 0x13, // P
        68 => 0x2f, // [
        74 => 0x30, // ]
        80 => 0x31, // \
        86 => 0x4b, // PgUp
        3 => 0x39,  // Caps
        9 => 0x04,  // A
        15 => 0x16, // S
        21 => 0x07, // D
        27 => 0x09, // F
        33 => 0x0a, // G
        39 => 0x0b, // H
        45 => 0x0d, // J
        51 => 0x0e, // K
        57 => 0x0f, // L
        63 => 0x33, // ;
        69 => 0x34, // '
        81 => 0x28, // Enter
        87 => 0x4e, // PgDn
        4 => return Some([0x00, 0x02, 0x00, 0x00]), // LShift
        10 => 0x1d, // Z
        16 => 0x1b, // X
        22 => 0x06, // C
        28 => 0x19, // V
        34 => 0x05, // B
        40 => 0x11, // N
        46 => 0x10, // M
        52 => 0x36, // ,
        58 => 0x37, // .
        64 => 0x38, // /
        70 => return Some([0x00, 0x20, 0x00, 0x00]), // RShift
        82 => 0x52, // Up
        88 => 0x4d, // End
        5 => return Some([0x00, 0x01, 0x00, 0x00]),  // LCtrl
        11 => return Some([0x00, 0x08, 0x00, 0x00]), // LWin
        17 => return Some([0x00, 0x04, 0x00, 0x00]), // LAlt
        35 => 0x2c, // Space
        53 => return Some([0x00, 0x40, 0x00, 0x00]), // RAlt
        59 => return Some([0x0d, 0x00, 0x00, 0x00]), // Fn
        71 => return Some([0x00, 0x10, 0x00, 0x00]), // RCtrl
        77 => 0x50, // Left
        83 => 0x51, // Down
        89 => 0x4f, // Right
        _ => return None,
    };
    Some([0x00, 0x00, 0x00, usage])
}

pub fn build_f75_layout() -> Vec<KeyLayoutItemDto> {
    let mut out = Vec::new();
    for (row_idx, row) in F75_MATRIX_ROWS.iter().enumerate() {
        let mut x = 0.0f32;
        for &(matrix_index, label, web_code, w) in *row {
            // Mirror physical F75 spacers for authentic layout alignment
            if row_idx == 0 && (label == "F1" || label == "F5" || label == "F9") {
                x += if label == "F1" { 0.8 } else { 0.35 };
            }
            if row_idx == 0 && label == "Knob" {
                x += 0.3;
            }
            out.push(KeyLayoutItemDto {
                matrix_index,
                label: label.to_string(),
                web_code: web_code.to_string(),
                row: row_idx as u8,
                x,
                width: w,
            });
            x += w;
        }
    }
    out
}

pub fn build_f75_topology() -> Vec<LedTopologyNode> {
    let layout = build_f75_layout();
    let max_x = layout
        .iter()
        .map(|k| k.x + k.width)
        .fold(16.0_f32, f32::max);
    let max_row = layout.iter().map(|k| k.row).max().unwrap_or(5).max(1) as f32;

    layout
        .into_iter()
        .enumerate()
        .map(|(index, k)| {
            let cx = ((k.x + k.width * 0.5) / max_x).clamp(0.0, 1.0);
            let cy = (k.row as f32 / max_row).clamp(0.0, 1.0);
            let is_mod = matches!(
                k.web_code.as_str(),
                "Escape"
                    | "Tab"
                    | "CapsLock"
                    | "ShiftLeft"
                    | "ShiftRight"
                    | "ControlLeft"
                    | "ControlRight"
                    | "MetaLeft"
                    | "AltLeft"
                    | "AltRight"
                    | "Fn"
                    | "Backspace"
                    | "Enter"
                    | "Delete"
                    | "PageUp"
                    | "PageDown"
                    | "End"
            );
            let zone = if k.web_code == "Knob" {
                "knob"
            } else if k.row == 0 && k.web_code.starts_with('F') {
                "fn"
            } else if k.x >= 14.5 {
                "nav"
            } else if is_mod {
                "mod"
            } else {
                "alpha"
            };
            LedTopologyNode {
                index,
                matrix_index: k.matrix_index,
                label: k.label,
                web_code: k.web_code,
                x: cx,
                y: cy,
                zone: zone.to_string(),
                is_modifier: is_mod,
            }
        })
        .collect()
}

pub fn remap_targets() -> Vec<RemapTargetDto> {
    let mut v = vec![RemapTargetDto {
        label: "Disabled".into(),
        code: [0, 0, 0, 0],
        category: "special".into(),
    }];
    for (i, c) in ('A'..='Z').enumerate() {
        v.push(RemapTargetDto {
            label: c.to_string(),
            code: [0, 0, 0, 0x04 + i as u8],
            category: "alpha".into(),
        });
    }
    for (i, c) in "1234567890".chars().enumerate() {
        v.push(RemapTargetDto {
            label: c.to_string(),
            code: [0, 0, 0, 0x1e + i as u8],
            category: "num".into(),
        });
    }
    for i in 0..12u8 {
        v.push(RemapTargetDto {
            label: format!("F{}", i + 1),
            code: [0, 0, 0, 0x3a + i],
            category: "fn".into(),
        });
    }
    let named: &[(&str, u8)] = &[
        ("Enter", 0x28),
        ("Esc", 0x29),
        ("Backspace", 0x2a),
        ("Tab", 0x2b),
        ("Space", 0x2c),
        ("-", 0x2d),
        ("=", 0x2e),
        ("[", 0x2f),
        ("]", 0x30),
        ("\\", 0x31),
        (";", 0x33),
        ("'", 0x34),
        ("`", 0x35),
        (",", 0x36),
        (".", 0x37),
        ("/", 0x38),
        ("Caps Lock", 0x39),
        ("Print Screen", 0x46),
        ("Scroll Lock", 0x47),
        ("Pause", 0x48),
        ("Insert", 0x49),
        ("Home", 0x4a),
        ("Page Up", 0x4b),
        ("Delete", 0x4c),
        ("End", 0x4d),
        ("Page Down", 0x4e),
        ("Right", 0x4f),
        ("Left", 0x50),
        ("Down", 0x51),
        ("Up", 0x52),
        ("Menu", 0x65),
    ];
    for (label, usage) in named {
        v.push(RemapTargetDto {
            label: (*label).to_string(),
            code: [0, 0, 0, *usage],
            category: "nav".into(),
        });
    }
    for (i, label) in [
        "Left Ctrl",
        "Left Shift",
        "Left Alt",
        "Left Super",
        "Right Ctrl",
        "Right Shift",
        "Right Alt",
        "Right Super",
    ]
    .iter()
    .enumerate()
    {
        v.push(RemapTargetDto {
            label: (*label).to_string(),
            code: [0, 1 << i, 0, 0],
            category: "mod".into(),
        });
    }
    let media: &[(&str, u16)] = &[
        ("Play / Pause", 0x00cd),
        ("Next Track", 0x00b5),
        ("Previous Track", 0x00b6),
        ("Stop", 0x00b7),
        ("Mute", 0x00e2),
        ("Volume Up", 0x00e9),
        ("Volume Down", 0x00ea),
        ("Calculator", 0x0192),
        ("Browser Home", 0x0223),
        ("Mail", 0x018a),
    ];
    for (label, usage) in media {
        v.push(RemapTargetDto {
            label: (*label).to_string(),
            code: [2, 0, (*usage >> 8) as u8, *usage as u8],
            category: "media".into(),
        });
    }
    v
}

pub fn describe_code(code: [u8; 4]) -> String {
    if code == [0, 0, 0, 0] {
        return "Disabled".into();
    }
    if code == [0x0d, 0x00, 0x00, 0x00] {
        return "Fn".into();
    }
    if code[0] == 0x03 {
        return format!("Macro #{}", code[3] + 1);
    }
    if code[0] == 0x07 {
        return match code[3] {
            0x01 => "Fn: Win Lock".into(),
            0x04 => "Fn: Factory Reset".into(),
            0x05 => "Fn: BT Slot 1".into(),
            0x06 => "Fn: BT Slot 2".into(),
            0x07 => "Fn: BT Slot 3".into(),
            0x08 => "Fn: 2.4G Mode".into(),
            0x11 => "Fn: Battery Gauge".into(),
            0x18 => "Fn: Windows Mode".into(),
            0x19 => "Fn: Android Mode".into(),
            0x1a => "Fn: Mac Mode".into(),
            _ => format!("System {:02x}", code[3]),
        };
    }
    if code[0] == 0x08 {
        return match (code[1], code[2]) {
            (0, 0) => "Fn: Next Effect".into(),
            (0, _) => "Fn: Side Light".into(),
            (2, _) => "Fn: Cycle Color".into(),
            (3, 1) => "Fn: Brightness +".into(),
            (3, 2) => "Fn: Brightness -".into(),
            (4, 1) => "Fn: Speed +".into(),
            (4, 2) => "Fn: Speed -".into(),
            _ => "Fn: Lighting".into(),
        };
    }
    for t in remap_targets() {
        if t.code == code {
            return t.label;
        }
    }
    format!("{:02x} {:02x} {:02x} {:02x}", code[0], code[1], code[2], code[3])
}

#[derive(Clone, Copy)]
struct TransportCmds {
    keymap: u8,
    led_matrix: u8,
    macros: u8,
    led: u8,
    realtime: u8,
    read_flag: u8,
}

const WIRELESS_CMDS: TransportCmds = TransportCmds {
    keymap: 0x01,
    led_matrix: 0x02,
    macros: 0x03,
    led: 0x04,
    realtime: 0x88,
    read_flag: WL_READ_FLAG,
};

const WIRED_CMDS: TransportCmds = TransportCmds {
    keymap: 0x03,
    led_matrix: 0x06,
    macros: 0x05,
    led: 0x04,
    realtime: 0x08,
    read_flag: WD_READ_FLAG,
};

pub fn wl_checksum(p: &[u8; WL_PACKET_LEN]) -> u8 {
    p[..WL_PACKET_LEN - 1]
        .iter()
        .fold(0u8, |acc, b| acc.wrapping_add(*b))
}

pub fn build_wl_write_packets(cmd: u8, sub: u8, data: &[u8]) -> Vec<[u8; WL_PACKET_LEN]> {
    let total = data.len().div_ceil(WL_CHUNK).max(1);
    if data.is_empty() {
        let mut p = [0u8; WL_PACKET_LEN];
        p[0] = WL_REPORT_ID;
        p[1] = cmd;
        p[2] = 1;
        p[3] = 0;
        p[4] = sub << 4;
        p[19] = wl_checksum(&p);
        return vec![p];
    }
    data.chunks(WL_CHUNK)
        .enumerate()
        .map(|(i, chunk)| {
            let mut p = [0u8; WL_PACKET_LEN];
            p[0] = WL_REPORT_ID;
            p[1] = cmd;
            p[2] = total as u8;
            p[3] = i as u8;
            p[4] = (sub << 4) | (chunk.len() as u8);
            p[5..5 + chunk.len()].copy_from_slice(chunk);
            p[19] = wl_checksum(&p);
            p
        })
        .collect()
}

pub fn build_wl_read_packet(cmd: u8, sub: u8) -> [u8; WL_PACKET_LEN] {
    let mut p = [0u8; WL_PACKET_LEN];
    p[0] = WL_REPORT_ID;
    p[1] = cmd;
    p[2] = 1;
    p[4] = sub << 4;
    p[19] = wl_checksum(&p);
    p
}

pub fn build_wired_packets(cmd: u8, sub: u8, len: usize, data: Option<&[u8]>) -> Vec<[u8; WD_PACKET_LEN]> {
    let total = len.div_ceil(WD_CHUNK).max(1);
    (0..total)
        .map(|i| {
            let off = i * WD_CHUNK;
            let size = len.saturating_sub(off).min(WD_CHUNK);
            let mut p = [0u8; WD_PACKET_LEN];
            p[0] = WD_REPORT_ID;
            p[1] = cmd;
            p[2] = sub;
            p[4] = total as u8;
            p[5] = i as u8;
            p[6] = size as u8;
            p[7] = (size >> 8) as u8;
            if let Some(d) = data {
                if off + size <= d.len() {
                    p[8..8 + size].copy_from_slice(&d[off..off + size]);
                }
            }
            p
        })
        .collect()
}

pub fn led_block_valid(block: &[u8]) -> bool {
    block.len() >= LED_BLOCK_LEN && block[126] == LED_MAGIC[0] && block[127] == LED_MAGIC[1]
}

pub fn decode_effect_slot(block: &[u8], effect_id: u8) -> (u8, u8, u8) {
    let Some(idx) = EFFECTS.iter().position(|e| e.0 == effect_id) else {
        return (7, 3, 7);
    };
    let off = OFF_SLOTS_BASE + idx * 2;
    if off + 1 >= block.len() {
        return (7, 3, 7);
    }
    let brightness = block[off].min(9);
    let speed = (block[off + 1] >> 4).min(4);
    let color = (block[off + 1] & 0x0f).min(7);
    (brightness, speed, color)
}

pub fn encode_effect_block(block: &mut [u8], effect_id: u8, brightness: u8, speed: u8, color_idx: u8) {
    block[OFF_PER_KEY_FLAG] = if effect_id == CUSTOM_MODE { 1 } else { 0 };
    block[OFF_EFFECT_ID] = effect_id;
    if let Some(idx) = EFFECTS.iter().position(|e| e.0 == effect_id) {
        let off = OFF_SLOTS_BASE + idx * 2;
        if off + 1 < block.len() {
            block[off] = brightness.min(9);
            block[off + 1] = (speed.min(4) << 4) | (color_idx.min(7) & 0x0f);
        }
    }
}

pub fn encode_planar_per_key(colors: &[[u8; 3]]) -> Vec<u8> {
    let mut buf = vec![0u8; CUSTOM_LEN];
    for (led, px) in colors.iter().take(LED_COUNT).enumerate() {
        buf[led] = px[0];
        buf[LED_COUNT + led] = px[1];
        buf[2 * LED_COUNT + led] = px[2];
    }
    buf
}

pub fn decode_planar_per_key(raw: &[u8]) -> Vec<[u8; 3]> {
    let mut out = vec![[0u8, 0u8, 0u8]; LED_COUNT];
    if raw.len() < LED_COUNT * 3 {
        return out;
    }
    for led in 0..LED_COUNT {
        out[led] = [raw[led], raw[LED_COUNT + led], raw[2 * LED_COUNT + led]];
    }
    out
}

pub fn encode_interleaved_realtime(colors: &[[u8; 3]]) -> Vec<u8> {
    let mut out = vec![0u8; REALTIME_LEN];
    for (led, px) in colors.iter().take(LED_COUNT).enumerate() {
        out[led * 3] = px[0];
        out[led * 3 + 1] = px[1];
        out[led * 3 + 2] = px[2];
    }
    out
}

pub fn layer0_plausible(layer: &[u8]) -> bool {
    if layer.len() < KEYMAP_LEN {
        return false;
    }
    // Index 0 = Esc should be standard Esc [00 00 00 29] (unless user mapped Esc intentionally, still require at least 70% default A-Z match or non-zero)
    let checks: Vec<bool> = [
        (9, 0x04u8),  // A
        (34, 0x05),   // B
        (22, 0x06),   // C
        (21, 0x07),   // D
        (20, 0x08),   // E
        (27, 0x09),   // F
        (33, 0x0a),   // G
        (39, 0x0b),   // H
        (50, 0x0c),   // I
        (45, 0x0d),   // J
        (51, 0x0e),   // K
        (57, 0x0f),   // L
        (46, 0x10),   // M
        (40, 0x11),   // N
        (56, 0x12),   // O
        (62, 0x13),   // P
        (8, 0x14),    // Q
        (26, 0x15),   // R
        (15, 0x16),   // S
        (32, 0x17),   // T
        (44, 0x18),   // U
        (28, 0x19),   // V
        (14, 0x1a),   // W
        (16, 0x1b),   // X
        (38, 0x1c),   // Y
        (10, 0x1d),   // Z
    ]
    .iter()
    .map(|&(idx, u)| layer[idx * 4..idx * 4 + 4] == [0x00, 0x00, 0x00, u])
    .collect();
    let matched = checks.iter().filter(|&&b| b).count();
    matched >= 14 || layer[510..512] == LED_MAGIC
}

pub fn sleep_secs_from_raw(raw_unit: u8) -> u16 {
    u16::from(raw_unit) * 30
}

pub fn raw_sleep_from_secs(seconds: u16) -> u8 {
    SLEEP_STEPS
        .iter()
        .min_by_key(|&&(s, _)| s.abs_diff(seconds))
        .map(|&(_, hw)| hw)
        .unwrap_or(10)
}

pub struct AulaF75Driver {
    info: HardwareDeviceInfo,
    link: ConnectionLink,
    hid_path: String,
    cmds: TransportCmds,
    io_lock: Mutex<Option<Instant>>,
    stream_dev: Mutex<Option<HidDevice>>,
}

impl AulaF75Driver {
    pub fn discover_with_api(api: &HidApi) -> Vec<HardwareDeviceInfo> {
        let mut found = Vec::new();
        let list: Vec<_> = api.device_list().collect();

        // 1. Wired USB-C (258a:010c, interface 1 or usage_page 0xff00)
        if let Some(d) = list
            .iter()
            .find(|d| {
                d.vendor_id() == WIRED_VID
                    && d.product_id() == WIRED_PID
                    && (d.interface_number() == 1 || d.usage_page() == 0xff00)
            })
            .or_else(|| {
                list.iter()
                    .find(|d| d.vendor_id() == WIRED_VID && d.product_id() == WIRED_PID)
            })
        {
            let path = d.path().to_string_lossy().into_owned();
            let permission_ok = Self::check_permission(api, &path);
            found.push(HardwareDeviceInfo {
                id: format!("aula-f75:wired:{WIRED_VID:04x}:{WIRED_PID:04x}"),
                driver_id: "aula-f75".to_string(),
                brand: "AULA".to_string(),
                model: "F75".to_string(),
                display_name: "AULA F75 (USB-C)".to_string(),
                device_kind: DeviceKind::Keyboard,
                vendor_id: WIRED_VID,
                product_id: WIRED_PID,
                vid_pid: format!("{WIRED_VID:04x}:{WIRED_PID:04x}"),
                link: ConnectionLink::Wired,
                hid_path: Some(path),
                interface_number: d.interface_number(),
                usage_page: d.usage_page(),
                online: true,
                permission_ok,
                capabilities: Self::f75_capabilities(permission_ok, permission_ok),
                notes: "Native wired 520B HID Feature Report driver (SinoWealth 258a:010c).".to_string(),
            });
        }

        // 2. 2.4G Wireless Receiver (3554:fa09, usage_page 0xff02 or interface 1)
        if let Some(d) = list
            .iter()
            .find(|d| {
                d.vendor_id() == WIRELESS_VID
                    && d.product_id() == DONGLE_PID
                    && (d.usage_page() == 0xff02 || d.interface_number() == 1)
            })
        {
            let path = d.path().to_string_lossy().into_owned();
            let permission_ok = Self::check_permission(api, &path);
            let online = if permission_ok {
                Self::probe_wireless_online(api, &path).unwrap_or(false)
            } else {
                false
            };
            found.push(HardwareDeviceInfo {
                id: format!("aula-f75:24g:{WIRELESS_VID:04x}:{DONGLE_PID:04x}"),
                driver_id: "aula-f75".to_string(),
                brand: "AULA".to_string(),
                model: "F75".to_string(),
                display_name: "AULA F75 (2.4G Wireless)".to_string(),
                device_kind: DeviceKind::Keyboard,
                vendor_id: WIRELESS_VID,
                product_id: DONGLE_PID,
                vid_pid: format!("{WIRELESS_VID:04x}:{DONGLE_PID:04x}"),
                link: ConnectionLink::Wireless24G,
                hid_path: Some(path),
                interface_number: d.interface_number(),
                usage_page: d.usage_page(),
                online,
                permission_ok,
                capabilities: Self::f75_capabilities(permission_ok && online, permission_ok),
                notes: if online {
                    "2.4G wireless HID driver connected & awake.".to_string()
                } else {
                    "2.4G receiver plugged in (keyboard in USB/off/sleep mode).".to_string()
                },
            });
        }

        // 3. Bluetooth (3554:fa08, view-only per hardware limitation)
        if let Some(d) = list.iter().find(|d| {
            d.vendor_id() == WIRELESS_VID
                && d.product_id() == BT_PID
                && (d.usage_page() == 0xff02 || d.interface_number() == 1)
        }) {
            let path = d.path().to_string_lossy().into_owned();
            let permission_ok = Self::check_permission(api, &path);
            found.push(HardwareDeviceInfo {
                id: format!("aula-f75:bt:{WIRELESS_VID:04x}:{BT_PID:04x}"),
                driver_id: "aula-f75".to_string(),
                brand: "AULA".to_string(),
                model: "F75".to_string(),
                display_name: "AULA F75 (Bluetooth)".to_string(),
                device_kind: DeviceKind::Keyboard,
                vendor_id: WIRELESS_VID,
                product_id: BT_PID,
                vid_pid: format!("{WIRELESS_VID:04x}:{BT_PID:04x}"),
                link: ConnectionLink::Bluetooth,
                hid_path: Some(path),
                interface_number: d.interface_number(),
                usage_page: d.usage_page(),
                online: true,
                permission_ok,
                capabilities: Self::f75_capabilities(false, permission_ok),
                notes: "Bluetooth mode is view-only: switch F75 to Wired USB-C or 2.4G to write RGB/Keymap.".to_string(),
            });
        }

        found
    }

    fn f75_capabilities(writable: bool, comm_ok: bool) -> DeviceCapabilities {
        DeviceCapabilities {
            rgb_effects: true,
            per_key_rgb: true,
            host_streaming: writable,
            side_light: true,
            knob_mode: true,
            os_mode: true,
            win_lock: true,
            sleep_timer: true,
            key_remapping: true,
            fn_layers: true,
            macros: true,
            battery_status: false,
            sound_engine: true,
            communication_supported: comm_ok,
            writable,
            lighting_mode: LightingCapability::PerKeyHost,
            led_count: 82,
        }
    }

    fn check_permission(api: &HidApi, path: &str) -> bool {
        let Ok(cpath) = CString::new(path) else {
            return false;
        };
        api.open_path(&cpath).is_ok()
    }

    fn probe_wireless_online(api: &HidApi, path: &str) -> Result<bool, String> {
        let Ok(cpath) = CString::new(path) else {
            return Ok(false);
        };
        let dev = api.open_path(&cpath).map_err(|e| e.to_string())?;
        let req = build_wl_read_packet(WL_ONLINE_CMD, 0);
        let _ = dev.write(&req);
        let mut buf = [0u8; 64];
        for _ in 0..4 {
            match dev.read_timeout(&mut buf, 120) {
                Ok(n) if n >= WL_PACKET_LEN && buf[0] == WL_REPORT_ID && (buf[1] & 0x7f) == WL_ONLINE_CMD => {
                    return Ok(buf[5] != 0);
                }
                Ok(_) => continue,
                Err(_) => break,
            }
        }
        Ok(false)
    }

    pub fn open_from_info(info: HardwareDeviceInfo) -> Result<Self, String> {
        let path = info
            .hid_path
            .clone()
            .ok_or_else(|| "Device has no HID path".to_string())?;
        let cmds = match info.link {
            ConnectionLink::Wired => WIRED_CMDS,
            ConnectionLink::Wireless24G | ConnectionLink::Bluetooth => WIRELESS_CMDS,
            ConnectionLink::UsbHid => WIRED_CMDS,
        };
        Ok(Self {
            link: info.link.clone(),
            info,
            hid_path: path,
            cmds,
            io_lock: Mutex::new(None),
            stream_dev: Mutex::new(None),
        })
    }

    fn with_persistent_hid<F, R>(&self, f: F) -> Result<R, String>
    where
        F: Fn(&HidDevice) -> Result<R, String>,
    {
        let mut guard = self
            .stream_dev
            .lock()
            .map_err(|_| "Stream HID mutex poisoned".to_string())?;
        if guard.is_none() {
            *guard = Some(self.open_hid()?);
        }
        if let Some(ref dev) = *guard {
            match f(dev) {
                Ok(v) => return Ok(v),
                Err(_) => {
                    *guard = None;
                }
            }
        }
        let fresh = self.open_hid()?;
        let res = f(&fresh);
        if res.is_ok() {
            *guard = Some(fresh);
        }
        res
    }

    fn with_stream_hid<F>(&self, f: F) -> Result<(), String>
    where
        F: Fn(&HidDevice) -> Result<(), String>,
    {
        self.with_persistent_hid(f)
    }

    fn open_hid(&self) -> Result<HidDevice, String> {
        let api = HidApi::new().map_err(|e| format!("HID init error: {e}"))?;
        let cpath = CString::new(self.hid_path.as_str()).map_err(|e| e.to_string())?;
        api.open_path(&cpath)
            .map_err(|e| format!("HID open failed ({}): {e}. Check udev rules in System tab.", self.hid_path))
    }

    fn enforce_gap(guard: &mut Option<Instant>, min_gap_ms: u64) {
        if let Some(prev) = *guard {
            let min_gap = Duration::from_millis(min_gap_ms);
            let elapsed = prev.elapsed();
            if elapsed < min_gap {
                thread::sleep(min_gap - elapsed);
            }
        }
        *guard = Some(Instant::now());
    }

    fn wired_send(dev: &HidDevice, pk: &[u8; WD_PACKET_LEN]) -> Result<(), String> {
        let mut last_err = String::new();
        for _ in 0..3 {
            match dev.send_feature_report(pk) {
                Ok(()) => return Ok(()),
                Err(e) => {
                    last_err = e.to_string();
                    thread::sleep(Duration::from_millis(70));
                }
            }
        }
        Err(format!("Wired HID send_feature_report failed: {last_err}"))
    }

    fn wired_read(&self, cmd: u8, sub: u8, len: usize) -> Result<Vec<u8>, String> {
        self.with_persistent_hid(|dev| {
            let mut out = Vec::with_capacity(len);
            let rc = cmd | self.cmds.read_flag;
            for pk in build_wired_packets(rc, sub, len, None) {
                let size = (pk[6] as usize) | ((pk[7] as usize) << 8);
                thread::sleep(Duration::from_millis(20));
                Self::wired_send(dev, &pk)?;
                thread::sleep(Duration::from_millis(20));
                let mut buf = [0u8; WD_PACKET_LEN];
                buf[0] = WD_REPORT_ID;
                let n = dev
                    .get_feature_report(&mut buf)
                    .map_err(|e| format!("Wired HID get_feature_report failed: {e}"))?;
                if n < 8 + size {
                    return Err(format!("Short wired HID reply ({n} < {})", 8 + size));
                }
                out.extend_from_slice(&buf[8..8 + size]);
            }
            Ok(out)
        })
    }

    fn wired_write(&self, cmd: u8, sub: u8, data: &[u8], delay_ms: u64) -> Result<(), String> {
        self.with_persistent_hid(|dev| {
            for pk in build_wired_packets(cmd, sub, data.len(), Some(data)) {
                if delay_ms > 0 {
                    thread::sleep(Duration::from_millis(delay_ms));
                }
                Self::wired_send(dev, &pk)?;
            }
            Ok(())
        })
    }

    fn wireless_read(&self, cmd: u8, sub: u8, len: usize) -> Result<Vec<u8>, String> {
        self.with_persistent_hid(|dev| {
            let rc = cmd | self.cmds.read_flag;
            let mut out = vec![0u8; len.max(WL_CHUNK)];
            let mut got: Vec<bool> = Vec::new();
            let mut total = 0usize;

            for attempt in 0..4 {
                if attempt > 0 {
                    thread::sleep(Duration::from_millis(60));
                }
                let req = build_wl_read_packet(rc, sub);
                dev.write(&req)
                    .map_err(|e| format!("2.4G HID write failed: {e}"))?;

            let deadline = Instant::now() + Duration::from_millis(550);
            let mut buf = [0u8; 64];
            while Instant::now() < deadline {
                let n = dev.read_timeout(&mut buf, 180).map_err(|e| e.to_string())?;
                if n < WL_PACKET_LEN || buf[0] != WL_REPORT_ID {
                    continue;
                }
                let rcmd = buf[1] & 0x7f;
                if rcmd != rc & 0x7f {
                    continue;
                }
                let crc_err = (buf[1] & 0x80) != 0 || (buf[2] & 0x80) != 0;
                if crc_err {
                    break;
                }
                let pkt_total = (buf[2] & 0x7f).max(1) as usize;
                let idx = buf[3] as usize;
                let chunk_len = ((buf[4] & 0x0f) as usize).min(WL_CHUNK);
                if total == 0 {
                    total = pkt_total;
                    got = vec![false; total];
                }
                if idx >= total || pkt_total != total {
                    continue;
                }
                let off = idx * WL_CHUNK;
                if out.len() < off + chunk_len {
                    out.resize(off + chunk_len, 0);
                }
                out[off..off + chunk_len].copy_from_slice(&buf[5..5 + chunk_len]);
                got[idx] = true;
                if got.iter().all(|&g| g) {
                    out.resize(len, 0);
                    return Ok(out);
                }
            }
        }
        Err("No complete reply from AULA F75 2.4G receiver (keyboard asleep or switched to USB/BT?)".to_string())
        })
    }

    fn wireless_write(&self, cmd: u8, sub: u8, data: &[u8], delay_ms: u64) -> Result<(), String> {
        self.with_persistent_hid(|dev| {
            let wants_ack = (cmd & 0x80) == 0;
            for (i, pk) in build_wl_write_packets(cmd, sub, data).iter().enumerate() {
                let mut ok = false;
                for _tries in 0..5 {
                    thread::sleep(Duration::from_millis(delay_ms));
                    dev.write(pk)
                        .map_err(|e| format!("2.4G HID write failed: {e}"))?;
                    if !wants_ack {
                        ok = true;
                        break;
                    }
                    let mut buf = [0u8; 64];
                    for _ in 0..16 {
                        let n = dev.read_timeout(&mut buf, 250).map_err(|e| e.to_string())?;
                        if n >= WL_PACKET_LEN && buf[0] == WL_REPORT_ID && buf[1] == cmd {
                            let err_bit = (buf[2] & 0x80) != 0;
                            if !err_bit && (buf[3] as usize) == i {
                                ok = true;
                            }
                            break;
                        }
                    }
                    if ok {
                        break;
                    }
                }
                if !ok {
                    return Err(format!("No 2.4G acknowledgement for command 0x{cmd:02x} packet {i}"));
                }
            }
            Ok(())
        })
    }

    fn ensure_writable(&self) -> Result<(), String> {
        if self.link == ConnectionLink::Bluetooth {
            return Err("AULA F75 cannot be written over Bluetooth; switch the rear toggle to USB-C Wired or 2.4G.".to_string());
        }
        Ok(())
    }

    fn read_cmd(&self, cmd: u8, sub: u8, len: usize) -> Result<Vec<u8>, String> {
        self.ensure_writable()?;
        match self.link {
            ConnectionLink::Wired | ConnectionLink::UsbHid => self.wired_read(cmd, sub, len),
            ConnectionLink::Wireless24G => self.wireless_read(cmd, sub, len),
            ConnectionLink::Bluetooth => Err("Bluetooth view-only".to_string()),
        }
    }

    fn write_cmd(&self, cmd: u8, sub: u8, data: &[u8], delay_ms: u64) -> Result<(), String> {
        self.ensure_writable()?;
        match self.link {
            ConnectionLink::Wired | ConnectionLink::UsbHid => {
                self.wired_write(cmd, sub, data, delay_ms.min(20))
            }
            ConnectionLink::Wireless24G => self.wireless_write(cmd, sub, data, delay_ms),
            ConnectionLink::Bluetooth => Err("Bluetooth view-only".to_string()),
        }
    }

    fn read_validated_led_block(&self) -> Result<Vec<u8>, String> {
        for attempt in 0..4 {
            if attempt > 0 {
                thread::sleep(Duration::from_millis(35));
            }
            let block = self.read_cmd(self.cmds.led, 0, LED_BLOCK_LEN)?;
            if led_block_valid(&block) {
                return Ok(block);
            }
        }
        Err("AULA F75 config block 5A A5 signature missing; refusing write for hardware safety.".to_string())
    }

    fn rmw_led_block<F>(&self, mutate: F) -> Result<Vec<u8>, String>
    where
        F: FnOnce(&mut [u8]),
    {
        let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
        let mut block = self.read_validated_led_block()?;
        mutate(&mut block);
        if !led_block_valid(&block) {
            return Err("Refusing to write invalid LED block".to_string());
        }
        self.write_cmd(self.cmds.led, 0, &block, 15)?;
        thread::sleep(Duration::from_millis(if self.link == ConnectionLink::Wired {
            60
        } else {
            120
        }));
        Ok(block)
    }

    fn build_state_from_block(&self, block: &[u8], per_key: Vec<[u8; 3]>) -> DeviceHardwareState {
        let effect_id = block[OFF_EFFECT_ID];
        let (brightness, speed, color_idx) = decode_effect_slot(block, effect_id);
        let effect_name = EFFECTS
            .iter()
            .find(|e| e.0 == effect_id)
            .map(|e| e.1.to_string())
            .unwrap_or_else(|| format!("Mode {effect_id}"));

        DeviceHardwareState {
            device_id: self.info.id.clone(),
            effect_id,
            effect_name,
            brightness,
            speed,
            color_idx,
            side_mode: block[OFF_SIDE_MODE].min(3),
            knob_mode: block[OFF_KNOB_MODE].min(1),
            os_mode: block[OFF_OS_MODE].min(2),
            win_lock: block[OFF_WIN_LOCK] != 0,
            sleep_seconds: sleep_secs_from_raw(block[OFF_SLEEP]),
            per_key_colors: per_key,
            supported_effects: EFFECTS
                .iter()
                .map(|&(id, name_en, name_tr, has_speed, has_brightness, has_color)| EffectMetaDto {
                    id,
                    name_en: name_en.to_string(),
                    name_tr: name_tr.to_string(),
                    has_speed,
                    has_brightness,
                    has_color,
                })
                .collect(),
            layout: build_f75_layout(),
            topology: build_f75_topology(),
            raw_config_valid: led_block_valid(block),
        }
    }

    fn decode_keymap_entries(&self, layer: u8, raw: &[u8]) -> Vec<KeymapEntryDto> {
        build_f75_layout()
            .into_iter()
            .filter(|k| k.matrix_index < MATRIX_LEN)
            .map(|k| {
                let off = k.matrix_index * 4;
                let code = if off + 3 < raw.len() {
                    [raw[off], raw[off + 1], raw[off + 2], raw[off + 3]]
                } else {
                    [0, 0, 0, 0]
                };
                let default = if layer == 0 {
                    factory_layer0_code(k.matrix_index)
                } else {
                    None
                };
                let is_modified = default.is_some_and(|d| d != code && k.matrix_index != 84);
                KeymapEntryDto {
                    matrix_index: k.matrix_index,
                    key_label: k.label,
                    web_code: k.web_code,
                    code,
                    assigned_label: describe_code(code),
                    is_modified,
                }
            })
            .collect()
    }
}

impl PeripheralDriver for AulaF75Driver {
    fn driver_id(&self) -> &'static str {
        "aula-f75"
    }

    fn device_info(&self) -> HardwareDeviceInfo {
        self.info.clone()
    }

    fn read_state(&self) -> Result<DeviceHardwareState, String> {
        if self.link == ConnectionLink::Bluetooth {
            return Ok(DeviceHardwareState {
                device_id: self.info.id.clone(),
                effect_id: 3,
                effect_name: "Rainbow (View-Only)".to_string(),
                brightness: 9,
                speed: 4,
                color_idx: 7,
                side_mode: 1,
                knob_mode: 0,
                os_mode: 0,
                win_lock: false,
                sleep_seconds: 300,
                per_key_colors: vec![[220, 220, 225]; LED_COUNT],
                supported_effects: EFFECTS
                    .iter()
                    .map(|&(id, name_en, name_tr, has_speed, has_brightness, has_color)| EffectMetaDto {
                        id,
                        name_en: name_en.to_string(),
                        name_tr: name_tr.to_string(),
                        has_speed,
                        has_brightness,
                        has_color,
                    })
                    .collect(),
                layout: build_f75_layout(),
                topology: build_f75_topology(),
                raw_config_valid: false,
            });
        }
        let _guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        let block = self.read_validated_led_block()?;
        let per_key = self
            .read_cmd(self.cmds.led_matrix, 0, CUSTOM_LEN)
            .map(|raw| decode_planar_per_key(&raw))
            .unwrap_or_else(|_| vec![[0, 0, 0]; LED_COUNT]);
        Ok(self.build_state_from_block(&block, per_key))
    }

    fn poll_live_state(&self) -> Result<Option<DeviceHardwareState>, String> {
        if self.link == ConnectionLink::Bluetooth || !self.info.capabilities.writable {
            return Ok(None);
        }
        let Ok(guard) = self.io_lock.try_lock() else {
            return Ok(None);
        };
        drop(guard);
        let Ok(_guard) = self.io_lock.lock() else {
            return Ok(None);
        };
        let block = self.read_validated_led_block()?;
        Ok(Some(self.build_state_from_block(&block, Vec::new())))
    }

    fn get_led_topology(&self) -> Vec<LedTopologyNode> {
        build_f75_topology()
    }

    fn apply_rgb_effect(
        &self,
        effect_id: u8,
        brightness: u8,
        speed: u8,
        color_idx: u8,
    ) -> Result<DeviceHardwareState, String> {
        let block = self.rmw_led_block(|b| {
            encode_effect_block(b, effect_id, brightness, speed, color_idx);
        })?;
        Ok(self.build_state_from_block(&block, vec![[0, 0, 0]; LED_COUNT]))
    }

    fn apply_per_key_rgb(
        &self,
        colors: Vec<[u8; 3]>,
        brightness: u8,
    ) -> Result<DeviceHardwareState, String> {
        let mut full = vec![[0u8, 0u8, 0u8]; LED_COUNT];
        for (i, c) in colors.iter().take(LED_COUNT).enumerate() {
            full[i] = *c;
        }
        let payload = encode_planar_per_key(&full);
        let block = {
            let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
            Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
            let mut b = self.read_validated_led_block()?;
            self.write_cmd(self.cmds.led_matrix, 0, &payload, 15)?;
            encode_effect_block(&mut b, CUSTOM_MODE, brightness, 0, 0);
            self.write_cmd(self.cmds.led, 0, &b, 15)?;
            b
        };
        Ok(self.build_state_from_block(&block, full))
    }

    fn prepare_realtime_stream(&self) -> Result<(), String> {
        self.ensure_writable()?;
        if self.link != ConnectionLink::Wired {
            // 2.4G receiver (3554:fa09) streams volatile 0x88 frames directly without
            // mutating the nonvolatile config block.
            return Ok(());
        }
        let mut guard = self
            .io_lock
            .lock()
            .map_err(|_| "Driver mutex poisoned".to_string())?;
        Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
        let mut block = self.read_validated_led_block()?;
        // Wired 0x08 realtime frames only render when the firmware is in Per-Key mode:
        // byte[9]=0x01, byte[10]=0x15 (CUSTOM_MODE), and byte[59]=0x47 (first slot speed/color).
        if block[OFF_PER_KEY_FLAG] != 0x01
            || block[OFF_EFFECT_ID] != CUSTOM_MODE
            || block[OFF_SLOTS_BASE + 1] != 0x47
        {
            encode_effect_block(&mut block, CUSTOM_MODE, 9, 4, 7);
            block[OFF_SLOTS_BASE + 1] = 0x47;
            self.wired_write(self.cmds.led, 0, &block, 15)?;
            // Firmware triggers an async repaint after config write; wait so it doesn't clobber frame 0.
            thread::sleep(Duration::from_millis(400));
            *guard = Some(Instant::now());
        }
        Ok(())
    }

    fn set_realtime_rgb(&self, colors: Vec<[u8; 3]>) -> Result<(), String> {
        self.ensure_writable()?;
        let mut full = vec![[0u8; 3]; LED_COUNT];
        for (i, c) in colors.iter().take(LED_COUNT).enumerate() {
            full[i] = *c;
        }
        let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        let min_gap = if self.link == ConnectionLink::Wired {
            MIN_WIRED_STREAM_GAP_MS
        } else {
            MIN_DONGLE_STREAM_GAP_MS
        };
        Self::enforce_gap(&mut guard, min_gap);
        if self.link == ConnectionLink::Wired {
            let payload = encode_interleaved_realtime(&full);
            let packets = build_wired_packets(self.cmds.realtime, 0, payload.len(), Some(&payload));
            self.with_stream_hid(|dev| {
                for pk in &packets {
                    Self::wired_send(dev, pk)?;
                }
                Ok(())
            })
        } else {
            // Compact group streaming on 2.4G (sub=1 <= 84B / 6 chunks).
            // Quantize to coarse non-zero levels so smooth gradients fit and dim keys don't vanish.
            let quantize_chan = |v: u8| -> u8 {
                if v == 0 {
                    0
                } else if v < 48 {
                    0x33
                } else {
                    match v {
                        0..=67 => 0x33,
                        68..=118 => 0x66,
                        119..=169 => 0x99,
                        170..=220 => 0xcc,
                        _ => 0xff,
                    }
                }
            };
            let mut groups: std::collections::BTreeMap<[u8; 3], Vec<u8>> =
                std::collections::BTreeMap::new();
            for item in build_f75_layout() {
                let idx = item.matrix_index;
                if idx < LED_COUNT {
                    let c = full[idx];
                    if c != [0, 0, 0] {
                        let q = [quantize_chan(c[0]), quantize_chan(c[1]), quantize_chan(c[2])];
                        if q != [0, 0, 0] {
                            groups.entry(q).or_default().push(idx as u8);
                        }
                    }
                }
            }
            // Pack largest color groups first within the 84-byte (6-chunk) wireless frame cap.
            let mut ordered: Vec<([u8; 3], Vec<u8>)> = groups.into_iter().collect();
            ordered.sort_by_key(|g| std::cmp::Reverse(g.1.len()));

            let mut payload = Vec::with_capacity(84);
            for (c, keys) in ordered {
                if payload.len() + 5 > 84 {
                    break;
                }
                let take = keys.len().min(84 - payload.len() - 4);
                if take == 0 {
                    continue;
                }
                payload.push(c[0]);
                payload.push(c[1]);
                payload.push(c[2]);
                payload.push(take as u8);
                payload.extend_from_slice(&keys[..take]);
            }
            if payload.is_empty() {
                let all_keys: Vec<u8> = build_f75_layout()
                    .into_iter()
                    .filter_map(|k| u8::try_from(k.matrix_index).ok())
                    .take(80)
                    .collect();
                payload.extend_from_slice(&[0, 0, 0, all_keys.len() as u8]);
                payload.extend_from_slice(&all_keys);
            }
            let packets = build_wl_write_packets(self.cmds.realtime, 1, &payload);
            self.with_stream_hid(|dev| {
                for pk in &packets {
                    dev.write(pk)
                        .map_err(|e| format!("2.4G HID write failed: {e}"))?;
                    thread::sleep(Duration::from_millis(6));
                }
                Ok(())
            })
        }
    }

    fn apply_hardware_flags(
        &self,
        side_mode: Option<u8>,
        knob_mode: Option<u8>,
        os_mode: Option<u8>,
        win_lock: Option<bool>,
        sleep_seconds: Option<u16>,
    ) -> Result<DeviceHardwareState, String> {
        let block = self.rmw_led_block(|b| {
            if let Some(m) = side_mode {
                b[OFF_SIDE_MODE] = m.min(3);
            }
            if let Some(k) = knob_mode {
                b[OFF_KNOB_MODE] = k.min(1);
            }
            if let Some(os) = os_mode {
                b[OFF_OS_MODE] = os.min(2);
            }
            if let Some(wl) = win_lock {
                b[OFF_WIN_LOCK] = if wl { 1 } else { 0 };
            }
            if let Some(secs) = sleep_seconds {
                b[OFF_SLEEP] = raw_sleep_from_secs(secs);
            }
        })?;
        Ok(self.build_state_from_block(&block, vec![[0, 0, 0]; LED_COUNT]))
    }

    fn read_keymap(&self, layer: u8) -> Result<Vec<KeymapEntryDto>, String> {
        if self.link == ConnectionLink::Bluetooth {
            return Ok(self.decode_keymap_entries(layer, &vec![0u8; KEYMAP_LEN]));
        }
        let _guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        let raw = self.read_cmd(self.cmds.keymap, layer.min(3), KEYMAP_LEN)?;
        Ok(self.decode_keymap_entries(layer, &raw))
    }

    fn write_keymap_entry(
        &self,
        layer: u8,
        matrix_index: u8,
        code: [u8; 4],
    ) -> Result<Vec<KeymapEntryDto>, String> {
        self.ensure_writable()?;
        let idx = matrix_index as usize;
        if idx >= 126 {
            return Err("Invalid AULA F75 matrix index (must be < 126 so tail 5A A5 stays safe)".to_string());
        }
        let target_layer = layer.min(1);
        let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
        let mut raw = self.read_cmd(self.cmds.keymap, target_layer, KEYMAP_LEN)?;
        if target_layer == 0 && !layer0_plausible(&raw) {
            return Err("Layer 0 read failed sanity check; refusing keymap write for safety.".to_string());
        }
        raw[idx * 4..idx * 4 + 4].copy_from_slice(&code);
        self.write_cmd(self.cmds.keymap, target_layer, &raw, 15)?;
        Ok(self.decode_keymap_entries(target_layer, &raw))
    }

    fn restore_default_layer(&self, layer: u8) -> Result<Vec<KeymapEntryDto>, String> {
        self.ensure_writable()?;
        if layer != 0 {
            return Err("Factory restore is supported for Base Layer (0).".to_string());
        }
        let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
        let mut raw = self.read_cmd(self.cmds.keymap, 0, KEYMAP_LEN)?;
        for item in build_f75_layout() {
            if let Some(def) = factory_layer0_code(item.matrix_index) {
                raw[item.matrix_index * 4..item.matrix_index * 4 + 4].copy_from_slice(&def);
            }
        }
        raw[510] = LED_MAGIC[0];
        raw[511] = LED_MAGIC[1];
        self.write_cmd(self.cmds.keymap, 0, &raw, 15)?;
        Ok(self.decode_keymap_entries(0, &raw))
    }

    fn write_macros(&self, macros: &[crate::sxboards_presets::SxBoardMacro]) -> Result<(), String> {
        self.ensure_writable()?;
        if macros.is_empty() {
            return Ok(());
        }
        let buf = encode_f75_macros_buffer(macros);
        if buf.len() > 0x1000 {
            return Err("Macro buffer exceeds 4 KB AULA F75 onboard limit.".to_string());
        }
        let mut guard = self.io_lock.lock().map_err(|_| "Driver mutex poisoned".to_string())?;
        Self::enforce_gap(&mut guard, MIN_WIRED_STREAM_GAP_MS);
        thread::sleep(Duration::from_millis(80));
        if self.link == ConnectionLink::Wired {
            self.wired_write(self.cmds.macros, 0, &buf, 20)
        } else {
            for (page, chunk) in buf.chunks(0x200).enumerate() {
                self.wireless_write(self.cmds.macros, page as u8, chunk, 15)?;
                thread::sleep(Duration::from_millis(90));
            }
            Ok(())
        }
    }
}

pub fn web_code_to_hid_usage(web_code: &str) -> Option<u8> {
    if web_code.starts_with("Key") && web_code.len() == 4 {
        let ch = web_code.as_bytes()[3];
        if ch.is_ascii_uppercase() {
            return Some(0x04 + (ch - b'A'));
        }
    }
    if web_code.starts_with("Digit") && web_code.len() == 6 {
        let ch = web_code.as_bytes()[5];
        if (b'1'..=b'9').contains(&ch) {
            return Some(0x1e + (ch - b'1'));
        }
        if ch == b'0' {
            return Some(0x27);
        }
    }
    if let Some(num) = web_code.strip_prefix('F').and_then(|s| s.parse::<u8>().ok()) {
        if (1..=12).contains(&num) {
            return Some(0x3a + (num - 1));
        }
    }
    match web_code {
        "Enter" => Some(0x28),
        "Escape" => Some(0x29),
        "Backspace" => Some(0x2a),
        "Tab" => Some(0x2b),
        "Space" => Some(0x2c),
        "Minus" => Some(0x2d),
        "Equal" => Some(0x2e),
        "BracketLeft" => Some(0x2f),
        "BracketRight" => Some(0x30),
        "Backslash" => Some(0x31),
        "Semicolon" => Some(0x33),
        "Quote" => Some(0x34),
        "Backquote" => Some(0x35),
        "Comma" => Some(0x36),
        "Period" => Some(0x37),
        "Slash" => Some(0x38),
        "CapsLock" => Some(0x39),
        "Insert" => Some(0x49),
        "Home" => Some(0x4a),
        "PageUp" => Some(0x4b),
        "Delete" => Some(0x4c),
        "End" => Some(0x4d),
        "PageDown" => Some(0x4e),
        "ArrowRight" => Some(0x4f),
        "ArrowLeft" => Some(0x50),
        "ArrowDown" => Some(0x51),
        "ArrowUp" => Some(0x52),
        "ControlLeft" => Some(0xe0),
        "ShiftLeft" => Some(0xe1),
        "AltLeft" => Some(0xe2),
        "MetaLeft" => Some(0xe3),
        "ControlRight" => Some(0xe4),
        "ShiftRight" => Some(0xe5),
        "AltRight" => Some(0xe6),
        "MetaRight" => Some(0xe7),
        _ => None,
    }
}

pub fn encode_f75_macros_buffer(macros: &[crate::sxboards_presets::SxBoardMacro]) -> Vec<u8> {
    let blobs: Vec<Vec<u8>> = macros
        .iter()
        .map(|m| {
            let name_bytes: Vec<u8> = m
                .name
                .encode_utf16()
                .take(30)
                .flat_map(|u| u.to_le_bytes())
                .collect();
            let mut blob = vec![name_bytes.len() as u8];
            blob.extend_from_slice(&name_bytes);
            for step in &m.steps {
                let Some(usage) = web_code_to_hid_usage(&step.web_code) else {
                    continue;
                };
                let delay = step.delay_ms.min(0x000f_ffff);
                let kind: u8 = if (0xe0..=0xe7).contains(&usage) { 1 } else { 0 };
                let mut head = (kind << 4) | (((delay >> 16) as u8) & 0x0f);
                if !step.is_down {
                    head |= 0x80;
                }
                blob.extend_from_slice(&[head, (delay >> 8) as u8, delay as u8, usage]);
            }
            blob
        })
        .collect();

    let mut out = Vec::new();
    let mut addr = macros.len() * 4;
    for b in &blobs {
        out.extend_from_slice(&(addr as u16).to_le_bytes());
        out.extend_from_slice(&(b.len() as u16).to_le_bytes());
        addr += b.len();
    }
    for b in blobs {
        out.extend_from_slice(&b);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wired_packet_framing_is_520_bytes_with_le_length() {
        let pkts = build_wired_packets(0x84, 0, 128, None);
        assert_eq!(pkts.len(), 1);
        assert_eq!(pkts[0][0], 0x06);
        assert_eq!(pkts[0][1], 0x84);
        assert_eq!(pkts[0][4], 1);
        assert_eq!(pkts[0][6], 128);
        assert_eq!(pkts[0][7], 0);
    }

    #[test]
    fn wireless_packet_checksum_and_chunking_valid() {
        let data = vec![0xaa; 30];
        let pkts = build_wl_write_packets(0x04, 1, &data);
        assert_eq!(pkts.len(), 3);
        assert_eq!(pkts[0][2], 3);
        assert_eq!(pkts[0][4], (1 << 4) | 14);
        assert_eq!(pkts[2][4], (1 << 4) | 2);
        for p in pkts {
            assert_eq!(wl_checksum(&p), p[19]);
        }
    }

    #[test]
    fn effect_slot_encode_decode_matches_rainbow_0947() {
        let mut block = [0u8; LED_BLOCK_LEN];
        block[126] = 0x5a;
        block[127] = 0xa5;
        encode_effect_block(&mut block, 3, 9, 4, 7);
        assert_eq!(block[OFF_EFFECT_ID], 3);
        assert_eq!(block[OFF_SLOTS_BASE + 4], 0x09);
        assert_eq!(block[OFF_SLOTS_BASE + 5], 0x47);
        assert_eq!(decode_effect_slot(&block, 3), (9, 4, 7));
    }

    #[test]
    fn planar_and_interleaved_rgb_encodings_are_accurate() {
        let mut colors = vec![[0u8; 3]; LED_COUNT];
        colors[0] = [255, 10, 20];
        colors[1] = [1, 200, 30];
        let planar = encode_planar_per_key(&colors);
        assert_eq!(planar.len(), CUSTOM_LEN);
        assert_eq!(planar[0], 255);
        assert_eq!(planar[LED_COUNT + 1], 200);
        assert_eq!(decode_planar_per_key(&planar)[0], [255, 10, 20]);

        let stream = encode_interleaved_realtime(&colors);
        assert_eq!(stream.len(), REALTIME_LEN);
        assert_eq!(&stream[0..6], &[255, 10, 20, 1, 200, 30]);
    }
}
