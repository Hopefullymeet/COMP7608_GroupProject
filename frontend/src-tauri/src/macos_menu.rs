use tauri::{
    menu::{AboutMetadata, Menu, PredefinedMenuItem as Item, Submenu, HELP_SUBMENU_ID, WINDOW_SUBMENU_ID},
    AppHandle,
};

pub fn install(app: &AppHandle, chinese: bool) -> tauri::Result<()> {
    let label = |zh, en| if chinese { zh } else { en };
    let about = AboutMetadata {
        name: Some("PaperTrace".into()),
        version: Some(app.package_info().version.to_string()),
        ..Default::default()
    };
    let application = Submenu::with_items(app, "PaperTrace", true, &[
        &Item::about(app, Some(label("关于 PaperTrace", "About PaperTrace")), Some(about))?,
        &Item::separator(app)?,
        &Item::services(app, Some(label("服务", "Services")))?,
        &Item::separator(app)?,
        &Item::hide(app, Some(label("隐藏 PaperTrace", "Hide PaperTrace")))?,
        &Item::hide_others(app, Some(label("隐藏其他", "Hide Others")))?,
        &Item::show_all(app, Some(label("全部显示", "Show All")))?,
        &Item::separator(app)?,
        &Item::quit(app, Some(label("退出 PaperTrace", "Quit PaperTrace")))?,
    ])?;
    let file = Submenu::with_items(app, label("文件", "File"), true, &[
        &Item::close_window(app, Some(label("关闭窗口", "Close Window")))?,
    ])?;
    let edit = Submenu::with_items(app, label("编辑", "Edit"), true, &[
        &Item::undo(app, Some(label("撤销", "Undo")))?,
        &Item::redo(app, Some(label("重做", "Redo")))?,
        &Item::separator(app)?,
        &Item::cut(app, Some(label("剪切", "Cut")))?,
        &Item::copy(app, Some(label("复制", "Copy")))?,
        &Item::paste(app, Some(label("粘贴", "Paste")))?,
        &Item::select_all(app, Some(label("全选", "Select All")))?,
    ])?;
    let view = Submenu::with_items(app, label("显示", "View"), true, &[
        &Item::fullscreen(app, Some(label("切换全屏幕", "Toggle Full Screen")))?,
    ])?;
    let window = Submenu::with_id_and_items(app, WINDOW_SUBMENU_ID, label("窗口", "Window"), true, &[
        &Item::minimize(app, Some(label("最小化", "Minimize")))?,
        &Item::maximize(app, Some(label("缩放", "Zoom")))?,
        &Item::separator(app)?,
        &Item::close_window(app, Some(label("关闭窗口", "Close Window")))?,
    ])?;
    let help = Submenu::with_id(app, HELP_SUBMENU_ID, label("帮助", "Help"), true)?;
    app.set_menu(Menu::with_items(app, &[&application, &file, &edit, &view, &window, &help])?)?;
    window.set_as_windows_menu_for_nsapp()?;
    help.set_as_help_menu_for_nsapp()
}
