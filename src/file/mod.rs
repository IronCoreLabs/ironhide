use std::path::PathBuf;

use clap::Parser;

use crate::util;

pub mod decrypt;
pub mod encrypt;
pub mod grant;
pub mod info;
pub mod revoke;

/// Encrypt and decrypt files, display information about encrypted files, and grant or revoke access to encrypted files.
#[derive(Parser)]
pub struct File {
    #[clap(subcommand)]
    pub subcmd: FileSubcommands,
}

impl util::GetKeyfile for File {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        match &self.subcmd {
            FileSubcommands::Decrypt(decrypt) => decrypt.get_keyfile(),
            FileSubcommands::Encrypt(encrypt) => encrypt.get_keyfile(),
            FileSubcommands::Grant(grant) => grant.get_keyfile(),
            FileSubcommands::Info(info) => info.get_keyfile(),
            FileSubcommands::Revoke(revoke) => revoke.get_keyfile(),
        }
    }
}

#[derive(Parser)]
pub enum FileSubcommands {
    #[clap(name = "decrypt")]
    Decrypt(decrypt::Decrypt),
    #[clap(name = "encrypt")]
    Encrypt(encrypt::Encrypt),
    #[clap(name = "info")]
    Info(info::Info),
    #[clap(name = "grant")]
    Grant(grant::Grant),
    #[clap(name = "revoke")]
    Revoke(revoke::Revoke),
}
