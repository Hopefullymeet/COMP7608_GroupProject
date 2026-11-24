use std::{ffi::OsString, os::windows::ffi::OsStringExt, path::{Path, PathBuf}, ptr::null_mut, thread, time::Duration};
use windows_sys::Win32::{
    Foundation::{CloseHandle, ERROR_SUCCESS, HWND, LPARAM},
    System::{
        Registry::{RegCloseKey, RegEnumKeyExW, RegGetValueW, RegOpenKeyExW, HKEY, HKEY_CURRENT_USER,
            HKEY_LOCAL_MACHINE, KEY_READ, RRF_RT_REG_SZ},
        Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION},
    },
    UI::{
        Shell::{AssocQueryStringW, ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE},
        WindowsAndMessaging::{EnumWindows, GetForegroundWindow, GetWindowThreadProcessId,
            IsIconic, IsWindowVisible, SetForegroundWindow, ShowWindowAsync, SW_RESTORE},
    },
};

fn wide(text: &str) -> Vec<u16> { text.encode_utf16().chain(Some(0)).collect() }

fn from_wide(buffer: &[u16]) -> PathBuf {
    let end = buffer.iter().position(|&c| c == 0).unwrap_or(buffer.len());
    OsString::from_wide(&buffer[..end]).into()
}

/// The executable registered for the protocol, if the registration still points at a file.
/// A browser that was uninstalled can leave the user's choice behind with no open command.
fn associated_browser(scheme: &str) -> Option<PathBuf> {
    let protocol = wide(scheme);
    let mut size = 0;
    let path = unsafe {
        AssocQueryStringW(ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE, protocol.as_ptr(),
            windows_sys::w!("open"), null_mut(), &mut size);
        let mut buffer = vec![0; size as usize];
        if size == 0 || AssocQueryStringW(ASSOCF_IS_PROTOCOL, ASSOCSTR_EXECUTABLE, protocol.as_ptr(),
            windows_sys::w!("open"), buffer.as_mut_ptr(), &mut size) != 0 { return None; }
        from_wide(&buffer)
    };
    path.is_file().then_some(path)
}

fn registry_string(root: HKEY, key: &str) -> Option<String> {
    let key = wide(key);
    let mut size = 0;
    unsafe {
        if RegGetValueW(root, key.as_ptr(), null_mut(), RRF_RT_REG_SZ, null_mut(), null_mut(), &mut size) != ERROR_SUCCESS {
            return None;
        }
        let mut buffer = vec![0u16; size as usize / 2 + 1];
        let mut size = (buffer.len() * 2) as u32;
        if RegGetValueW(root, key.as_ptr(), null_mut(), RRF_RT_REG_SZ, null_mut(),
            buffer.as_mut_ptr().cast(), &mut size) != ERROR_SUCCESS { return None; }
        from_wide(&buffer).into_os_string().into_string().ok()
    }
}

/// The program part of a shell command such as `"C:\...\msedge.exe" --single-argument %1`.
fn command_program(command: &str) -> PathBuf {
    let command = command.trim();
    match command.strip_prefix('"') {
        Some(rest) => PathBuf::from(rest.split('"').next().unwrap_or_default()),
        None => PathBuf::from(command.split_whitespace().next().unwrap_or_default()),
    }
}

/// Browsers that registered themselves with Windows, used when the default choice is broken.
fn registered_browsers() -> Vec<PathBuf> {
    const CLIENTS: &str = r"SOFTWARE\Clients\StartMenuInternet";
    let mut browsers = Vec::new();
    for root in [HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE] {
        let mut key: HKEY = null_mut();
        if unsafe { RegOpenKeyExW(root, wide(CLIENTS).as_ptr(), 0, KEY_READ, &mut key) } != ERROR_SUCCESS { continue; }
        for index in 0.. {
            let mut name = vec![0u16; 256];
            let mut len = name.len() as u32;
            if unsafe { RegEnumKeyExW(key, index, name.as_mut_ptr(), &mut len, null_mut(), null_mut(), null_mut(), null_mut()) }
                != ERROR_SUCCESS { break; }
            let name = String::from_utf16_lossy(&name[..len as usize]);
            // Internet Explorer is only a stub on current Windows.
            if name.eq_ignore_ascii_case("IEXPLORE.EXE") { continue; }
            let Some(command) = registry_string(root, &format!(r"{CLIENTS}\{name}\shell\open\command")) else { continue };
            let program = command_program(&command);
            if program.is_file() && !browsers.iter().any(|known: &PathBuf| known.as_os_str().eq_ignore_ascii_case(program.as_os_str())) {
                browsers.push(program);
            }
        }
        unsafe { RegCloseKey(key) };
    }
    browsers
}

