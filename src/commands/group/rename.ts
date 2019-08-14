import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {buildCommandSampleText} from "../../lib/Utils";

/**
 * Change the name of a group given its existing name or ID and a new name to update it to.
 */
export default class Rename extends Command {
    static description = "Change the name of a group. Won't change any of the group admins, members, or files encrypted to the group.";
    static args = [
        {
            name: "currentGroupName",
            description: "Current name of the group. Can alternately refer to a group by ID. Indicate IDs by prefixing with 'id^' e.g. 'id^groupID'.",
            required: true,
        },
        {
            name: "newGroupName",
            description: "New name of the group.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [buildCommandSampleText("group:rename myGroup newGroup")];

    /**
     * Check if the user is already a member/admin of a group with the provided name that they're changing to.
     */
    async checkGroupExists(groupName: string) {
        let doesGroupExist: boolean = false;
        try {
            doesGroupExist = await GroupMaps.doesGroupNameAlreadyExist(groupName);
        } catch (e) {
            this.log(e);
            this.error(chalk.red("Unable to make group rename request."));
        }

        if (doesGroupExist) {
            this.error(chalk.red(`You are already in a group with the name '${groupName}'. Please pick a different name.`));
        }
    }

    async run() {
        const {args} = this.parse(Rename);
        if (args.newGroupName.includes(",") || args.newGroupName.includes("^")) {
            return this.error("Group names cannot contain commas or carets.");
        }
        await this.checkGroupExists(args.newGroupName);

        const groupID = await GroupMaps.getGroupIDFromName(args.currentGroupName);

        return ironnode()
            .group.update(groupID, {groupName: args.newGroupName})
            .then(() => this.log(chalk.green("Group name successfully updated!")))
            .catch((e) => {
                this.log(e);
                this.error(chalk.red("Group could not be updated."));
            });
    }
}
