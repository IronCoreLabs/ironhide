use crate::util;
use clap::Parser;
use ironoxide::prelude::BlockingIronOxide;
use prettytable::{color, Attr, Cell, Row};
use std::path::PathBuf;

#[derive(Parser)]
/// Display a list of all the groups of which you're either an admin or member.
pub struct List {
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for List {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn list_groups(sdk: &BlockingIronOxide) -> Result<(), String> {
    let groups = sdk.group_list().unwrap();

    if groups.result().is_empty() {
        Err("You aren't currently an admin or member of any groups.".to_string())
    } else {
        let mut table =
            table!([Fbb=>"Group Name", "Admin", "Member", "Group ID", "Created", "Updated"]);
        for group in groups.result() {
            let check = Cell::new("✓").with_style(Attr::ForegroundColor(color::GREEN));
            let nope = Cell::new("✗").with_style(Attr::ForegroundColor(color::RED));
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
                cell!(Fw -> group.name().map(|n| n.name().as_str()).unwrap_or("")),
                is_admin,
                is_member,
                cell!(Fw -> group.id().id()),
                cell!(Fw -> group.created()),
                cell!(Fw -> group.last_updated()),
            ]));
        }

        table.printstd();

        Ok(())
    }
}
