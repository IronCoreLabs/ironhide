import {Command, flags as flagtype} from "@oclif/command";
import {ErrorCodes} from "@ironcorelabs/ironnode";
import * as fs from "fs";
import {extname} from "path";
import chalk from "chalk";
import {ironnode} from "../../lib/SDK";
import {keyFile} from "../../lib/sharedFlags";
import * as Utils from "../../lib/Utils";

type DecryptFileResult = Utils.ErrorOr<{
    decryptedContent: Buffer;
    destinationFileOutput?: string;
}>;

/**
 * File decrypt command. Takes a single or list of files and attempts to decrypt them. If a single file is provided without flags it will attempt to write the
 * decrypted file as a sibling of the encrypted file with it's extension removed. The -o option allows users to have the decrypted content to be written out
 * to either a different file location or `-o -` can be used to print the decrypted content to stdout. If multiple files are provided they will each be written
 * as siblings of their encrypted files with the file extension removed.
 */
export default class Decrypt extends Command {
    static description = "Decrypt a file or list of files. By default, the decrypted file is written to the same directory without the '.iron' extension.";
    static strict = false; //Allow multiple files to be provided as arguments
    static args = [
        {
            name: "files",
            description: "Path of file or files to decrypt.",
        },
    ];
    static flags = {
        help: flagtype.help({char: "h"}),
        keyfile: keyFile(),
        out: flagtype.string({
            char: "o",
            description:
                "Filename where decrypted file will be written. Only allowed if a single file is being decrypted. Use '-o -' to write decrypted file content to stdout.",
        }),
        stdin: flagtype.boolean({
            char: "s",
            description: "Read data to decrypt from stdin. If used, no source files should be provided as arguments and you must use the -o flag.",
            dependsOn: ["out"],
        }),
        delete: flagtype.boolean({
            char: "d",
            description: "Delete the input file after successful decrypt",
            exclusive: ["stdin"],
        }),
    };
    static examples = [
        Utils.buildCommandSampleText(
            "file:decrypt path/to/file.txt.iron",
            "Decrypt a file given its path and write it out to 'path/to/file.txt' leaving input file in place."
        ),
        Utils.buildCommandSampleText(
            "file:decrypt path/to/file.json.iron -o file.json",
            "Decrypt the provided encrypted file and write the result to file.json in the current working directory."
        ),
        Utils.buildCommandSampleText(
            "file:decrypt path/to/file.json.iron -d -o file.json",
            "Decrypt the provided encrypted file and write the result to file.json and delete the encrypted path/to/file.json.iron file."
        ),
        Utils.buildCommandSampleText("file:decrypt *.iron", "Decrypt all of the '.iron' files and write them to files without the '.iron' extension."),
        Utils.buildCommandSampleText("file:decrypt path/to/file.iron -o -", "Decrypt the provided file and write the decrypted bytes to stdout."),
        Utils.buildCommandSampleText(
            `${chalk.green("cat")} encryptedfile.iron | ${chalk.green("ironhide")} file:decrypt -s -o -`,
            "Decrypt the provided file from stdin and write the decrypted bytes to stdout.",
            false
        ),
    ];

    /**
     * Strip off the last extension from the provided file path. Would remove .iron from both file.json.iron and file.iron
     */
    removeLastFileExtension(filePath: string) {
        const lastExtensionLength = extname(filePath).length;
        if (lastExtensionLength === 0) {
            //The file we're trying to decrypt doesn't have an extension, so just return the file name. This is very likely
            //to fail later on because we're trying to write the decrypted content to the same place as the encrypted file.
            return filePath;
        }
        return filePath.slice(0, -lastExtensionLength);
    }

    /**
     * Read all the data from stdin into a single Buffer since we don't yet support streaming decryption. Returns a Promise which
     * resolves with all file data as bytes or rejects with any error encountered while reading the stream.
     */
    readAllContentFromStdin(): Promise<Buffer> {
        const encryptedData: Buffer[] = [];
        return new Promise((resolve, reject) => {
            process.stdin.on("data", (chunk: Buffer) => encryptedData.push(chunk));
            process.stdin.on("end", () => resolve(Buffer.concat(encryptedData)));
            process.stdin.on("error", (e) => reject(e));
        });
    }

    /**
     * Returns the bytes to decrypt conditionally based off whether the user is decrypting a file provided on the CLI or from content
     * read from stdin.
     */
    getBytesToDecrypt(decryptOptions: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp): Promise<Buffer> {
        if (Utils.isStdInFileOperation(decryptOptions)) {
            return this.readAllContentFromStdin();
        }
        const sourceFile = Utils.normalizePathToFile(decryptOptions.file);
        return Utils.checkSourceFilePermissions(sourceFile).then(() => fs.readFileSync(sourceFile));
    }

    /**
     * If provided, verify the provided output file. If not provided, just resolves.
     */
    verifyOutfile(outPath?: string) {
        return outPath ? Utils.checkDestinationFilePermissions(Utils.normalizePathToFile(outPath)) : Promise.resolve();
    }

