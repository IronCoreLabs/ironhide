use crate::util::{self, act_on_all_files};
use clap::Parser;
use ironoxide::prelude::BlockingIronOxide;
use std::{
    fs::{self, File, OpenOptions},
    io::{self, Read, Write},
    path::Path,
    path::PathBuf,
};
use yansi::Paint;

const EXAMPLES: &str = "EXAMPLES

    Decrypt a file given its path and write it out to 'path/to/file.txt' leaving input file in place.
        $ ironhide file decrypt path/to/file.txt.iron

    Decrypt the provided encrypted file and write the result to file.json in the current working directory.
        $ ironhide file decrypt path/to/file.json.iron -o file.json

    Decrypt the provided encrypted file and write the result to file.json and delete the encrypted
    path/to/file.json.iron file.
        $ ironhide file decrypt path/to/file.json.iron -d -o file.json

    Decrypt all of the '.iron' files and write them to files without the '.iron' extension.
        $ ironhide file decrypt *.iron

    Decrypt the provided file and write the decrypted bytes to stdout.
        $ ironhide file decrypt path/to/file.iron -o -

    Decrypt the provided file from stdin and write the decrypted bytes to stdout.
        $  cat encryptedfile.iron | ironhide file decrypt -s -o -
";

#[derive(Parser)]
#[clap(after_help = EXAMPLES)]
/// Decrypt a file or list of files. By default, the decrypted file is written to the same directory without the
/// '.iron' extension.
pub struct Decrypt {
    /// Delete the encrypted source file(s) after successful encryption.
    #[clap(short, long, takes_value = false)]
    delete: bool,
    /// Path of file or files to decrypt.
    #[clap(parse(from_os_str), min_values = 1, required = true)]
    files: Vec<PathBuf>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
    /// Filename where decrypted file will be written. Only allowed if a single file is
    /// being decrypted.
    /// Use '-o -' to write decrypted file content to stdout, but fair warning, the output is binary and not ASCII.
    #[clap(parse(from_os_str), short, long)]
    out: Option<PathBuf>,
    /// Read data to decrypt from stdin. If used, no source files should be provided as
    /// arguments and you must use the '-o' flag.
    #[clap(
        short,
        long,
        takes_value = false,
        conflicts_with = "files",
        requires = "out"
    )]
    stdin: bool,
}

impl util::GetKeyfile for Decrypt {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn decrypt_files(
    sdk: &BlockingIronOxide,
    Decrypt {
        delete,
        files,
        out,
        stdin,
        ..
    }: Decrypt,
) -> Result<(), String> {
    if stdin {
        let mut encrypted_document: Vec<u8> = vec![];
        match io::stdin().read_to_end(&mut encrypted_document) {
            Ok(_) => {
                // safe to unwrap here because `stdin` always has to have `out` set.
                let out_path = out.unwrap();
                decrypt_file(sdk, encrypted_document, None, out_path, delete)?;
            }
            Err(e) => util::println_paint(Paint::red(format!("Error reading stdin: {}", e))),
        }
    } else if out.is_some() && files.len() > 1 {
        util::println_paint(Paint::red(
            "Cannot use '-o' flag with multiple files.".to_string(),
        ));
    } else {
        act_on_all_files(
            &files,
            |path: &PathBuf| -> Result<(), String> {
                let mut file = File::open(&path).map_err(|e| {
                    format!(
                        "Provided path '{}' doesn't exist or is not readable: {e}",
                        path.display()
                    )
                })?;
                let mut encrypted_document = Vec::new();
                file.read_to_end(&mut encrypted_document).map_err(|e| {
                    format!(
                        "Failed to read bytes from the encrypted document at {}: {e}",
                        path.display()
                    )
                })?;
                let in_parent = path.parent().ok_or(format!(
                    "Failed to find parent of input path {}.",
                    path.display()
                ))?;
                let out_path =
                    out.clone()
                        .unwrap_or(in_parent.join(Path::new(path.file_stem().ok_or(format!(
                            "Failed to extract default output file name from input path {}.",
                            path.display()
                        ))?)));
                decrypt_file(
                    sdk,
                    encrypted_document,
                    Some(path),
                    out_path.clone(),
                    delete,
                )?;
                if files.len() == 1 {
                    let out_logged_path = get_output_logged_path(out_path)?;
                    util::println_paint(Paint::green(format!(
                        "File successfully decrypted and written to {}",
                        out_logged_path
                    )));
                }
                Ok(())
            },
            "decrypted",
        )?;
    }

    Ok(())
}

fn get_output_writer(out_path: PathBuf) -> Result<Box<dyn Write>, String> {
    let out_writer: Box<dyn Write> = if out_path == PathBuf::from("-") {
        Box::new(io::stdout())
    } else {
        OpenOptions::new()
            .create_new(true)
            .write(true)
            .append(true)
            .open(out_path.clone())
            .map_err(|e| {
                format!(
                    "Couldn't create a file at the desired output path '{}': {e}",
                    out_path.display()
                )
            })
            .map(Box::new)?
    };
    Ok(out_writer)
}

fn get_output_logged_path(out_path: PathBuf) -> Result<String, String> {
    let out_logged_path = if out_path == PathBuf::from("-") {
        "stdout"
    } else {
        out_path.to_str().ok_or(format!(
            "Output path '{}' wasn't valid unicode.",
            out_path.display()
        ))?
    };
    Ok(out_logged_path.to_string())
}

fn decrypt_file(
    sdk: &BlockingIronOxide,
    encrypted_document: Vec<u8>,
    input_path: Option<&PathBuf>,
    out_path: PathBuf,
    delete: bool,
) -> Result<(), String> {
    let decrypt_result = sdk
        .document_decrypt(&encrypted_document)
        .map_err(|e| format!("Failed to decrypt encrypted document: {e}"))?;
    let decrypted_document = decrypt_result.decrypted_data();
    let mut decrypted_writer = get_output_writer(out_path)?;
    decrypted_writer
        .write_all(decrypted_document)
        .map_err(|e| format!("Failed to write decrypted document: {e}"))?;
    if delete {
        match input_path {
            Some(infile) => {
                if fs::remove_file(&infile).is_err() {
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
    Ok(())
}
