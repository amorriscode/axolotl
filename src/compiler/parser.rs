use std::error::Error;
use swc_common::{
    errors::{ColorConfig, Handler},
    sync::Lrc,
    SourceMap,
};
use swc_ecma_ast::EsVersion;
use swc_ecma_parser::{lexer::Lexer, Capturing, Parser, StringInput, Syntax};

pub fn parse(source: StringInput) -> Result<String, Box<dyn Error>> {
    let cm: Lrc<SourceMap> = Default::default();
    let handler = Handler::with_tty_emitter(ColorConfig::Auto, true, false, Some(cm.clone()));

    let lexer = Lexer::new(
        Syntax::Typescript(Default::default()),
        EsVersion::Es2015,
        source,
        None,
    );

    let capturing = Capturing::new(lexer);

    let mut parser = Parser::new_from(capturing);

    let _module = parser
        .parse_typescript_module()
        .map_err(|e| e.into_diagnostic(&handler).emit())
        .expect("Failed to parse module.");

    println!("Tokens: {:?}", parser.input().take());

    Ok("Ok".to_string())
}
