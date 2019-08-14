import {GroupDetailResponse} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import cli from "cli-ux";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";

export default class Delete extends Command {
    static description = "Delete a group given its name or ID. Once deleted all files encrypted to only the group will no longer be able to be decrypted.";
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
    };

    /**
     * Deleting a group is currently a risky operation as it nukes the group from the DB. Display a warning to the user on delete telling them the
     * downsides of their decision and make them re-enter the group name to verify the deletion of the group.
     */
    async verifyGroupName(enteredGroupName: string, groupID: string) {
        let group: GroupDetailResponse;
        try {
            // tslint:disable-next-line
            group = (await ironnode().group.get(groupID)) as GroupDetailResponse;
            this.log(
                chalk.yellowBright(
                    `\nWarning! Deleting a group will cause all documents encrypted to only that group to no longer be decryptable! The group you are trying to delete has ${
                        group.groupAdmins.length
                    } admin(s) and ${group.groupMembers.length} member(s).\n`
                )
            );
        } catch (e) {
            this.error(chalk.red("Was not able to retrieve information about the provided group."));
        }
        const groupConfirm = await cli.prompt(chalk.magenta("Please enter the group to delete again to confirm its deletion"));
        if (groupConfirm !== enteredGroupName) {
            throw new Error(`Group confirmation failed. Original group provided was '${enteredGroupName}' but confirmation value was '${groupConfirm}'.`);
        }
    }

    async run() {
        const {args} = this.parse(Delete);

        const groupID = await GroupMaps.getGroupIDFromName(args.group);
        const [, groupsByID] = await GroupMaps.getGroupMaps();
        if (!groupsByID[groupID].isAdmin) {
            return this.error(chalk.red(`You aren't currently an admin of '${args.group}' so you may not delete it.`));
        }

        try {
            await this.verifyGroupName(args.group, groupID);
        } catch (e) {
            return this.error(chalk.red(e.message));
        }
        return ironnode()
            .group.deleteGroup(groupID)
            .then(() => this.log(chalk.green("Group successfully deleted!")))
            .catch((e) => {
                this.log(e.message);
                this.error(chalk.red("Group delete request failed."));
            });
    }
}
