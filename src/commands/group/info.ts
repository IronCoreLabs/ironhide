import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import {GroupMetaResponse, GroupDetailResponse} from "@ironcorelabs/ironnode";
import {createDisplayTable, buildCommandSampleText} from "../../lib/Utils";
import {ironnode} from "../../lib/SDK";
import * as GroupMaps from "../../lib/GroupMaps";
import {keyFile} from "../../lib/sharedFlags";

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
        const tableHeader = ["Group", "Admin", "Member"];
        if (this.canSeeGroupDetails(group)) {
            tableHeader.push("Admins", "Members");
        }
        const table = createDisplayTable(tableHeader);

        const check = chalk.green("✔");
        const nope = chalk.red("✖");
        const fixedRows = [group.groupName, group.isAdmin ? check : nope, group.isMember ? check : nope];

        if (this.canSeeGroupDetails(group)) {
            table.push([...fixedRows, group.groupAdmins.join("\n"), group.groupMembers.join("\n")]);
        } else {
            table.push(fixedRows);
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
