use clap::Parser;

use crate::util::GetKeyfile;

pub mod add_admin;
pub mod add_member;
pub mod create;
pub mod delete;
pub mod info;
pub mod list;
pub mod remove_admin;
pub mod remove_member;
pub mod rename;

/// Manage your cryptographic groups. Display groups you're a part of, create new groups, and manage group admins and members.
#[derive(Parser)]
pub struct Group {
    #[clap(subcommand)]
    pub subcmd: GroupSubcommands,
}

impl GetKeyfile for Group {
    fn get_keyfile(&self) -> Option<&std::path::PathBuf> {
        match &self.subcmd {
            GroupSubcommands::AddAdmin(add_admin) => add_admin.get_keyfile(),
            GroupSubcommands::AddMember(add_member) => add_member.get_keyfile(),
            GroupSubcommands::Create(create) => create.get_keyfile(),
            GroupSubcommands::Delete(delete) => delete.get_keyfile(),
            GroupSubcommands::Info(info) => info.get_keyfile(),
            GroupSubcommands::List(list) => list.get_keyfile(),
            GroupSubcommands::RemoveAdmin(remove_admin) => remove_admin.get_keyfile(),
            GroupSubcommands::RemoveMember(remove_member) => remove_member.get_keyfile(),
            GroupSubcommands::Rename(rename) => rename.get_keyfile(),
        }
    }
}

#[derive(Parser)]
pub enum GroupSubcommands {
    #[clap(name = "add-admin")]
    AddAdmin(add_admin::AddAdmin),
    #[clap(name = "add-member")]
    AddMember(add_member::AddMember),
    #[clap(name = "create")]
    Create(create::Create),
    #[clap(name = "delete")]
    Delete(delete::Delete),
    #[clap(name = "info")]
    Info(info::Info),
    #[clap(name = "list")]
    List(list::List),
    #[clap(name = "remove-admin")]
    RemoveAdmin(remove_admin::RemoveAdmin),
    #[clap(name = "remove-member")]
    RemoveMember(remove_member::RemoveMember),
    #[clap(name = "rename")]
    Rename(rename::Rename),
}
