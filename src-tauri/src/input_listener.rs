use crate::keycodes::MouseButtonKind;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default)]
pub struct InputStatus {
    pub has_permission: bool,
    pub active_devices: Vec<String>,
    pub denied_devices: usize,
    pub session_type: String,
    pub desktop: String,
}

#[derive(Debug, Clone)]
pub enum GlobalInputEvent {
    Key { web_code: &'static str, is_down: bool },
    Mouse { button: MouseButtonKind, is_down: bool },
}

pub struct InputListenerHandle {
    inner: platform::PlatformHandle,
}

impl InputListenerHandle {
    pub fn get_status(&self) -> InputStatus {
        self.inner.get_status()
    }

    pub fn trigger_rescan(&self) {
        self.inner.trigger_rescan();
    }
}

pub fn start_global_listener<F>(on_event: F) -> InputListenerHandle
where
    F: Fn(GlobalInputEvent) + Send + Sync + 'static,
{
    InputListenerHandle {
        inner: platform::start(on_event),
    }
}

pub fn install_udev_input_rule() -> Result<(), String> {
    platform::install_udev_input_rule()
}

// ============================================================================
// LINUX (Wayland / Hyprland / X11 via evdev)
// ============================================================================
#[cfg(target_os = "linux")]
mod platform {
    use super::{GlobalInputEvent, InputStatus};
    use crate::keycodes::{evdev_to_mouse_button, evdev_to_web_code};
    use std::collections::HashMap;
    use std::ffi::CString;
    use std::fs;
    use std::mem;
    use std::path::Path;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    #[repr(C)]
    #[derive(Copy, Clone)]
    struct RawInputEvent {
        time: libc::timeval,
        type_: u16,
        code: u16,
        value: i32,
    }

    struct OpenedDevice {
        fd: libc::c_int,
        name: String,
    }

    impl Drop for OpenedDevice {
        fn drop(&mut self) {
            if self.fd >= 0 {
                unsafe {
                    libc::close(self.fd);
                }
            }
        }
    }

    pub struct PlatformHandle {
        status: Arc<Mutex<InputStatus>>,
        force_rescan: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
    }

    impl PlatformHandle {
        pub fn get_status(&self) -> InputStatus {
            self.status.lock().map(|g| g.clone()).unwrap_or_default()
        }

        pub fn trigger_rescan(&self) {
            self.force_rescan.store(true, Ordering::Relaxed);
        }
    }

    impl Drop for PlatformHandle {
        fn drop(&mut self) {
            self.stop.store(true, Ordering::Relaxed);
        }
    }

