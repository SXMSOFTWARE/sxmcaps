use std::fs;
use std::path::PathBuf;

pub fn is_autostart_enabled() -> bool {
    #[cfg(target_os = "linux")]
    {
        linux_desktop_path().is_file()
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("reg")
            .args([
                "query",
                r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                "/v",
                "sxmcaps",
            ])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(target_os = "macos")]
    {
        macos_plist_path().is_file()
    }
    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        false
    }
}

pub fn set_autostart(enabled: bool) -> Result<bool, String> {
    let exe = std::env::current_exe()
        .map_err(|e| format!("Çalıştırılabilir dosya yolu alınamadı: {e}"))?;
    let exe_str = exe.to_string_lossy().to_string();

    #[cfg(target_os = "linux")]
    {
        let path = linux_desktop_path();
        if enabled {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("Autostart klasörü oluşturulamadı: {e}"))?;
            }
            let content = format!(
                "[Desktop Entry]\nType=Application\nName=sxmcaps\nComment=Mechanical Keycap & Mouse Sound Studio\nExec=\"{exe_str}\"\nTerminal=false\nX-GNOME-Autostart-enabled=true\n"
            );
            fs::write(&path, content)
                .map_err(|e| format!("Autostart dosyası yazılamadı: {e}"))?;
        } else if path.exists() {
            fs::remove_file(&path)
                .map_err(|e| format!("Autostart dosyası silinemedi: {e}"))?;
        }
        Ok(is_autostart_enabled())
    }

    #[cfg(target_os = "windows")]
    {
        if enabled {
            let out = std::process::Command::new("reg")
                .args([
                    "add",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "sxmcaps",
                    "/t",
                    "REG_SZ",
                    "/d",
                    &format!("\"{exe_str}\""),
                    "/f",
                ])
                .output()
                .map_err(|e| format!("reg.exe çalıştırılamadı: {e}"))?;
            if !out.status.success() {
                return Err("Kayıt defteri autostart girdisi eklenemedi".to_string());
            }
        } else {
            let _ = std::process::Command::new("reg")
                .args([
                    "delete",
                    r"HKCU\Software\Microsoft\Windows\CurrentVersion\Run",
                    "/v",
                    "sxmcaps",
                    "/f",
                ])
                .output();
        }
        Ok(is_autostart_enabled())
    }

    #[cfg(target_os = "macos")]
    {
        let path = macos_plist_path();
        if enabled {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)
                    .map_err(|e| format!("LaunchAgents klasörü oluşturulamadı: {e}"))?;
            }
            let plist = format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sxmcaps.desktop</string>
  <key>ProgramArguments</key><array><string>{exe_str}</string></array>
  <key>RunAtLoad</key><true/>
</dict>
</plist>
"#
            );
            fs::write(&path, plist).map_err(|e| format!("plist yazılamadı: {e}"))?;
        } else if path.exists() {
            fs::remove_file(&path).map_err(|e| format!("plist silinemedi: {e}"))?;
        }
        Ok(is_autostart_enabled())
    }

    #[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
    {
        let _ = enabled;
        Ok(false)
    }
}

#[cfg(target_os = "linux")]
fn linux_desktop_path() -> PathBuf {
    let base = std::env::var("XDG_CONFIG_HOME")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
            PathBuf::from(home).join(".config")
        });
    base.join("autostart").join("sxmcaps.desktop")
}

#[cfg(target_os = "macos")]
fn macos_plist_path() -> PathBuf {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    PathBuf::from(home)
        .join("Library")
        .join("LaunchAgents")
        .join("com.sxmcaps.desktop.plist")
}
