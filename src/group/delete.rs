use crate::{group_maps, util};
use clap::Parser;
use ironoxide::group::{GroupGetResult, GroupName};
use ironoxide::prelude::{BlockingIronOxide, GroupId};
use itertools::Either;
use yansi::Paint;

use std::path::PathBuf;

#[derive(Parser)]
/// Delete a group given its name. Once deleted all files encrypted to only the group will no longer be able to be decrypted.
pub struct Delete {
    /// Name of the group.
    /// Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = util::group_identifier_from_string))]
    name: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long, max_values = 1)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for Delete {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn group_delete(sdk: &BlockingIronOxide, Delete { name, .. }: Delete) -> Result<(), String> {
    match verify_group(sdk, &name) {
        Ok(group_info) => {
            if !group_info.is_admin() {
                util::println_paint(Paint::red(format!(
                    "You aren't currently an admin of '{}' so you may not delete it.",
                    group_info
                        .name()
                        .map(|x| x.name().as_str())
                        .unwrap_or_else(|| group_info.id().id())
                )))
            } else {
                match sdk.group_delete(group_info.id()) {
                    Ok(_) => {
                        util::println_paint(Paint::green("Group successfully deleted!".to_string()))
                    }
                    Err(_) => {
                        util::println_paint(Paint::red("Group delete request failed.".to_string()))
                    }
                }
            }
        }
        Err(message) => util::println_paint(Paint::red(message)),
    }

    Ok(())
}

/**
 * Deleting a group is currently a risky operation as it nukes the group from the DB. Display a warning to the user on delete telling them the
 * downsides of their decision and make them re-enter the group name to verify the deletion of the group.
 */
pub fn verify_group(
    sdk: &BlockingIronOxide,
    identifier: &Either<GroupName, GroupId>,
) -> Result<GroupGetResult, String> {
    let (groups_by_name, _) = group_maps::get_group_maps(sdk);

    let group_id = group_maps::convert_group_names_to_ids(&[identifier.clone()], &groups_by_name)
        .first()
        .cloned()
        .expect("Unknown group provided.");

    match sdk.group_get_metadata(&group_id) {
        Ok(group_info) => {
            util::println_paint(Paint::yellow(format!("\nWarning! Deleting a group will cause all documents encrypted to only that group to no longer be decryptable! The group you are trying to delete has {} admin(s) and {} member(s).", group_info.admin_list().unwrap_or(&vec![]).len(), group_info.member_list().unwrap_or(&vec![]).len())));
            let group_confirmation: String = promptly::prompt(format!(
                "{}",
                Paint::magenta("Please enter the group identifier (without prefix) again to confirm its deletion ")
            ))
            .map_err(|e| e.to_string())?;

            match identifier {
                Either::Left(group_name) => {
                    verify_group_confirmation(group_name.name(), &group_confirmation, group_info)
                }
                Either::Right(group_id) => {
                    verify_group_confirmation(group_id.id(), &group_confirmation, group_info)
                }
            }
        }
        Err(err) => Err(format!(
            "Was not able to retrieve information about {}: {}",
            group_id.id(),
            err
        )),
    }
}

fn verify_group_confirmation(
    expected_value: &str,
    group_confirmation: &str,
    group_info: GroupGetResult,
) -> Result<GroupGetResult, String> {
    if expected_value != group_confirmation {
        Err(format!("Group confirmation failed. Original group provided was '{}' but confirmation value was '{}'.", expected_value, group_confirmation))
    } else {
        Ok(group_info)
    }
}
