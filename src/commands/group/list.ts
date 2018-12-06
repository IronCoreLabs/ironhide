import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import {ironnode} from "../../lib/SDK";
import {createDisplayTable} from "../../lib/Utils";
import {keyFile} from "../../lib/sharedFlags";

/**
 * Group list command. Retrieves all groups that the user is a part of and displays them in a table to the console.
 */
export default class List extends Command {
    static description = "Display a list of all the groups of which you're either an admin or member.";
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };

    async run() {
        this.parse(List);
        ironnode()
            .group.list()
            .then((groups) => {
                if (groups.result.length === 0) {
                    return this.log("You aren't currently an admin or member of any groups.");
                }
                const table = createDisplayTable(["Group Name", "Group ID", "Admin", "Member"]);

                const check = chalk.green("✔");
                const nope = chalk.red("✖");
                groups.result.map((group) => {
                    table.push([group.groupName, group.groupID, group.isAdmin ? check : nope, group.isMember ? check : nope]);
                });
                this.log(`\n${table.toString()}\n`);
            })
            .catch((e) => {
                this.log(chalk.red(e.message));
                this.error(chalk.red("Failed to retrieve list of groups."));
            });
    }
}
