import {ErrorCodes, GroupUserEditResponse, SDKError} from "@ironcorelabs/ironnode";
import {Command, Flags} from "@oclif/core";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile, userList} from "../../lib/sharedFlags";
import {buildCommandSampleText, createDisplayTable} from "../../lib/Utils";
import chalk = require("chalk");

/**
 * Group add admin command. Takes a comma-separated list of emails as admins as well as the group name and attempts to add
 * users to the group as admins.
 */
export default class AddAdmin extends Command {
    static aliases = ["group:addadmins", "group:addAdmin", "group:addAdmins"];
    static description =
        "Add an admin to a group using their email address. Admins will be able to manage the group name, members, admins, and to delete the group.";
    static args = [
        {
            name: "group",
            description: "Name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.",
            required: true,
        },
    ];
    static flags = {
        help: Flags.help({char: "h"}),
        keyfile: keyFile(),
        users: userList("Add admin permissions to the comma-separated list of user emails.")(),
    };
    static examples = [buildCommandSampleText("group:addadmin -u test@example.com,test2@example.com myGroup")];

    /**
     * Build up a table that displays the results from the group add admin operation showing both successes and failures.
     */
    buildResultTable(buildResults: GroupUserEditResponse) {
        const table = createDisplayTable(["User", "Result"]);

        buildResults.succeeded.forEach((addedUser) => {
            table.push([addedUser, chalk.green("✔ Added as admin")]);
        });

        buildResults.failed.forEach((addedUser) => {
            table.push([addedUser.id, chalk.red(addedUser.error)]);
        });
        return table;
    }

    async run() {
        const {args, flags} = await this.parse(AddAdmin);
        const groupID = await GroupMaps.getGroupIDFromName(args.group);

        return ironnode()
            .group.addAdmins(groupID, flags.users as string[])
            .then((addResult) => {
                this.log(`\n${this.buildResultTable(addResult).toString()}\n`);
                if (addResult.failed.length > 0) {
                    this.error(`Failed to add ${addResult.failed.length} admin(s).`);
                }
            })
            .catch((e: SDKError) => {
                if (e.code === ErrorCodes.GROUP_ADD_ADMINS_NOT_ADMIN_FAILURE) {
                    return this.error(chalk.red(`\nYou aren't an admin of the '${args.group}' group therefore you cannot manage its admins.\n`));
                }
                if (e.code === ErrorCodes.GROUP_ADD_ADMINS_REQUEST_FAILURE) {
                    return this.error(chalk.red(`\nUnable to complete request to add admins to the group.\n`));
                }
                this.error(chalk.red(e.message));
            });
    }
}
