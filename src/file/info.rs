use crate::util;
use clap::Parser;
use ironoxide::prelude::BlockingIronOxide;
use itertools::Itertools;
use std::{fs::File, io::Read, path::PathBuf};
use yansi::Paint;

const EXAMPLES: &str = "EXAMPLES

    $ ironhide file info path/to/file
    $ ironhide file info *.iron

";

#[derive(Parser)]
#[clap(after_help = EXAMPLES)]
/// Display information about an encrypted file or list of files.
pub struct Info {
    /// Path of file or files to display information for.
    #[clap(parse(from_os_str), min_values = 1, required = true)]
    files: Vec<PathBuf>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for Info {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn investigate_files(sdk: &BlockingIronOxide, info: Info) -> Result<(), String> {
    // collect up all the file metadata results
    let (successes, failures) = get_files_info(sdk, info.files);
    let table = build_result_table(successes);
    table.printstd();

    for fail in failures {
        println!("{}", fail);
    }

    Ok(())
}

fn get_files_info(
    sdk: &BlockingIronOxide,
    files: Vec<PathBuf>,
) -> (
    Vec<(String, ironoxide::document::DocumentMetadataResult)>,
    Vec<Paint<String>>,
) {
    files
        .into_iter()
        .map(|path| {
            let mut file = File::open(&path).unwrap();
            let mut encrypted_document = Vec::new();
            file.read_to_end(&mut encrypted_document).unwrap();
            let file_name = path.file_name().unwrap().to_string_lossy();

            sdk.document_get_id_from_bytes(&encrypted_document)
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
                    sdk.document_get_metadata(&id)
                        .map(|metadata| (file_name.to_string(), metadata))
                        .map_err(|e| {
                            Paint::red(format!("Failed to get metadata for {}: {}.", file_name, e))
                        })
                })
        })
        // pass back up the vec of path and metadata, along with the vec of failure messages.
        .partition_result()
}

fn build_result_table(
    metadata_pairs: Vec<(String, ironoxide::document::DocumentMetadataResult)>,
) -> prettytable::Table {
    let mut table = table!([Fbb->"File", Fbb->"Users with access", Fbb->"Groups with access", Fbb->"Created", Fbb->"Updated"]);
    for (path, metadata) in metadata_pairs {
        table.add_row(row![
            path,
            metadata
                .visible_to_users()
                .iter()
                .map(|vu| vu.id().id())
                .collect::<Vec<_>>()
                .join("\n"),
            metadata
                .visible_to_groups()
                .iter()
                .map(|vg| {
                    let name = vg
                        .name()
                        .map(|gn| gn.name().as_str())
                        .unwrap_or_else(|| "UNNAMED");
                    let id = vg.id().id();
                    format!("{} ({})", name, id)
                })
                .collect::<Vec<_>>()
                .join("\n"),
            metadata.created(),
            metadata.last_updated()
        ]);
    }
    table
}
