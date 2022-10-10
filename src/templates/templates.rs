use clap::crate_version;
use regex::Regex;
use std::{
    error::Error,
    fs::{create_dir_all, File},
    io::{Read, Write},
    path::Path,
};
use toml_edit::{Document, Item};

pub static TS_PATH: &str = "programs_ts";
static PROGRAM_TEMPLATE: &str = include_str!("./program_template.ts");
static README_TEMPALTE: &str = include_str!("./README.md");

fn inject_variables(mut text: String, project_name: &str) -> String {
    let project_name_regex = Regex::new(r"\{\{project_name\}\}").unwrap();
    let version_regex = Regex::new(r"\{\{version\}\}").unwrap();

    text = project_name_regex
        .replace_all(&text, project_name)
        .to_string();

    text = version_regex
        .replace_all(&text, crate_version!())
        .to_string();

    text
}

pub fn write_templates(project_name: &str, project_path: &Path) -> Result<(), Box<dyn Error>> {
    let src_path = project_path.join(TS_PATH);
    let program_path = project_path.join("programs").join(project_name);
    let src_filename = format!("{}.ts", project_name);

    create_dir_all(src_path.clone())?;

    let mut src_file = File::create(src_path.join(src_filename))?;
    src_file.write_all(inject_variables(PROGRAM_TEMPLATE.to_string(), project_name).as_bytes())?;

    let mut readme_file = File::create(project_path.join("README.md"))?;
    readme_file
        .write_all(inject_variables(README_TEMPALTE.to_string(), project_name).as_bytes())?;

    // Load Cargo.toml for Anchor project
    let cargo_toml_path = program_path.join("Cargo.toml");
    let mut cargo_toml = String::new();
    File::open(&cargo_toml_path)?.read_to_string(&mut cargo_toml)?;
    let mut cargo_toml = cargo_toml.as_str().parse::<Document>().unwrap();

    // Add anchor-spl as a dependency
    let anchor_version = cargo_toml["dependencies"]["anchor-lang"].clone();
    cargo_toml["dependencies"]["anchor-lang"] = anchor_version.clone();
    cargo_toml["dependencies"]["anchor-spl"] = anchor_version.clone();

    File::create(&cargo_toml_path)?.write_all(cargo_toml.to_string().as_bytes())?;

    // Load Anchor.toml for Anchor project
    let anchor_toml_path = project_path.join("Anchor.toml");
    let mut anchor_toml = String::new();
    File::open(&anchor_toml_path)?.read_to_string(&mut anchor_toml)?;
    let mut anchor_toml = anchor_toml.as_str().parse::<Document>().unwrap();

    // Add seeds feature
    anchor_toml["features"]["seeds"] = "true".parse::<Item>().unwrap();

    File::create(&anchor_toml_path)?.write_all(anchor_toml.to_string().as_bytes())?;

    Ok(())
}
