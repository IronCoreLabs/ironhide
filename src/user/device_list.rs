use std::path::PathBuf;

use clap::Parser;
use ironoxide::prelude::BlockingIronOxide;

use crate::util;

#[derive(Parser)]
/// List all of the devices authorized to decrypt your data.
pub struct DeviceList {
    /// Path to location of file which contains keys to use for this operation. Overrides using default key file from '~/.iron' directory.
    #[clap(parse(from_os_str), short, long)]
    keyfile: Option<PathBuf>,
}

impl util::GetKeyfile for DeviceList {
    fn get_keyfile(&self) -> Option<&PathBuf> {
        self.keyfile.as_ref()
    }
}

pub fn list_devices(sdk: &BlockingIronOxide) -> Result<(), String> {
    let result = sdk.user_list_devices()?;
    let device_list = result.result();
    let mut table = table!([Fbb->"Device ID", Fbb->"Device Name", Fbb->"Created", Fbb->"Updated", Fbb->"Current Device"]);
    for device in device_list {
        let device_name = match device.name() {
            Some(dname) => dname.name(),
            None => "",
        };
        let current_device = if device.is_current_device() {
            "✔"
        } else {
            ""
        };
        table.add_row(row![
            device.id().id(),
            device_name,
            util::time_format(device.created()),
            util::time_format(device.last_updated()),
            Fgb->current_device,
        ]);
    }
    table.printstd();
    Ok(())
}
