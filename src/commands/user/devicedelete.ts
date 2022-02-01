import {UserDeviceListResponse} from "@ironcorelabs/ironnode";
import {Command, Flags} from "@oclif/core";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {buildCommandSampleText, ErrorOr, isError} from "../../lib/Utils";
import chalk = require("chalk");

type DeviceDeleteResult = ErrorOr<{id: number}>;

/**
 * Delete one to many devices given their ID. Verifies that the user isn't trying to use this command to delete the device they're on and makes requests
 * in parallel to delete devices for each ID provided.
 */
export default class DeviceDelete extends Command {
    static aliases = ["user:deviceDelete"];
    static description =
        "Deauthorize a device from being able to decrypt your data. Use this to deauthorize devices other than the device you are currently on. To deauthorize the current device, use 'ironhide logout'.";
    static args = [
        {
            name: "device ID",
            description: "ID of the device keys to revoke. Multiple IDs can be provided.",
            required: true,
        },
    ];
    static strict = false;
    static flags = {
        help: Flags.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [buildCommandSampleText(`user:devicedelete 293 5559 312`)];

    /**
     * Return a Promise operation to delete the provided device ID. Maps any failures into successes so we can display information about each
     * result back to the user.
     */
    getDeviceDeletePromise(deviceID: string): Promise<DeviceDeleteResult> {
        const numericalDeviceID = parseInt(deviceID);
        if (!numericalDeviceID) {
            return Promise.resolve(new Error(`Expected a numerical device ID but got '${deviceID}' instead.`));
        }
        return ironnode()
            .user.deleteDevice(numericalDeviceID)
            .catch((e) => e);
    }

    /**
     * Check if the user is attempting to delete the device keys that they're currently using. If so display an error.
     */
    async checkDeletionOfCurrentDevice(deviceIDs: string[]) {
        let devices: UserDeviceListResponse;
        try {
            devices = await ironnode().user.listDevices();
        } catch (e) {
            throw new Error("Failed to make request to get current device keys.");
        }
        const currentDevice = devices.result.find((device) => device.isCurrentDevice);
        if (currentDevice && deviceIDs.includes(`${currentDevice.id}`)) {
            throw new Error("Attempting to delete keys for the current device. Use the 'logout' command instead.");
        }
    }

    async run() {
        const {argv} = await this.parse(DeviceDelete);
        try {
            await this.checkDeletionOfCurrentDevice(argv);
        } catch (e: any) {
            return this.error(chalk.red(e.message));
        }

        const deviceDeletes = argv.map((deviceID) => this.getDeviceDeletePromise(deviceID));
        return Promise.all(deviceDeletes).then((resultList) => {
            let successfulCount = 0;
            let failureCount = 0;
            resultList.forEach((deviceDeleteResult) => {
                if (isError(deviceDeleteResult)) {
                    this.log(chalk.red(deviceDeleteResult.message));
                    failureCount++;
                } else {
                    successfulCount++;
                }
            });
            if (successfulCount > 0) {
                this.log(chalk.green(`\n${successfulCount} device key(s) successfully deleted.`));
            }
            if (failureCount > 0) {
                this.log(chalk.red(`\n${failureCount} device key(s) failed to be deleted.`));
            }
        });
    }
}
