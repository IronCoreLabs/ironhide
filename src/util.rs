use crate::group_maps::{convert_group_names_to_ids, get_group_maps};
use crate::{group_maps, IronhideErr};
use clap::lazy_static::lazy_static;
use fancy_regex::Regex;
use ironoxide::prelude::*;
use ironoxide::prelude::{GroupId, UserId, UserOrGroup};
use itertools::{Either, Itertools};
use serde::{Deserialize, Serialize};
use serde_json::Error;
use std::convert::TryFrom;
use std::fmt::Display;
use std::fs;
use std::path::PathBuf;
use std::{fs::File, path::Path};
use time::format_description::FormatItem;
use time::{format_description, UtcOffset};
use yansi::Paint;

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IHDeviceContext {
    #[serde(alias = "accountID")]
    account_id: String,
    #[serde(alias = "segmentID")]
    segment_id: usize,
    device_keys: IHDeviceKeys,
    signing_keys: IHSigningKeys,
}

impl From<DeviceAddResult> for IHDeviceContext {
    fn from(add_result: DeviceAddResult) -> Self {
        IHDeviceContext {
            account_id: add_result.account_id().id().to_string(),
            segment_id: add_result.segment_id(),
            device_keys: IHDeviceKeys {
                private_key: add_result.device_private_key().clone(),
            },
            signing_keys: IHSigningKeys {
                private_key: add_result.signing_private_key().clone(),
            },
        }
    }
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IHDeviceKeys {
    private_key: PrivateKey,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct IHSigningKeys {
    pub private_key: DeviceSigningKeyPair,
}

// Helper to get a keyfile off something that has a keyfile (if it exists) and initialize.
// This should make it easy to switch to a keyring (or a stack of keyring -> keyfile -> default file location) in the future.
pub fn initialize_sdk(keyfile: Option<&PathBuf>) -> Result<BlockingIronOxide, String> {
    match keyfile {
        Some(keyfile) => initialize_sdk_from_file(keyfile),
        None => initialize_sdk_from_keyring()
            .or_else(|_| initialize_sdk_from_file(&dirs::home_dir().unwrap().join(".iron/keys"))),
    }
}

pub fn initialize_sdk_from_file(device_path: &Path) -> Result<BlockingIronOxide, String> {
    if device_path.is_file() {
        let device_context_file = File::open(&device_path).map_err(|e| {
            format!(
                "Couldn't open device context at {}: {:?}",
                device_path.to_str().unwrap(),
                e
            )
        })?;
        let ih_context: IHDeviceContext =
            serde_json::from_reader(device_context_file).map_err(|e| {
                format!(
                    "Couldn't parse device context file at {}: {:?}",
                    device_path.to_str().unwrap(),
                    e
                )
            })?;
        let io_context = DeviceContext::new(
            UserId::unsafe_from_string(ih_context.account_id),
            ih_context.segment_id,
            ih_context.device_keys.private_key,
            ih_context.signing_keys.private_key,
        );
        Ok(ironoxide::blocking::initialize(
            &io_context,
            &IronOxideConfig::default(),
        )?)
    } else {
        Err("No user logged in to ironhide. Try `ironhide login`".to_string())
    }
}

pub fn initialize_sdk_from_keyring() -> Result<BlockingIronOxide, String> {
    let logged_in_user = ensure_login()?;
    let keyring = keyring::Entry::new("ironhide", &logged_in_user);
    let device_context_json = keyring
        .get_password()
        .map_err(|e| format!("Couldn't get device context from your keyring: {:?}", e))?;
    let device: DeviceContext = serde_json::from_str(&device_context_json).map_err(|e| {
        format!(
            "Failed to parse device context retrieved from keyring: {}",
            e
        )
    })?;

    ironoxide::blocking::initialize(&device, &IronOxideConfig::default())
        .map_err(|e| format!("Failed to initialize SDK using keyring device: {:?}", e))
}

impl From<keyring::Error> for IronhideErr {
    fn from(_e: keyring::Error) -> Self {
        unimplemented!()
    }
}

impl From<serde_json::error::Error> for IronhideErr {
    fn from(_: Error) -> Self {
        unimplemented!()
    }
}

fn ensure_login() -> Result<String, String> {
    let maybe_logged_in_user =
        std::fs::read_to_string(dirs::home_dir().unwrap().join(".iron/login"));

    match maybe_logged_in_user {
        Err(_) => Err("No user logged in to ironhide. Try `ironhide login`".to_string()),
        Ok(logged_in_user) => Ok(logged_in_user),
    }
}

/// Collect a vector of `UserId` and a vector of `GroupId` into a vector of `UserOrGroup`.
pub fn collect_users_and_groups(user_ids: &[UserId], group_ids: &[GroupId]) -> Vec<UserOrGroup> {
    let mut users_or_groups = user_ids
        .iter()
        .map(|user| user.into())
        .collect::<Vec<UserOrGroup>>();
    let mut groups = group_ids
        .iter()
        .map(|group| group.into())
        .collect::<Vec<UserOrGroup>>();
    users_or_groups.append(&mut groups);
    users_or_groups
}

pub fn print_paint(paint: yansi::Paint<String>) {
    // only print to stdout if we're not being piped somewhere
    if atty::is(atty::Stream::Stdout) {
        print!("{}", paint);
    }
}

pub fn println_paint(paint: yansi::Paint<String>) {
    // only print to stdout if we're not being piped somewhere
    if atty::is(atty::Stream::Stdout) {
        println!("{}", paint);
    }
}

// this can probably be made a lazy static
pub fn local_offset() -> UtcOffset {
    // this is _all_ a workaround until `UtcOffset::current_local_offset()` is sound again (see https://github.com/time-rs/time/issues/293)
    // it _is_ sound in our use case (we're single threaded so we can't possibly setenv), but we're not able to set
    // --cfg unsound_local_offset in all build environments, because [crates.io ignores .cargo/config.toml files](https://github.com/rust-lang/cargo/issues/6025) and
    // [build.rs](https://doc.rust-lang.org/cargo/reference/build-scripts.html#cargorustc-cfgkeyvalue) scripts are run after dependencies are compiled.
    // TODO: replace this entire block with `UtcOffset::current_local_offset()` once it's fixed
    tzdb::now::local()
        .ok()
        .and_then(|local_time| {
            UtcOffset::from_whole_seconds(local_time.local_time_type().ut_offset()).ok()
        })
        .unwrap_or(UtcOffset::UTC)
}

// this can definitely be made a lazy static
pub fn time_format() -> Vec<FormatItem<'static>> {
    format_description::parse("[year]-[month]-[day] [hour]:[minute]:[second]").unwrap()
}

pub fn group_already_known(sdk: &BlockingIronOxide, name: &GroupName) -> bool {
    let (groups_by_name, _) = group_maps::get_group_maps(sdk);

    groups_by_name.get(name).is_some()
}

pub trait GetKeyfile {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        None
    }
}

