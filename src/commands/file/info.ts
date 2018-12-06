import {Command, flags as flagtype} from "@oclif/command";
import {ErrorCodes, DocumentMetaResponse} from "@ironcorelabs/ironnode";
import * as fs from "fs";
import {basename} from "path";
import chalk from "chalk";
import {keyFile} from "../../lib/sharedFlags";
import * as GroupMaps from "../../lib/GroupMaps";
import {ErrorOr, isError, normalizePathToFile, createDisplayTable, checkSourceFilePermissions, buildCommandSampleText} from "../../lib/Utils";
import {ironnode} from "../../lib/SDK";

type FileMetaResult = ErrorOr<{
    source: string;
    metadata: DocumentMetaResponse;
}>;

/**
 * File info command. Takes a single or multiple files as arguments and parses them for their IDs, then takes those IDs and looks up the meta information
 * from the SDk about the files. Displays results in a table.
 */
export default class Info extends Command {
    static description = "Display information about an encrypted file or list of files.";
    static strict = false;
    static args = [
        {
            name: "files",
            description: "Path of file or files to display information for.",
            required: true,
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
    };
    static examples = [buildCommandSampleText("file:info path/to/file"), buildCommandSampleText("file:info *.iron")];

    /**
     * Return a Promise to handle getting the meta information for a single file given it's relative path. Returns a result
     * structure that represents a success or error response.
     */
    getFileMetaPromise(filePath: string): Promise<FileMetaResult> {
        const sourceFile = normalizePathToFile(filePath);

        return checkSourceFilePermissions(sourceFile)
            .then(() => ironnode().document.getDocumentIDFromStream(fs.createReadStream(sourceFile)))
            .then((documentID) => {
                if (!documentID) {
                    return Promise.reject(new Error("Could not parse encrypted file."));
                }
                return ironnode().document.getMetadata(documentID);
            })
            .then((documentMeta) => ({
                source: sourceFile,
                metadata: documentMeta,
            }))
            .catch((e) => {
                return new Error(
                    e.code === ErrorCodes.DOCUMENT_HEADER_PARSE_FAILURE
                        ? `Failed to parse '${sourceFile}'. File doesn't appear to be an encrypted file.`
                        : e.message
                );
            });
    }

    /**
     * Take the list of file meta results and groups by ID and create the display table, one row for each file we're getting information on.
     */
    buildResultTable(fileMeta: FileMetaResult[], groupsByID: GroupMaps.GroupsByID) {
        const resultTable = createDisplayTable(["File", "ID", "Association", "Users with access", "Groups with access"]);
        fileMeta.forEach((fileInfo) => {
            if (isError(fileInfo)) {
                this.log(chalk.red(fileInfo.message));
            } else {
                const {documentID, association, visibleTo} = fileInfo.metadata;
                resultTable.push([
                    basename(fileInfo.source),
                    documentID,
                    association,
                    visibleTo.users.map((user) => user.id).join("\n"),
                    visibleTo.groups.map((group) => `${groupsByID[group.id].groupName} (${group.id})`).join("\n"),
                ]);
            }
        });
        return resultTable;
    }

    async run() {
        const {argv} = this.parse(Info);
        const metaOps = argv.map((file) => this.getFileMetaPromise(file));
        Promise.all(metaOps)
            .then((fileMeta) => {
                return GroupMaps.getGroupMaps()
                    .then(([, groupsByID]) => {
                        const resultTable = this.buildResultTable(fileMeta, groupsByID);
                        if (resultTable.length) {
                            this.log(resultTable.toString());
                        }
                    })
                    .catch((e) => {
                        //TODO: what do we do here? In this case we've failed to get a map of the users group IDs so we can't display
                        //the name properly.
                        this.error(chalk.red(e.message));
                    });
            })
            .catch((e) => this.error(e.message));
    }
}
