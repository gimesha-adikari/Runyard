use crate::error::{Result, RunyardError};
use crate::models::DetectedIde;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn detect_ides() -> Vec<DetectedIde> {
    let mut ides = Vec::new();
    let mut seen_ids = HashSet::new();

    let binary_checks = [
        ("code", "VS Code", "path"),
        ("codium", "VSCodium", "path"),
        ("cursor", "Cursor", "path"),
        ("zed", "Zed", "path"),
        ("zeditor", "Zed", "path"),
        ("nvim", "Neovim", "path"),
        ("subl", "Sublime Text", "path"),
        ("idea", "IntelliJ IDEA", "path"),
        ("webstorm", "WebStorm", "path"),
        ("pycharm", "PyCharm", "path"),
        ("goland", "GoLand", "path"),
        ("rider", "Rider", "path"),
        ("studio", "Android Studio", "path"),
        ("antigravity", "Antigravity", "path"),
        ("agy", "Antigravity", "path"),
    ];

    for (cmd, name, via) in binary_checks.iter() {
        if !seen_ids.contains(*cmd) && is_command_available(cmd) {
            seen_ids.insert(cmd.to_string());
            ides.push(DetectedIde {
                id: cmd.to_string(),
                name: name.to_string(),
                command: cmd.to_string(),
                icon: None,
                installed_via: via.to_string(),
            });
        }
    }

    // Check Flatpak apps
    let flatpak_apps = [
        (
            "com.visualstudio.code",
            "VS Code (Flatpak)",
            "flatpak run com.visualstudio.code",
        ),
        (
            "com.vscodium.codium",
            "VSCodium (Flatpak)",
            "flatpak run com.vscodium.codium",
        ),
        (
            "com.jetbrains.IntelliJ-IDEA-Community",
            "IntelliJ IDEA (Flatpak)",
            "flatpak run com.jetbrains.IntelliJ-IDEA-Community",
        ),
        (
            "com.jetbrains.IntelliJ-IDEA-Ultimate",
            "IntelliJ IDEA (Flatpak)",
            "flatpak run com.jetbrains.IntelliJ-IDEA-Ultimate",
        ),
        (
            "com.jetbrains.PyCharm-Community",
            "PyCharm (Flatpak)",
            "flatpak run com.jetbrains.PyCharm-Community",
        ),
        ("dev.zed.Zed", "Zed (Flatpak)", "flatpak run dev.zed.Zed"),
    ];

    for (app_id, name, exec) in flatpak_apps {
        if !seen_ids.contains(app_id) {
            let desktop_path = format!(
                "/var/lib/flatpak/exports/share/applications/{}.desktop",
                app_id
            );
            let user_desktop = dirs::home_dir().map(|h| {
                h.join(format!(
                    ".local/share/flatpak/exports/share/applications/{}.desktop",
                    app_id
                ))
            });
            if Path::new(&desktop_path).exists()
                || user_desktop.map(|p| p.exists()).unwrap_or(false)
            {
                seen_ids.insert(app_id.to_string());
                ides.push(DetectedIde {
                    id: app_id.to_string(),
                    name: name.to_string(),
                    command: exec.to_string(),
                    icon: None,
                    installed_via: "flatpak".to_string(),
                });
            }
        }
    }

    // Check JetBrains Toolbox apps in ~/.local/share/JetBrains/Toolbox/apps/
    if let Some(home) = dirs::home_dir() {
        let toolbox_apps = home.join(".local/share/JetBrains/Toolbox/apps");
        if toolbox_apps.exists() {
            if let Ok(entries) = std::fs::read_dir(&toolbox_apps) {
                for entry in entries.flatten() {
                    let app_name = entry.file_name().to_string_lossy().to_string();
                    let id = format!("toolbox-{}", app_name);
                    if !seen_ids.contains(&id) {
                        // Look for binary in bin/
                        if let Ok(sub) = std::fs::read_dir(entry.path()) {
                            for sub_entry in sub.flatten() {
                                let bin_dir = sub_entry.path().join("bin");
                                if bin_dir.is_dir() {
                                    let mut exec_path = None;
                                    if let Ok(bin_entries) = std::fs::read_dir(&bin_dir) {
                                        for be in bin_entries.flatten() {
                                            if let Some(name) = be.file_name().to_str() {
                                                let valid_launchers = [
                                                    "idea.sh",
                                                    "pycharm.sh",
                                                    "webstorm.sh",
                                                    "phpstorm.sh",
                                                    "rubymine.sh",
                                                    "goland.sh",
                                                    "rider.sh",
                                                    "clion.sh",
                                                    "datagrip.sh",
                                                    "studio.sh",
                                                    "rustrover.sh",
                                                    "fleet",
                                                ];
                                                if valid_launchers.contains(&name) {
                                                    exec_path = Some(
                                                        be.path().to_string_lossy().to_string(),
                                                    );
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    if let Some(cmd_path) = exec_path {
                                        seen_ids.insert(id.clone());
                                        ides.push(DetectedIde {
                                            id: id.clone(),
                                            name: format!("JetBrains {}", app_name),
                                            command: cmd_path,
                                            icon: None,
                                            installed_via: "toolbox".to_string(),
                                        });
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Check desktop applications directories
    let desktop_dirs = [
        PathBuf::from("/usr/share/applications"),
        dirs::home_dir()
            .map(|h| h.join(".local/share/applications"))
            .unwrap_or_default(),
    ];

    for dir in desktop_dirs {
        if dir.exists() {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for e in entries.flatten() {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.contains("code") && !seen_ids.contains("code") {
                        seen_ids.insert("code".to_string());
                        ides.push(DetectedIde {
                            id: "code".to_string(),
                            name: "VS Code".to_string(),
                            command: "code".to_string(),
                            icon: None,
                            installed_via: "desktop-entry".to_string(),
                        });
                    } else if name.contains("cursor") && !seen_ids.contains("cursor") {
                        seen_ids.insert("cursor".to_string());
                        ides.push(DetectedIde {
                            id: "cursor".to_string(),
                            name: "Cursor".to_string(),
                            command: "cursor".to_string(),
                            icon: None,
                            installed_via: "desktop-entry".to_string(),
                        });
                    }
                }
            }
        }
    }

    ides
}

fn is_command_available(cmd: &str) -> bool {
    Command::new("which")
        .arg(cmd)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn open_in_ide(ide_command: &str, project_path: &str) -> Result<()> {
    let p = Path::new(project_path);
    if !p.exists() {
        return Err(RunyardError::Validation(format!(
            "Project path '{}' does not exist",
            project_path
        )));
    }

    if ide_command.starts_with("flatpak run ") {
        let parts: Vec<&str> = ide_command.split_whitespace().collect();
        let mut cmd = Command::new(parts[0]);
        for part in &parts[1..] {
            cmd.arg(part);
        }
        cmd.arg(project_path)
            .spawn()
            .map_err(|e| RunyardError::Process(format!("Failed to open Flatpak IDE: {}", e)))?;
    } else {
        Command::new(ide_command)
            .arg(project_path)
            .spawn()
            .map_err(|e| {
                RunyardError::Process(format!("Failed to open IDE '{}': {}", ide_command, e))
            })?;
    }
    Ok(())
}

pub fn open_folder(path: &str) -> Result<()> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(RunyardError::Validation(format!(
            "Path '{}' does not exist",
            path
        )));
    }

    Command::new("xdg-open")
        .arg(path)
        .spawn()
        .map_err(|e| RunyardError::Process(e.to_string()))?;
    Ok(())
}

pub fn open_terminal(path: &str) -> Result<()> {
    let p = Path::new(path);
    if !p.exists() {
        return Err(RunyardError::Validation(format!(
            "Path '{}' does not exist",
            path
        )));
    }

    let terminals = [
        "gnome-terminal",
        "konsole",
        "xfce4-terminal",
        "alacritty",
        "kitty",
        "xterm",
    ];
    for term in terminals {
        if is_command_available(term) {
            let mut cmd = Command::new(term);
            if term == "gnome-terminal" {
                cmd.arg("--working-directory").arg(path);
            } else {
                cmd.current_dir(path);
            }
            cmd.spawn()
                .map_err(|e| RunyardError::Process(e.to_string()))?;
            return Ok(());
        }
    }
    Err(RunyardError::NotFound(
        "No terminal emulator found".to_string(),
    ))
}