/// Helper that takes a message to be printlned and nicely wraps it into console friendly line lengths before printing.
pub fn console_pretty_println(message: &str) {
    let print_width = textwrap::termwidth() - 4;
    let print_options = textwrap::Options::new(print_width)
        .initial_indent("  ")
        .subsequent_indent("  ");

    textwrap::wrap(message, print_options)
        .iter()
        .for_each(|line| {
            println!("{}", line);
        });
}

// Regex email validation from https://github.com/Keats/validator/blob/master/validator/src/validation/email.rs
// but tone a bit back since this is mostly to avoid typos by the user on the CLI. Does not allow IP email addresses.
lazy_static! {
    // Regex from the specs
    // https://html.spec.whatwg.org/multipage/forms.html#valid-e-mail-address
    // It will mark esoteric email addresses like quoted string as invalid
    static ref EMAIL_USER_RE: Regex = Regex::new(r"^(?i)[a-z0-9.!#$%&'*+/=?^_`{|}~-]+\z").unwrap();
    static ref EMAIL_DOMAIN_RE: Regex = Regex::new(
        r"(?i)^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$"
    ).unwrap();
}

/// Parse a UserId from a string, checking to make sure that it's an email address.
pub fn try_from_email(email: &str) -> Result<UserId, String> {
    if email.is_empty() || !email.contains('@') {
        return Err("Email address is empty or missing an @".to_string());
    }
    let parts: Vec<&str> = email.rsplitn(2, '@').collect();
    let user_part = parts[1];
    let domain_part = parts[0];

    if user_part.len() > 64 || domain_part.len() > 255 {
        return Err("Email address is too long.".to_string());
    }

    if !EMAIL_USER_RE.is_match(user_part).unwrap() {
        return Err("Email user is invalid.".to_string());
    }

    if !EMAIL_DOMAIN_RE.is_match(domain_part).unwrap() {
        return Err("Email domain is invalid.".to_string());
    }

    UserId::try_from(email.to_string()).map_err(|e| e.to_string())
}

