use crate::{
    group_maps::{convert_group_names_to_ids, get_group_maps},
    util,
};
use clap::Parser;
use ironoxide::{
    group::GroupGetResult,
    prelude::{BlockingIronOxide, GroupId, GroupName, IronOxideErr},
};
use itertools::Either;
use prettytable::Row;
use std::path::PathBuf;
use time::OffsetDateTime;

#[derive(Parser)]
/// Get detailed information about a group.
pub struct Info {
    /// Name of the group to retrieve. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(value_parser = util::group_identifier_from_string, num_args = 1.., required = true)]
    name: Either<GroupName, GroupId>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for Info {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn info(sdk: &BlockingIronOxide, Info { name, .. }: Info) -> Result<(), String> {
    let (groups_by_name, _) = get_group_maps(sdk);
    let group_ids = convert_group_names_to_ids(&[name], &groups_by_name);
    let group_id = group_ids.first().unwrap();

    let result = sdk.group_get_metadata(group_id).map(|r| r.into());
    let table = build_table(result);
    table.printstd();

    Ok(())
}

fn build_table(result: Result<GetResult, IronOxideErr>) -> prettytable::Table {
    let mut table = table![];
    match result {
        Ok(get_result) => {
            table.add_row(row![Fbb->"Group", get_result.name]);
            table.add_row(row![Fbb->"ID", get_result.id]);
            table.add_row(create_row("Admin", get_result.is_admin));
            table.add_row(create_row("Member", get_result.is_member));
            table.add_row(row![Fbb->"Created", util::time_format(&get_result.created)]);
            table.add_row(row![Fbb->"Updated", util::time_format(&get_result.updated)]);
            table.add_row(row![Fbb->"Admins", get_result.admins.join("\n")]);
            table.add_row(row![Fbb->"Members", get_result.members.join("\n")]);
        }
        Err(e) => {
            table.add_row(
            row![Fw -> "ALL", Fr -> format!("Getting group info failed catastrophically: {}", e)],
        );
        }
    }
    table
}

fn create_row(label: &str, b: bool) -> Row {
    let cell2 = if b {
        cell![FG -> "✔"]
    } else {
        cell![FR->"✖"]
    };
    Row::new(vec![cell![Fbb-> label], cell2])
}

#[derive(Debug)]
struct GetResult {
    pub members: Vec<String>,
    pub admins: Vec<String>,
    pub updated: OffsetDateTime,
    pub created: OffsetDateTime,
    pub is_admin: bool,
    pub is_member: bool,
    pub id: String,
    pub name: String,
}

impl From<GroupGetResult> for GetResult {
    fn from(get_result: GroupGetResult) -> Self {
        let members = get_result
            .member_list()
            .iter()
            .flat_map(|members| members.iter())
            .map(|member| member.id().to_string())
            .collect();
        let admins = get_result
            .admin_list()
            .into_iter()
            .flat_map(|members| members.iter())
            .map(|member| member.id().to_string())
            .collect();
        GetResult {
            members,
            admins,
            updated: *get_result.last_updated(),
            created: *get_result.created(),
            is_admin: get_result.is_admin(),
            is_member: get_result.is_member(),
            id: get_result.id().id().to_string(),
            name: get_result
                .name()
                .map(|s| s.name().to_string())
                .unwrap_or_else(|| "None".to_string()),
        }
    }
}
