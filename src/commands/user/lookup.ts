import {UserPublicKeyGetResponse} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {buildCommandSampleText, createDisplayTable} from "../../lib/Utils";

/**
 * User lookup command. Attempts to retrieve public keys for a list of users given their email addresses.
 */
export default class Lookup extends Command {
    static description = "See if a user is signed up and get their public keys using their email address.";
    static args = [
        {
            name: "users",
            description: "One or more user emails to lookup.",
            required: true,
        },
    ];
    static strict = false; //This command supports unlimited arguments
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [buildCommandSampleText(`user:lookup test@example.com test2@example.com`)];

    /**
     * Build up a table that adds a row for each key result row which either displays the users public key or an error message
     * saying that the user has yet to create an account.
     */
    buildUserKeyTable(userKeys: UserPublicKeyGetResponse) {
        const table = createDisplayTable(["User ID", "Public Key"]);

        Object.keys(userKeys).forEach((userID) => {
            const userPublicKey = userKeys[userID];
            table.push([
                userID,
                userPublicKey !== null ? chalk.green(`${userPublicKey.x}\n${userPublicKey.y}`) : chalk.red("User hasn't created an account yet."),
            ]);
        });

        return table;
    }

    async run() {
        const {argv} = this.parse(Lookup);
        return ironnode()
            .user.getPublicKey(argv)
            .then((userKeys) => {
                this.log(`\n${this.buildUserKeyTable(userKeys).toString()}\n`);
            })
            .catch((_) => {
                this.error(chalk.red("Failed to retrieve keys for the provided user IDs."));
            });
    }
}
