use clap::Args;
use heck::ToSnakeCase;
use std::{error::Error, path::Path, process::Command};

use crate::{validate_dependency, write_templates, TS_PATH};

#[derive(Debug, Args)]
pub struct InitArgs {
    /// The name of your Solana project
    #[arg(required = true)]
    project_name: String,
}

pub fn cmd_init(args: InitArgs) -> Result<(), Box<dyn Error>> {
    if &args.project_name.to_snake_case() != &args.project_name {
        return Err(format!(
            "Project name must be snake case. Re-run the command: axolotl init {}",
            args.project_name.to_snake_case()
        )
        .into());
    }

    let project_path = Path::new(&args.project_name);
    if project_path.exists() {
        return Err("Project directory already exists!".into());
    }

    println!("Initializing {}...", &args.project_name);

    println!("Validating dependencies...");
    match validate_dependency(
        "anchor",
        "--version",
        "anchor-cli (.+)",
        ">=0.25.0",
        concat!(
            "axolotl depends on the Anchor framework for Solana programs.\n",
            "For instructions on how to install Anchor, visit:\n",
            "https://book.anchor-lang.com/getting_started/installation.html"
        ),
    ) {
        Ok(result) => println!("{}", result),
        Err(e) => return Result::Err(e),
    };

    match validate_dependency(
        "solana",
        "--version",
        r"solana-cli (\S+)",
        ">=1.14.4",
        concat!(
            "axolotl depends on the Solana tool suite..\n",
            "For instructions on how to install Solana, visit:\n",
            "https://docs.solana.com/cli/install-solana-cli-tools"
        ),
    ) {
        Ok(result) => println!("{}", result),
        Err(e) => return Result::Err(e),
    };

    println!("All dependencies satisfied!");

    println!("Initializing an Anchor project...");
    let anchor_output = Command::new("anchor")
        .args(["init", project_path.to_str().unwrap()])
        .output()
        .unwrap();
    if !anchor_output.status.success() {
        return Err(format!(
            "Failed to initialize anchor project: {}",
            String::from_utf8(anchor_output.stderr)?
        )
        .into());
    }
    println!("Initialized Anchor project!");

    println!("Creating project files...");
    match write_templates(&args.project_name, project_path) {
        Ok(_) => println!("Project files created!"),
        Err(e) => return Result::Err(e),
    };

    println!("Adding @axolotl-sol/ts library...");
    let yarn_output = Command::new("yarn")
        .args([
            "--cwd",
            project_path.to_str().unwrap(),
            "add",
            "@axolotl-sol/ts",
        ])
        .output()
        .unwrap();
    if !yarn_output.status.success() {
        return Err(format!(
            "Failed to install @axolotl-sol/ts library: {}",
            String::from_utf8(yarn_output.stderr)?
        )
        .into());
    }

    println!("{} initialized!", &args.project_name);

    let entry_point = project_path
        .join(TS_PATH)
        .join(format!("{}.ts", args.project_name.to_snake_case()));
    println!("Open {} to get started!", entry_point.to_str().unwrap());

    Ok(())
}
