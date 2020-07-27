import {GroupDetailResponse, GroupMetaResponse} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import * as Table from "cli-table3";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {buildCommandSampleText} from "../../lib/Utils";
import chalk = require("chalk");

/**
 * Group info command. Retrieves a group given its name or ID and displays information about the group including the
 * members and admins if the requesting user is an admin.
 */
export default class Info extends Command {
    static description = "Get detailed information about a group.";
    static args = [
        {
            name: "group",
            description: "Name of the group to retrieve. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [
        buildCommandSampleText("group:info myGroup"),
        buildCommandSampleText("group:info id^b94850b8855486ca504ecbc521801153", "Display information about a group given its ID"),
    ];

    /**
     * Typeguard to determine which type of group detail response we have.
     */
    canSeeGroupDetails(group: GroupMetaResponse | GroupDetailResponse): group is GroupDetailResponse {
        return group.isAdmin || group.isMember;
    }

    /**
     * Build up the display table for group details. Displays the list of members and admins if the current
     * user is an admin of the group.
     */
    buildGroupDetailTable(group: GroupMetaResponse | GroupDetailResponse) {
        const table = new Table() as Table.GenericTable<Table.VerticalTableRow>;

        const check = chalk.green("✔");
        const nope = chalk.red("✖");
        table.push(
            {[chalk.blue("Group")]: group.groupName},
            {[chalk.blue("ID")]: group.groupID},
            {[chalk.blue("Admin")]: group.isAdmin ? check : nope},
            {[chalk.blue("Member")]: group.isMember ? check : nope},
            {[chalk.blue("Created")]: new Date(group.created).toLocaleDateString()},
            {[chalk.blue("Updated")]: new Date(group.updated).toLocaleDateString()}
        );

        if (this.canSeeGroupDetails(group)) {
            table.push({[chalk.blue("Admins")]: group.groupAdmins.join("\n")}, {[chalk.blue("Members")]: group.groupMembers.join("\n")});
        }
        return table;
    }

    async run() {
        const {args} = this.parse(Info);
        const groupID = await GroupMaps.getGroupIDFromName(args.group);

        try {
            const group = await ironnode().group.get(groupID);
            this.log(`\n${this.buildGroupDetailTable(group).toString()}\n`);
        } catch (e) {
            this.error(chalk.red(`Group '${args.group}' couldn't be retrieved.`));
        }
    }
}
