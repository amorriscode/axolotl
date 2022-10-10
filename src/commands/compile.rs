use clap::Args;
use std::{
    error::Error,
    fs::File,
    io::{stdin, stdout},
    path::{Path, PathBuf},
};

#[derive(Debug, Args)]
pub struct CompileArgs {
    /// The TypeScript file to compile (or stdin if omitted)
    #[arg(short, long)]
    input: Option<String>,

    /// The destination for the axolotl output (or stdout if omitted)
    #[arg(short, long)]
    output: Option<String>,
}

pub fn compile(args: CompileArgs) -> Result<(), Box<dyn Error>> {
    let input_file: Option<PathBuf> = match args.input {
        Some(path) => Some(Path::new(&path).to_path_buf()),
        None => None,
    };
    let output_file: Option<PathBuf> = match args.output {
        Some(path) => Some(Path::new(&path).to_path_buf()),
        None => None,
    };

    let _program_name = match (&input_file, &output_file) {
        (Some(path), _) => format!("{}", path.display()),
        (None, Some(path)) => format!("{}", path.display()),
        (None, None) => "axolotl_program".to_string(),
    };

    let mut input: Box<dyn std::io::Read + 'static> = match input_file {
        Some(path) => match File::open(&path) {
            Ok(file) => Box::new(file),
            Err(_) => return Err(format!("Failed to parse input file: {}", path.display()).into()),
        },
        None => Box::new(stdin()),
    };

    let mut output: Box<dyn std::io::Write + 'static> = match output_file {
        Some(path) => match File::create(&path) {
            Ok(file) => Box::new(file),
            Err(_) => {
                return Err(format!("Failed to create output file: {}", path.display()).into())
            }
        },
        None => Box::new(stdout()),
    };

    let mut ts_src = String::new();
    input.read_to_string(&mut ts_src)?;

    output.write_all(&ts_src.as_bytes())?;

    Ok(())
}
