import {Command} from "@oclif/command";
import cli from "cli-ux";
import * as fs from "fs";
import {ironnode} from "../lib/SDK";
import chalk = require("chalk");

/**
 * Logout command. Confirms that the user wants to delete their local keys and if so, removes the public keys from the identity DB and
 * the private keys from their filesystem.
 */
export default class Logout extends Command {
    public static description =
        "Logout of ironhide and delete any local private keys. Those keys will also be deauthorized so they can no longer decrypt your data.";

    async run() {
        this.parse(Logout);
        const deviceKeysLocation = `${this.config.home}/.iron/keys`;
        const doDelete = await cli.confirm(`${chalk.magenta("Really deauthorize this device and remove local private keys?")} ${chalk.gray("[y/n]")}`);
        if (!doDelete) {
            return this.exit(0);
        }
        try {
            const SDK = ironnode();
            if (!SDK) {
                throw new Error(); //No message for this error as we don't display it below in the catch
            }
            await ironnode().user.deleteDevice();
        } catch {
            this.log(chalk.red("Failed to deauthroize device keys from key server, but still attempting to delete local device keys."));
        }
        try {
            fs.accessSync(deviceKeysLocation, fs.constants.W_OK);
            fs.unlinkSync(deviceKeysLocation);
            this.log(chalk.green("You have been logged out. Use 'ironhide login' to log back in and authorize this device again."));
        } catch (e) {
            this.log(e);
            this.error(chalk.red(`Failed to remove local device keys as the key file ('${deviceKeysLocation}') could not be deleted.`));
        }
    }
}
