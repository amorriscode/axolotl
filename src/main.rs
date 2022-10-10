use axolotl::{build, init, BuildArgs, InitArgs};
use clap::{Parser, Subcommand};
use std::process::exit;

#[derive(Debug, Parser)]
#[clap(name = "axolotl")]
#[command(version, about = "A toolchain that helps you write Anchor-compatible Solana programs in TypeScript", long_about = None)]
struct Args {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Initialize a new Axolotl project
    Init(InitArgs),
    /// Compile your TypeScript source code to Anchor/Rust
    Build(BuildArgs),
}

fn main() {
    let args = Args::parse();

    let res = match args.command {
        Commands::Init(args) => init(args),
        Commands::Build(args) => build(args),
    };

    if let Err(err) = res {
        println!("{}", err);
        exit(1);
    }
}
