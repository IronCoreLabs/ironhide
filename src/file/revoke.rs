use crate::util;
use clap::Parser;
use ironoxide::prelude::{BlockingIronOxide, GroupId, GroupName, UserId};
use itertools::Either;
use std::path::PathBuf;

const EXAMPLES: &str = "EXAMPLES

Revoke access to the provided encrypted file from the provided user and group. 
    $ ironhide file revoke -u john@example.com -g myGroup path/to/file.iron

Revoke access to the provided encrypted file from the provided users and groups. 
    $ ironhide file revoke -u john@example.com,mike@example.com -g myGroup1,myGroup2 path/to/file.iron

Revoke access to all of the '.iron' files from 'myGroup'. 
    $ ironhide file revoke -g myGroup *.iron

";

#[derive(Parser)]
/// Revoke decryption access to a file or list of files to additional users or groups.
#[clap(after_help = EXAMPLES)]
pub struct Revoke {
    /// Path of file or files to revoke access to.
    #[clap(parse(from_os_str), min_values = 1, required = true)]
    files: Vec<PathBuf>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long, max_values = 1)]
    keyfile: Option<PathBuf>,
    /// Revoke access to the file(s) to a comma separated list of groups.
    /// Can refer to a group by ID or by name. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = util::group_identifier_from_string), short, long, use_value_delimiter = true, require_value_delimiter = true, required = false)]
    groups: Vec<Either<GroupName, GroupId>>,
    /// Revoke access to the file(s) to a comma separated list of user emails.
    #[clap(parse(try_from_str = util::try_from_email), short, long, use_value_delimiter = true, require_value_delimiter = true, required = false)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for Revoke {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

// TODO: this function is very similar to grant::grant_files, should make more generic
pub fn revoke_files(sdk: &BlockingIronOxide, revoke: Revoke) -> Result<(), String> {
    let revoke_results = util::execute_permissioning_operation(
        &revoke.users,
        &revoke.groups,
        &revoke.files,
        sdk,
        util::PermissionOperation::Revoke,
    );
    let table = util::build_permissioning_result_table(
        sdk,
        revoke_results,
        util::PermissionOperation::Revoke,
    );
    table.printstd();

    Ok(())
}
