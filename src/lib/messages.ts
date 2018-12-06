import chalk from "chalk";

/**
 * Text that gets displayed when user runs ironhide login
 */
export const loginIntro = `\nWelcome to the IronHide CLI tool!

This tool uses public key elliptic curve cryptography to encrypt sensitive data. It uses a \
flavor of proxy re-encryption called transform cryptography to delegate access so that multiple \
devices (laptops, phones, tablets) with their own private keys are able to decrypt files. It uses \
that same technique to allow encryption to a group and to delegate decryption rights to members of \
the group. There’s a central service for managing public keys and delegation, but that service never \
sees your private keys, your data, or anything that would allow the service to decrypt your data or \
authorize others to do so. More details can be found on IronCore’s website, https://docs.ironcorelabs.com.

${chalk.green("FIRST TIME USERS")}
The first step is to authenticate with one of your existing Internet accounts so we can tie an identity \
to your public key and so that others can encrypt to you using your email address. When you continue, \
we'll open a browser window where you’ll login. After you login, we'll locally generate a key pair for \
your user and another pair for the current device and we’ll upload the public keys to the free IronCore \
service. Once you've logged in, come back here to finish setup.

${chalk.green("EXISTING USERS")}
If you already have an account, but this is not an authorized machine, you’ll need to login as a first step. \
We’ll launch a browser for you to login after you select continue. Once you’ve logged in, we’ll locally generate \
a key pair for this device and then you’ll take a final step to authorize this device.`;

/**
 * Text that gets displayed after browser auth workflow completes and we have a JWT, but the user doesn't exist.
 */
export const newUserIntro = `\nYou now have a master key pair whose only function is to authorize new devices. Please enter \
a passphrase to protect the private key. This passphrase will not leave this machine, but will be used to encrypt your \
private key before sending it to the free IronCore service to hold in escrow. In the future, if you want to authorize a new \
device, you’ll need to first authenticate to get the encrypted private key, and then you’ll need your passphrase to unlock it. \
You’ll only ever need this passphrase when authorizing new devices.\n`;

/**
 * Text that gets displayed after browser auth workflow completes and we have a JWT, and the user already exists.
 */
export const existingUserIntro = `\nWelcome back! This device does not have a local key pair for your account. To authorize this \
device and allow it to decrypt files, you need to enter the passphrase you used when creating your account.\n`;
