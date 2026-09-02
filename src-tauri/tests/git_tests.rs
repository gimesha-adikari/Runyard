use std::fs;
use std::process::Command;
use tempfile::tempdir;

#[test]
fn test_git_operations_with_spaces_in_paths() {
    let dir = tempdir().unwrap();
    let root = dir.path().join("My Projects Directory");
    fs::create_dir_all(&root).unwrap();

    Command::new("git")
        .args(["init"])
        .current_dir(&root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(&root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(&root)
        .status()
        .unwrap();

    let file_with_spaces = root.join("My Cool File.txt");
    fs::write(&file_with_spaces, "initial content\n").unwrap();
    Command::new("git")
        .args(["add", "My Cool File.txt"])
        .current_dir(&root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "init with space"])
        .current_dir(&root)
        .status()
        .unwrap();

    // 1. Status
    let status = runyard_lib::git::get_git_status(root.to_str().unwrap()).unwrap();
    assert!(status.is_clean);

    // 2. Diff
    fs::write(&file_with_spaces, "modified content\n").unwrap();
    let diff =
        runyard_lib::git::get_file_diff(root.to_str().unwrap(), "My Cool File.txt", false).unwrap();
    assert!(diff.diff.contains("+modified content"));

    // 3. Branches
    runyard_lib::git::git_create_branch(root.to_str().unwrap(), "feature-spaces").unwrap();
    let branches = runyard_lib::git::get_git_branches(root.to_str().unwrap()).unwrap();
    assert!(branches
        .iter()
        .any(|b| b.name == "feature-spaces" && b.is_current));
}

#[test]
fn test_git_branch_name_validation_and_injection_prevention() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    Command::new("git")
        .args(["init"])
        .current_dir(root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(root)
        .status()
        .unwrap();
    fs::write(root.join("init.txt"), "init\n").unwrap();
    Command::new("git")
        .args(["add", "init.txt"])
        .current_dir(root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["commit", "-m", "init"])
        .current_dir(root)
        .status()
        .unwrap();

    // 1. Rejects branch names starting with '-'
    let res_flag = runyard_lib::git::git_create_branch(root.to_str().unwrap(), "-D");
    assert!(res_flag.is_err());

    let res_help = runyard_lib::git::git_checkout_branch(root.to_str().unwrap(), "--help");
    assert!(res_help.is_err());

    // 2. Rejects empty branch names
    let res_empty = runyard_lib::git::git_create_branch(root.to_str().unwrap(), "   ");
    assert!(res_empty.is_err());

    // 3. Rejects invalid characters
    let res_inv =
        runyard_lib::git::git_create_branch(root.to_str().unwrap(), "feature name with space");
    assert!(res_inv.is_err());
}

#[test]
fn test_non_git_directory_rejected() {
    let dir = tempdir().unwrap();
    let root = dir.path().to_str().unwrap();

    let res_status = runyard_lib::git::get_git_status(root);
    assert!(res_status.is_err());
    let err_msg = res_status.unwrap_err().to_string();
    assert!(err_msg.contains("not a Git repository"));

    let res_branches = runyard_lib::git::get_git_branches(root);
    assert!(res_branches.is_err());

    let res_stage = runyard_lib::git::git_stage_file(root, "foo.txt");
    assert!(res_stage.is_err());
}

#[test]
fn test_git_stage_unstage_commit_lifecycle() {
    let dir = tempdir().unwrap();
    let root = dir.path();

    Command::new("git")
        .args(["init"])
        .current_dir(root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.name", "Test"])
        .current_dir(root)
        .status()
        .unwrap();
    Command::new("git")
        .args(["config", "user.email", "test@test.com"])
        .current_dir(root)
        .status()
        .unwrap();

    let root_str = root.to_str().unwrap();
    let file1 = root.join("file1.txt");
    let file2 = root.join("file2.txt");
    fs::write(&file1, "content1\n").unwrap();
    fs::write(&file2, "content2\n").unwrap();

    // Initially untracked
    let status0 = runyard_lib::git::get_git_status(root_str).unwrap();
    assert_eq!(status0.untracked_files.len(), 2);
    assert!(status0.staged_files.is_empty());

    // Stage single file
    runyard_lib::git::git_stage_file(root_str, "file1.txt").unwrap();
    let status1 = runyard_lib::git::get_git_status(root_str).unwrap();
    assert!(status1.staged_files.contains(&"file1.txt".to_string()));
    assert_eq!(status1.untracked_files.len(), 1);

    // Unstage file
    runyard_lib::git::git_unstage_file(root_str, "file1.txt").unwrap();
    let status2 = runyard_lib::git::get_git_status(root_str).unwrap();
    assert!(status2.staged_files.is_empty());

    // Stage all
    runyard_lib::git::git_stage_all(root_str).unwrap();
    let status3 = runyard_lib::git::get_git_status(root_str).unwrap();
    assert_eq!(status3.staged_files.len(), 2);

    // Empty commit message rejected
    let res_empty_commit = runyard_lib::git::git_commit(root_str, "   ");
    assert!(res_empty_commit.is_err());

    // Valid commit
    let commit_res = runyard_lib::git::git_commit(root_str, "initial feature commit").unwrap();
    assert!(!commit_res.is_empty());

    let status4 = runyard_lib::git::get_git_status(root_str).unwrap();
    assert!(status4.is_clean);
    assert_eq!(status4.recent_commits.len(), 1);
    assert_eq!(status4.recent_commits[0].message, "initial feature commit");

    // Detect git
    let git_info = runyard_lib::git::detect_git();
    assert!(git_info.is_installed);
    assert!(git_info.version.is_some());
}
