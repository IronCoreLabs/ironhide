use crate::{file::FileSubcommands, group::GroupSubcommands};
use clap::Parser;
use derive_more::{Display, Error};
use ironoxide::{blocking::BlockingIronOxide, prelude::*};
use promptly::prompt;
use std::time::Duration;
use util::GetKeyfile;
use yansi::Paint;
#[macro_use]
extern crate prettytable;

mod auth;
mod file;
mod group;
mod group_maps;
mod user;
mod util;

/// Tool to easily encrypt and decrypt files to users and groups. Similar to GPG, but usable at scale.
#[derive(Parser)]
#[clap(version = "1.0.0", author = "IronCore Labs")]
struct Ironhide {
    #[clap(subcommand)]
    subcmd: IronhideSubcommands,
}

#[derive(Parser)]
enum IronhideSubcommands {
    #[clap(name = "file")]
    File(file::File),
    #[clap(name = "group")]
    Group(group::Group),
    /// Login to the ironhide CLI tool to either create a new account or authorize a new device for an existing account by generating device-specific keys and enabling them.
    #[clap(name = "login")]
    Login,
    #[clap(name = "user")]
    User(user::User),
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // TODO: more unified error handling. All errors should be printed out with the message
    // in red.
    let ironhide = Ironhide::parse();