fn belongs_to_browser(window: HWND, browser: &Path) -> bool {
    if window.is_null() { return false; }
    unsafe {
        let mut pid = 0;
        GetWindowThreadProcessId(window, &mut pid);
        let process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
        if process.is_null() { return false; }
        let mut buffer = vec![0; 32768];
        let mut size = buffer.len() as u32;
        let ok = QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut size);
        CloseHandle(process);
        ok != 0 && Path::new(&OsString::from_wide(&buffer[..size as usize]))
            .as_os_str().eq_ignore_ascii_case(browser.as_os_str())
    }
}

struct WindowSearch<'a> { browser: &'a Path, found: HWND }

unsafe extern "system" fn find_browser_window(window: HWND, data: LPARAM) -> i32 {
    let search = &mut *(data as *mut WindowSearch);
    if IsWindowVisible(window) != 0 && belongs_to_browser(window, search.browser) {
        search.found = window;
        return 0;
    }
    1
}

/// Best effort: the browser may already be in front, or Windows may refuse the focus change.
fn bring_to_front(browser: &Path) {
    for attempt in 0..60 {
        thread::sleep(Duration::from_millis(150));
        if belongs_to_browser(unsafe { GetForegroundWindow() }, browser) { return; }
        if attempt == 8 || attempt == 28 {
            let mut search = WindowSearch { browser, found: null_mut() };
            unsafe {
                EnumWindows(Some(find_browser_window), &mut search as *mut _ as LPARAM);
                if !search.found.is_null() {
                    if IsIconic(search.found) != 0 { ShowWindowAsync(search.found, SW_RESTORE); }
                    SetForegroundWindow(search.found);
                }
            }
        }
    }
}

/// Visible top-level windows of the given browsers with their titles.
fn browser_windows(browsers: &[PathBuf]) -> Vec<(usize, String, usize)> {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetWindowTextW;
    struct Collect<'a> { browsers: &'a [PathBuf], windows: Vec<(usize, String, usize)> }
    unsafe extern "system" fn collect(window: HWND, data: LPARAM) -> i32 {
        let collect = &mut *(data as *mut Collect);
        if IsWindowVisible(window) != 0 {
            if let Some(index) = collect.browsers.iter().position(|browser| belongs_to_browser(window, browser)) {
                let mut title = [0u16; 512];
                let len = GetWindowTextW(window, title.as_mut_ptr(), title.len() as i32).max(0) as usize;
                collect.windows.push((window as usize, String::from_utf16_lossy(&title[..len]), index));
            }
        }
        1
    }
    let mut state = Collect { browsers, windows: Vec::new() };
    unsafe { EnumWindows(Some(collect), &mut state as *mut _ as LPARAM) };
    state.windows
}

/// Waits for a browser to answer the link: it takes the foreground, opens a window, or a
/// window's title changes to the new tab. Nothing is forced to the front while waiting.
fn wait_for_browser<'a>(browsers: &'a [PathBuf], before: &[(usize, String, usize)], timeout: Duration) -> Option<&'a PathBuf> {
    let step = Duration::from_millis(150);
    let mut waited = Duration::ZERO;
    while waited < timeout {
        thread::sleep(step);
        waited += step;
        let window = unsafe { GetForegroundWindow() };
        if let Some(browser) = browsers.iter().find(|browser| belongs_to_browser(window, browser)) {
            return Some(browser);
        }
        if let Some((_, _, index)) = browser_windows(browsers).into_iter()
            .find(|(window, title, _)| !before.iter().any(|(old, old_title, _)| old == window && old_title == title)) {
            return Some(&browsers[index]);
        }
    }
    None
}

