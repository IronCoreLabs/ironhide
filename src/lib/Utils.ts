import {DeviceDetails, DocumentAccessList, DocumentAccessResponse} from "@ironcorelabs/ironnode";
import * as Table from "cli-table3";
import * as fs from "fs";
import {basename, dirname, join, normalize, sep} from "path";
import {GroupsByID} from "./GroupMaps";
import chalk = require("chalk");

export type ErrorOr<R> = R | Error;
interface ProcessFileBase {
    out?: string;
    deleteSource: boolean;
}
export interface ProcessSingleFileOp extends ProcessFileBase {
    file: string;
}
export interface ProcessMultipleFileOp extends ProcessFileBase {
    file: string[];
}
export interface ProcessStdinOp {
    out: string;
}
export type ProcessFileOp = ProcessSingleFileOp | ProcessMultipleFileOp;
export type ProcessOp = ProcessFileOp | ProcessStdinOp;

/**
 * Type guard to determine if the file options we have represents a multiple file operation.
 */
export function isMultipleFileOperation(fileProcessOp: ProcessOp): fileProcessOp is ProcessMultipleFileOp {
    return Array.isArray((fileProcessOp as ProcessFileOp).file);
}

/**
 * Type guard to determine if the file options we have represent an operation from stdin.
 */
export function isStdInFileOperation(fileProcessOp: ProcessOp): fileProcessOp is ProcessStdinOp {
    return !(fileProcessOp as ProcessFileOp).file;
}

/**
 * Type guard to determine of ErrorOr result is an Error instance.
 */
export function isError<R>(result: ErrorOr<R>): result is Error {
    return result instanceof Error;
}

/**
 * Returns whether or not the file provided both exists and is readable.
 */
export function isFileReadable(path: string) {
    try {
        fs.accessSync(path, fs.constants.R_OK);
        return true;
    } catch (_) {
        return false;
    }
}

/**
 * Check to see if the provided device key config file is parsable and formatted correctly.
 */
export function validateExistingKeys(configPath: string) {
    try {
        const config: DeviceDetails = JSON.parse(fs.readFileSync(configPath, "utf8"));
        return config && config.accountID && config.segmentID && config.deviceKeys && config.signingKeys;
    } catch (e) {
        return false;
    }
}

/**
 * Attempt to normalize and create a fully qualified path given either an existing fully qualified path
 * or a partial path. If the provided path starts with / it assumes it's already fully qualified, otherwise
 * it normalizes the path from the cwd.
 */
export function normalizePathToFile(file: string) {
    if (file.startsWith(sep)) {
        return file;
    }
    return normalize(join(process.cwd(), file));
}

/**
 * Attempt to delete the provided partial file path. Will throw an exception if the file isn't writable and cannot be deleted.
 */
export function deleteFile(filePath: string) {
    const sourceFile = normalizePathToFile(filePath);
    fs.accessSync(sourceFile, fs.constants.W_OK);
    fs.unlinkSync(sourceFile);
}

/**
 * Validate that the provided file to encrypt is readable and is an actual file.
 */
export function checkSourceFilePermissions(fileToEncrypt: string) {
    //Make sure we can read from the source file
    if (!isFileReadable(fileToEncrypt)) {
        return Promise.reject(new Error(`Provided path '${fileToEncrypt}' doesn't exist or is not readable.`));
    }

    //Make sure the provided input file is not a directory
    const sourceFileStats = fs.lstatSync(fileToEncrypt);
    if (!sourceFileStats.isFile()) {
        return Promise.reject(new Error(`Provided path '${fileToEncrypt}' does not appear to be a file.`));
    }
    return Promise.resolve();
}

/**
 * Check that the file path to write to doesn't already exist and the directory it will live in is writable.
 */
export function checkDestinationFilePermissions(destinationFile: string) {
    //Make sure the destination file doesn't already exist
    if (fs.existsSync(destinationFile)) {
        return Promise.reject(new Error(`Output path '${destinationFile}' already exists.`));
    }

    //Make sure we can write to the output location
    try {
        fs.accessSync(dirname(destinationFile), fs.constants.W_OK);
        return Promise.resolve();
    } catch (_) {
        return Promise.reject(new Error(`Output path '${dirname(destinationFile)}' is not writable.`));
    }
}

/**
 * Given an optional list of users and groups convert them into an object that the SDK takes for user and group shares.
 */
export function convertUserAndGroupToAccessList(providedUserIDs: string[] | undefined, providedGroupIDs: string[] | undefined): DocumentAccessList {
    let userShares: Array<{id: string}> = [];
    let groupShares: Array<{id: string}> = [];

    if (providedUserIDs && providedUserIDs.length) {
        userShares = providedUserIDs.map((userEmail) => ({id: userEmail}));
    }
    if (providedGroupIDs && providedGroupIDs.length) {
        groupShares = providedGroupIDs.map((groupID) => ({id: groupID}));
    }
    return {users: userShares, groups: groupShares};
}

/**
 * Creates a new CLI table from the provided columns. Centralized method to return the proper type as well as change
 * the table headers from their default of red (bad!) to blue (nice!).
 */
export function createDisplayTable(columns: string[]) {
    return new Table({
        head: columns.map((columnLabel) => chalk.blue(columnLabel)),
    }) as Table.HorizontalTable;
}

/**
 * Convert a grant/revoke response object into a CLI table for which displays the list of successes and failures
 */
export function fileAccessResponseToTableRow(fileSource: string, accessResult: DocumentAccessResponse, groupsByID: GroupsByID) {
    const {succeeded, failed} = accessResult;

    const successfulIDToDisplay = ({id, type}: {id: string; type: "user" | "group"}) => {
        return type === "user" ? id : groupsByID[id].groupName;
    };

    const failedIDToDisplay = ({id, type, error}: {id: string; type: "user" | "group"; error: string}) => {
        //If we're displaying a user error or a group error but we don't have the ID which likely means that they tried
        //to share with a group that doesn't exist.
        if (type === "user" || !groupsByID[id]) {
            return `${id} (${error})`;
        }
        //Display the group name instead of the ID. Also replace the group ID in the error message as it might contain it.
        const groupName = groupsByID[id].groupName as string;
        return `${groupName} (${error.replace(id, groupName)})`;
    };

    return [basename(fileSource), chalk.green(succeeded.map(successfulIDToDisplay).join("\n")), chalk.red(failed.map(failedIDToDisplay).join("\n"))];
}

/**
 * Build up example command text which support for providing an optional description of the example. All examples are prefixed with a `$ ironhide` to avoid
 * duplication of that for each command.
 */
export function buildCommandSampleText(example: string, description?: string, showPrefix: boolean = true) {
    const descText = description ? `\n${chalk.gray(description)} \n ` : "";
    const commandPrefix = showPrefix ? chalk.green("ironhide") : "";
    return `${descText} ${chalk.magenta("$")} ${commandPrefix} ${example}`;
}
