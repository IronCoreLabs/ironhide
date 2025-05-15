use crate::{
    group_maps::{convert_group_names_to_ids, get_group_maps},
    util::{self, act_on_all_files},
};
use clap::Parser;
use ironoxide::prelude::*;
use itertools::Itertools;
use itertools::{Either, EitherOrBoth};
use prettytable::Row;
use std::{
    convert::TryFrom,
    fs::{self, OpenOptions},
    io::{self, Read, Write},
    path::PathBuf,
};
use yansi::Paint;

const EXAMPLES: &str = "EXAMPLES

    Encrypt the provided file and write the results to 'path/to/file.iron'.
        $ ironhide file encrypt path/to/file

    Encrypt the provided file and grant decryption access to two users and one group
        $ ironhide file encrypt -g myGroup -u john@example.com,mike@example.com path/to/file

    Encrypt the provided file and write the decrypted bytes to 'other/path/to/encrypted.iron'.
        $ ironhide file encrypt path/to/file -o other/path/to/encrypted.iron

    Encrypt the provided file and write the decrypted bytes to 'path/to/file.txt.iron' while also deleting
    the original unencrypted 'path/to/file.txt' file.
        $ ironhide file encrypt path/to/file.txt -d

    Encrypt all of the JSON files in the current directory and write them out to '.iron' files.
        $ ironhide file encrypt *.json

    Encrypt the provided file and write the encrypted content to stdout.
        $ ironhide file encrypt path/to/file -o -

    Encrypt stdin and write the encrypted results to stdout in base64.
        $ echo \"my secret\" | ironhide file encrypt -s -o - | base64 -e
";

#[derive(Parser)]
#[clap(after_help = EXAMPLES)]
/// Encrypt a file or list of files to yourself and optionally to other users or groups. By default, the input file is
/// unchanged and the output uses the same filename with a '.iron' extension added.
pub struct Encrypt {
    /// Delete the unencrypted source file(s) after successful encryption.
    #[clap(short, long, num_args = 0)]
    delete: bool,
    /// Path of file(s) to encrypt.
    #[clap(value_parser = clap::value_parser!(PathBuf), num_args = 1.., required = true)]
    files: Vec<PathBuf>,
    /// Encrypt the file(s) to the given groups. Multiple groups should be comma separated.
    /// Can refer to a group by ID or by name. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.
    #[clap(value_parser = util::group_identifier_from_string, short, long, use_value_delimiter = true, value_delimiter = ',')]
    groups: Vec<Either<GroupName, GroupId>>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
    /// Filename where encrypted file will be written. Only allowed if a single file is
    /// being encrypted.
    /// Use '-o -' to write encrypted file content to stdout, but fair warning, the output is binary and not ASCII.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    out: Option<PathBuf>,
    /// Read data to encrypt from stdin. If used, no source files should be provided as
    /// arguments and you must use the '-o' flag.
    #[clap(short, long, num_args = 0, conflicts_with = "files", requires = "out")]
    stdin: bool,
    /// Encrypt the file(s) to a comma-separated list of user emails. Files are
    /// automatically encrypted to the logged-in user.
    #[clap(value_parser = parse_user_id, short, long, use_value_delimiter = true, value_delimiter = ',', required = false)]
    users: Vec<UserId>,
}

fn parse_user_id(s: &str) -> Result<UserId, IronOxideErr> {
    UserId::try_from(s)
}

