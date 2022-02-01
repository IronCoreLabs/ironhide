import {format, inspect} from "util";
import wrapAnsi from "wrap-ansi";

/**
 * Display the provided message to the console, but wrap it at word breaks to either match the console width, or a fixed
 * width to make it easier to read.
 */
export const info = (message: any) => {
    const columns = Math.min(process.stdout.columns, 140);
    const detailedMessage = typeof message === "string" ? message : inspect(message);
    process.stdout.write(wrapAnsi(format(detailedMessage) + "\n", columns));
};
