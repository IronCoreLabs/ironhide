use std::path::PathBuf;

use clap::Parser;
use ironoxide::{
    group::GroupAccessEditResult,
    prelude::{BlockingIronOxide, GroupId, GroupName, UserId},
    IronOxideErr,
};
use itertools::Either;

use crate::{
    group_maps::{self, convert_group_names_to_ids},
    util,
};

const EXAMPLE: &str = "EXAMPLE

    $ ironhide group remove-member -u test@example.com,test2@example.com myGroup

";

#[derive(Parser)]
/// Remove members from a group given their email address.
#[clap(after_help = EXAMPLE)]
pub struct RemoveMember {
    /// Name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = util::group_identifier_from_string))]
    group: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
    /// Remove member permissions from the comma-separated list of user emails.
    #[clap(parse(try_from_str = util::try_from_email), short, long, use_value_delimiter = true, require_value_delimiter = true, required = true)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for RemoveMember {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn group_remove_members(
    sdk: &BlockingIronOxide,
    RemoveMember { group, users, .. }: RemoveMember,
) -> Result<(), String> {
    let (groups_by_name, _) = group_maps::get_group_maps(sdk);
    let group_id = convert_group_names_to_ids(&[group], &groups_by_name)
        .first()
        .cloned()
        .expect("Group doesn't have an ID.");

    let removed_members = sdk.group_remove_members(&group_id, &users);
    let table = build_result_table(removed_members);
    table.printstd();

    Ok(())
}

fn build_result_table(
    remove_member_results: Result<GroupAccessEditResult, IronOxideErr>,
) -> prettytable::Table {
    let mut table = table!([Fbb->"User", Fbb->"Result"]);

    match remove_member_results {
        Ok(results) => {
            for succeeded_id in results.succeeded() {
                table.add_row(row![
                    Fw -> succeeded_id.id(),
                    Fg -> format!("{}", "✔ Removed as member"),
                ]);
            }
            for failure in results.failed() {
                table.add_row(row![
                    Fw -> failure.user().id(),
                    Fr -> failure.error(),
                ]);
            }
        }
        Err(e) => {
            table.add_row(
                row![Fw -> "ALL", Fr -> format!("Removing members failed catastrophically: {}", e)],
            );
        }
    }

    table
}
