use std::path::Path;

pub struct DetectionResult {
    pub project_type: Option<String>,
    pub languages: Vec<String>,
    pub frameworks: Vec<String>,
}

pub fn detect_project_type(path: &str) -> DetectionResult {
    let p = Path::new(path);
    let mut languages = Vec::new();
    let mut frameworks = Vec::new();

    // Node / JS / TS
    if p.join("package.json").exists() {
        if p.join("tsconfig.json").exists() {
            languages.push("TypeScript".to_string());
        } else {
            languages.push("JavaScript".to_string());
        }

        // Package managers
        if p.join("pnpm-lock.yaml").exists() {
            frameworks.push("pnpm".to_string());
        } else if p.join("yarn.lock").exists() {
            frameworks.push("yarn".to_string());
        } else if p.join("bun.lockb").exists() || p.join("bun.lock").exists() {
            frameworks.push("bun".to_string());
        } else if p.join("package-lock.json").exists() {
            frameworks.push("npm".to_string());
        }

        if let Ok(content) = std::fs::read_to_string(p.join("package.json")) {
            if content.contains("\"react\"") || content.contains("\"react-dom\"") {
                frameworks.push("React".to_string());
            }
            if content.contains("\"next\"") {
                frameworks.push("Next.js".to_string());
            }
            if content.contains("\"vue\"") {
                frameworks.push("Vue".to_string());
            }
            if content.contains("\"nuxt\"") {
                frameworks.push("Nuxt".to_string());
            }
            if content.contains("\"svelte\"") {
                frameworks.push("Svelte".to_string());
            }
            if content.contains("\"vite\"") {
                frameworks.push("Vite".to_string());
            }
            if content.contains("\"express\"") {
                frameworks.push("Express".to_string());
            }
            if content.contains("\"@nestjs/core\"") || content.contains("\"@nestjs/common\"") {
                frameworks.push("NestJS".to_string());
            }
            if content.contains("\"fastify\"") {
                frameworks.push("Fastify".to_string());
            }
            if content.contains("\"astro\"") {
                frameworks.push("Astro".to_string());
            }
            if content.contains("\"@remix-run\"") {
                frameworks.push("Remix".to_string());
            }
            if content.contains("\"@tauri-apps/api\"") || content.contains("\"@tauri-apps/cli\"") {
                frameworks.push("Tauri".to_string());
            }
            if content.contains("\"electron\"") {
                frameworks.push("Electron".to_string());
            }
        }
    }

    // Rust
    if p.join("Cargo.toml").exists() {
        if !languages.contains(&"Rust".to_string()) {
            languages.push("Rust".to_string());
        }
        if let Ok(content) = std::fs::read_to_string(p.join("Cargo.toml")) {
            if content.contains("[workspace]") {
                frameworks.push("Cargo Workspace".to_string());
            }
            if content.contains("tauri") {
                frameworks.push("Tauri".to_string());
            }
            if content.contains("axum") {
                frameworks.push("Axum".to_string());
            }
            if content.contains("actix-web") {
                frameworks.push("Actix Web".to_string());
            }
            if content.contains("tokio") {
                frameworks.push("Tokio".to_string());
            }
        }
    }

    // Go
    if p.join("go.mod").exists() {
        if !languages.contains(&"Go".to_string()) {
            languages.push("Go".to_string());
        }
        if let Ok(content) = std::fs::read_to_string(p.join("go.mod")) {
            if content.contains("github.com/gin-gonic/gin") {
                frameworks.push("Gin".to_string());
            }
            if content.contains("github.com/labstack/echo") {
                frameworks.push("Echo".to_string());
            }
            if content.contains("github.com/gofiber/fiber") {
                frameworks.push("Fiber".to_string());
            }
        }
    }

    // Python
    if p.join("pyproject.toml").exists()
        || p.join("requirements.txt").exists()
        || p.join("Pipfile").exists()
    {
        if !languages.contains(&"Python".to_string()) {
            languages.push("Python".to_string());
        }

        if p.join("uv.lock").exists() {
            frameworks.push("uv".to_string());
        } else if p.join("poetry.lock").exists() {
            frameworks.push("Poetry".to_string());
        } else if p.join("Pipfile.lock").exists() {
            frameworks.push("Pipenv".to_string());
        }

        let mut content = String::new();
        if let Ok(c) = std::fs::read_to_string(p.join("pyproject.toml")) {
            content.push_str(&c);
        }
        if let Ok(c) = std::fs::read_to_string(p.join("requirements.txt")) {
            content.push_str(&c);
        }

        let content_lower = content.to_lowercase();
        if content_lower.contains("django") {
            frameworks.push("Django".to_string());
        }
        if content_lower.contains("flask") {
            frameworks.push("Flask".to_string());
        }
        if content_lower.contains("fastapi") {
            frameworks.push("FastAPI".to_string());
        }
        if content_lower.contains("torch") || content_lower.contains("pytorch") {
            frameworks.push("PyTorch".to_string());
        }
        if content_lower.contains("celery") {
            frameworks.push("Celery".to_string());
        }
    }

    // Java
    if p.join("pom.xml").exists() {
        if !languages.contains(&"Java".to_string()) {
            languages.push("Java".to_string());
        }
        if let Ok(content) = std::fs::read_to_string(p.join("pom.xml")) {
            if content.contains("spring-boot") {
                frameworks.push("Spring Boot".to_string());
            }
            if content.contains("quarkus") {
                frameworks.push("Quarkus".to_string());
            }
        }
    } else if p.join("build.gradle").exists() || p.join("build.gradle.kts").exists() {
        let lang = if p.join("build.gradle.kts").exists() {
            "Kotlin"
        } else {
            "Java"
        };
        if !languages.contains(&lang.to_string()) {
            languages.push(lang.to_string());
        }
        let mut content = String::new();
        if let Ok(c) = std::fs::read_to_string(p.join("build.gradle")) {
            content.push_str(&c);
        }
        if let Ok(c) = std::fs::read_to_string(p.join("build.gradle.kts")) {
            content.push_str(&c);
        }
        if content.contains("org.springframework.boot") {
            frameworks.push("Spring Boot".to_string());
        }
    }

    // .NET
    if let Ok(entries) = std::fs::read_dir(p) {
        for e in entries.flatten() {
            if let Some(ext) = e.path().extension().and_then(|s| s.to_str()) {
                if ext == "sln" || ext == "csproj" || ext == "fsproj" {
                    let lang = if ext == "fsproj" { "F#" } else { "C#" };
                    if !languages.contains(&lang.to_string()) {
                        languages.push(lang.to_string());
                    }
                    if let Ok(content) = std::fs::read_to_string(e.path()) {
                        if content.contains("Microsoft.NET.Sdk.Web") {
                            frameworks.push("ASP.NET Core".to_string());
                        }
                    }
                    break;
                }
            }
        }
    }

    // Docker Compose
    if p.join("docker-compose.yml").exists()
        || p.join("docker-compose.yaml").exists()
        || p.join("compose.yml").exists()
        || p.join("compose.yaml").exists()
    {
        frameworks.push("Docker Compose".to_string());
    }

    // Makefile
    if p.join("Makefile").exists() {
        frameworks.push("Make".to_string());
    }

    frameworks.dedup();
    languages.dedup();

    // Map to conceptual category
    let mut category = "Unknown".to_string();

    // Infrastructure
    if frameworks.contains(&"Docker Compose".to_string())
        || frameworks.contains(&"Make".to_string())
    {
        category = "Infrastructure".to_string();
    }

    // Applications (Frontend/Fullstack)
    let app_frameworks = [
        "React",
        "Next.js",
        "Vue",
        "Nuxt",
        "Svelte",
        "Astro",
        "Remix",
        "Tauri",
        "Electron",
        "ASP.NET Core",
    ];
    for af in app_frameworks {
        if frameworks.contains(&af.to_string()) {
            category = "Application".to_string();
            break;
        }
    }

    // Services (Backend API)
    if category == "Unknown" {
        let svc_frameworks = [
            "Express",
            "NestJS",
            "Fastify",
            "Axum",
            "Actix Web",
            "Gin",
            "Echo",
            "Fiber",
            "Django",
            "Flask",
            "FastAPI",
            "Spring Boot",
            "Quarkus",
        ];
        for sf in svc_frameworks {
            if frameworks.contains(&sf.to_string()) {
                category = "Service".to_string();
                break;
            }
        }
    }

    // Libraries / Tools mapping could be refined by looking at package.json "bin" vs "main" or Cargo.toml "[lib]"
    if category == "Unknown" {
        if let Ok(c) = std::fs::read_to_string(p.join("Cargo.toml")) {
            if c.contains("[lib]") {
                category = "Library".to_string();
            } else if c.contains("[[bin]]") {
                category = "Tool".to_string();
            }
        } else if let Ok(c) = std::fs::read_to_string(p.join("package.json")) {
            // Simple heuristic for Node
            if c.contains("\"bin\":") {
                category = "Tool".to_string();
            } else if !c.contains("\"start\":") && !c.contains("\"dev\":") {
                category = "Library".to_string();
            }
        }
    }

    DetectionResult {
        project_type: Some(category),
        languages,
        frameworks,
    }
}
