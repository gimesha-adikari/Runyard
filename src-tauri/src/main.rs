#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    env_logger::init();
    
    if let Err(e) = runyard_lib::db::initialize() {
        log::error!("Failed to initialize database: {}", e);
    }
    
    runyard_lib::run();
}
