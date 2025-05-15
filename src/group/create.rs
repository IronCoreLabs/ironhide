use crate::util::{GetKeyfile, group_already_known, println_paint};
use clap::Parser;
use ironoxide::group::GroupName;
use ironoxide::prelude::BlockingIronOxide;
use yansi::Paint;

use ironoxide::IronOxideErr;
use std::convert::TryFrom;
use std::path::PathBuf;

const EXAMPLE: &str = "EXAMPLE

    Create a new group with the name 'myGroup'
        $ ironhide group create myGroup

";

#[derive(Parser)]
#[clap(after_help = EXAMPLE)]
/// Create a new cryptographic group. Upon creation of the group you will become both an admin and a member of the
/// group. This generates a public key for the group and uploads it to the IronCore service.
pub struct Create {
    /// Name for the group. Will be used when referencing this group from all other
    /// commands.
    #[clap(value_parser = parse_group_name)]
    name: GroupName,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
}

pub(crate) fn parse_group_name(s: &str) -> Result<GroupName, IronOxideErr> {
    GroupName::try_from(s)
}

impl GetKeyfile for Create {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn group_create(sdk: &BlockingIronOxide, Create { name, .. }: Create) -> Result<(), String> {
    if group_already_known(sdk, &name) {
        println_paint(Paint::red(format!(
            "You're already in a group with the name {}",
            name.name()
        )));
    } else if name.name().contains('^') || name.name().contains(',') {
        println_paint(Paint::red(
            "Group names cannot contain commas or carets.".to_string(),
        ));
    } else {
        // change this if https://github.com/IronCoreLabs/ironoxide/issues/263 ever is finished
        let options = ironoxide::group::GroupCreateOpts::new(
            None,
            Some(name.clone()),
            true,
            true,
            None,
            Vec::new(),
            Vec::new(),
            false,
        );
        match sdk.group_create(&options) {
            Ok(group) => {
                let mut table =
                    table!([Fbb->"Group Name", Fbb->"Group ID", Fbb->"Admin", Fbb -> "Member"]);
                table.add_row(
                    row![group.name().unwrap().name(), group.id().id(), Fg -> "✔", Fg -> "✔"],
                );
                println_paint(Paint::green("New group successfully created.".to_string()));
                table.printstd();
            }
            Err(err) => {
                println_paint(Paint::red(format!(
                    "Failed to create group {}: {}",
                    name.name(),
                    err
                )));
            }
        };
    }

    Ok(())
}
