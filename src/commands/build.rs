use clap::Args;
use std::error::Error;

#[derive(Debug, Args)]
pub struct BuildArgs {}

pub fn cmd_build(args: BuildArgs) -> Result<(), Box<dyn Error>> {
    println!("{:?}", args);
    Ok(())
}
