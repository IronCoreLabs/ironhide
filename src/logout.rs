use crate::util;
use clap::Parser;
use std::path::PathBuf;

#[derive(Parser)]
pub struct Logout {
    #[clap(short, long, default_value = "false", num_args = 0)]
    pub force: bool,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for Logout {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}