    pub fn start<F>(on_event: F) -> PlatformHandle
    where
        F: Fn(GlobalInputEvent) + Send + Sync + 'static,
    {
        let status = Arc::new(Mutex::new(InputStatus {
            session_type: std::env::var("XDG_SESSION_TYPE")
                .unwrap_or_else(|_| "unknown".to_string()),
            desktop: std::env::var("XDG_CURRENT_DESKTOP")
                .unwrap_or_else(|_| "Linux".to_string()),
            ..Default::default()
        }));
        let force_rescan = Arc::new(AtomicBool::new(true));
        let stop = Arc::new(AtomicBool::new(false));

        let status_bg = Arc::clone(&status);
        let rescan_bg = Arc::clone(&force_rescan);
        let stop_bg = Arc::clone(&stop);

        std::thread::Builder::new()
            .name("sxmcaps-evdev".to_string())
            .spawn(move || {
                let mut opened: HashMap<String, OpenedDevice> = HashMap::new();
                let mut last_scan = Instant::now() - Duration::from_secs(10);
                let mut buf = [RawInputEvent {
                    time: libc::timeval {
                        tv_sec: 0,
                        tv_usec: 0,
                    },
                    type_: 0,
                    code: 0,
                    value: 0,
                }; 64];

                while !stop_bg.load(Ordering::Relaxed) {
                    let need_scan = rescan_bg.swap(false, Ordering::Relaxed)
                        || last_scan.elapsed() >= Duration::from_secs(3);

                    if need_scan {
                        last_scan = Instant::now();
                        let (new_opened, denied_count) = scan_and_open_devices(&mut opened);
                        opened = new_opened;

                        if let Ok(mut st) = status_bg.lock() {
                            st.active_devices = opened.values().map(|d| d.name.clone()).collect();
                            st.active_devices.sort();
                            st.denied_devices = denied_count;
                            st.has_permission = !opened.is_empty() || denied_count == 0;
                        }
                    }

                    if opened.is_empty() {
                        std::thread::sleep(Duration::from_millis(200));
                        continue;
                    }

                    let mut pollfds: Vec<libc::pollfd> = opened
                        .values()
                        .map(|d| libc::pollfd {
                            fd: d.fd,
                            events: libc::POLLIN,
                            revents: 0,
                        })
                        .collect();

                    let ret = unsafe {
                        libc::poll(pollfds.as_mut_ptr(), pollfds.len() as libc::nfds_t, 120)
                    };

                    if ret < 0 {
                        let err = std::io::Error::last_os_error();
                        if err.raw_os_error() == Some(libc::EINTR) {
                            continue;
                        }
                        std::thread::sleep(Duration::from_millis(100));
                        continue;
                    }

                    if ret == 0 {
                        continue;
                    }

                    let mut disconnected_fds = Vec::new();
                    let ev_size = mem::size_of::<RawInputEvent>();

                    for pfd in &pollfds {
                        if (pfd.revents & (libc::POLLERR | libc::POLLHUP | libc::POLLNVAL)) != 0 {
                            disconnected_fds.push(pfd.fd);
                            continue;
                        }
                        if (pfd.revents & libc::POLLIN) == 0 {
                            continue;
                        }

                        loop {
                            let bytes = unsafe {
                                libc::read(
                                    pfd.fd,
                                    buf.as_mut_ptr() as *mut libc::c_void,
                                    buf.len() * ev_size,
                                )
                            };
                            if bytes <= 0 {
                                let err = std::io::Error::last_os_error();
                                if err.raw_os_error() == Some(libc::EAGAIN)
                                    || err.raw_os_error() == Some(libc::EWOULDBLOCK)
                                {
                                    break;
                                }
                                disconnected_fds.push(pfd.fd);
                                break;
                            }

                            let count = (bytes as usize) / ev_size;
                            for ev in &buf[..count] {
                                // EV_KEY == 1; value == 1 (press), 0 (release), 2 (auto-repeat ignored)
                                if ev.type_ == 1 && (ev.value == 0 || ev.value == 1) {
                                    let is_down = ev.value == 1;
                                    if let Some(button) = evdev_to_mouse_button(ev.code) {
                                        on_event(GlobalInputEvent::Mouse { button, is_down });
                                    } else if ev.code < 0x100 {
                                        let web_code = evdev_to_web_code(ev.code);
                                        on_event(GlobalInputEvent::Key { web_code, is_down });
                                    }
                                }
                            }
                        }
                    }

                    if !disconnected_fds.is_empty() {
                        opened.retain(|_, dev| !disconnected_fds.contains(&dev.fd));
                        rescan_bg.store(true, Ordering::Relaxed);
                    }
                }
            })
            .expect("input listener thread spawn failed");

        PlatformHandle {
            status,
            force_rescan,
            stop,
        }
    }

    fn is_keyboard_or_mouse(event_name: &str) -> (bool, String) {
        let sys_dir = Path::new("/sys/class/input").join(event_name).join("device");
        let ev_caps = fs::read_to_string(sys_dir.join("capabilities/ev")).unwrap_or_default();
        let key_caps = fs::read_to_string(sys_dir.join("capabilities/key")).unwrap_or_default();
        let name = fs::read_to_string(sys_dir.join("name"))
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|_| event_name.to_string());

