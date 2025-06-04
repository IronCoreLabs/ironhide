use std::{convert::TryFrom, path::PathBuf};

use clap::Parser;
use ironoxide::prelude::{BlockingIronOxide, DeviceId};
use yansi::Paint;

use crate::util;

pub const EXAMPLE: &str = "EXAMPLE

    $ ironhide user device-delete 293 5559 312

";

#[derive(Parser)]
#[clap(after_help = EXAMPLE)]
/// Deauthorize a device, so it is no longer able to decrypt your data. Use this to deauthorize devices other than the one you are currently using. To deauthorize your current device, use 'ironhide logout'.
pub struct DeviceDelete {
    /// One or more IDs of the device keys to revoke.
    #[clap(num_args = 1.., required = true)]
    device_ids: Vec<u64>,
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from
    /// '~/.iron' directory.
    #[clap(value_parser = clap::value_parser!(PathBuf), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for DeviceDelete {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn delete_devices(
    sdk: &BlockingIronOxide,
    DeviceDelete { device_ids, .. }: DeviceDelete,
) -> Result<(), String> {
    for device_id in device_ids.iter() {
        match sdk.user_delete_device(Option::Some(&DeviceId::try_from(*device_id)?)) {
            Ok(dev_id_confirm) => util::println_paint(Paint::green(format!(
                "Successfully deleted device with ID {}",
                dev_id_confirm.id()
            ))),
            Err(e) => util::println_paint(Paint::red(format!(
                "Unable to delete device with ID {} - {}",
                device_id, e
            ))),
        }
    }
    Ok(())
}
