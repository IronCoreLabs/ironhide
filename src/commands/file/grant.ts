import {DocumentAccessList, DocumentAccessResponse, ErrorCodes, SDKError} from "@ironcorelabs/ironnode";
import {Command, Flags} from "@oclif/core";
import * as fs from "fs";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import {
    buildCommandSampleText,
    checkSourceFilePermissions,
    convertUserAndGroupToAccessList,
    createDisplayTable,
    ErrorOr,
    fileAccessResponseToTableRow,
    isError,
    normalizePathToFile,
} from "../../lib/Utils";
import chalk = require("chalk");

type FileGrantResponse = ErrorOr<{
    source: string;
    shares: DocumentAccessResponse;
}>;

/**
 * File grant command. Lets user grant access to a file or list of files to a list of groups and/or users.
 */
export default class Grant extends Command {
    static description = "Grant decryption access to a file or list of files to additional users or groups.";
    static strict = false;
    static args = [
        {
            name: "files",
            description: "Path of file or files to grant access to.",
            required: true,
        },
    ];
    static flags = {
        help: Flags.help({char: "h"}),
        keyfile: keyFile(),
        users: Flags.option({
            char: "u",
            description: "Grant access to the file(s) to a comma-separated list of user emails.",
            parse: (list) => Promise.resolve(list.split(",")),
        }),
        groups: Flags.option({
            char: "g",
            description: "Grant access to the file(s) to a comma-separated list of groups.",
            parse: (list) => Promise.resolve(list.split(",")),
        }),
    };
    static examples = [
        buildCommandSampleText(
            "file:grant -u john@example.com -g myGroup path/to/file.iron",
            "Add decrypt access to the specified file to the provided user and group."
        ),
        buildCommandSampleText(
            "file:grant -u john@example.com,mike@example.com -g myGroup1,myGroup2 path/to/file.iron",
            "Add decrypt access to the specified file to multiple users and groups."
        ),
        buildCommandSampleText("file:grant -g myGroup *.iron", "Add decrypt access to all of the '.iron' files in the current directory to 'myGroup'."),
    ];

    /**
     * Build a Promise that shares the provided file with the provide list of users and groups. Returns a fixed grant response
     * so that we can partially fail the grant operation.
     */
    getGrantPromise(filePath: string, accessList: DocumentAccessList): Promise<FileGrantResponse> {
        const sourceFile = normalizePathToFile(filePath);

        return checkSourceFilePermissions(sourceFile)
            .then(() => ironnode().document.getDocumentIDFromStream(fs.createReadStream(sourceFile)))
            .then((documentID) => {
                if (!documentID) {
                    return Promise.reject(new Error(`Could not parse encrypted file.`));
                }
                return ironnode().document.grantAccess(documentID, accessList);
            })
            .then((shareResults) => ({
                source: sourceFile,
                shares: shareResults,
            }))
            .catch((e) =>
                e instanceof SDKError && e.code === ErrorCodes.DOCUMENT_HEADER_PARSE_FAILURE
                    ? new Error(`Failed to revoke '${sourceFile}'. File doesn't appear to be an ironhide encrypted file.`)
                    : (e as Error)
            );
    }

    async run() {
        const {argv, flags} = await this.parse(Grant);

        if (!flags.groups && !flags.users) {
            this.error(chalk.red("You must provide at least one user or group."));
        }
        const [groupsByName, groupsByID] = await GroupMaps.getGroupMaps();
        const requestedGroups = await GroupMaps.convertGroupNamesToIDs(flags.groups, groupsByName);
        const resultTable = createDisplayTable(["File", "Successful Grants", "Failed Grants"]);
        const accessList = convertUserAndGroupToAccessList(flags.users, requestedGroups);
        const grantOps = argv.map((file) => this.getGrantPromise(file, accessList));

        //Run each file grant operation and for operations that completly failed display an error but for
        //successful results, we return the list of successful grants and failures which get displayed within
        //a table.
        Promise.all(grantOps)
            .then((grantResultList) => {
                grantResultList.forEach((grantResult) => {
                    if (isError(grantResult)) {
                        this.log(chalk.red(grantResult.message));
                    } else {
                        resultTable.push(fileAccessResponseToTableRow(grantResult.source, grantResult.shares, groupsByID));
                    }
                });
                if (resultTable.length) {
                    this.log(resultTable.toString());
                }
            })
            .catch((e) => this.error((e as Error).message));
    }
}
