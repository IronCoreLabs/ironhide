import {ErrorCodes} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import cli from "cli-ux";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import chalk = require("chalk");

/**
 * Ask the user for the current and a new passphrase and update their passphrase within IronCore.
 */
export default class ChangePassphrase extends Command {
    static aliases = ["user:changePassphrase"];
    static description = "Update your private key escrow passphrase.";
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };

    async run() {
        this.parse(ChangePassphrase);
        let currentPassphrase: string;
        let newPassphrase: string;
        let confirmNewPassphrase: string;
        try {
            currentPassphrase = await cli.prompt(chalk.magenta("Current Passphrase"), {type: "hide"});
            newPassphrase = await cli.prompt(chalk.magenta("New Passphrase"), {type: "hide"});
            confirmNewPassphrase = await cli.prompt(chalk.magenta("Confirm New Passphrase"), {type: "hide"});
        } catch (e) {
            return this.exit(0); //User command-C'd so just bail out
        }

        console.log(`CURRENT: ${currentPassphrase}`);
        console.log(`New: ${newPassphrase}`);
        console.log(`Confirm: ${confirmNewPassphrase}`);

        if (confirmNewPassphrase !== newPassphrase) {
            return this.error(chalk.red("New passphrase and confirm passphrase do not match!"));
        }

        return ironnode()
            .user.changePassword(currentPassphrase, newPassphrase)
            .then(() => {
                this.log(chalk.green(`\nPassphrase successfully changed!\n`));
            })
            .catch((e) => {
                if (e.code === ErrorCodes.USER_PASSCODE_CHANGE_FAILURE) {
                    this.error(chalk.red(`Current passphrase was incorrect.`));
                } else {
                    this.error(chalk.red(`Passphrase changed failed: ${e.message}`));
                }
            });
    }
}
