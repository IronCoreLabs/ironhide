import {ErrorCodes, GroupUserEditResponse, SDKError} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile, userList} from "../../lib/sharedFlags";
import {buildCommandSampleText, createDisplayTable} from "../../lib/Utils";

/**
 * Group remove member command. Takes a comma-separated list of emails as well as the group name and attempts to remove users as members from the group.
 */
export default class RemoveMember extends Command {
    static aliases = ["group:removemembers", "group:removeMember", "group:removeMembers"];
    static description = "Remove members from a group given their email address.";
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
        users: userList("Remove member permissions from the comma-separated list of user emails.")(),
    };
    static examples = [buildCommandSampleText("group:removemember -u test@example.com,test2@example.com myGroup")];

    /**
     * Build up a table that displays the results from the group remove member operation showing both successes and failures.
     */
    buildResultTable(buildResults: GroupUserEditResponse) {
        const table = createDisplayTable(["User", "Result"]);

        buildResults.succeeded.forEach((removedUser) => {
            table.push([removedUser, chalk.green("✔ Removed as member")]);
        });

        buildResults.failed.forEach((removedUser) => {
            table.push([removedUser.id, chalk.red(removedUser.error)]);
        });

        return table;
    }

    async run() {
        const {args, flags} = this.parse(RemoveMember);
        const groupID = await GroupMaps.getGroupIDFromName(args.group);

        return ironnode()
            .group.removeMembers(groupID, flags.users as string[])
            .then((removeResult) => {
                this.log(`\n${this.buildResultTable(removeResult).toString()}\n`);
            })
            .catch((e: SDKError) => {
                if (e.code === ErrorCodes.GROUP_REMOVE_MEMBERS_REQUEST_FAILURE) {
                    return this.error(chalk.red(`Unable to complete request to remove members from the group.`));
                }
                this.error(chalk.red(e.message));
            });
    }
}
