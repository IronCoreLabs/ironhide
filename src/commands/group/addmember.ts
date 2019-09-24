import {ErrorCodes, GroupUserEditResponse, SDKError} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile, userList} from "../../lib/sharedFlags";
import {buildCommandSampleText, createDisplayTable} from "../../lib/Utils";

/**
 * Group add member command. Takes a comma-separated list of email addresses and attempts to add them as members to the group.
 */
export default class AddMember extends Command {
    static aliases = ["group:addmembers", "group:addMember", "group:addMembers"];
    static description = "Add members to a group by email address. Members can decrypt all content that has been shared with the group.";
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
        users: userList("Add member permissions to the comma-separated list of user emails.")(),
    };
    static examples = [buildCommandSampleText("group:addmember -u test@example.com,test2@example.com myGroup")];

    /**
     * Build up a table that displays the results from the group add member operation showing both successes and failures.
     */
    buildResultTable(buildResults: GroupUserEditResponse) {
        const table = createDisplayTable(["User", "Result"]);

        buildResults.succeeded.forEach((addedUser) => {
            table.push([addedUser, chalk.green("✔ Added as member")]);
        });

        buildResults.failed.forEach((addedUser) => {
            table.push([addedUser.id, chalk.red(addedUser.error)]);
        });
        return table;
    }

    async run() {
        const {args, flags} = this.parse(AddMember);
        const groupID = await GroupMaps.getGroupIDFromName(args.group);

        ironnode()
            .group.addMembers(groupID, flags.users as string[])
            .then((addResult) => {
                this.log(`\n${this.buildResultTable(addResult).toString()}\n`);
                if (addResult.failed.length > 0) {
                    this.error(`Failed to add ${addResult.failed.length} member(s).`);
                }
            })
            .catch((e: SDKError) => {
                if (e.code === ErrorCodes.GROUP_ADD_MEMBER_NOT_ADMIN_FAILURE) {
                    return this.error(chalk.red(`\nYou aren't an admin of the '${args.group}' group therefore you cannot manage its members.\n`));
                }
                if (e.code === ErrorCodes.GROUP_ADD_MEMBERS_REQUEST_FAILURE) {
                    return this.error(chalk.red(`\nUnable to complete request to add members to the group.\n`));
                }
                this.error(chalk.red(e.message));
            });
    }
}