        let ev_val = u64::from_str_radix(ev_caps.trim(), 16).unwrap_or(0);
        if (ev_val & (1 << 1)) == 0 {
            return (false, name);
        }

        let words: Vec<u64> = key_caps
            .split_whitespace()
            .filter_map(|w| u64::from_str_radix(w, 16).ok())
            .collect();

        if words.is_empty() {
            return (false, name);
        }

        let len = words.len();
        let word0 = words[len - 1];

        let has_keyboard_keys =
            (word0 & (1 << 30)) != 0 && (word0 & (1 << 57)) != 0 && (word0 & (1 << 28)) != 0;

        let has_mouse_buttons = if len >= 5 {
            let word4 = words[len - 5];
            (word4 & (1 << 16)) != 0
        } else {
            false
        };

        (has_keyboard_keys || has_mouse_buttons, name)
    }

    fn scan_and_open_devices(
        existing: &mut HashMap<String, OpenedDevice>,
    ) -> (HashMap<String, OpenedDevice>, usize) {
        let mut next: HashMap<String, OpenedDevice> = HashMap::new();
        let mut denied_count = 0usize;

        let Ok(entries) = fs::read_dir("/dev/input") else {
            return (next, 0);
        };

        for entry in entries.flatten() {
            let file_name = entry.file_name();
            let Some(fname) = file_name.to_str() else {
                continue;
            };
            if !fname.starts_with("event") {
                continue;
            }

            let (relevant, dev_name) = is_keyboard_or_mouse(fname);
            if !relevant {
                continue;
            }

            let dev_path = format!("/dev/input/{fname}");
            if let Some(prev) = existing.remove(&dev_path) {
                next.insert(dev_path, prev);
                continue;
            }

            let Ok(c_path) = CString::new(dev_path.as_str()) else {
                continue;
            };

            let fd = unsafe { libc::open(c_path.as_ptr(), libc::O_RDONLY | libc::O_NONBLOCK) };
            if fd >= 0 {
                next.insert(
                    dev_path,
                    OpenedDevice {
                        fd,
                        name: dev_name,
                    },
                );
            } else {
                let err = std::io::Error::last_os_error();
                if err.raw_os_error() == Some(libc::EACCES)
                    || err.raw_os_error() == Some(libc::EPERM)
                {
                    denied_count += 1;
                }
            }
        }

        (next, denied_count)
    }

    pub fn install_udev_input_rule() -> Result<(), String> {
        let user = std::env::var("USER").unwrap_or_default();
        let usermod_part = if !user.is_empty()
            && user
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        {
            format!(" && usermod -aG input {user}")
        } else {
            String::new()
        };

        let cmd = format!(
            "rm -f /etc/udev/rules.d/99-sxmcaps-input.rules && printf 'KERNEL==\"event*\", SUBSYSTEM==\"input\", TAG+=\"uaccess\"\\n' > /etc/udev/rules.d/65-sxmcaps-input.rules && udevadm control --reload-rules && udevadm trigger --subsystem-match=input --action=change{usermod_part}"
        );
        let output = std::process::Command::new("pkexec")
            .arg("sh")
            .arg("-c")
            .arg(&cmd)
            .output()
            .map_err(|e| format!("pkexec çalıştırılamadı: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Yetki verilemedi: {}", stderr.trim()));
        }
        Ok(())
    }
}

// ============================================================================
// WINDOWS (Global WH_KEYBOARD_LL + WH_MOUSE_LL hooks via Win32 user32.dll)
// ============================================================================
#[cfg(target_os = "windows")]
mod platform {
    use super::{GlobalInputEvent, InputStatus};
    use crate::keycodes::MouseButtonKind;
    use std::collections::HashSet;
    use std::ffi::c_void;
    use std::ptr;
    use std::sync::{Arc, Mutex, OnceLock};

