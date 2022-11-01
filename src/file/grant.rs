use crate::util;
use clap::Parser;
use ironoxide::prelude::{BlockingIronOxide, GroupId, GroupName, UserId};
use itertools::Either;
use std::path::PathBuf;

const EXAMPLES: &str = "EXAMPLES

Add decrypt access to the specified file to the provided user and group.\n
    $ ironhide file grant -u john@example.com -g myGroup path/to/file.iron

Add decrypt access to the specified file to multiple users and groups.\n
    $ ironhide file grant -u john@example.com,mike@example.com -g myGroup1,myGroup2 path/to/file.iron

Add decrypt access to all of the '.iron' files in the current directory to 'myGroup'.\n
    $ ironhide file grant -g myGroup *.iron

";

#[derive(Parser)]
/// Grant decryption access to a file or list of files to additional users or groups.
#[clap(after_help = EXAMPLES)]
pub struct Grant {
    /// Path of file or files to grant access to.
    #[clap(parse(from_os_str), min_values = 1, required = true)]
    files: Vec<PathBuf>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long, max_values = 1)]
    keyfile: Option<PathBuf>,
    /// Grant access to the file(s) to a comma separated list of groups.
    /// Can refer to a group by ID or by name. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(parse(try_from_str = util::group_identifier_from_string), short, long, use_value_delimiter = true, require_value_delimiter = true, required = false)]
    groups: Vec<Either<GroupName, GroupId>>,
    /// Grant access to the file(s) to a comma separated list of user emails.
    #[clap(parse(try_from_str = util::try_from_email), short, long, use_value_delimiter = true, require_value_delimiter = true, required = false)]
    users: Vec<UserId>,
}

impl util::GetKeyfile for Grant {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn grant_files(sdk: &BlockingIronOxide, grant: Grant) -> Result<(), String> {
    let grant_results = util::execute_permissioning_operation(
        &grant.users,
        &grant.groups,
        &grant.files,
        sdk,
        util::PermissionOperation::Grant,
    );
    let table = util::build_permissioning_result_table(
        sdk,
        grant_results,
        util::PermissionOperation::Grant,
    );
    table.printstd();

    Ok(())
}
