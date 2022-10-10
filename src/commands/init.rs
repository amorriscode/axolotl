use clap::Args;
use std::error::Error;

#[derive(Debug, Args)]
pub struct InitArgs {
    #[clap(value_parser)]
    name: String,
}

pub fn init(args: InitArgs) -> Result<(), Box<dyn Error>> {
    println!("{:?}", args);
    Ok(())
}
