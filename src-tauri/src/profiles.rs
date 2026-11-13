use serde::Serialize;

#[derive(Debug, Clone, Serialize, Default, PartialEq, Eq)]
pub struct ActiveWindowInfo {
    pub app_class: String,
    pub title: String,
}

pub fn get_active_window() -> Option<ActiveWindowInfo> {
    #[cfg(target_os = "linux")]
    {
        linux_active_window()
    }
    #[cfg(target_os = "windows")]
    {
        windows_active_window()
    }
    #[cfg(target_os = "macos")]
    {
        macos_active_window()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        None
    }
}

#[cfg(target_os = "linux")]
fn linux_active_window() -> Option<ActiveWindowInfo> {
    // 1. Hyprland IPC
    if std::env::var("HYPRLAND_INSTANCE_SIGNATURE").is_ok() {
        if let Ok(out) = std::process::Command::new("hyprctl")
            .args(["activewindow", "-j"])
            .output()
        {
            if out.status.success() {
                if let Ok(val) = serde_json::from_slice::<serde_json::Value>(&out.stdout) {
                    let app_class = val
                        .get("class")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let title = val
                        .get("title")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !app_class.is_empty() || !title.is_empty() {
                        return Some(ActiveWindowInfo { app_class, title });
                    }
                }
            }
        }
    }

    // 2. X11 fallback via xdotool if available
    if let Ok(out) = std::process::Command::new("xdotool")
        .args(["getactivewindow", "getwindowname"])
        .output()
    {
        if out.status.success() {
            let title = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if !title.is_empty() {
                return Some(ActiveWindowInfo {
                    app_class: title.clone(),
                    title,
                });
            }
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn windows_active_window() -> Option<ActiveWindowInfo> {
    use std::ffi::c_void;
    use std::path::Path;

    type HWND = *mut c_void;
    type HANDLE = *mut c_void;

    const PROCESS_QUERY_LIMITED_INFORMATION: u32 = 0x1000;

    #[link(name = "user32")]
    extern "system" {
        fn GetForegroundWindow() -> HWND;
        fn GetWindowTextW(hwnd: HWND, lp_string: *mut u16, n_max_count: i32) -> i32;
        fn GetWindowThreadProcessId(hwnd: HWND, lpdw_process_id: *mut u32) -> u32;
    }

    #[link(name = "kernel32")]
    extern "system" {
        fn OpenProcess(dw_desired_access: u32, b_inherit_handle: i32, dw_process_id: u32)
            -> HANDLE;
        fn QueryFullProcessImageNameW(
            h_process: HANDLE,
            dw_flags: u32,
            lp_exe_name: *mut u16,
            lpdw_size: *mut u32,
        ) -> i32;
        fn CloseHandle(h_object: HANDLE) -> i32;
    }

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return None;
        }
        let mut title_buf = [0u16; 512];
        let tlen = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        let title = if tlen > 0 {
            String::from_utf16_lossy(&title_buf[..tlen as usize])
        } else {
            String::new()
        };

        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        let mut app_class = String::new();
        if pid != 0 {
            let proc = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if !proc.is_null() {
                let mut path_buf = [0u16; 512];
                let mut size = path_buf.len() as u32;
                if QueryFullProcessImageNameW(proc, 0, path_buf.as_mut_ptr(), &mut size) != 0 {
                    let full = String::from_utf16_lossy(&path_buf[..size as usize]);
                    app_class = Path::new(&full)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or("")
                        .to_string();
                }
                CloseHandle(proc);
            }
        }

        if app_class.is_empty() && title.is_empty() {
            None
        } else {
            Some(ActiveWindowInfo { app_class, title })
        }
    }
}

#[cfg(target_os = "macos")]
fn macos_active_window() -> Option<ActiveWindowInfo> {
    let out = std::process::Command::new("osascript")
        .args([
            "-e",
            "tell application \"System Events\" to get name of first application process whose frontmost is true",
        ])
        .output()
        .ok()?;
    if out.status.success() {
        let name = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if !name.is_empty() {
            return Some(ActiveWindowInfo {
                app_class: name.clone(),
                title: name,
            });
        }
    }
    None
}
