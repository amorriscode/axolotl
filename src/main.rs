use axolotl::{cmd_build, cmd_compile, cmd_init, BuildArgs, CompileArgs, InitArgs};
use clap::{Parser, Subcommand};
use std::process::exit;

#[derive(Debug, Parser)]
#[clap(name = "axolotl")]
#[command(version, about = "A toolchain that helps you write Anchor-compatible Solana programs in TypeScript", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
pub enum Commands {
    /// Initialize a new Axolotl project
    Init(InitArgs),
    /// Compile your TypeScript source code to Anchor/Rust
    Build(BuildArgs),
    /// Compiles a single Seahorse file
    Compile(CompileArgs),
}

fn main() {
    let args = Cli::parse();

    let res = match args.command {
        Commands::Init(args) => cmd_init(args),
        Commands::Build(args) => cmd_build(args),
        Commands::Compile(args) => cmd_compile(args),
    };

    if let Err(err) = res {
        println!("{}", err);
        exit(1);
    }
}