impl util::GetKeyfile for Encrypt {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

fn display_group_name_and_id(meta: &GroupMetaResult) -> String {
    format!(
        "{} ({})",
        meta.name()
            .map(|n| n.name().as_str())
            .unwrap_or_else(|| "NO_NAME"),
        meta.id().id()
    )
}

pub fn encrypt_files(
    sdk: &BlockingIronOxide,
    Encrypt {
        delete,
        files,
        groups,
        out,
        stdin,
        users,
        ..
    }: Encrypt,
) -> Result<(), String> {
    if stdin {
        let mut file: Vec<u8> = vec![];
        match io::stdin().read_to_end(&mut file) {
            Ok(_) => {
                match encrypt_file(&out, None, sdk, &groups, &users, file, delete) {
                    Ok(_) => (),
                    Err(e) => {
                        util::println_paint(Paint::red(format!("Error encrypting file: {}", e)))
                    }
                };
            }
            Err(e) => util::println_paint(Paint::red(format!("Error reading stdin: {}", e))),
        }
    } else if out.is_some() && files.len() > 1 {
        util::println_paint(Paint::red(
            "Cannot use '-o' flag with multiple files.".to_string(),
        ));
    } else {
        let result = act_on_all_files(
            &files,
            |infile| -> Result<EncryptResultWithResolved, String> {
                let file = fs::read(infile).map_err(|e| {
                    format!(
                        "Provided path '{}' doesn't exist or is not readable: {e}",
                        infile.display()
                    )
                })?;
                let encrypt_result =
                    encrypt_file(&out, Some(infile), sdk, &groups, &users, file, delete)?;
                if files.len() == 1 {
                    util::println_paint(Paint::green(format!(
                        "Encrypted file successfully written to {}.",
                        encrypt_result.output_log.clone()
                    )));
                }
                Ok(encrypt_result)
            },
            "encrypted",
        )
        .map_err(|(e, maybe_success)| {
            maybe_success.map(|success| print_resolved_grants(success));
            e
        })?;
        result.map(|encrypt_result| print_resolved_grants(encrypt_result));
    }

    Ok(())
}

fn print_resolved_grants(encrypt_result: EncryptResultWithResolved) {
    util::println_paint(Paint::green(
        "\nSuccessfully encrypted to the following users and groups:".to_string(),
    ));
    let zipped = encrypt_result
        .resolved_users
        .into_iter()
        .zip_longest(encrypt_result.resolved_groups);
    let mut table = table!([Fbb=>"Users", "Groups"]);
    zipped.for_each(|either_or_both| {
        let row = match either_or_both {
            EitherOrBoth::Both(ref user, ref group) => {
                (user.id(), display_group_name_and_id(group))
            }
            EitherOrBoth::Left(ref user) => (user.id(), "".to_string()),
            EitherOrBoth::Right(ref group) => ("", display_group_name_and_id(group)),
        };
        table.add_row(Row::new(vec![cell!(Fw -> row.0), cell!(Fw -> row.1)]));
    });
    table.printstd();
}

fn encrypt_file(
    out: &Option<PathBuf>,
    infile: Option<&PathBuf>,
    sdk: &BlockingIronOxide,
    groups: &[Either<GroupName, GroupId>],
    users: &[UserId],
    file: Vec<u8>,
    delete: bool,
) -> Result<EncryptResultWithResolved, String> {
    let (groups_by_name, groups_by_id) = get_group_maps(sdk);
    let group_ids = convert_group_names_to_ids(groups, &groups_by_name);
    let users_or_groups = util::collect_users_and_groups(users, &group_ids);
    let encrypt_result = encrypt_bytes_to_file(sdk, &file, &users_or_groups, out, infile)?;
    let (resolved_users, maybe_resolved_groups): (Vec<UserId>, Vec<Option<GroupMetaResult>>) =
        encrypt_result
            .grants
            .into_iter()
            .partition_map(|u_or_g| match u_or_g {
                UserOrGroup::User { id } => Either::Left(id),
                UserOrGroup::Group { id } => Either::Right(groups_by_id.get(&id).cloned()),
            });
    let resolved_groups = maybe_resolved_groups.into_iter().flatten().collect_vec();
    if delete {
        match infile {
            Some(infile) => {
                if fs::remove_file(infile).is_err() {
                    util::println_paint(Paint::yellow(format!(
                        "Unable to delete source file '{}' as it is not writable.",
                        &infile.display()
                    )))
                }
            }
            None => util::println_paint(Paint::yellow(
                "Unable to delete source as it was a stream.".to_string(),
            )),
        }
    }
    Ok(EncryptResultWithResolved {
        resolved_users,
        resolved_groups,
        output_log: encrypt_result.output_log,
    })
}

/// Validate that the output path provided by the user can be used for encryption. If no path is provided,
/// will append ".iron" to the input filename. Returns an Err if the input file ends with "..".
fn validate_encrypt_output_path(
    maybe_output: Option<PathBuf>,
    infile: Option<&PathBuf>,
) -> Result<(Box<dyn Write>, String), String> {
    let output: (Box<dyn Write>, String) = match maybe_output {
        // User specified an output path.
        Some(desired) => {
            // User specified a directory for output
            if desired.is_dir() && infile.is_some() {
                let mut filename = infile
                    // unwrap here is safe because of the .is_some check above
                    .unwrap()
                    .file_name()
                    .ok_or_else(|| "Invalid input file".to_string())?
                    .to_os_string();
                filename.push(".iron");
                let mut desired_dir = desired;
                desired_dir.push(filename);
                // if desired_dir.exists() {
                //     return Err("BLOW UP".to_string())
                // }
                (
                    Box::new(
                        OpenOptions::new()
                            .create_new(true)
                            .append(true)
                            .open(desired_dir.clone())
                            .map_err(|e| {
                                format!(
                                    "Couldn't create a file in the desired output directory '{}': {e}",
                                    desired_dir.display()
                                )
                            })?
                    ),
                    desired_dir.to_string_lossy().to_string(),
                )
            } else if desired == PathBuf::from("-") {
                (Box::new(io::stdout()), "stdout".to_string())
            } else {
                (
                    Box::new(
                        OpenOptions::new()
                            .create_new(true)
                            .append(true)
                            .open(desired.clone())
                            .map_err(|e| {
                                format!(
                                    "Couldn't create a file at the desired output path '{}': {e}",
                                    desired.display()
                                )
                            })?,
                    ),
                    desired.to_string_lossy().to_string(),
                )
            }
        }
        // User didn't specify an output path. Add ".iron" to the input path.
        None => match infile {
            Some(infile) => {
                let input_iron = infile.display().to_string() + ".iron";
                (
                    Box::new(
                        OpenOptions::new()
                            .create_new(true)
                            .append(true)
                            .open(PathBuf::from(input_iron.clone()))
                            .map_err(|e| {
                                format!("Couldn't create a file at the default output path '{input_iron}': {e}")
                            })?,
                    ),
                    input_iron,
                )
            }
            None => unreachable!(), // If stdin is used, output path is required, this is unreachable.
        },
    };
    Ok(output)
}

struct EncryptResult {
    grants: Vec<UserOrGroup>,
    output_log: String,
}

#[derive(Clone)]
struct EncryptResultWithResolved {
    resolved_users: Vec<UserId>,
    resolved_groups: Vec<GroupMetaResult>,
    output_log: String,
}

/// Encrypt the provided file to the `users_or_groups`. The file will also be granted to the calling user.
/// The bytes of the encrypted file will be written to `output_path`.
fn encrypt_bytes_to_file(
    sdk: &BlockingIronOxide,
    file: &[u8],
    users_or_groups: &[UserOrGroup],
    outfile: &Option<PathBuf>,
    infile: Option<&PathBuf>,
) -> Result<EncryptResult, String> {
    let grants = ExplicitGrant::new(true, users_or_groups);
    let opts = DocumentEncryptOpts::new(None, None, EitherOrBoth::Left(grants));
    let encrypt_result = sdk.document_encrypt(file.to_vec(), &opts)?;
    let (mut output_writer, output_log) = validate_encrypt_output_path(outfile.clone(), infile)?;

    output_writer
        .write_all(encrypt_result.encrypted_data())
        .map_err(|e| format!("Couldn't write encrypted file: {e}"))?;

    Ok(EncryptResult {
        grants: encrypt_result.grants().to_vec(),
        output_log,
    })
}
