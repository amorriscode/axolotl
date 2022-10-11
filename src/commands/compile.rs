use clap::Args;
use std::{
    error::Error,
    fs::File,
    io::{read_to_string, stdin, stdout},
    path::{Path, PathBuf},
};
use swc_common::sync::Lrc;
use swc_common::{FileName, SourceFile, SourceMap};
use swc_ecma_parser::StringInput;

use crate::compile;

#[derive(Debug, Args)]
pub struct CompileArgs {
    /// The TypeScript file to compile (or stdin if omitted)
    #[arg(short, long)]
    input: Option<String>,

    /// The destination for the axolotl output (or stdout if omitted)
    #[arg(short, long)]
    output: Option<String>,
}

pub fn cmd_compile(args: CompileArgs) -> Result<(), Box<dyn Error>> {
    let input_file: Option<PathBuf> = match args.input {
        Some(path) => Some(Path::new(&path).to_path_buf()),
        None => None,
    };
    let output_file: Option<PathBuf> = match args.output {
        Some(path) => Some(Path::new(&path).to_path_buf()),
        None => None,
    };
    let cm: Lrc<SourceMap> = Default::default();

    let program_name = match (&input_file, &output_file) {
        (Some(path), _) => format!("{}", path.display()),
        (None, Some(path)) => format!("{}", path.display()),
        (None, None) => "axolotl_program".to_string(),
    };

    let input: Lrc<SourceFile> = match input_file {
        Some(path) => match path.exists() {
            true => cm.load_file(&path)?,
            false => return Err(format!("Failed to parse input file: {}", path.display()).into()),
        },
        None => cm.new_source_file(FileName::Custom("temp.ts".into()), read_to_string(stdin())?),
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

    let typescripe_src = StringInput::from(&*input);

    let rust_src = compile(typescripe_src, program_name)?;

    output.write_all(&rust_src.as_bytes())?;

    Ok(())
}
