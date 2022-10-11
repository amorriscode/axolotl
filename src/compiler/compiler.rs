use std::error::Error;

use swc_ecma_parser::StringInput;

use crate::parse;

pub fn compile(
    typescript_src: StringInput,
    _program_name: String,
) -> Result<String, Box<dyn Error>> {
    let typescript_source = typescript_src.clone();

    let _parsed_src = parse(typescript_source)?;

    Ok("LFG".to_string())
}