/// Hands the link to the desktop's Explorer, which opens it with the user's default browser in
/// the user's own session. A browser that PaperTrace starts itself inherits PaperTrace's
/// process token, and when PaperTrace was launched from a sandboxed tool (Codex, an agent shell)
/// that token cannot write the browser profile: Chrome then crashes (0x80000003) and Edge quits
/// with code 21 before showing anything. Explorer's own process is not affected.
fn hand_to_explorer(url: &str) -> Result<(), String> {
    use windows_sys::Win32::System::SystemInformation::GetSystemWindowsDirectoryW;
    let mut directory = vec![0; 32768];
    let len = unsafe { GetSystemWindowsDirectoryW(directory.as_mut_ptr(), directory.len() as u32) } as usize;
    if len == 0 || len >= directory.len() { return Err("Windows could not locate Explorer.".into()); }
    let explorer = from_wide(&directory[..len]).join("explorer.exe");
    // Explorer forwards the request to the running shell and always exits with code 1.
    use std::process::{Command, Stdio};
    Command::new(explorer).arg(url).stdin(Stdio::null()).stdout(Stdio::null()).stderr(Stdio::null())
        .spawn().map(|_| ()).map_err(|error| error.to_string())
}

/// Starts a browser ourselves, used when Explorer did not bring a browser forward.
/// A launcher that exits with an error right away did not open the page.
fn launch(program: &Path, url: &str) -> Result<(), String> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::{
        Foundation::{GetLastError, WAIT_TIMEOUT},
        System::Threading::{GetExitCodeProcess, WaitForSingleObject},
        UI::{Shell::{ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOASYNC, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW},
            WindowsAndMessaging::SW_SHOWNORMAL},
    };
    let file: Vec<u16> = program.as_os_str().encode_wide().chain(Some(0)).collect();
    // A parsed URL never contains a quote or a space, so quoting keeps it one argument.
    let parameters = wide(&format!("\"{url}\""));
    let mut info: SHELLEXECUTEINFOW = unsafe { std::mem::zeroed() };
    info.cbSize = std::mem::size_of::<SHELLEXECUTEINFOW>() as u32;
    info.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_NOASYNC | SEE_MASK_FLAG_NO_UI;
    info.lpVerb = windows_sys::w!("open");
    info.lpFile = file.as_ptr();
    info.lpParameters = parameters.as_ptr();
    info.nShow = SW_SHOWNORMAL;
    unsafe {
        if ShellExecuteExW(&mut info) == 0 {
            return Err(std::io::Error::from_raw_os_error(GetLastError() as i32).to_string());
        }
        if info.hProcess.is_null() { return Ok(()); }
        let waited = WaitForSingleObject(info.hProcess, 1500);
        let mut code = 0;
        let exited = waited != WAIT_TIMEOUT && GetExitCodeProcess(info.hProcess, &mut code) != 0;
        CloseHandle(info.hProcess);
        if exited && code != 0 { Err(format!("quit with exit code {code:#x}")) } else { Ok(()) }
    }
}

/// A readable name for the status line.
fn browser_name(program: &Path) -> String {
    match program.file_stem().and_then(|stem| stem.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "chrome" => "Google Chrome".into(),
        "msedge" => "Microsoft Edge".into(),
        "firefox" => "Firefox".into(),
        _ => program.file_stem().map(|stem| stem.to_string_lossy().into_owned()).unwrap_or_default(),
    }
}

