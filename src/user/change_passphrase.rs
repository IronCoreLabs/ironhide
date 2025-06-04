use std::path::PathBuf;

use clap::Parser;
use ironoxide::{IronOxideErr, prelude::BlockingIronOxide};
use rpassword::prompt_password;
use yansi::Paint;

use crate::util;

#[derive(Parser)]
/// Update your private key escrow passphrase.
pub struct ChangePassphrase {
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for ChangePassphrase {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn change_passphrase(sdk: &BlockingIronOxide) -> Result<(), String> {
    let current_passphrase: String =
        prompt_password(format!("{}", Paint::magenta("Current Passphrase: ")))
            .map_err(|e| e.to_string())?;
    let new_passphrase: String = prompt_password(format!("{}", Paint::magenta("New Passphrase: ")))
        .map_err(|e| e.to_string())?;
    let confirm_new_passphrase: String =
        prompt_password(format!("{}", Paint::magenta("Confirm New Passphrase: ")))
            .map_err(|e| e.to_string())?;

    if confirm_new_passphrase != new_passphrase {
        let e = "New passphrase and confirm passphrase do not match!".to_string();
        util::println_paint(Paint::red(e));
        // this probably isn't the right pattern
        return Ok(());
    }

    match sdk.user_change_password(&current_passphrase, &new_passphrase) {
        Ok(_) => util::println_paint(Paint::green(
            "Successfully changed your passphrase.".to_string(),
        )),
        Err(e) => match e {
            IronOxideErr::AesError(_) => {
                util::println_paint(Paint::red("Current passphrase is incorrect.".to_string()))
            }
            _ => util::println_paint(Paint::red(format!(
                "Failed to change your passphrase: {}",
                e
            ))),
        },
    }

    Ok(())
}
