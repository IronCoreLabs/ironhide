import {flags} from "@oclif/command";

/**
 * Required user list flag. Takes a comma separated list of users.
 */
export const userList = (description: string) =>
    flags.build({
        type: "option",
        char: "u",
        required: true,
        description,
        parse: (list) => list.split(","),
    });

/**
 * Optional key file location flag. Allows calls to the SDK to specify a different location for their keyfile
 * than the default path. This allows the tool to be used more programatically and allow a server to perform
 * operations on behalf of a user.
 */
export const keyFile = flags.build({
    char: "k",
    required: false,
    description: "Path to location of file which contains keys to use for this operation. Overrides using default key file from '~/.iron' directory.",
});