/// True when PaperTrace runs below medium integrity. Windows starts an EXE at low integrity
/// when the file carries a low mandatory label, which sandboxed coding tools (Codex, agent
/// shells) put on project folders. A low-integrity process cannot start Explorer (0xc0000142)
/// or a browser that writes the user's profile (Chrome crashes, Edge exits with code 21).
fn runs_at_low_integrity() -> bool {
    use windows_sys::Win32::{
        Security::{GetSidSubAuthority, GetSidSubAuthorityCount, GetTokenInformation, TokenIntegrityLevel, TOKEN_MANDATORY_LABEL, TOKEN_QUERY},
        System::Threading::{GetCurrentProcess, OpenProcessToken},
    };
    const MEDIUM: u32 = 0x2000;
    unsafe {
        let mut token = null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 { return false; }
        let mut buffer = [0u64; 32];
        let mut len = 0;
        let ok = GetTokenInformation(token, TokenIntegrityLevel, buffer.as_mut_ptr().cast(),
            std::mem::size_of_val(&buffer) as u32, &mut len);
        CloseHandle(token);
        if ok == 0 { return false; }
        let sid = (*(buffer.as_ptr() as *const TOKEN_MANDATORY_LABEL)).Label.Sid;
        let count = *GetSidSubAuthorityCount(sid) as u32;
        count > 0 && *GetSidSubAuthority(sid, count - 1) < MEDIUM
    }
}

/// Opens the URL and returns the browser's name for the status line.
pub fn open(url: tauri::Url) -> Result<String, String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::{AllowSetForegroundWindow, ASFW_ANY};
    if runs_at_low_integrity() {
        let location = std::env::current_exe().ok().and_then(|exe| exe.parent().map(|dir| dir.display().to_string()))
            .unwrap_or_else(|| "its folder".into());
        return Err(format!("PaperTrace is running at low integrity because {location} carries a low mandatory label             (added by a sandboxed coding tool), so Windows will not let it start a browser. Run the EXE from a folder             without that label, or copy the link below."));
    }
    let url = url.as_str();
    let browsers: Vec<_> = associated_browser("https").into_iter().chain(registered_browsers()).collect();
    unsafe { AllowSetForegroundWindow(ASFW_ANY) };

    let before = browser_windows(&browsers);
    let handed = hand_to_explorer(url);
    if handed.is_ok() {
        if let Some(browser) = wait_for_browser(&browsers, &before, Duration::from_secs(5)) {
            return Ok(browser_name(browser));
        }
    }

    let mut errors: Vec<String> = handed.as_ref().err().map(|error| format!("Explorer: {error}")).into_iter().collect();
    for browser in &browsers {
        match launch(browser, url) {
            Ok(()) => {
                bring_to_front(browser);
                return Ok(browser_name(browser));
            }
            Err(error) => errors.push(format!("{}: {error}", browser_name(browser))),
        }
    }
    if errors.is_empty() && browsers.is_empty() {
        // Explorer took the link but no known browser answered; it may still open elsewhere.
        return Ok("your default browser".into());
    }
    let note = if handed.is_ok() { " Explorer was asked to open the link but no browser answered." } else { "" };
    Err(format!("{}.{note} Choose a default browser in Windows Settings > Apps > Default apps, or copy the link below.",
        errors.join("; ")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_program_from_shell_commands() {
        assert_eq!(command_program(r#""C:\Program Files\Edge\msedge.exe" --single-argument %1"#),
            PathBuf::from(r"C:\Program Files\Edge\msedge.exe"));
        assert_eq!(command_program(r"C:\Tools\browser.exe %1"), PathBuf::from(r"C:\Tools\browser.exe"));
    }

    #[test]
    fn reads_the_integrity_level() {
        println!("low integrity: {}", runs_at_low_integrity());
    }

    #[test]
    fn finds_an_existing_browser() {
        let found: Vec<_> = associated_browser("https").into_iter().chain(registered_browsers()).collect();
        println!("browser candidates: {found:?}");
        assert!(found.iter().all(|path| path.is_file()));
    }
}



#[cfg(test)]
mod launch_probe {
    /// Opens a real browser tab: `cargo test --bin papertrace launch_probe -- --ignored --nocapture`.
    #[test]
    #[ignore]
    fn opens_a_page() {
        println!("{:?}", super::open(tauri::Url::parse("https://www.iana.org/domains/reserved").unwrap()));
    }
}
