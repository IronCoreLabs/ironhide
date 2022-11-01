use std::path::PathBuf;

use clap::Parser;

use crate::util::GetKeyfile;

pub mod change_passphrase;
pub mod device_delete;
pub mod device_list;
pub mod lookup;

/// Manage your devices and retrieve information about other users.
#[derive(Parser)]
pub struct User {
    #[clap(subcommand)]
    pub subcmd: UserSubcommands,
}

impl GetKeyfile for User {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        match &self.subcmd {
            UserSubcommands::ChangePassphrase(change_passphrase) => change_passphrase.get_keyfile(),
            UserSubcommands::DeviceDelete(device_delete) => device_delete.get_keyfile(),
            UserSubcommands::DeviceList(device_list) => device_list.get_keyfile(),
            UserSubcommands::UserLookup(lookup) => lookup.get_keyfile(),
        }
    }
}

#[derive(Parser)]
pub enum UserSubcommands {
    #[clap(name = "change-passphrase")]
    ChangePassphrase(change_passphrase::ChangePassphrase),
    #[clap(name = "device-delete")]
    DeviceDelete(device_delete::DeviceDelete),
    #[clap(name = "device-list")]
    DeviceList(device_list::DeviceList),
    #[clap(name = "lookup")]
    UserLookup(lookup::UserLookup),
}