const GROUP_ID_PREFIX: &str = "id^";

/// Parse either a GroupId or GroupName from a string, where GroupIds have the prefix "id^" and GroupNames don't.
pub fn group_identifier_from_string(
    group_identifier: &str,
) -> Result<Either<GroupName, GroupId>, String> {
    if is_group_id(group_identifier) {
        match group_identifier.rsplit_once(GROUP_ID_PREFIX) {
            Some(("", group_id)) => GroupId::try_from(group_id)
                .map(Either::Right)
                .map_err(|e| format!("Invalid group ID: {}", e)),
            _ => Err("Malformed group ID".to_string()),
        }
    } else {
        GroupName::try_from(group_identifier)
            .map(Either::Left)
            .map_err(|e| format!("Invalid group name: {}", e))
    }
}

/// Check to see if the group identifier has a group id prefix.
pub fn is_group_id(group_identifier: &str) -> bool {
    group_identifier.starts_with(GROUP_ID_PREFIX)
}

// Run an action closure across all files and print messages for the successes and failures.
pub fn act_on_all_files<F>(files: &[PathBuf], action: F, action_verb: &str)
where
    F: FnMut(&PathBuf) -> Result<(), String>,
{
    let (successes, failures): (Vec<_>, Vec<_>) = files.iter().map(action).partition_result();
    if !successes.is_empty() {
        println_paint(Paint::green(format!(
            "{} files successfully {action_verb}.",
            successes.len()
        )));
    }
    if !failures.is_empty() {
        println_paint(Paint::red(format!(
            "{} file(s) failed to be {action_verb}. Error(s): {:#?}",
            failures.len(),
            failures
        )));
    }
}

pub enum PermissionOperation {
    Grant,
    Revoke,
}
impl Display for PermissionOperation {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Grant => write!(f, "grant"),
            Self::Revoke => write!(f, "revoke"),
        }
    }
}
// Helper to do all the same things for grant/revoke except for which document SDK method is called.
pub fn execute_permissioning_operation(
    users: &[UserId],
    groups: &[Either<GroupName, GroupId>],
    files: &[PathBuf],
    sdk: &BlockingIronOxide,
    operation: PermissionOperation,
) -> Vec<(String, Option<DocumentAccessResult>)> {
    let (groups_by_name, _) = get_group_maps(sdk);
    let requested_groups = convert_group_names_to_ids(groups, &groups_by_name);
    let application_list = collect_users_and_groups(users, &requested_groups);
    let results = files
        .iter()
        .map(|infile| {
            let file = fs::read(&infile).unwrap();
            let file_name = infile.file_name().unwrap().to_string_lossy();

            let res = sdk
                .document_get_id_from_bytes(&file)
                .map_err(|e| match e {
                    ironoxide::IronOxideErr::DocumentHeaderParseFailure(_) => Paint::red(format!(
                        "Failed to parse '{}'. File doesn't appear to be an encrypted file.",
                        file_name
                    )),
                    _ => Paint::red(format!(
                        "Failed to get the document id for {}: {}.",
                        file_name, e
                    )),
                })
                .and_then(|id| {
                    let f = match operation {
                        PermissionOperation::Grant => BlockingIronOxide::document_grant_access,
                        PermissionOperation::Revoke => BlockingIronOxide::document_revoke_access,
                    };
                    f(sdk, &id, &application_list).map_err(|e| {
                        Paint::red(format!(
                            "Catastrophically failed to {operation} access to anything for {}: {}",
                            file_name, e
                        ))
                    })
                });

            match res {
                Ok(access_result) => (infile.to_str().unwrap().to_string(), Some(access_result)),
                Err(e) => {
                    println_paint(e);
                    (infile.to_str().unwrap().to_string(), None)
                }
            }
        })
        .collect();
    results
}

