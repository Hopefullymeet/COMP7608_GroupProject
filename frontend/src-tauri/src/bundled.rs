//! Install the platform-specific runtime into a versioned, per-user cache.
use std::{fs, io, path::{Path, PathBuf}, process::Command, time::{SystemTime, UNIX_EPOCH}};

pub fn prepare(resources: &Path, directory: &Path) -> io::Result<PathBuf> {
    let digest = fs::read_to_string(resources.join("runtime.sha256"))?;
    let digest = digest.trim();
    if digest.len() != 64 || !digest.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(io::Error::other("Invalid runtime manifest"));
    }
    let cache = directory.join("desktop-runtime");
    let installed = cache.join(digest);
    if installed.is_dir() { return Ok(installed); }
    fs::create_dir_all(&cache)?;
    let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
    let staging = cache.join(format!(".install-{}-{nonce}", std::process::id()));
    fs::create_dir(&staging)?;
    let result = (|| {
        #[cfg(windows)]
        let mut tar = {
            use std::os::windows::process::CommandExt;
            let system = std::env::var_os("SystemRoot").ok_or_else(|| io::Error::other("Missing Windows system directory"))?;
            let mut command = Command::new(PathBuf::from(system).join("System32/tar.exe"));
            command.creation_flags(0x08000000);
            command
        };
        #[cfg(not(windows))]
        let mut tar = Command::new("/usr/bin/tar");
        if !tar.arg("-xzf").arg(resources.join("runtime.tar.gz")).arg("-C").arg(&staging).status()?.success() {
            return Err(io::Error::other("Could not unpack the PaperTrace runtime"));
        }
        match fs::rename(&staging, &installed) {
            Ok(()) => Ok(()),
            Err(_) if installed.is_dir() => Ok(()),
            Err(error) => Err(error),
        }
    })();
    if staging.exists() { let _ = fs::remove_dir_all(staging); }
    result.map(|_| installed)
}
