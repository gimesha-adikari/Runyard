use crate::error::{Result, RunyardError};
use crate::models::{GitBranchInfo, GitCommit, GitFileDiff, GitInstalledInfo, GitStatus};
use std::process::Command;

pub fn detect_git() -> GitInstalledInfo {
    let which_out = Command::new("which").arg("git").output();
    let path = match which_out {
        Ok(out) if out.status.success() => {
            let p = String::from_utf8_lossy(&out.stdout).trim().to_string();
            if p.is_empty() {
                None
            } else {
                Some(p)
            }
        }
        _ => None,
    };

    let ver_out = Command::new("git").arg("--version").output();
    let (is_installed, version) = match ver_out {
        Ok(out) if out.status.success() => {
            let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
            (true, Some(v))
        }
        _ => (false, None),
    };

    GitInstalledInfo {
        is_installed,
        path,
        version,
    }
}

pub fn ensure_git_repository(project_path: &str) -> Result<()> {
    let path = std::path::Path::new(project_path);
    if !path.exists() {
        return Err(RunyardError::Validation(format!(
            "Project path does not exist: {}",
            project_path
        )));
    }

    let output = Command::new("git")
        .args(["rev-parse", "--is-inside-work-tree"])
        .current_dir(project_path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                RunyardError::Git(
                    "Git executable not found in system PATH. Please install Git.".to_string(),
                )
            } else {
                RunyardError::Git(e.to_string())
            }
        })?;

    if !output.status.success() {
        return Err(RunyardError::Git(format!(
            "'{}' is not a Git repository or worktree",
            project_path
        )));
    }

    Ok(())
}

pub fn get_git_status(project_path: &str) -> Result<GitStatus> {
    ensure_git_repository(project_path)?;

    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    let branch = if branch_output.status.success() {
        let b = String::from_utf8_lossy(&branch_output.stdout)
            .trim()
            .to_string();
        if b.is_empty() {
            let head_output = Command::new("git")
                .args(["rev-parse", "--short", "HEAD"])
                .current_dir(project_path)
                .output();
            match head_output {
                Ok(h) if h.status.success() => {
                    let h_str = String::from_utf8_lossy(&h.stdout).trim().to_string();
                    if h_str.is_empty() {
                        None
                    } else {
                        Some(format!("HEAD (detached at {})", h_str))
                    }
                }
                _ => None,
            }
        } else {
            Some(b)
        }
    } else {
        None
    };

    let remote_output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    let remote_url = if remote_output.status.success() {
        Some(
            String::from_utf8_lossy(&remote_output.stdout)
                .trim()
                .to_string(),
        )
    } else {
        None
    };

    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    let mut modified_files = Vec::new();
    let mut untracked_files = Vec::new();
    let mut staged_files = Vec::new();

    if status_output.status.success() {
        let stdout = String::from_utf8_lossy(&status_output.stdout);
        for line in stdout.lines() {
            if line.len() > 3 {
                let status = &line[0..2];
                let file = line[3..].to_string();
                if status.starts_with('?') {
                    untracked_files.push(file.clone());
                } else if status.starts_with(' ') || status.starts_with('M') {
                    modified_files.push(file.clone());
                }

                if status.chars().next().unwrap_or(' ') != ' '
                    && status.chars().next().unwrap_or(' ') != '?'
                {
                    staged_files.push(file);
                }
            }
        }
    }

    let mut ahead = 0;
    let mut behind = 0;

    let rev_output = Command::new("git")
        .args(["rev-list", "--count", "--left-right", "HEAD...@{upstream}"])
        .current_dir(project_path)
        .output();

    if let Ok(out) = rev_output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = stdout.split_whitespace().collect();
            if parts.len() == 2 {
                ahead = parts[0].parse().unwrap_or(0);
                behind = parts[1].parse().unwrap_or(0);
            }
        }
    }

    let log_output = Command::new("git")
        .args([
            "log",
            "--oneline",
            "-15",
            "--format=%H|||%h|||%s|||%an|||%ai",
        ])
        .current_dir(project_path)
        .output();

    let mut recent_commits = Vec::new();
    if let Ok(out) = log_output {
        if out.status.success() {
            let stdout = String::from_utf8_lossy(&out.stdout);
            for line in stdout.lines() {
                let parts: Vec<&str> = line.split("|||").collect();
                if parts.len() >= 5 {
                    recent_commits.push(GitCommit {
                        hash: parts[0].to_string(),
                        short_hash: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author: parts[3].to_string(),
                        date: parts[4].to_string(),
                    });
                }
            }
        }
    }

    Ok(GitStatus {
        branch,
        remote_url,
        is_clean: modified_files.is_empty()
            && untracked_files.is_empty()
            && staged_files.is_empty(),
        modified_files,
        untracked_files,
        staged_files,
        ahead,
        behind,
        recent_commits,
    })
}

