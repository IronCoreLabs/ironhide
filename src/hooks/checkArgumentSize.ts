import {Hook} from "@oclif/config";
import {CLIError} from "@oclif/errors";

/**
 * Max number of concurrent files that we let the user encrypt/decrypt/query at one time. Will likely bump up this limit in the
 * future but for now it's used to try and prevent simple DoS attacks against our service.
 */
const CONCURRENT_REQ_LIMIT = 75;

/**
 * Before we run the command, check that the user didn't provide an excessive number of files which might cause rate limiting issues against our server.
 */
const hook: Hook<"prerun"> = async ({argv, Command}) => {
    //Verify that we're running a file command and that the argument list is larger than we support at once.
    if (Command.id.startsWith("file:") && argv && argv.length > CONCURRENT_REQ_LIMIT) {
        throw new CLIError(
            `List of ${argv.length} files exceeds ${CONCURRENT_REQ_LIMIT} which is the maximum number of files that can be processed at one time.`
        );
    }
};

export default hook;
