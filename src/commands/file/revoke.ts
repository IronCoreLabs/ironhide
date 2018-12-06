import {Command, flags as flagtype} from "@oclif/command";
import chalk from "chalk";
import * as fs from "fs";
import {DocumentAccessList, DocumentAccessResponse, ErrorCodes} from "@ironcorelabs/ironnode";
import {ironnode} from "../../lib/SDK";
import * as GroupMaps from "../../lib/GroupMaps";
import {keyFile} from "../../lib/sharedFlags";
import {
    ErrorOr,
    isError,
    convertUserAndGroupToAccessList,
    normalizePathToFile,
    createDisplayTable,
    fileAccessResponseToTableRow,
    checkSourceFilePermissions,
    buildCommandSampleText,
} from "../../lib/Utils";

type FileRevokeResponse = ErrorOr<{
    source: string;
    revokes: DocumentAccessResponse;
}>;

/**
 * File revoke command. Lets user revoke access to a file or list of files from a list of groups and/or users.
 */
export default class Revoke extends Command {
    static description =
        "Revoke cryptographic access to a file or list of files from other users or groups. (Note: revocation can also be accomplished by removing group members if you’re a group admin).";
    static strict = false;
    static args = [
        {
            name: "files",
            description: "Path of file or files to revoke access from.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
        users: flagtype.option({
            char: "u",
            description: "Revoke access to the file(s) from a comma-separated list of user emails.",
            parse: (list) => list.split(","),
        }),
        groups: flagtype.option({
            char: "g",
            description: "Revoke access to the file(s) from a comma-separated list of groups.",
            parse: (list) => list.split(","),
        }),
    };
    static examples = [
        buildCommandSampleText(
            "file:revoke -u john@example.com -g myGroup path/to/file.iron",
            "Revoke access to the provided encrypted file from the provided user and group."
        ),
        buildCommandSampleText(
            "file:revoke -u john@example.com,mike@example.com -g myGroup1,myGroup2 path/to/file.iron",
            "Revoke access to the provided encrypted file from the provided users and groups."
        ),
        buildCommandSampleText("file:revoke -g myGroup *.iron", "Revoke access to all of the '.iron' files from 'myGroup'."),
    ];

    /**
     * Build a Promise that revokes access to the provided file with the provide list of users and groups. Returns a fixed revoke response
     * so that we can partially fail the revoke operation.
     */
    getRevokePromise(filePath: string, accessList: DocumentAccessList): Promise<FileRevokeResponse> {
        const sourceFile = normalizePathToFile(filePath);

        return checkSourceFilePermissions(sourceFile)
            .then(() => ironnode().document.getDocumentIDFromStream(fs.createReadStream(sourceFile)))
            .then((documentID) => {
                if (!documentID) {
                    return Promise.reject(new Error(`Could not parse encrypted file.`));
                }
                return ironnode().document.revokeAccess(documentID, accessList);
            })
            .then((shareResults) => ({
                source: sourceFile,
                revokes: shareResults,
            }))
            .catch((e) => {
                return new Error(
                    e.code === ErrorCodes.DOCUMENT_HEADER_PARSE_FAILURE
                        ? `Failed to parse '${sourceFile}'. Document doesn't appear to be an encrypted file.`
                        : e.message
                );
            });
    }

    async run() {
        const {argv, flags} = this.parse(Revoke);

        if (!flags.groups && !flags.users) {
            this.error(chalk.red("You must provide at least one user or group from which to revoke access."));
        }
        const resultTable = createDisplayTable(["File", "Successful Revokes", "Failed Revokes"]);
        const [groupsByName, groupsByID] = await GroupMaps.getGroupMaps();
        const requestedGroups = await GroupMaps.convertGroupNamesToIDs(flags.groups, groupsByName);
        const accessList = convertUserAndGroupToAccessList(flags.users, requestedGroups);
        const revokeOps = argv.map((file) => this.getRevokePromise(file, accessList));

        //Run each file revoke operation and for operations that completly failed display an error but for
        //successful results, we return the list of successful revokes and failures which get displayed within
        //a table.
        Promise.all(revokeOps)
            .then((revokeResultList) => {
                revokeResultList.forEach((revokeResult) => {
                    if (isError(revokeResult)) {
                        this.log(chalk.red(revokeResult.message));
                    } else {
                        resultTable.push(fileAccessResponseToTableRow(revokeResult.source, revokeResult.revokes, groupsByID));
                    }
                });
                if (resultTable.length) {
                    this.log(resultTable.toString());
                }
            })
            .catch((e) => this.error(e.message));
    }
}
