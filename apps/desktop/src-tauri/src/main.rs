// 防止 Windows release 构建额外弹出控制台窗口，请勿移除。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    desktop_lib::run()
}