    type HHOOK = *mut c_void;
    type HINSTANCE = *mut c_void;
    type HWND = *mut c_void;
    type WPARAM = usize;
    type LPARAM = isize;
    type LRESULT = isize;
    type HookProc = unsafe extern "system" fn(i32, WPARAM, LPARAM) -> LRESULT;

    #[repr(C)]
    struct MSG {
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        time: u32,
        pt_x: i32,
        pt_y: i32,
    }

    #[repr(C)]
    struct KBDLLHOOKSTRUCT {
        vk_code: u32,
        scan_code: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    #[repr(C)]
    struct MSLLHOOKSTRUCT {
        pt_x: i32,
        pt_y: i32,
        mouse_data: u32,
        flags: u32,
        time: u32,
        dw_extra_info: usize,
    }

    const WH_KEYBOARD_LL: i32 = 13;
    const WH_MOUSE_LL: i32 = 14;
    const WM_QUIT: u32 = 0x0012;
    const WM_KEYDOWN: usize = 0x0100;
    const WM_KEYUP: usize = 0x0101;
    const WM_SYSKEYDOWN: usize = 0x0104;
    const WM_SYSKEYUP: usize = 0x0105;

    const WM_LBUTTONDOWN: usize = 0x0201;
    const WM_LBUTTONUP: usize = 0x0202;
    const WM_RBUTTONDOWN: usize = 0x0204;
    const WM_RBUTTONUP: usize = 0x0205;
    const WM_MBUTTONDOWN: usize = 0x0207;
    const WM_MBUTTONUP: usize = 0x0208;
    const WM_XBUTTONDOWN: usize = 0x020B;
    const WM_XBUTTONUP: usize = 0x020C;

