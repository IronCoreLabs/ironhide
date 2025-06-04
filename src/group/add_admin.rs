use crate::{
    group_maps::{convert_group_names_to_ids, get_group_maps},
    util,
};
use clap::Parser;
use ironoxide::{
    IronOxideErr,
    group::GroupAccessEditResult,
    prelude::{BlockingIronOxide, GroupId, GroupName, UserId},
};
use itertools::Either;
use std::path::PathBuf;
use yansi::Paint;

const EXAMPLE: &str = "EXAMPLE

    $ ironhide group add-admin -u test@example.com,test2@example.com myGroup

";

#[derive(Parser)]
/// Add an admin to a group using their email address. Admins will be able to manage the group name, members, admins, and to delete the group.
#[clap(after_help = EXAMPLE)]
pub struct AddAdmin {
    /// Name of the group.
    /// Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(value_parser = util::group_identifier_from_string, required = true)]
    group: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
    /// Add admin permissions to the comma-separated list of user emails.
    #[clap(value_parser = util::try_from_email, short, long, use_value_delimiter = true, value_delimiter = ',', required = true, num_args = 1..)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for AddAdmin {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn add_admins(sdk: &BlockingIronOxide, add_admin: AddAdmin) -> Result<(), String> {
    let (groups_by_name, _) = get_group_maps(sdk);
    let requested_group = convert_group_names_to_ids(&[add_admin.group.clone()], &groups_by_name)
        .first()
        .cloned()
        .expect("Unknown group provided.");
    let response = sdk
        .group_add_admins(&requested_group, &add_admin.users)
        .map_err(|e| match e {
            IronOxideErr::NotGroupAdmin(_) => Paint::red(format!(
                "Failed to add admins: You are not an admin of group {}.\n",
                requested_group.id()
            )),
            _ => Paint::red("Failed to add admins to group.".to_string()),
        });
    match response {
        Ok(result) => {
            build_result_table(result).printstd();
        }
        Err(error_message) => util::print_paint(error_message),
    }

    Ok(())
}

fn build_result_table(result: GroupAccessEditResult) -> prettytable::Table {
    let mut table = table!([Fbb->"User", Fbb->"Result"]);
    result.succeeded().iter().for_each(|user| {
        table.add_row(row![Fw -> user.id(), Fg -> format!("{} Added as admin", '\u{2713}')]);
    });
    result.failed().iter().for_each(|err| {
        table.add_row(row![Fw -> err.user().id(), Fr -> err.error()]);
    });

    table
}