pub fn get_git_branches(project_path: &str) -> Result<Vec<GitBranchInfo>> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["branch", "-a", "--format=%(refname:short)|||%(HEAD)"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    if !output.status.success() {
        return Ok(Vec::new());
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut branches = Vec::new();

    for line in stdout.lines() {
        let parts: Vec<&str> = line.split("|||").collect();
        if !parts.is_empty() {
            let name = parts[0].to_string();
            let is_current = parts.get(1).map(|h| h.trim() == "*").unwrap_or(false);
            let is_remote = name.starts_with("origin/") || name.starts_with("remotes/");
            branches.push(GitBranchInfo {
                name,
                is_current,
                is_remote,
            });
        }
    }

    Ok(branches)
}

pub fn get_file_diff(project_path: &str, file_path: &str, staged: bool) -> Result<GitFileDiff> {
    ensure_git_repository(project_path)?;

    let mut cmd = Command::new("git");
    cmd.current_dir(project_path);
    if staged {
        cmd.args(["diff", "--staged", "--", file_path]);
    } else {
        cmd.args(["diff", "HEAD", "--", file_path]);
    }

    let output = cmd.output().map_err(|e| RunyardError::Git(e.to_string()))?;
    let diff = if output.status.success() {
        String::from_utf8_lossy(&output.stdout).to_string()
    } else {
        String::new()
    };

    Ok(GitFileDiff {
        path: file_path.to_string(),
        diff,
        is_staged: staged,
    })
}

pub fn git_fetch(project_path: &str) -> Result<String> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["fetch"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!("Git fetch failed: {}", err)));
    }

    Ok("Fetch successful".to_string())
}

pub fn git_pull(project_path: &str) -> Result<String> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["pull", "--ff-only"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!("Git pull failed: {}", err)));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn validate_branch_name(branch_name: &str) -> Result<()> {
    let name = branch_name.trim();
    if name.is_empty() {
        return Err(RunyardError::Validation(
            "Branch name cannot be empty".to_string(),
        ));
    }
    if name.starts_with('-') {
        return Err(RunyardError::Validation(
            "Branch name cannot start with '-'".to_string(),
        ));
    }
    if name.contains('\0')
        || name.contains(' ')
        || name.contains("..")
        || name.contains('~')
        || name.contains('^')
        || name.contains(':')
    {
        return Err(RunyardError::Validation(format!(
            "Branch name '{}' contains invalid characters",
            branch_name
        )));
    }
    Ok(())
}

pub fn git_checkout_branch(project_path: &str, branch_name: &str) -> Result<()> {
    ensure_git_repository(project_path)?;
    validate_branch_name(branch_name)?;

    let output = Command::new("git")
        .args(["checkout", branch_name])
        .current_dir(project_path)
        .output()
        .map_err(|e| {
            RunyardError::Git(format!(
                "Failed to execute git checkout in '{}': {}",
                project_path, e
            ))
        })?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!(
            "Checkout of '{}' failed in '{}': {}",
            branch_name,
            project_path,
            err.trim()
        )));
    }

    Ok(())
}

