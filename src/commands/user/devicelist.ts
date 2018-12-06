import {Command, flags as flagtype} from "@oclif/command";
import {UserDeviceListResponse} from "@ironcorelabs/ironnode";
import chalk from "chalk";
import {ironnode} from "../../lib/SDK";
import {createDisplayTable} from "../../lib/Utils";
import {keyFile} from "../../lib/sharedFlags";

/**
 * User device list command. Gets a list of a users devices and displays their ID, name, timestamps, and whether the device is their current device.
 */
export default class DeviceList extends Command {
    static aliases = ["user:deviceList"];
    static description = "List all of the devices authorized to decrypt your data.";
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };

    /**
     * Build up a table that adds a row for each device and shows the device ID, name, and created and updated times in an easier to read format
     */
    buildUserKeyTable(devices: UserDeviceListResponse) {
        const table = createDisplayTable(["Device ID", "Device Name", "Created", "Updated", "Current Device"]);
        devices.result
            .sort((a, b) => (new Date(a.created) > new Date(b.created) ? 1 : -1))
            .forEach((device) => {
                const currentDevice = device.isCurrentDevice ? chalk.green("✔") : "";
                table.push([device.id, device.name, new Date(device.created).toLocaleString(), new Date(device.updated).toLocaleString(), currentDevice]);
            });
        return table;
    }

    async run() {
        this.parse(DeviceList);
        try {
            const devices = await ironnode().user.listDevices();
            this.log(`\n${this.buildUserKeyTable(devices).toString()}\n`);
        } catch (e) {
            this.error(chalk.red("Failed to retrieve list of device keys."));
        }
    }
}
