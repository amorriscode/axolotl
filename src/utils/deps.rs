use std::{
    error::Error,
    io::ErrorKind,
    process::{Command, Stdio},
};

use regex::Regex;
use semver::{Version, VersionReq};

fn parse_semver(regex: &str, output: &str) -> Result<Version, semver::Error> {
    let semver_regex = Regex::new(regex).unwrap();
    let semver_capture = semver_regex.captures(output).unwrap();
    Version::parse(&semver_capture[1])
}

pub fn validate_dependency(
    program: &str,
    version_arg: &str,
    program_regex: &str,
    expected_version: &str,
    not_found_instructions: &str,
) -> Result<String, Box<dyn Error>> {
    match Command::new(program)
        .arg(version_arg)
        .stdout(Stdio::piped())
        .spawn()
    {
        Ok(process) => {
            let output = process
                .wait_with_output()
                .expect(&format!("Failed to run {}", program));

            let existing_semver =
                parse_semver(program_regex, &String::from_utf8(output.stdout).unwrap()).unwrap();

            let expected_semver = VersionReq::parse(expected_version).unwrap();

            if !expected_semver.matches(&existing_semver) {
                return Err(format!(
                    "axolotl requires {} {} but found {}",
                    program, expected_version, existing_semver
                )
                .into());
            } else {
                Ok(format!(
                    "{} satisfied with version {}",
                    program, existing_semver
                ))
            }
        }
        Err(e) => {
            if e.kind() == ErrorKind::NotFound {
                return Err(format!("{} not found! {}", program, not_found_instructions).into());
            } else {
                return Err(e.into());
            }
        }
    }
}
