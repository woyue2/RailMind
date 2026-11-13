use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_log::{Target, TargetKind};

#[cfg(windows)]
use windows_sys::Win32::{
    Foundation::HWND,
    UI::WindowsAndMessaging::{
        GetSystemMetrics, GetWindowLongPtrW, SetForegroundWindow, SetWindowLongPtrW,
        SetWindowPos, SystemParametersInfoW, GWL_EXSTYLE, HWND_BOTTOM, HWND_TOPMOST,
        SM_CXSCREEN, SM_CYSCREEN, SPI_GETWORKAREA, SWP_FRAMECHANGED, SWP_NOACTIVATE,
        SWP_NOMOVE, SWP_NOSIZE, SWP_SHOWWINDOW, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        WS_EX_TOOLWINDOW,
    },
};

#[cfg(windows)]
#[repr(C)]
struct RECT {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

const SIDEBAR_WIDTH: i32 = 420;

fn toggle_window_pin(hwnd: isize, is_pinned: &AtomicBool) {
    #[cfg(windows)]
    unsafe {
        let hwnd = hwnd as HWND;
        let was_pinned = is_pinned.load(Ordering::SeqCst);
        if was_pinned {
            // 切换到置顶浮动模式，并主动获取焦点便于直接打字输入
            SetWindowPos(
                hwnd,
                HWND_TOPMOST,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW,
            );
            SetForegroundWindow(hwnd);
            is_pinned.store(false, Ordering::SeqCst);
        } else {
            // 归位到桌面底层贴底
            SetWindowPos(
                hwnd,
                HWND_BOTTOM,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW,
            );
            is_pinned.store(true, Ordering::SeqCst);
        }
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .targets([
                    Target::new(TargetKind::Stdout),
                    Target::new(TargetKind::LogDir { file_name: None }),
                    Target::new(TargetKind::Webview),
                ])
                .level(log::LevelFilter::Info)
                .build(),
        )
        .setup(|app| {
            log::info!("RailMind Desktop starting up...");
            let window = app.get_webview_window("main").expect("main window not found");

            #[cfg(windows)]
            {
                if let Ok(raw_hwnd) = window.hwnd() {
                    let hwnd = raw_hwnd.0 as HWND;
                    unsafe {
                        // 1. 设置为 ToolWindow：不出现在 Alt+Tab 切换列表中
                        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
                        SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | (WS_EX_TOOLWINDOW as isize));

                        // 2. 获取主屏幕工作区（避开 Windows 底部任务栏）
                        let mut work_area = RECT { left: 0, top: 0, right: 0, bottom: 0 };
                        let success = SystemParametersInfoW(
                            SPI_GETWORKAREA,
                            0,
                            &mut work_area as *mut _ as *mut _,
                            0 as SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
                        );

                        let (x, y, w, h) = if success != 0 {
                            let height = work_area.bottom - work_area.top;
                            let left = work_area.right - SIDEBAR_WIDTH;
                            (left, work_area.top, SIDEBAR_WIDTH, height)
                        } else {
                            let screen_w = GetSystemMetrics(SM_CXSCREEN);
                            let screen_h = GetSystemMetrics(SM_CYSCREEN);
                            (screen_w - SIDEBAR_WIDTH, 0, SIDEBAR_WIDTH, screen_h)
                        };

                        // 3. 初始吸附到桌面最右侧，先置顶显示出来，让用户立即看到右侧抽屉
                        SetWindowPos(
                            hwnd,
                            HWND_TOPMOST,
                            x,
                            y,
                            w,
                            h,
                            SWP_SHOWWINDOW | SWP_FRAMECHANGED,
                        );
                        SetForegroundWindow(hwnd);
                    }
                }
            }

            // 4. 构建系统托盘图标
            let toggle_pin = MenuItem::with_id(app, "toggle_pin", "切换置顶 / 桌面贴底", true, None::<&str>)?;
            let reload_item = MenuItem::with_id(app, "reload", "刷新看板", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;

            let tray_menu = Menu::with_items(app, &[&toggle_pin, &reload_item, &quit_item])?;

            // 初始状态为未贴底（即置顶可见），用户点击托盘后即可贴底至桌面
            let is_pinned_to_bottom = Arc::new(AtomicBool::new(false));
            let is_pinned_menu = Arc::clone(&is_pinned_to_bottom);
            let is_pinned_click = Arc::clone(&is_pinned_to_bottom);

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app_handle, event| {
                    match event.id.as_ref() {
                        "toggle_pin" => {
                            if let Some(win) = app_handle.get_webview_window("main") {
                                if let Ok(raw_hwnd) = win.hwnd() {
                                    toggle_window_pin(raw_hwnd.0 as isize, &is_pinned_menu);
                                }
                            }
                        }
                        "reload" => {
                            if let Some(win) = app_handle.get_webview_window("main") {
                                let _ = win.eval("window.location.reload()");
                            }
                        }
                        "quit" => {
                            app_handle.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(move |tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app_handle = tray.app_handle();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            if let Ok(raw_hwnd) = win.hwnd() {
                                toggle_window_pin(raw_hwnd.0 as isize, &is_pinned_click);
                            }
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
