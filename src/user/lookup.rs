use std::path::PathBuf;

use clap::Parser;
use ironoxide::prelude::{BlockingIronOxide, UserId};

use crate::util;

pub const EXAMPLE: &str = "EXAMPLE

    $ ironhide user lookup test@example.com test2@example.com

";

#[derive(Parser)]
#[clap(after_help = EXAMPLE)]
/// Retrieve the public keys for a user or a list of users using their email addresses.
pub struct UserLookup {
    /// Email address of the user to locate.
    #[clap(parse(from_str), min_values = 1, required = true)]
    users: Vec<String>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for UserLookup {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn lookup_users(sdk: &BlockingIronOxide, user_lookup: &UserLookup) -> Result<(), String> {
    let user_id_vec: Vec<UserId> = user_lookup
        .users
        .iter()
        .map(|email| UserId::unsafe_from_string(email.clone()))
        .collect();
    let user_ids: &[UserId] = &user_id_vec;
    let mut table = table!([Fbb->"User ID", Fbb->"Public Key"]);
    match sdk.user_get_public_key(user_ids) {
        Ok(key_list) => {
            for user_id in user_id_vec {
                match key_list.get(&user_id) {
                    Some(public_key) => table.add_row(row![
                                          Fg->user_id.id(),
                                          Fg->base64::encode(public_key.as_bytes())]),
                    None => {
                        table.add_row(row![Fr->user_id.id(), Fr->"user has not generated keys yet"])
                    }
                };
            }
            table.printstd();
        }
        Err(msg) => println!("Unable to retrieve user public keys - {}", msg),
    };
    Ok(())
}