pub fn git_create_branch(project_path: &str, branch_name: &str) -> Result<()> {
    ensure_git_repository(project_path)?;
    validate_branch_name(branch_name)?;

    let output = Command::new("git")
        .args(["checkout", "-b", branch_name])
        .current_dir(project_path)
        .output()
        .map_err(|e| {
            RunyardError::Git(format!(
                "Failed to execute git branch creation in '{}': {}",
                project_path, e
            ))
        })?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!(
            "Create branch '{}' failed in '{}': {}",
            branch_name,
            project_path,
            err.trim()
        )));
    }

    Ok(())
}

pub fn git_stage_file(project_path: &str, file_path: &str) -> Result<()> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["add", "--", file_path])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(format!("Failed to execute git add: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!(
            "Git stage failed: {}",
            err.trim()
        )));
    }

    Ok(())
}

pub fn git_stage_all(project_path: &str) -> Result<()> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["add", "-A"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(format!("Failed to execute git add -A: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!(
            "Git stage all failed: {}",
            err.trim()
        )));
    }

    Ok(())
}

pub fn git_unstage_file(project_path: &str, file_path: &str) -> Result<()> {
    ensure_git_repository(project_path)?;

    let head_exists = Command::new("git")
        .args(["rev-parse", "--verify", "HEAD"])
        .current_dir(project_path)
        .output()
        .map(|out| out.status.success())
        .unwrap_or(false);

    let output = if head_exists {
        Command::new("git")
            .args(["restore", "--staged", "--", file_path])
            .current_dir(project_path)
            .output()
    } else {
        Command::new("git")
            .args(["rm", "--cached", "-r", "--", file_path])
            .current_dir(project_path)
            .output()
    }
    .map_err(|e| RunyardError::Git(format!("Failed to execute git unstage: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!(
            "Git unstage failed: {}",
            err.trim()
        )));
    }

    Ok(())
}

pub fn git_commit(project_path: &str, message: &str) -> Result<String> {
    ensure_git_repository(project_path)?;

    let trimmed = message.trim();
    if trimmed.is_empty() {
        return Err(RunyardError::Validation(
            "Commit message cannot be empty".to_string(),
        ));
    }

    let output = Command::new("git")
        .args(["commit", "-m", trimmed])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(format!("Failed to execute git commit: {}", e)))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        let out = String::from_utf8_lossy(&output.stdout);
        let combined = if err.trim().is_empty() { out } else { err };
        return Err(RunyardError::Git(format!(
            "Git commit failed: {}",
            combined.trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}

pub fn git_push(project_path: &str) -> Result<String> {
    ensure_git_repository(project_path)?;

    let output = Command::new("git")
        .args(["push"])
        .current_dir(project_path)
        .output()
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::NotFound {
                RunyardError::Git(
                    "Git executable not found in system PATH. Please install Git.".to_string(),
                )
            } else {
                RunyardError::Git(format!("Failed to execute git push: {}", e))
            }
        })?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let combined = if err.is_empty() { out } else { err };

        if combined.contains("Permission denied")
            || combined.contains("Authentication failed")
            || combined.contains("Could not read from remote repository")
        {
            return Err(RunyardError::Git(format!(
                "Git push authentication failed: {}",
                combined
            )));
        } else if combined.contains("no upstream branch")
            || combined.contains("has no upstream branch")
        {
            return Err(RunyardError::Git(format!(
                "No upstream configured for branch. Please push with upstream set: {}",
                combined
            )));
        }

        return Err(RunyardError::Git(format!("Git push failed: {}", combined)));
    }

    let out = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if out.is_empty() {
        let err = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if err.is_empty() {
            Ok("Push successful".to_string())
        } else {
            Ok(err)
        }
    } else {
        Ok(out)
    }
}
