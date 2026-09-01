use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use tempfile::tempdir;

#[test]
fn test_pty_creation_and_command_execution() {
    let pty_system = native_pty_system();
    let size = PtySize {
        rows: 24,
        cols: 80,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system.openpty(size).expect("Failed to open PTY");
    let dir = tempdir().unwrap();

    let mut cmd = CommandBuilder::new("sh");
    cmd.cwd(dir.path());
    cmd.env("TERM", "xterm-256color");

    let mut child = pair
        .slave
        .spawn_command(cmd)
        .expect("Failed to spawn shell in PTY");
    let mut reader = pair
        .master
        .try_clone_reader()
        .expect("Failed to clone reader");
    let mut writer = pair.master.take_writer().expect("Failed to take writer");

    // Write command
    writeln!(writer, "echo 'RUNYARD_PTY_OK'").unwrap();
    writer.flush().unwrap();

    let mut output = String::new();
    let mut buf = [0u8; 1024];

    for _ in 0..20 {
        if let Ok(n) = reader.read(&mut buf) {
            if n > 0 {
                output.push_str(&String::from_utf8_lossy(&buf[..n]));
                if output.contains("RUNYARD_PTY_OK") {
                    break;
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    assert!(
        output.contains("RUNYARD_PTY_OK"),
        "PTY output should contain echoed string, got: {}",
        output
    );

    // Cleanly kill child
    let _ = child.kill();
}

#[test]
fn test_utf8_multibyte_boundary_handling() {
    // Test that multi-byte UTF-8 sequences (like 🦀 = [240, 159, 166, 128]) split across chunk reads
    // are correctly handled without producing U+FFFD replacement characters.
    let crab_bytes = "🦀".as_bytes(); // 4 bytes
    assert_eq!(crab_bytes.len(), 4);

    let mut carryover: Vec<u8> = Vec::new();
    let mut reconstructed = String::new();

    // Split across two simulated 2-byte chunks
    let chunk1 = &crab_bytes[0..2];
    let chunk2 = &crab_bytes[2..4];

    // Process chunk 1
    let mut c1 = std::mem::take(&mut carryover);
    c1.extend_from_slice(chunk1);
    let mut valid_up_to = c1.len();
    while valid_up_to > 0 {
        match std::str::from_utf8(&c1[..valid_up_to]) {
            Ok(_) => break,
            Err(e) => {
                let valid = e.valid_up_to();
                if let Some(err_len) = e.error_len() {
                    valid_up_to = valid + err_len;
                } else {
                    valid_up_to = valid;
                    break;
                }
            }
        }
    }
    if valid_up_to > 0 {
        reconstructed.push_str(&String::from_utf8_lossy(&c1[..valid_up_to]));
    }
    if valid_up_to < c1.len() {
        carryover.extend_from_slice(&c1[valid_up_to..]);
    }

    assert_eq!(reconstructed, "");
    assert_eq!(carryover.len(), 2);

    // Process chunk 2
    let mut c2 = std::mem::take(&mut carryover);
    c2.extend_from_slice(chunk2);
    let mut valid_up_to = c2.len();
    while valid_up_to > 0 {
        match std::str::from_utf8(&c2[..valid_up_to]) {
            Ok(_) => break,
            Err(e) => {
                let valid = e.valid_up_to();
                if let Some(err_len) = e.error_len() {
                    valid_up_to = valid + err_len;
                } else {
                    valid_up_to = valid;
                    break;
                }
            }
        }
    }
    if valid_up_to > 0 {
        reconstructed.push_str(&String::from_utf8_lossy(&c2[..valid_up_to]));
    }
    if valid_up_to < c2.len() {
        carryover.extend_from_slice(&c2[valid_up_to..]);
    }

    assert_eq!(reconstructed, "🦀");
    assert!(carryover.is_empty());
}
