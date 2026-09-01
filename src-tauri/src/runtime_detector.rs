use crate::models::DetectedRunConfig;
use std::path::Path;

pub fn detect_run_configs(project_path: &str) -> Vec<DetectedRunConfig> {
    let p = Path::new(project_path);
    let mut configs = Vec::new();

    // Node.js
    if p.join("package.json").exists() {
        let pkg_mgr = if p.join("pnpm-lock.yaml").exists() {
            "pnpm"
        } else if p.join("yarn.lock").exists() {
            "yarn"
        } else if p.join("bun.lockb").exists() || p.join("bun.lock").exists() {
            "bun"
        } else {
            "npm"
        };

        if let Ok(content) = std::fs::read_to_string(p.join("package.json")) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(scripts) = json.get("scripts").and_then(|s| s.as_object()) {
                    for (name, _) in scripts {
                        if ["dev", "start", "serve", "watch", "build", "test"]
                            .contains(&name.as_str())
                        {
                            let (command, args) = if pkg_mgr == "yarn" {
                                ("yarn".to_string(), vec![name.clone()])
                            } else {
                                (pkg_mgr.to_string(), vec!["run".to_string(), name.clone()])
                            };

                            configs.push(DetectedRunConfig {
                                service_id: None,
                                service_name: None,
                                name: format!("{} run {}", pkg_mgr, name),
                                command,
                                args,
                                working_dir: Some(project_path.to_string()),
                                source_file: "package.json".to_string(),
                            });
                        }
                    }
                }
            }
        }
    }

    // Rust
    if p.join("Cargo.toml").exists() {
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: "cargo run".to_string(),
            command: "cargo".to_string(),
            args: vec!["run".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "Cargo.toml".to_string(),
        });
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: "cargo test".to_string(),
            command: "cargo".to_string(),
            args: vec!["test".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "Cargo.toml".to_string(),
        });
    }

    // Go
    if p.join("go.mod").exists() {
        if p.join("cmd").is_dir() {
            if let Ok(entries) = std::fs::read_dir(p.join("cmd")) {
                for e in entries.flatten() {
                    if e.path().is_dir() {
                        let cmd_name = e.file_name().to_string_lossy().to_string();
                        configs.push(DetectedRunConfig {
                            service_id: None,
                            service_name: None,
                            name: format!("go run ./cmd/{}", cmd_name),
                            command: "go".to_string(),
                            args: vec!["run".to_string(), format!("./cmd/{}", cmd_name)],
                            working_dir: Some(project_path.to_string()),
                            source_file: "go.mod".to_string(),
                        });
                    }
                }
            }
        }
        if configs.is_empty() || p.join("main.go").exists() {
            configs.push(DetectedRunConfig {
                service_id: None,
                service_name: None,
                name: "go run .".to_string(),
                command: "go".to_string(),
                args: vec!["run".to_string(), ".".to_string()],
                working_dir: Some(project_path.to_string()),
                source_file: "go.mod".to_string(),
            });
        }
    }

    // Python
    if p.join("manage.py").exists() {
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: "Django runserver".to_string(),
            command: "python".to_string(),
            args: vec!["manage.py".to_string(), "runserver".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "manage.py".to_string(),
        });
    } else if p.join("pyproject.toml").exists() || p.join("requirements.txt").exists() {
        let runner = if p.join("uv.lock").exists() {
            "uv"
        } else if p.join("poetry.lock").exists() {
            "poetry"
        } else {
            "python"
        };

        if p.join("main.py").exists() {
            let (cmd, args) = if runner == "uv" {
                (
                    "uv".to_string(),
                    vec!["run".to_string(), "main.py".to_string()],
                )
            } else if runner == "poetry" {
                (
                    "poetry".to_string(),
                    vec![
                        "run".to_string(),
                        "python".to_string(),
                        "main.py".to_string(),
                    ],
                )
            } else {
                ("python".to_string(), vec!["main.py".to_string()])
            };
            configs.push(DetectedRunConfig {
                service_id: None,
                service_name: None,
                name: format!("{} main.py", runner),
                command: cmd,
                args,
                working_dir: Some(project_path.to_string()),
                source_file: "main.py".to_string(),
            });
        } else if p.join("app.py").exists() {
            let (cmd, args) = if runner == "uv" {
                (
                    "uv".to_string(),
                    vec!["run".to_string(), "app.py".to_string()],
                )
            } else if runner == "poetry" {
                (
                    "poetry".to_string(),
                    vec![
                        "run".to_string(),
                        "python".to_string(),
                        "app.py".to_string(),
                    ],
                )
            } else {
                ("python".to_string(), vec!["app.py".to_string()])
            };
            configs.push(DetectedRunConfig {
                service_id: None,
                service_name: None,
                name: format!("{} app.py", runner),
                command: cmd,
                args,
                working_dir: Some(project_path.to_string()),
                source_file: "app.py".to_string(),
            });
        }
    }

    // Java
    if p.join("pom.xml").exists() {
        let mvn_cmd = if p.join("mvnw").exists() {
            "./mvnw"
        } else {
            "mvn"
        };
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: format!("{} spring-boot:run", mvn_cmd),
            command: mvn_cmd.to_string(),
            args: vec!["spring-boot:run".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "pom.xml".to_string(),
        });
    } else if p.join("build.gradle").exists() || p.join("build.gradle.kts").exists() {
        let gradle_cmd = if p.join("gradlew").exists() {
            "./gradlew"
        } else {
            "gradle"
        };
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: format!("{} bootRun", gradle_cmd),
            command: gradle_cmd.to_string(),
            args: vec!["bootRun".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "build.gradle".to_string(),
        });
    }

    // .NET
    let mut has_dotnet = false;
    let mut dotnet_file = ".csproj".to_string();
    if let Ok(entries) = std::fs::read_dir(p) {
        for e in entries.flatten() {
            if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                    has_dotnet = true;
                    dotnet_file = e.file_name().to_string_lossy().to_string();
                    break;
                }
            }
        }
    }
    if has_dotnet {
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: "dotnet run".to_string(),
            command: "dotnet".to_string(),
            args: vec!["run".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: dotnet_file,
        });
    }

    // Docker Compose
    if p.join("docker-compose.yml").exists()
        || p.join("docker-compose.yaml").exists()
        || p.join("compose.yml").exists()
        || p.join("compose.yaml").exists()
    {
        configs.push(DetectedRunConfig {
            service_id: None,
            service_name: None,
            name: "docker compose up".to_string(),
            command: "docker".to_string(),
            args: vec!["compose".to_string(), "up".to_string()],
            working_dir: Some(project_path.to_string()),
            source_file: "docker-compose.yml".to_string(),
        });
    }

    // Makefile
    if p.join("Makefile").exists() {
        if let Ok(content) = std::fs::read_to_string(p.join("Makefile")) {
            for target in ["dev", "run", "start", "test", "build"] {
                if content
                    .lines()
                    .any(|l| l.starts_with(&format!("{}:", target)))
                {
                    configs.push(DetectedRunConfig {
                        service_id: None,
                        service_name: None,
                        name: format!("make {}", target),
                        command: "make".to_string(),
                        args: vec![target.to_string()],
                        working_dir: Some(project_path.to_string()),
                        source_file: "Makefile".to_string(),
                    });
                }
            }
        }
    }

    configs
}
