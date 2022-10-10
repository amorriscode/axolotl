use axolotl::{build, init, BuildArgs, InitArgs};
use clap::{Parser, Subcommand};
use std::process::exit;

#[derive(Debug, Parser)]
#[clap(name = "axolotl")]
#[command(version, about, long_about = None)]
struct Args {
    #[clap(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
pub enum Command {
    Init(InitArgs),
    Build(BuildArgs),
}

fn main() {
    let args = Args::parse();

    let res = match args.command {
        Command::Init(args) => init(args),
        Command::Build(args) => build(args),
    };

    if let Err(err) = res {
        println!("{}", err);
        exit(1);
    }
}
