use axolotl::{build, init, BuildArgs, InitArgs};
use clap::{Parser, Subcommand};
use std::process::exit;

#[derive(Debug, Parser)]
#[clap(name = "axolotl")]
#[command(version, about, long_about = None)]
struct Args {
    #[clap(subcommand)]
    command: AxolotlCommand,
}

#[derive(Debug, Subcommand)]
pub enum AxolotlCommand {
    Init(InitArgs),
    Build(BuildArgs),
}

fn main() {
    let args = Args::parse();

    let res = match args.command {
        AxolotlCommand::Init(args) => init(args),
        AxolotlCommand::Build(args) => build(args),
    };

    if let Err(err) = res {
        println!("{}", err);
        exit(1);
    }
}
