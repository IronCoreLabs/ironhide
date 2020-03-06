import {DocumentAccessList, DocumentIDNameResponse} from "@ironcorelabs/ironnode";
import {Command, flags as flagtype} from "@oclif/command";
import * as fs from "fs";
import * as GroupMaps from "../../lib/GroupMaps";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import * as Utils from "../../lib/Utils";
import chalk = require("chalk");

type EncryptResult = Utils.ErrorOr<DocumentIDNameResponse>;

const FILE_SIZE_ERROR_THRESHOLD = 1024 * 1024 * 1024 * 2; //2 GB

/**
 * File encrypt command. Takes a single file or multiple files and encrypts them to the caller and any optional users and
 * groups provided via flags. Multiple files and single files without the -o flag will write a file as a sibling of the plaintext
 * file with a `.iron` suffix. Providing the -o option allows users to write files to a specific file location or to use `-` to
 * write the encrypted bytes to stdout.
 */
export default class Encrypt extends Command {
    static description =
        "Encrypt a file or list of files to yourself and optionally to other users or groups. By default, the input file is unchanged and the output uses the same filename with a '.iron' extension added.";
    static strict = false; //Allow multiple files to be provided as arguments
    static args = [
        {
            name: "files",
            description: "Path of file or files to encrypt.",
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
        users: flagtype.option({
            char: "u",
            description: "Encrypt the file(s) to a comma-separated list of user emails. Files are automatically encrypted to the logged-in user.",
            parse: (list) => list.split(","),
        }),
        groups: flagtype.option({
            char: "g",
            description: "Encrypt the file(s) to a comma-separated list of groups.",
            parse: (list) => list.split(","),
        }),
        out: flagtype.string({
            char: "o",
            description:
                "Filename where encrypted file will be written. Only allowed if a single file is being encrypted. Use '-o -' to write encrypted file content to stdout, but fair warning, the output is binary and not ASCII.",
        }),
        stdin: flagtype.boolean({
            char: "s",
            description: "Read data to encrypt from stdin. If used, no source files should be provided as arguments and you must use the '-o' flag.",
            dependsOn: ["out"],
        }),
        delete: flagtype.boolean({
            char: "d",
            description: "Delete the unencrypted source file(s) after successful encryption.",
            exclusive: ["stdin"],
        }),
    };
    static examples = [
        Utils.buildCommandSampleText("file:encrypt path/to/file", "Encrypt the provided file and write the results to 'path/to/file.iron'."),
        Utils.buildCommandSampleText(
            "file:encrypt -g myGroup -u john@example.com,mike@example.com path/to/file",
            "Encrypt the provided file and grant decryption access to two users and one group"
        ),
        Utils.buildCommandSampleText(
            "file:encrypt path/to/file -o other/path/to/encrypted.iron",
            "Encrypt the provided file and write the decrypted bytes to 'other/path/to/encrypted.iron'."
        ),
        Utils.buildCommandSampleText(
            "file:encrypt path/to/file.txt -d",
            "Encrypt the provided file and write the decrypted bytes to 'path/to/file.txt.iron' while also deleting the original unencrypted 'path/to/file.txt' file."
        ),
        Utils.buildCommandSampleText("file:encrypt *.json", "Encrypt all of the JSON files in the current directory and write them out to '.iron' files."),
        Utils.buildCommandSampleText("file:encrypt path/to/file -o -", "Encrypt the provided file and write the encrypted content to stdout."),
        Utils.buildCommandSampleText(
            `${chalk.green("echo")} "my secret" | ${chalk.green("ironhide")} file:encrypt -s -o - | ${chalk.green("base64")} -e`,
            "Encrypt stdin and write the encrypted results to stdout in base64.",
            true
        ),
    ];

    /**
     * Get the readable stream that the content to encrypt is coming from. Either uses the process.stdin stream or verifies that the
     * provided sourcePath has the proper permissions and creates a readable stream from it.
     */
    getSourceStream(encryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp): Promise<NodeJS.ReadableStream> {
        if (Utils.isStdInFileOperation(encryptOp)) {
            return Promise.resolve(process.stdin);
        }
        const sourceFile = Utils.normalizePathToFile(encryptOp.file);
        return Utils.checkSourceFilePermissions(sourceFile).then(() => {
            const sourceFileStats = fs.lstatSync(sourceFile);
            if (sourceFileStats.size > FILE_SIZE_ERROR_THRESHOLD) {
                return Promise.reject(new Error(`${sourceFile} is over 2GB, which is not currently supported.`));
            }
            return Promise.resolve(fs.createReadStream(sourceFile));
        });
    }

    /**
     * Get the writable stream that the encrypted content will be piped out to. Either uses process.stdout stream or creates a writable
     * stream from either the outputFlag path or the sourcePath with a .iron extension.
     */
    getDestinationStream(encryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp): Promise<NodeJS.WritableStream> {
        if (encryptOp.out === "-") {
            return Promise.resolve(process.stdout);
        }
        const destinationFile = Utils.normalizePathToFile(encryptOp.out || `${(encryptOp as Utils.ProcessSingleFileOp).file}.iron`);
        return Utils.checkDestinationFilePermissions(destinationFile).then(() => fs.createWriteStream(destinationFile));
    }

    /**
     * Run both operations to get the source and destinations that we'll be reading/writing from for this operation.
     */
    getSourceAndDestinationStreams(encryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp) {
        return this.getSourceStream(encryptOp).then((readStream) => this.getDestinationStream(encryptOp).then((writeStream) => [readStream, writeStream]));
    }

    /**
     * Returns a promise for the actual encrypt operation. Determines the source and destination streams and returns a Promise which runs
     * the encrypt operation. NOTE: The returned Promise from this method CANNOT fail as we let the caller decide how to handle failure. This
     * lets us prevent a complete failure when encrypting multiple files when one of them fails.
     */
    getFileEncryptPromise(fileAccessList: DocumentAccessList, encryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp): Promise<EncryptResult> {
        return this.getSourceAndDestinationStreams(encryptOp)
            .then(([sourceStream, destStream]) =>
                ironnode().document.encryptStream(sourceStream as NodeJS.ReadStream, destStream as NodeJS.WriteStream, {accessList: fileAccessList})
            )
            .then((decryptResult) => {
                if (!Utils.isStdInFileOperation(encryptOp) && encryptOp.deleteSource) {
                    try {
                        Utils.deleteFile(encryptOp.file);
                    } catch (_) {
                        this.warn(`Unable to delete source file '${encryptOp.file}' as it is not writable.`);
                    }
                }
                return decryptResult;
            })
            .catch((e) => e);
    }

    /**
     * Encrypt a list of files to the provided list of users and groups. Runs a series of Promises in parallel and logs the results of the successes
     * and failures.
     */
    encryptMultipleFiles(fileAccessList: DocumentAccessList, encryptOp: Utils.ProcessMultipleFileOp) {
        const encryptOps = encryptOp.file.map((file) =>
            this.getFileEncryptPromise(fileAccessList, {file, out: encryptOp.out, deleteSource: encryptOp.deleteSource})
        );

        return Promise.all(encryptOps).then((results) => {
            let successfulCount = 0;
            let failureCount = 0;
            results.forEach((encryptionResult) => {
                if (Utils.isError(encryptionResult)) {
                    this.log(chalk.red(encryptionResult.message));
                    failureCount++;
                } else {
                    successfulCount++;
                }
            });
            if (successfulCount > 0) {
                this.log(chalk.green(`\n${successfulCount} file(s) successfully encrypted.`));
            }
            if (failureCount > 0) {
                this.error(chalk.red(`\n${failureCount} file(s) failed to be encrypted.`));
            }
        });
    }

    /**
     * Encrypt a single file from it's path or from stdin and write the output to either
     * + A sibling of the source file with a .iron extension,
     * + The file path provided by the -o flag
     * + Stdout if the -o flag was set to '-'
     */
    encryptSingleFile(fileAccessList: DocumentAccessList, encryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp) {
        return this.getFileEncryptPromise(fileAccessList, encryptOp).then((encryptionResult) => {
            if (Utils.isError(encryptionResult)) {
                //Throw this error so that it's caught in the try/catch in the run() function so we log this as an error
                throw encryptionResult;
            }
            if (encryptOp.out !== "-") {
                const writtenResult = Utils.isStdInFileOperation(encryptOp) ? encryptOp.out : encryptOp.out || `${encryptOp.file}.iron`;
                this.log(chalk.green(`Encrypted file successfully written to ${writtenResult}.`));
            }
        });
    }

    /**
     * Various argument/outflag/stdinflag checks to verify that we support the combination of things they're trying to do.
     */
    checkFlagsAndArguments(argv: string[], outFlag?: string, stdinFlag?: boolean) {
        if (argv.length > 1 && outFlag) {
            return this.error(chalk.red("The output flag (-o) can only be provided when encrypting a single file."));
        }
        if (argv.length === 0 && !stdinFlag) {
            return this.error(chalk.red("You must either provide a path to a file to encrypt or use the -s flag to read from stdin."));
        }
        if (argv.length > 0 && stdinFlag) {
            return this.error(chalk.red("You cannot provide both source files and the -s flag."));
        }
    }

    async run() {
        const {argv, args, flags} = this.parse(Encrypt);
        this.checkFlagsAndArguments(argv, flags.out, flags.stdin);
        let requestedGroups: string[] = [];
        //Only lookup the users groups for mapping if they're sharing with a group
        if (flags.groups && flags.groups.length) {
            const [groupsByName] = await GroupMaps.getGroupMaps();
            requestedGroups = await GroupMaps.convertGroupNamesToIDs(flags.groups, groupsByName);
        }

        const accessList = Utils.convertUserAndGroupToAccessList(flags.users, requestedGroups);

        let encryptOp: Utils.ProcessOp;
        if (flags.stdin) {
            encryptOp = {out: flags.out as string} as Utils.ProcessStdinOp;
        } else {
            encryptOp = {
                file: argv.length > 1 ? argv : (args.files as string),
                out: flags.out,
                deleteSource: flags.delete,
            } as Utils.ProcessFileOp;
        }

        try {
            Utils.isMultipleFileOperation(encryptOp)
                ? await this.encryptMultipleFiles(accessList, encryptOp)
                : await this.encryptSingleFile(accessList, encryptOp);
        } catch (e) {
            this.error(chalk.red(e.message));
        }
    }
}
