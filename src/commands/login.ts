import * as IronNode from "@ironcorelabs/ironnode";
import {Command} from "@oclif/command";
import chalk from "chalk";
import cli from "cli-ux";
import * as fs from "fs";
import * as os from "os";
import {dirname} from "path";
import authenticate from "../lib/authenticate";
import * as Logger from "../lib/Logger";
import * as messages from "../lib/messages";
import {validateExistingKeys} from "../lib/Utils";

export default class Login extends Command {
    public static aliases = ["init"];
    public static description =
        "Login to the ironhide CLI tool to either create a new account or authorize a new device for an existing account by generating device-specific keys and enabling them.";

    private configFileHome = `${this.config.home}/.iron/keys`;
    private defaultDeviceName = `${os.hostname()}(${os.platform().replace("darwin", "macos")})`;

    /**
     * Write out the provided device config to the provided file location.
     */
    storeNewDeviceKeys(configPath: string, configDetails: IronNode.DeviceDetails) {
        const ironDirectory = dirname(configPath);
        const homeDirectory = dirname(ironDirectory);
        //Check that we can write to their home directory first. If we can't, bail
        try {
            fs.accessSync(homeDirectory, fs.constants.W_OK);
        } catch (_) {
            return false;
        }
        //Check if the `.iron` directory exists and if not, try to create it
        try {
            fs.accessSync(ironDirectory, fs.constants.F_OK);
        } catch (_) {
            try {
                fs.accessSync(homeDirectory, fs.constants.W_OK);
                fs.mkdirSync(ironDirectory);
            } catch (_) {
                return false;
            }
        }
        //Make sure we have write access to the .iron directory and attempt to write out the file
        try {
            fs.accessSync(ironDirectory, fs.constants.W_OK);
            fs.writeFileSync(configPath, JSON.stringify(configDetails));
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Generate device keys for a user that already exists. Checks if the users provided password was wrong and lets them retry. Once they get the right
     * password, use it to generate a new set of device keys and write them out.
     */
    async generateExistingUserDeviceKeys(auth0Jwt: string): Promise<void> {
        let deviceKeys: IronNode.DeviceDetails;
        let password: string;
        let deviceName: string;
        try {
            password = await cli.prompt(chalk.magenta("Device Authorization Passphrase"), {type: "hide"});
            deviceName = await cli.prompt(chalk.magenta("Name for this device"), {
                required: false,
                default: this.defaultDeviceName,
            });
        } catch (e) {
            return this.exit(0); //User command-C'd so just bail out
        }
        try {
            deviceKeys = await IronNode.User.generateDeviceKeys(auth0Jwt, password, {deviceName});
        } catch (e) {
            if (e.message.includes("was an invalid authorization token")) {
                this.log(chalk.red("Auth token from Auth0 has timed out. Please try logging in again."));
                return this.exit(-1);
            }
            this.log(chalk.red("Provided passphrase was invalid. Please try again."));
            return this.generateExistingUserDeviceKeys(auth0Jwt);
        }
        const keysStored = this.storeNewDeviceKeys(this.configFileHome, deviceKeys);
        if (!keysStored) {
            this.error(
                chalk.red(`Device keys created successfully but could not be stored. Tried to store them at '${this.configFileHome}' but it was not writable.`)
            );
        }
        this.log(chalk.green("Login successful! This device is now able to decrypt files you can access. Use 'ironhide -help' to see what else is possible."));
    }

    /**
     * Sync a new user within the SDK. Ask the user for a password (verifying that it's non empty) and use it to generate a new user as well as an
     * initial set of device keys. Write out the device key details to the config path for future SDK operations.
     */
    async generateNewUserAndDeviceKeys(auth0Jwt: string): Promise<void> {
        let password: string;
        let confirmPassword: string;
        let deviceName: string = this.defaultDeviceName;
        let deviceKeys: IronNode.DeviceDetails;
        try {
            password = await cli.prompt(chalk.magenta("Passphrase to Authorize New Devices"), {type: "hide"});
            confirmPassword = await cli.prompt(chalk.magenta("Confirm Passphrase"), {type: "hide"});
        } catch (e) {
            return this.exit(0); //User command-C'd so just bail out
        }
        if (password !== confirmPassword) {
            this.log(chalk.red("Provided passphrases do not match."));
            return this.generateNewUserAndDeviceKeys(auth0Jwt);
        }
        try {
            await IronNode.User.create(auth0Jwt, password);
        } catch (e) {
            return this.error(chalk.red("Creating a new user account failed, please try again."));
        }
        this.log(chalk.green("New account created successfully, now authorizing this device’s local encryption keys."));
        try {
            deviceName = await cli.prompt(chalk.magenta(`Name for this device`), {
                required: false,
                default: this.defaultDeviceName,
            });
        } catch (e) {
            return this.exit(0); //User command-C'd so just bail out
        }
        try {
            deviceKeys = await IronNode.User.generateDeviceKeys(auth0Jwt, password, {deviceName});
        } catch (e) {
            return this.error(chalk.red("Device key creation failed, please try again."));
        }

        if (!this.storeNewDeviceKeys(this.configFileHome, deviceKeys)) {
            this.error(
                chalk.red(`Device keys created successfully but could not be stored. Tried to store them at ${this.configFileHome} but it was not writable.`)
            );
        }
        this.log(chalk.green("Setup successful! Use 'ironhide -help' to see how to encrypt, decrypt, manage groups, and more."));
    }

    /**
     * Login the user by popping up an Auth0 login form and getting an Auth0 JWT. Then verify the user with the SDK to see if they exist. Then optionally
     * create the user and generating device keys which will be written out to a file for future command use.
     */
    async loginUser(): Promise<void> {
        Logger.info(messages.loginIntro);

        const cont = await cli.confirm(`\n${chalk.magenta("Continue?")} ${chalk.gray("[y/n]")}`);
        if (!cont) {
            return this.log("Ok, maybe next time! Bye!");
        }
        let auth0Token = "";
        let userExists: IronNode.ApiUserResponse | undefined;
        try {
            auth0Token = await authenticate();
            userExists = await IronNode.User.verify(auth0Token);
        } catch (e) {
            this.log(chalk.red(e.message));
            return this.error(chalk.red("\nAuthentication failed, please try again."));
        }
        if (userExists) {
            Logger.info(messages.existingUserIntro);
            await this.generateExistingUserDeviceKeys(auth0Token);
        } else {
            Logger.info(messages.newUserIntro);
            await this.generateNewUserAndDeviceKeys(auth0Token);
        }
        process.exit(0);
    }

    /**
     * Run the login command. Check to see if this device already has keys. If not kick off the login process.
     */
    async run() {
        this.parse(Login);
        //Check if the user already has keys that they want to override
        if (validateExistingKeys(this.configFileHome)) {
            return this.log(
                chalk.red(
                    `This device is already authorized and using keys at ${this.configFileHome}. Run 'ironhide logout' to delete these keys and deauthorize this device.`
                )
            );
        }
        await this.loginUser();
    }
}