    match ironhide.subcmd {
        IronhideSubcommands::File(file) => {
            // Every file subcommand needs the SDK so we can try to initialize here.
            let sdk = util::initialize_sdk(file.get_keyfile())?;
            match file.subcmd {
                FileSubcommands::Decrypt(decrypt) => file::decrypt::decrypt_files(&sdk, decrypt),
                FileSubcommands::Encrypt(encrypt) => file::encrypt::encrypt_files(&sdk, encrypt),
                FileSubcommands::Info(info) => file::info::investigate_files(&sdk, info),
                FileSubcommands::Grant(grant) => file::grant::grant_files(&sdk, grant),
                FileSubcommands::Revoke(revoke) => file::revoke::revoke_files(&sdk, revoke),
            }
        }
        IronhideSubcommands::Group(group) => {
            // Every group subcommand needs the SDK so we can try to initialize here.
            let sdk = util::initialize_sdk(group.get_keyfile())?;
            match group.subcmd {
                GroupSubcommands::AddAdmin(add_admin) => {
                    group::add_admin::add_admins(&sdk, add_admin)
                }
                GroupSubcommands::AddMember(add_member) => {
                    group::add_member::add_members(&sdk, add_member)
                }
                GroupSubcommands::Create(create) => group::create::group_create(&sdk, create),
                GroupSubcommands::Delete(delete) => group::delete::group_delete(&sdk, delete),
                GroupSubcommands::Info(info) => group::info::info(&sdk, info),
                GroupSubcommands::List(_) => group::list::list_groups(&sdk),
                GroupSubcommands::RemoveAdmin(remove) => {
                    group::remove_admin::group_remove_admins(&sdk, remove)
                }
                GroupSubcommands::RemoveMember(remove) => {
                    group::remove_member::group_remove_members(&sdk, remove)
                }
                GroupSubcommands::Rename(rename) => group::rename::group_rename(&sdk, rename),
            }
        }
        IronhideSubcommands::Login => {
            util::println_paint(Paint::green(
                "Welcome to the ironhide CLI tool!".to_string(),
            ));
            util::console_pretty_println("This tool uses public key elliptic curve cryptography to encrypt sensitive data. It uses a flavor of proxy re-encryption called transform cryptography to delegate access so that multiple devices (laptops, phones, tablets) with their own private keys are able to decrypt files. It uses that same technique to allow encryption to a group and to delegate decryption rights to members of the group. There's a central service for managing public keys and delegation, but that service never sees your private keys, your data, or anything that would allow the service to decrypt your data or authorize others to do so. More details can be found on IronCore's website, https://docs.ironcorelabs.com.\n");

            util::println_paint(Paint::green("FIRST TIME USERS".to_string()));
            util::console_pretty_println("The first step is to authenticate with one of your existing Internet accounts so we can tie an identity to your public key and so that others can encrypt to you using your email address. When you continue, we'll open a browser window where you'll login. After you login, we'll locally generate a key pair for your user and another pair for the current device and we'll upload the public keys to the free IronCore service. Once you've logged in, come back here to finish setup.\n");

            util::println_paint(Paint::green("EXISTING USERS".to_string()));
            util::console_pretty_println("If you already have an account, but this is not an authorized machine, you'll need to login as a first step. We'll launch a browser for you to login after you select continue. Once you've logged in, we'll locally generate a key pair for this device and then you'll take a final step to authorize this device.\n");

            if prompt(format!(
                "{} {}",
                Paint::magenta("Continue?"),
                Paint::rgb(169, 169, 169, "[y/n]")
            ))? {
                let auth0_token = auth::authorize();
                let user_exists = ironoxide::blocking::BlockingIronOxide::user_verify(
                    &auth0_token,
                    Some(Duration::new(10, 0)),
                )?;
                match user_exists {
                    Some(user) => {
                        let user_id = user.account_id().id();
                        // generate device keys
                        util::console_pretty_println("Welcome back! This device does not have a local key pair for your account. To authorize this device and allow it to decrypt files, you need to enter the passphrase you used when creating your account.\n");
                        let pass = rpassword::prompt_password(Paint::magenta(
                            "Device Authorization Passphrase: ".to_string(),
                        ))?;

                        let device = BlockingIronOxide::generate_new_device(
                            &auth0_token,
                            &pass,
                            &DeviceCreateOpts::default(),
                            None,
                        )
                        .or_else(|e| {
                            util::println_paint(Paint::red(format!(
                                "Error authorizing new device: {}",
                                e
                            )));
                            rpassword::prompt_password(Paint::magenta(
                                "[attempt 2] Device Authorization Passphrase: ".to_string(),
                            ))
                            .map_err(|_| IronhideErr::DeviceErr)
                            .and_then(|pass| {
                                BlockingIronOxide::generate_new_device(
                                    &auth0_token,
                                    &pass,
                                    &DeviceCreateOpts::default(),
                                    None,
                                )
                                .map_err(|_| IronhideErr::DeviceErr)
                            })
                        })?;

                        let device_context = util::IHDeviceContext::from(device);

                        // write their device to their keyring
                        let keyring = keyring::Entry::new("ironhide", user_id);
                        match keyring.set_password(serde_json::to_string(&device_context)?.as_str())
                        {
                            Ok(_) => {}
                            Err(_e) => {
                                // at debug logging we'd log something here. As is if something went wrong with their keyring
                                // we'll fall back to the disk
                            }
                        };

                        // as well as to the default file location
                        std::fs::create_dir_all(dirs::home_dir().unwrap().join(".iron"))?;
                        std::fs::write(dirs::home_dir().unwrap().join(".iron/login"), &user_id)?;
                        std::fs::write(
                            dirs::home_dir().unwrap().join(".iron/keys"),
                            serde_json::to_string(&device_context)?.as_str(),
                        )?;

                        util::println_paint(Paint::green("Login successful! This device is now able to decrypt files you can access. Use 'ironhide -help' to see what else is possible.".to_string()));
                    }
                    None => {
                        // TODO: error handling here doesn't match up with JS
                        println!("creating user and generating device keys");
                        let password = rpassword::prompt_password(Paint::magenta(
                            "Passphrase to Authorize New Devices: ",
                        ))?;
                        let confirmation_password =
                            rpassword::prompt_password(Paint::magenta("Confirm Passphrase: "))?;

                        if password != confirmation_password {
                            // this seems weird
                            return Err(Box::new(IronhideErr::AccountCreateErr));
                        }

                        let user = BlockingIronOxide::user_create(
                            &auth0_token,
                            &password,
                            &UserCreateOpts::default(),
                            None,
                        )
                        .map_err(|_| IronhideErr::AccountCreateErr)?;

                        util::println_paint(Paint::green("New account created successfully, now authorizing this device’s local encryption keys.".to_string()));

                        let device = BlockingIronOxide::generate_new_device(
                            &auth0_token,
                            &password,
                            &DeviceCreateOpts::default(),
                            None,
                        )?;

                        let device_context = util::IHDeviceContext::from(device);

                        // write their device to their keyring
                        let keyring = keyring::Entry::new("ironhide", user.id());
                        keyring.set_password(serde_json::to_string(&device_context)?.as_str())?;

                        // as well as to the default file location
                        std::fs::write(dirs::home_dir().unwrap().join(".iron/login"), &user.id())?;
                        std::fs::write(
                            dirs::home_dir().unwrap().join(".iron/keys"),
                            serde_json::to_string(&device_context)?.as_str(),
                        )?;

                        util::println_paint(Paint::green("Authorization successful! This device is now able to decrypt files you can access. Use 'ironhide -help' to see what else is possible.".to_string()));
                    }
                };
            } else {
                println!("Ok, maybe next time! Bye!");
            }
            Ok(())
        }
        IronhideSubcommands::User(user) => {
            // Every user subcommand needs the SDK so we can try to initialize here.
            let sdk = util::initialize_sdk(user.get_keyfile())?;
            match user.subcmd {
                user::UserSubcommands::ChangePassphrase(_) => {
                    user::change_passphrase::change_passphrase(&sdk)
                }

                user::UserSubcommands::UserLookup(user_lookup) => {
                    user::lookup::lookup_users(&sdk, &user_lookup)
                }

                user::UserSubcommands::DeviceDelete(device_delete) => {
                    user::device_delete::delete_devices(&sdk, device_delete)
                }

                user::UserSubcommands::DeviceList(_) => user::device_list::list_devices(&sdk),
            }
        }
    }?;

    Ok(())
}

#[derive(Debug, Display, Error)]
pub enum IronhideErr {
    DeviceErr,
    NoUserLoggedIn,
    KeyringErr(keyring::Error),
    AccountCreateErr,
}
