use crate::{
    group_maps::{convert_group_names_to_ids, get_group_maps},
    util,
};
use clap::Parser;
use ironoxide::{
    group::GroupAccessEditResult,
    prelude::{BlockingIronOxide, GroupId, GroupName, UserId},
    IronOxideErr,
};
use itertools::Either;
use std::path::PathBuf;
use yansi::Paint;

const EXAMPLE: &str = "EXAMPLE

    $ ironhide group add-member -u test@example.com,test2@example.com myGroup

";

#[derive(Parser)]
/// Add members to a group by email address. Members can decrypt all content that has been shared with the group.
#[clap(after_help = EXAMPLE)]
pub struct AddMember {
    /// Name of the group.
    /// Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = util::group_identifier_from_string), required = true)]
    group: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
    /// (required) Add member permissions to the comma-separated list of user emails.
    #[clap(parse(try_from_str = util::try_from_email), short, long, use_value_delimiter = true, require_value_delimiter = true, required = true, min_values = 1)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for AddMember {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn add_members(sdk: &BlockingIronOxide, add_member: AddMember) -> Result<(), String> {
    let (groups_by_name, _) = get_group_maps(sdk);
    let requested_group = convert_group_names_to_ids(&[add_member.group.clone()], &groups_by_name)
        .first()
        .cloned()
        .expect("Unknown group provided.");
    let response = sdk
        .group_add_members(&requested_group, &add_member.users)
        .map_err(|e| match e {
            IronOxideErr::NotGroupAdmin(_) => Paint::red(format!(
                "Failed to add members: You are not an admin of group {} therefore you cannot manage its members.\n",
                requested_group.id()
            )),
            IronOxideErr::RequestError { .. } => Paint::red("Failed to add members: Unable to complete request to add members to the group.\n".to_string()),
            _ => Paint::red("Failed to add members to group.".to_string()),
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
        table.add_row(row![Fw -> user.id(), Fg -> format!("{} Added as member", '\u{2713}')]);
    });
    result.failed().iter().for_each(|err| {
        table.add_row(row![Fw -> err.user().id(), Fr -> err.error()]);
    });

    table
}
