use std::{env, path::PathBuf, process::Command};

fn main() {
    println!("cargo:rerun-if-changed=../scripts/pdf-wheel.mjs");
    println!("cargo:rerun-if-changed=../scripts/pdf-wheels.json");
    let wheel = PathBuf::from(env::var_os("OUT_DIR").unwrap()).join("pdf-engine.whl");
    let status = Command::new("node")
        .arg("../scripts/pdf-wheel.mjs")
        .arg(env::var("TARGET").unwrap())
        .arg(wheel)
        .status()
        .expect("Node is required to prepare the PDF engine");
    assert!(status.success(), "Could not package the PDF engine");
    tauri_build::build();
}
