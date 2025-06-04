use ironoxide::{
    group::{GroupId, GroupListResult, GroupMetaResult, GroupName},
    prelude::BlockingIronOxide,
};
use itertools::Either;
use prettytable::{Attr, Cell, Row, color};
use std::collections::HashMap;
use yansi::Paint;

use crate::util::{self, println_paint, time_format};

type GroupsByName = HashMap<GroupName, Vec<GroupMetaResult>>;
type GroupsById = HashMap<GroupId, GroupMetaResult>;

// TODO: add static caching here so we don't always have to call out to ironcore id for the groups

/// Convert a list of groups from the SDK response into a map from the provided index (name or id) to the group details.
pub fn create_group_map_by_index(group_result: GroupListResult) -> (GroupsByName, GroupsById) {
    group_result.result().iter().fold(
        (HashMap::new(), HashMap::new()),
        |(mut groups_by_name, mut groups_by_id), group| {
            groups_by_id.insert(group.id().clone(), group.clone());

            // If the group doesn't have a name (will only happen if the group was created outside of the CLI) we just omit it from the by-name map. The user
            // will have to provide the group by id in that case.
            if let Some(group_name) = group.name() {
                let existing_entry = groups_by_name
                    .entry(group_name.clone())
                    .or_insert_with(Vec::default);
                existing_entry.push(group.clone());
            }

            (groups_by_name, groups_by_id)
        },
    )
}

/// Get a map from group id to group information for all the groups the user is a part of.
pub fn get_group_maps(sdk: &BlockingIronOxide) -> (GroupsByName, GroupsById) {
    let groups = sdk.group_list().unwrap();

    create_group_map_by_index(groups)
}

/// Take a list of group names and map them to a list of group ids. If any name provided can't be mapped it won't be
/// included. If only a group id is available, use `ironhide group list` to get the group name.
pub fn convert_group_names_to_ids(
    group_names: &[Either<GroupName, GroupId>],
    groups_by_name: &GroupsByName,
) -> Vec<GroupId> {
    // Iterate through each group resolve the group names to ids. They'll all be auto resolved unless
    // we find a group name which has a duplicate. In that case we'll ask the user for their choice before proceeding.
    group_names
        .iter()
        .fold(Vec::new(), |mut resolved_names, provided_identifier| {
            match provided_identifier {
                Either::Left(provided_name) => {
                    if let Some(group_at_key) = groups_by_name.get(provided_name) {
                        match group_at_key.len() {
                            num if num > 1 => {
                                // There's more than one group with the same name we need to ask the user which one they want to use.
                                println_paint(Paint::yellow(format!(
                                    "Multiple groups found with the provided name {}.",
                                    provided_name.name()
                                )));
                                group_choice_table(group_at_key).printstd();
                                let group_choice: usize = promptly::prompt(format!(
                                    "{}",
                                    Paint::yellow("Which one do you want to use? ")
                                ))
                                .map_err(|e| e.to_string())
                                .unwrap();

                                resolved_names.push(group_at_key[group_choice - 1].id().clone());
                            }
                            1 => {
                                // There's just the one group with that name, we're good.
                                resolved_names.push(group_at_key[0].id().clone());
                            }
                            _ => {
                                // we got a "valid" name that didn't match up to any names we know about, so we'll just log and exclude it
                                util::print_paint(Paint::red(format!(
                                    "Couldn't find group ID for {}\n",
                                    provided_name.name()
                                )));
                            }
                        }
                    } else {
                        // we got an invalid name that didn't match up to any names we know about, so we'll just log and exclude it
                        util::print_paint(Paint::red(format!(
                            "Couldn't find group ID for {}\n",
                            provided_name.name()
                        )));
                    }
                }
                Either::Right(group_id) => {
                    resolved_names.push(group_id.clone());
                    return resolved_names;
                }
            }

            resolved_names
        })
}

fn group_choice_table(groups: &[GroupMetaResult]) -> prettytable::Table {
    let mut table = table!([Fbb=>"Option", "ID", "Admin", "Member", "Created", "Updated"]);
    let check = Cell::new("✓").with_style(Attr::ForegroundColor(color::GREEN));
    let nope = Cell::new("✗").with_style(Attr::ForegroundColor(color::RED));
    for (index, group) in groups.iter().enumerate() {
        let is_admin = if group.is_admin() {
            check.clone()
        } else {
            nope.clone()
        };
        let is_member = if group.is_member() {
            check.clone()
        } else {
            nope.clone()
        };
        table.add_row(Row::new(vec![
            cell!(Fw -> index + 1),
            cell!(Fw -> group.id().id()),
            is_admin,
            is_member,
            cell!(Fw -> time_format(group.created())),
            cell!(Fw -> time_format(group.last_updated())),
        ]));
    }

    table
}
