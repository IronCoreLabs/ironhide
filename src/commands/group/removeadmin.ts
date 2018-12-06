import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import {GroupUserEditResponse, SDKError, ErrorCodes} from "@ironcorelabs/ironnode";
import {ironnode} from "../../lib/SDK";
import {userList, keyFile} from "../../lib/sharedFlags";
import * as GroupMaps from "../../lib/GroupMaps";
import {createDisplayTable, buildCommandSampleText} from "../../lib/Utils";

/**
 * Group remove admin command. Takes a comma-separated list of emails as well as the group name and attempts to remove users as admins from the group.
 */
export default class RemoveAdmin extends Command {
    static aliases = ["group:removeadmins", "group:removeAdmin", "group:removeAdmins"];
    static description = "Remove admins from a group given their email address.";
    static args = [
        {
            name: "group",
            description: "Name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
        users: userList("Remove admin permissions from the comma-separated list of user emails.")(),
    };
    static examples = [buildCommandSampleText("group:removeadmin -u test@example.com,test2@example.com myGroup")];

    /**
     * Build up a table that displays the results from the group remove admin operation showing both successes and failures.
     */
    buildResultTable(buildResults: GroupUserEditResponse) {
        const table = createDisplayTable(["User", "Result"]);

        buildResults.succeeded.map((removedUser) => {
            table.push([removedUser, chalk.green("✔ Removed as admin")]);
        });

        buildResults.failed.map((removedUser) => {
            table.push([removedUser.id, chalk.red(removedUser.error)]);
        });

        return table;
    }

    async run() {
        const {args, flags} = this.parse(RemoveAdmin);
        const groupID = await GroupMaps.getGroupIDFromName(args.group);

        ironnode()
            .group.removeAdmins(groupID, flags.users as string[])
            .then((removeResult) => {
                this.log(`\n${this.buildResultTable(removeResult).toString()}\n`);
            })
            .catch((e: SDKError) => {
                if (e.code === ErrorCodes.GROUP_REMOVE_ADMINS_REQUEST_FAILURE) {
                    this.log(e.message);
                    return this.error(chalk.red(`Unable to complete request to remove admins from the group.`));
                }
                this.error(chalk.red(e.message));
            });
    }
}