    /**
     * Given an encrypted file path, read in the file content to bytes then extract the document ID from the doc
     * and use that to decrypt the document. Returns the decrypted document response from the SDK
     */
    getDocumentIDAndDecrypt(encryptedBytes: Buffer) {
        return ironnode()
            .document.getDocumentIDFromBytes(encryptedBytes)
            .then((documentID) => {
                if (!documentID) {
                    throw new Error(`Could not parse encrypted file.`);
                }
                return ironnode().document.decryptBytes(documentID, encryptedBytes);
            })
            .catch((e) => {
                throw new Error(e.code === ErrorCodes.DOCUMENT_HEADER_PARSE_FAILURE ? `Failed to decrypt. Input doesn't appear to be encrypted.` : e.message);
            });
    }

    /**
     * Returns a Promise of decrypting a file. Checks the file permissions of the provided input and output paths and attempts
     * to decrypt the file and write the result to the output file. If no output file is provided we take the same path as the
     * input file and strip off it's last extension.
     */
    getFileDecryptPromise(decryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp): Promise<DecryptFileResult> {
        let destinationFileOutput: string | undefined;
        // tslint:disable-next-line
        if (decryptOp.out) {
            destinationFileOutput = decryptOp.out === "-" ? undefined : decryptOp.out;
        } else {
            destinationFileOutput = this.removeLastFileExtension((decryptOp as Utils.ProcessSingleFileOp).file);
        }

        return this.verifyOutfile(destinationFileOutput)
            .then(() => this.getBytesToDecrypt(decryptOp))
            .then((encryptedBytes) => this.getDocumentIDAndDecrypt(encryptedBytes))
            .then((decryptedDocument) => {
                if (!Utils.isStdInFileOperation(decryptOp) && decryptOp.deleteSource) {
                    try {
                        Utils.deleteFile(decryptOp.file);
                    } catch (_) {
                        this.warn(`Unable to delete encrypted source file '${decryptOp.file}' as it is not writable.`);
                    }
                }
                return {
                    decryptedContent: decryptedDocument.data,
                    destinationFileOutput,
                };
            })
            .catch((e) => e);
    }

    /**
     * Decrypt a collection of files and write them out to the same location but with their extension removed.
     */
    decryptMultipleFiles(decryptOp: Utils.ProcessMultipleFileOp) {
        const decryptOps = decryptOp.file.map((file) => this.getFileDecryptPromise({file, out: decryptOp.out, deleteSource: decryptOp.deleteSource}));

        return Promise.all(decryptOps).then((results) => {
            let successfulCount = 0;
            let failureCount = 0;
            results.forEach((decryptResult) => {
                if (Utils.isError(decryptResult)) {
                    this.log(chalk.red(decryptResult.message));
                    failureCount++;
                } else {
                    fs.writeFileSync(decryptResult.destinationFileOutput as string, decryptResult.decryptedContent);
                    successfulCount++;
                }
            });
            if (successfulCount > 0) {
                this.log(chalk.green(`\n${successfulCount} file(s) successfully decrypted.`));
            }
            if (failureCount > 0) {
                this.log(chalk.red(`\n${failureCount} file(s) failed to be decrypted.`));
            }
        });
    }

    /**
     * Decrypt a single file and write the decrypted bytes either to a sibling file, the location requested by the -o option or
     * write the bytes to stdout.
     */
    decryptSingleFile(decryptOp: Utils.ProcessSingleFileOp | Utils.ProcessStdinOp) {
        return this.getFileDecryptPromise(decryptOp).then((result) => {
            if (Utils.isError(result)) {
                throw result;
            }
            if (decryptOp.out === "-") {
                //Write out the decrypted bytes to stdout
                process.stdout.write(result.decryptedContent);
            } else {
                //Write out the decrypted bytes to the file and display a success message
                fs.writeFileSync(result.destinationFileOutput as string, result.decryptedContent);
                const writtenResult = Utils.isStdInFileOperation(decryptOp) ? decryptOp.out : this.removeLastFileExtension(decryptOp.file);
                this.log(chalk.green(`File successfully decrypted and written to ${writtenResult}.`));
            }
        });
    }

    /**
     * Manual validation of complex flag and argument combinations to make sure the user is doing the right thing. Also limit the number of files that
     * we attempt to decrypt at any one time.
     */
    checkFlagsAndArguments(argv: string[], stdin: boolean, out?: string) {
        if (argv.length > 1 && out) {
            return this.error(chalk.red("The output flag (-o) can only be provided when decrypting a single file."));
        }
        if (argv.length === 0 && !stdin) {
            return this.error(chalk.red("Error: You must either provide a path to a file to decrypt or use the -s flag to read from stdin."));
        }
        if (argv.length > 0 && stdin) {
            return this.error(chalk.red("Error: You cannot provide both source files and the -s flag to read from stdin."));
        }
    }

    async run() {
        const {argv, args, flags} = this.parse(Decrypt);
        this.checkFlagsAndArguments(argv, flags.stdin, flags.out);
        let decryptOp: Utils.ProcessOp;
        if (flags.stdin) {
            decryptOp = {out: flags.out as string} as Utils.ProcessStdinOp;
        } else {
            decryptOp = {
                file: argv.length > 1 ? argv : (args.files as string),
                out: flags.out,
                deleteSource: flags.delete,
            } as Utils.ProcessFileOp;
        }

        try {
            Utils.isMultipleFileOperation(decryptOp) ? await this.decryptMultipleFiles(decryptOp) : await this.decryptSingleFile(decryptOp);
        } catch (e) {
            this.error(chalk.red(e.message));
        }
    }
}
