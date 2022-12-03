use std::error::Error;

use swc_ecma_ast::*;
use swc_ecma_parser::StringInput;
use swc_ecma_visit::*;

use crate::parse;

pub fn compile(
    typescript_src: StringInput,
    _program_name: String,
) -> Result<String, Box<dyn Error>> {
    let typescript_source = typescript_src.clone();

    let parsed_src = parse(typescript_source)?;

    let mut compiler = AxolotlCompiler {};
    compiler.visit_module(&parsed_src);

    Ok("Compilation complete!".to_string())
}

struct AxolotlCompiler;
impl Visit for AxolotlCompiler {
    fn visit_function(&mut self, function: &Function) {
        function.visit_children_with(self);
        println!("function found {:?}", function);
    }

    fn visit_params(&mut self, params: &[Param]) {
        params.visit_children_with(self);
        println!("params found {:?}", params);
    }

    fn visit_block_stmt(&mut self, block_stmt: &BlockStmt) {
        block_stmt.visit_children_with(self);
        println!("block_stmt found {:?}", block_stmt);
    }
}
