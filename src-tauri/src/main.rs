// Evita abrir una consola de Windows en release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    writeflow_lib::run()
}
