use crate::error::{Result, RunyardError};
use crate::models::{GitBranchInfo, GitCommit, GitFileDiff, GitStatus};
use std::process::Command;

pub fn get_git_status(project_path: &str) -> Result<GitStatus> {
    let branch_output = Command::new("git")
        .args(["branch", "--show-current"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;
    
    let branch = if branch_output.status.success() {
        let b = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();
        if b.is_empty() { None } else { Some(b) }
    } else {
        None
    };

    let remote_output = Command::new("git")
        .args(["remote", "get-url", "origin"])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;
    
    let remote_url = if remote_output.status.success() {
        Some(String::from_utf8_lossy(&remote_output.stdout).trim().to_string())
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
                
                if status.chars().next().unwrap_or(' ') != ' ' && status.chars().next().unwrap_or(' ') != '?' {
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
            let parts: Vec<&str> = stdout.trim().split_whitespace().collect();
            if parts.len() == 2 {
                ahead = parts[0].parse().unwrap_or(0);
                behind = parts[1].parse().unwrap_or(0);
            }
        }
    }

    let log_output = Command::new("git")
        .args(["log", "--oneline", "-15", "--format=%H|||%h|||%s|||%an|||%ai"])
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
        is_clean: modified_files.is_empty() && untracked_files.is_empty() && staged_files.is_empty(),
        modified_files,
        untracked_files,
        staged_files,
        ahead,
        behind,
        recent_commits,
    })
}

pub fn get_git_branches(project_path: &str) -> Result<Vec<GitBranchInfo>> {
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

pub fn git_checkout_branch(project_path: &str, branch_name: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["checkout", branch_name])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!("Checkout failed: {}", err)));
    }

    Ok(())
}

pub fn git_create_branch(project_path: &str, branch_name: &str) -> Result<()> {
    let output = Command::new("git")
        .args(["checkout", "-b", branch_name])
        .current_dir(project_path)
        .output()
        .map_err(|e| RunyardError::Git(e.to_string()))?;

    if !output.status.success() {
        let err = String::from_utf8_lossy(&output.stderr);
        return Err(RunyardError::Git(format!("Create branch failed: {}", err)));
    }

    Ok(())
}
