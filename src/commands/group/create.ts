import {ErrorCodes, SDKError} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {buildCommandSampleText, createDisplayTable} from "../../lib/Utils";

/**
 * Group create command. Creates a new group with the user provided ID. Auto adds the creator of the group as a member and an admin.
 */
export default class Create extends Command {
    static description = `Create a new cryptographic group. Upon creation of the group you will become both an admin and a member of the group. This generates a public key for the group and uploads it to the IronCore service.`;
    static args = [
        {
            name: "group",
            description: "Name for the group. Will be used when referencing this group from all other commands.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [buildCommandSampleText("group:create myGroup", "Create a new group with the name 'myGroup'")];

    /**
     * Check if the user is already a member/admin of a group with the provided name and fail if they are or
     * if we can't get the list of groups they're in.
     */
    async checkGroupExists(groupName: string) {
        let doesGroupExist: boolean = false;
        try {
            doesGroupExist = await GroupMaps.doesGroupNameAlreadyExist(groupName);
        } catch (e) {
            this.log(e);
            this.error(chalk.red("Unable to make group create request."));
        }

        if (doesGroupExist) {
            this.error(chalk.red(`You are already in a group with the name '${groupName}'.`));
        }
    }

    async run() {
        const {args} = this.parse(Create);
        const groupName = args.group as string;
        if (groupName.includes(",") || groupName.includes("^")) {
            return this.error("Group names cannot contain commas or carets.");
        }
        await this.checkGroupExists(args.group);

        return ironnode()
            .group.create({groupName: args.group})
            .then((group) => {
                const table = createDisplayTable(["Group Name", "Group ID", "Admin", "Member"]);
                table.push([group.groupName, group.groupID, chalk.green("✔"), chalk.green("✔")]);

                this.log(chalk.green("\nNew group successfully created."));
                this.log(chalk.green(`\n${table.toString()}\n`));
            })
            .catch((e: SDKError) => {
                if (e.code === ErrorCodes.GROUP_CREATE_REQUEST_FAILURE) {
                    this.error(chalk.red("Unable to make group create request."));
                }
                this.error(chalk.red(e.message));
            });
    }
}
