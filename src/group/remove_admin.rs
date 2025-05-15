use std::path::PathBuf;

use clap::Parser;
use ironoxide::{
    IronOxideErr,
    group::GroupAccessEditResult,
    prelude::{BlockingIronOxide, GroupId, GroupName, UserId},
};
use itertools::Either;
use yansi::Paint;

use crate::{
    group_maps::{convert_group_names_to_ids, get_group_maps},
    util,
};

const EXAMPLE: &str = "EXAMPLE

    $ ironhide group remove-admin -u test@example.com,test2@example.com myGroup

";

#[derive(Parser)]
/// Remove admins from a group given their email address.
#[clap(after_help = EXAMPLE)]
pub struct RemoveAdmin {
    /// Name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(value_parser = util::group_identifier_from_string)]
    group: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
    /// Remove admin permissions from the comma-separated list of user emails.
    #[clap(value_parser = util::try_from_email, short, long, use_value_delimiter = true, value_delimiter = ',', required = true)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for RemoveAdmin {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn group_remove_admins(
    sdk: &BlockingIronOxide,
    RemoveAdmin { group, users, .. }: RemoveAdmin,
) -> Result<(), String> {
    let (groups_by_name, _) = get_group_maps(sdk);
    match convert_group_names_to_ids(&[group], &groups_by_name).first() {
        Some(group_id) => {
            let removed_admins = sdk.group_remove_admins(group_id, &users);
            let table = build_result_table(removed_admins);
            table.printstd();
        }
        None => {
            util::println_paint(Paint::red("Group does not exist.".to_string()));
        }
    }

    Ok(())
}

fn build_result_table(
    remove_admin_results: Result<GroupAccessEditResult, IronOxideErr>,
) -> prettytable::Table {
    let mut table = table!([Fbb->"User", Fbb->"Result"]);

    match remove_admin_results {
        Ok(results) => {
            for succeeded_id in results.succeeded() {
                table.add_row(row![
                    Fw -> succeeded_id.id(),
                    Fg -> format!("{}", "✔ Removed as admin"),
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
                row![Fw -> "ALL", Fr -> format!("Removing admins failed catastrophically: {}", e)],
            );
        }
    }

    table
}