    #[link(name = "user32")]
    extern "system" {
        fn SetWindowsHookExW(
            id_hook: i32,
            lpfn: HookProc,
            hmod: HINSTANCE,
            dw_thread_id: u32,
        ) -> HHOOK;
        fn CallNextHookEx(hhk: HHOOK, n_code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT;
        fn UnhookWindowsHookEx(hhk: HHOOK) -> i32;
        fn GetMessageW(
            lp_msg: *mut MSG,
            hwnd: HWND,
            wmsg_filter_min: u32,
            wmsg_filter_max: u32,
        ) -> i32;
        fn PostThreadMessageW(id_thread: u32, msg: u32, wparam: WPARAM, lparam: LPARAM) -> i32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentThreadId() -> u32;
    }

    static CALLBACK: OnceLock<Arc<dyn Fn(GlobalInputEvent) + Send + Sync>> = OnceLock::new();
    static PRESSED_VK: OnceLock<Mutex<HashSet<u32>>> = OnceLock::new();

    unsafe extern "system" fn keyboard_proc(
        code: i32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if code >= 0 {
            let kb = &*(lparam as *const KBDLLHOOKSTRUCT);
            let is_down = wparam == WM_KEYDOWN || wparam == WM_SYSKEYDOWN;
            let is_up = wparam == WM_KEYUP || wparam == WM_SYSKEYUP;

            if is_down || is_up {
                let mut should_emit = true;
                if let Some(pressed) = PRESSED_VK.get() {
                    if let Ok(mut guard) = pressed.lock() {
                        if is_down {
                            // Ignore Windows key auto-repeat while held
                            if !guard.insert(kb.vk_code) {
                                should_emit = false;
                            }
                        } else {
                            guard.remove(&kb.vk_code);
                        }
                    }
                }
                if should_emit {
                    if let Some(cb) = CALLBACK.get() {
                        let web_code = vk_to_web_code(kb.vk_code);
                        cb(GlobalInputEvent::Key { web_code, is_down });
                    }
                }
            }
        }
        CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
    }

    unsafe extern "system" fn mouse_proc(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
        if code >= 0 {
            let ms = &*(lparam as *const MSLLHOOKSTRUCT);
            let ev = match wparam {
                WM_LBUTTONDOWN => Some((MouseButtonKind::Left, true)),
                WM_LBUTTONUP => Some((MouseButtonKind::Left, false)),
                WM_RBUTTONDOWN => Some((MouseButtonKind::Right, true)),
                WM_RBUTTONUP => Some((MouseButtonKind::Right, false)),
                WM_MBUTTONDOWN => Some((MouseButtonKind::Middle, true)),
                WM_MBUTTONUP => Some((MouseButtonKind::Middle, false)),
                WM_XBUTTONDOWN => {
                    let xbutton = (ms.mouse_data >> 16) & 0xffff;
                    let kind = if xbutton == 2 {
                        MouseButtonKind::Extra
                    } else {
                        MouseButtonKind::Side
                    };
                    Some((kind, true))
                }
                WM_XBUTTONUP => {
                    let xbutton = (ms.mouse_data >> 16) & 0xffff;
                    let kind = if xbutton == 2 {
                        MouseButtonKind::Extra
                    } else {
                        MouseButtonKind::Side
                    };
                    Some((kind, false))
                }
                _ => None,
            };

            if let Some((button, is_down)) = ev {
                if let Some(cb) = CALLBACK.get() {
                    cb(GlobalInputEvent::Mouse { button, is_down });
                }
            }
        }
        CallNextHookEx(ptr::null_mut(), code, wparam, lparam)
    }

    pub struct PlatformHandle {
        status: Arc<Mutex<InputStatus>>,
        thread_id: Arc<Mutex<Option<u32>>>,
    }

    impl PlatformHandle {
        pub fn get_status(&self) -> InputStatus {
            self.status.lock().map(|g| g.clone()).unwrap_or_default()
        }

        pub fn trigger_rescan(&self) {}
    }

    impl Drop for PlatformHandle {
        fn drop(&mut self) {
            if let Ok(guard) = self.thread_id.lock() {
                if let Some(tid) = *guard {
                    unsafe {
                        PostThreadMessageW(tid, WM_QUIT, 0, 0);
                    }
                }
            }
        }
    }

    pub fn start<F>(on_event: F) -> PlatformHandle
    where
        F: Fn(GlobalInputEvent) + Send + Sync + 'static,
    {
        let _ = CALLBACK.set(Arc::new(on_event));
        let _ = PRESSED_VK.set(Mutex::new(HashSet::new()));

        let status = Arc::new(Mutex::new(InputStatus {
            has_permission: true,
            active_devices: vec!["Windows Global Hook (Keyboard & Mouse)".to_string()],
            denied_devices: 0,
            session_type: "win32".to_string(),
            desktop: "Windows".to_string(),
        }));
        let thread_id = Arc::new(Mutex::new(None));
        let tid_bg = Arc::clone(&thread_id);

        std::thread::Builder::new()
            .name("sxmcaps-win32-hook".to_string())
            .spawn(move || unsafe {
                let tid = GetCurrentThreadId();
                if let Ok(mut g) = tid_bg.lock() {
                    *g = Some(tid);
                }

                let kb_hook = SetWindowsHookExW(WH_KEYBOARD_LL, keyboard_proc, ptr::null_mut(), 0);
                let ms_hook = SetWindowsHookExW(WH_MOUSE_LL, mouse_proc, ptr::null_mut(), 0);

                let mut msg = MSG {
                    hwnd: ptr::null_mut(),
                    message: 0,
                    wparam: 0,
                    lparam: 0,
                    time: 0,
                    pt_x: 0,
                    pt_y: 0,
                };
                while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {}

                if !kb_hook.is_null() {
                    UnhookWindowsHookEx(kb_hook);
                }
                if !ms_hook.is_null() {
                    UnhookWindowsHookEx(ms_hook);
                }
            })
            .expect("win32 hook thread spawn failed");

        PlatformHandle { status, thread_id }
    }

    pub fn install_udev_input_rule() -> Result<(), String> {
        Ok(())
    }

    fn vk_to_web_code(vk: u32) -> &'static str {
        match vk {
            0x1B => "Escape",
            0x30 => "Digit0",
            0x31 => "Digit1",
            0x32 => "Digit2",
            0x33 => "Digit3",
            0x34 => "Digit4",
            0x35 => "Digit5",
            0x36 => "Digit6",
            0x37 => "Digit7",
            0x38 => "Digit8",
            0x39 => "Digit9",
            0x41 => "KeyA",
            0x42 => "KeyB",
            0x43 => "KeyC",
            0x44 => "KeyD",
            0x45 => "KeyE",
            0x46 => "KeyF",
            0x47 => "KeyG",
            0x48 => "KeyH",
            0x49 => "KeyI",
            0x4A => "KeyJ",
            0x4B => "KeyK",
            0x4C => "KeyL",
            0x4D => "KeyM",
            0x4E => "KeyN",
            0x4F => "KeyO",
            0x50 => "KeyP",
            0x51 => "KeyQ",
            0x52 => "KeyR",
            0x53 => "KeyS",
            0x54 => "KeyT",
            0x55 => "KeyU",
            0x56 => "KeyV",
            0x57 => "KeyW",
            0x58 => "KeyX",
            0x59 => "KeyY",
            0x5A => "KeyZ",
            0x08 => "Backspace",
            0x09 => "Tab",
            0x0D => "Enter",
            0x14 => "CapsLock",
            0x20 => "Space",
            0xA0 | 0x10 => "ShiftLeft",
            0xA1 => "ShiftRight",
            0xA2 | 0x11 => "ControlLeft",
            0xA3 => "ControlRight",
            0xA4 | 0x12 => "AltLeft",
            0xA5 => "AltRight",
            0x5B => "MetaLeft",
            0x5C => "MetaRight",
            0x70 => "F1",
            0x71 => "F2",
            0x72 => "F3",
            0x73 => "F4",
            0x74 => "F5",
            0x75 => "F6",
            0x76 => "F7",
            0x77 => "F8",
            0x78 => "F9",
            0x79 => "F10",
            0x7A => "F11",
            0x7B => "F12",
            0x25 => "ArrowLeft",
            0x26 => "ArrowUp",
            0x27 => "ArrowRight",
            0x28 => "ArrowDown",
            0x2D => "Insert",
            0x2E => "Delete",
            0x24 => "Home",
            0x23 => "End",
            0x21 => "PageUp",
            0x22 => "PageDown",
            0xBD => "Minus",
            0xBB => "Equal",
            0xDB => "BracketLeft",
            0xDD => "BracketRight",
            0xDC => "Backslash",
            0xBA => "Semicolon",
            0xDE => "Quote",
            0xC0 => "Backquote",
            0xBC => "Comma",
            0xBE => "Period",
            0xBF => "Slash",
            _ => "Unknown",
        }
    }
}

// ============================================================================
// OTHER PLATFORMS (macOS fallback)
// ============================================================================
#[cfg(not(any(target_os = "linux", target_os = "windows")))]
mod platform {
    use super::{GlobalInputEvent, InputStatus};

    pub struct PlatformHandle;

    impl PlatformHandle {
        pub fn get_status(&self) -> InputStatus {
            InputStatus {
                has_permission: false,
                active_devices: vec![],
                denied_devices: 0,
                session_type: std::env::consts::OS.to_string(),
                desktop: std::env::consts::OS.to_string(),
            }
        }

        pub fn trigger_rescan(&self) {}
    }

    pub fn start<F>(_on_event: F) -> PlatformHandle
    where
        F: Fn(GlobalInputEvent) + Send + Sync + 'static,
    {
        PlatformHandle
    }

    pub fn install_udev_input_rule() -> Result<(), String> {
        Err("udev sadece Linux için geçerlidir".to_string())
    }
}
