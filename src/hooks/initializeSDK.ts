import {DeviceDetails, initialize} from "@ironcorelabs/ironnode";
import {Hook, IConfig} from "@oclif/config";
import {CLIError, handle} from "@oclif/errors";
import * as fs from "fs";
import {set} from "../lib/SDK";
import {isFileReadable, normalizePathToFile, validateExistingKeys} from "../lib/Utils";

/**
 * All errors that occur during various oclif commands use this.error() to report the error. This ends up throwing a new error which has
 * some nice formatting. However, sometimes we want to call this.error() from within the catch() block of a Promise when things fail. Because
 * this ends up throwing another error, we trigger the Node Unhandled Promise Rejection error issue and a bunch of unnecessary content gets
 * dumped to the console. So to handle that we subscribe to these events and use the internal oclif error handling to print the error in the same
 * way that all other this.error calls happen. This also causes the Node process to exit, but with a non-zero exit code.
 */
process.on("rejectionHandled", () => null);
process.on("unhandledRejection", (_, promise) => promise.catch((e) => handle(new CLIError(e))));

/**
 * Check the command being run and various flags to see if we shouldn't run SDK initialization prior to this command running.
 */
function shouldBailOnSdkInit(commandID: string, args: string[]) {
    return commandID === "login" || args.includes("-h") || args.includes("--help");
}

/**
 * Parse -k/--keyfile flag to support multiple ways to provide this flag. Supports:
 *   -k path/to/file
 *   --keyfile path/to/file
 *   --keyfile=path/to/file
 * Note that for the last one the user will have to provide a normalized path to the file as bash et al won't auto expand the result. So if
 * the user tries to run `--keyfile=~/.iron/keys` it won't work since the `~/` won't expand properly.
 */
function getKeyFileFlagValue(args: string[]) {
    //Support both -k and --keyfile as flags where the argument is provided after a space (-k path | --keyfile path)
    if (args.includes("-k") || args.includes("--keyfile")) {
        const keyFlagIndex = args.indexOf("-k") > -1 ? args.indexOf("-k") : args.indexOf("--keyfile");
        //Get the key file path from the next index in the args array
        const keyPath = args[keyFlagIndex + 1];
        if (!keyPath) {
            throw new CLIError("Error: Flag --keyfile expects a value.");
        }
        return keyPath;
    }
    //Support the --keyfile=path form. Falls back to returning null (no flag) if not found
    let keyfileArgument: string | null = null;
    args.forEach((arg) => {
        if (arg.startsWith("--keyfile=")) {
            keyfileArgument = arg.split("=")[1];
            if (!keyfileArgument) {
                throw new CLIError("Error: Flag --keyfile expects a value.");
            }
        }
    });
    return keyfileArgument;
}

/**
 * Return a fully qualified path to the device key file to use for this operation. Defaults to the expected key directory unless
 * the user provides a `-k` option at which point we take the argument
 */
function getConfigFilePath(config: IConfig, args: string[]) {
    const customKeyFileLocation = getKeyFileFlagValue(args);
    if (!customKeyFileLocation) {
        return `${config.home}/.iron/keys`;
    }
    const fullKeyFilePath = normalizePathToFile(customKeyFileLocation);
    if (!isFileReadable(fullKeyFilePath)) {
        throw new CLIError(`Value provided for keyfile '${customKeyFileLocation}' either doesn't exist or cannot be read.`);
    }
    const keyFileStats = fs.lstatSync(fullKeyFilePath);
    if (!keyFileStats.isFile()) {
        throw new CLIError(`Value provided for keyfile '${customKeyFileLocation}' does not appear to be a file.`);
    }
    return fullKeyFilePath;
}

/**
 * Read the device keys file from disk. Throws if the file is not accessible.
 */
function readDeviceKeys(configPath: string): DeviceDetails {
    fs.accessSync(configPath, fs.constants.R_OK);
    const config: DeviceDetails = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config;
}

/**
 * oclif prerun hook that is responsible for looking up local device keys and initializing the IronNode SDK from those keys and storing
 * off the SDK instance so that the subequent command can access it.
 */
const hook: Hook<"prerun"> = async ({argv, Command, config}) => {
    //Don't initialize the SDK if the user is logging in/out or if they're just getting help info
    if (shouldBailOnSdkInit(Command.id, argv)) {
        return;
    }
    const configFilePath = getConfigFilePath(config, argv);
    if (!isFileReadable(configFilePath)) {
        throw new CLIError(`No device keys found. Please run 'ironhide login' first to create your account and/or authorize this device.`);
    }

    if (!validateExistingKeys(configFilePath)) {
        throw new CLIError(`Device key file at '${configFilePath}' could not be successfully parsed or isn't in the expected format.`);
    }
    let deviceKeys: any;
    try {
        deviceKeys = readDeviceKeys(configFilePath);
    } catch (e) {
        throw new CLIError("Failed to properly parse device keys. Please run 'ironhide logout' and then re-run 'ironhide login' to generate new keys.");
    }
    try {
        const SDK = await initialize(deviceKeys.accountID, deviceKeys.segmentID, deviceKeys.deviceKeys.privateKey, deviceKeys.signingKeys.privateKey);
        set(SDK);
    } catch (e) {
        //If init fails, throw an error unless the user is currently running the logout operation. Running the logout operation shouldn't fail to try and delete
        //the users local keys even if can't init can't be run. The logout command currently checks whether the SDK init completed before trying to delete the
        //device keys from the server.
        if (Command.id !== "logout") {
            console.error(e.message);
            throw new CLIError("Failed to authenticate. Try logging out and logging back in again to generate a new set of keys.");
        }
    }
};

export default hook;
