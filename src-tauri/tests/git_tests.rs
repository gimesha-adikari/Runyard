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
