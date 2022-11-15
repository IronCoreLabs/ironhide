use crate::group_maps::{convert_group_names_to_ids, get_group_maps};
use crate::util::{group_already_known, group_identifier_from_string, println_paint, GetKeyfile};
use clap::Parser;
use ironoxide::group::GroupName;
use ironoxide::prelude::{BlockingIronOxide, GroupId};
use itertools::Either;
use yansi::Paint;

use std::convert::TryFrom;
use std::path::PathBuf;

const EXAMPLE: &str = "EXAMPLE

    $ ironhide group rename myGroup newGroup

";

#[derive(Parser)]
#[clap(after_help = EXAMPLE)]
/// Change the name of a group. Won't change any of the group admins, members, or files encrypted to the group.
pub struct Rename {
    /// Current name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = group_identifier_from_string))]
    current_group_name: Either<GroupName, GroupId>,
    /// New name of the group.
    #[clap(parse(try_from_str = GroupName::try_from))]
    new_group_name: GroupName,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
}

impl GetKeyfile for Rename {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn group_rename(
    sdk: &BlockingIronOxide,
    Rename {
        current_group_name,
        new_group_name,
        ..
    }: Rename,
) -> Result<(), String> {
    if group_already_known(sdk, &new_group_name) {
        println_paint(Paint::red(format!(
            "You're already in a group with the name {}. Please pick a different name.",
            new_group_name.name()
        )));
    } else if new_group_name.name().contains('^') || new_group_name.name().contains(',') {
        println_paint(Paint::red(
            "Group names cannot contain commas or carets.".to_string(),
        ));
    } else {
        let (groups_by_name, _) = get_group_maps(sdk);
        match convert_group_names_to_ids(&[current_group_name], &groups_by_name).first() {
            Some(group_id) => {
                match sdk.group_update_name(group_id, Some(&new_group_name)) {
                    Ok(_) => {
                        println_paint(Paint::green("Group name successfully updated.".to_string()));
                    }
                    Err(err) => {
                        println_paint(Paint::red(format!("Group could not be updated: {}", err)));
                    }
                };
            }
            None => {
                println_paint(Paint::red("Group does not exist.".to_string()));
            }
        }
    }
    Ok(())
}