pub fn build_permissioning_result_table(
    sdk: &BlockingIronOxide,
    operation_results: Vec<(String, Option<DocumentAccessResult>)>,
    operation: PermissionOperation,
) -> prettytable::Table {
    let operation_column_title = match operation {
        PermissionOperation::Grant => "Grants",
        PermissionOperation::Revoke => "Revocations",
    };
    let mut table = table!([Fbb->"File", Fbb->format!("Successful {operation_column_title}"), Fbb->format!("Failed {operation_column_title}")]);
    let (_, groups_by_id) = get_group_maps(sdk);
    for (file_path, m_access_result) in operation_results {
        if let Some(result) = m_access_result {
            let succeeded_names = result
                .succeeded()
                .iter()
                .map(|user_or_group| match user_or_group {
                    UserOrGroup::User { id: user_id } => user_id.id(),
                    UserOrGroup::Group { id: group_id } => {
                        if let Some(name) =
                            groups_by_id.get(group_id).and_then(|group| group.name())
                        {
                            name.name()
                        } else {
                            group_id.id()
                        }
                    }
                })
                .collect::<Vec<_>>();

            let failed_names = result
                .failed()
                .iter()
                .map(|access_err| {
                    let reason = access_err.err.as_str();
                    let user_or_group_name = match &access_err.user_or_group {
                        UserOrGroup::User { id: user_id } => user_id.id(),
                        UserOrGroup::Group { id: group_id } => {
                            if let Some(name) =
                                groups_by_id.get(group_id).and_then(|group| group.name())
                            {
                                name.name()
                            } else {
                                group_id.id()
                            }
                        }
                    };
                    (user_or_group_name, reason)
                })
                .collect::<Vec<_>>();
            table.add_row(row![
                Fw -> file_path,
                Fg -> succeeded_names.join("\n"),
                Fr -> failed_names.iter().map(|(name, failure_reason)| format!("{} ({})", name, failure_reason)).collect::<Vec<_>>().join("\n")
            ]);
        } else {
            table.add_row(row![
                file_path,
                "",
                format!("ALL (failed to get any {operation} response)")
            ]);
        }
    }

    table
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_id_try_from_email() {
        let tests =
            vec![
            ("email@here.com", true),
            ("weirder-email@here.and.there.com", true),
            ("example@valid-----hyphens.com", true),
            ("example@valid-with-hyphens.com", true),
            (r#""test@test"@example.com"#, false),
            ("a@atm.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", true),
            ("a@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.atm", true),
            (
                "a@aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.bbbbbbbbbb.atm",
                true,
            ),
            ("", false),
            ("abc", false),
            ("abc@", false),
            ("abc@bar", true),
            ("a @x.cz", false),
            ("abc@.com", false),
            ("something@@somewhere.com", false),
            ("email@127.0.0.1", true),
            ("email@[127.0.0.256]", false),
            ("email@[2001:db8::12345]", false),
            ("email@[2001:db8:0:0:0:0:1]", false),
            ("email@[::ffff:127.0.0.256]", false),
            (r#"test@example.com\n\n<script src="x.js">"#, false),
            (r#""\\\011"@here.com"#, false),
            (r#""\\\012"@here.com"#, false),
            ("John.Doe@exam_ple.com", false),
            ("example@invalid-.com", false),
            ("example@-invalid.com", false),
            ("example@invalid.com-", false),
            ("example@inv-.alid-.com", false),
            ("example@inv-.-alid.com", false),
            ("trailingdot@shouldfail.com.", false),
            // Trailing newlines in username or domain not allowed
            ("a@b.com\n", false),
            ("a\n@b.com", false),
            (r#""test@test"\n@example.com"#, false),
            ("a@[127.0.0.1]\n", false),
            // % is not allowed in UserIds
            (r#"!def!xyz%abc@example.com"#, false),
            // [] are not allowed in UserIds
            ("email@[127.0.0.1]", false),
            ("email@[2001:dB8::1]", false),
            ("email@[2001:dB8:0:0:0:0:0:1]", false),
            ("email@[::fffF:127.0.0.1]", false),
            // UserIds don't allow unicode characters
            ("test@domain.with.idn.tld.उदाहरण.परीक्षा", false),
        ];

        for (input, expected) in tests {
            assert_eq!(
                try_from_email(input).is_ok(),
                expected,
                "Email `{}` was not classified correctly",
                input
            );
        }
    }
}
