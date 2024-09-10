# Changelog

## 1.0.9

+ Update to the nix flake

## 1.0.8

+ Update to the nix flake

## 1.0.7

+ Added arm64 macos to prebuilt release binaries
+ Dependency updates

## 1.0.6

+ Added arm64 linux to prebuilt release binaries

## 1.0.5

+ Fix a bug where decryption outputs the file to the current directory
+ Fix a bug where an empty file is created when decryption fails
+ Return a non-zero status when one or more file operations fail

## 1.0.4

+ Improve the display of datetimes

## 1.0.3

+ Create the `~/.iron` directory if it doesn't exist.

## 1.0.2

+ Resolve issue running binary when it is `cargo install`d. Previously returned an error 'Must be run on a system that has an OS time library.' when the group info and user device-list commands were invoked.

## 1.0.1

+ Changed processing of the `-out` parameter so it could precede the list of files to be processed (for file encrypt and decrypt operations).

## 1.0.0

+ **Breaking Change**: Moved from a Node application to a Rust binary. Initial package manager support exists for `cargo install`, homebrew, arch linux, nix, chocolatey, and ubuntu. Instructions to compile from source are in the README if your platform doesn't have package manager support or a prebuilt binary.
+ adds initial keyring support, see the README for details
+ command structure has changed from `ironhide logical-group:command` to `ironhide logical-group command`. See `ironhide -h` for details.

## 0.8.0

+ **Breaking Change**: Removed Node 10 and 12 support.
+ Added Node 14 and 16 support.
+ Updated dependencies

## 0.7.1

+ Updated dependencies

## 0.7.0

+ **Breaking Change**: Removed Node 8 support
+ Added support for running on Windows
+ Added new command (`ironhide user:changepassphrase`) to allow users to change their current private key escrow passphrase
+ Updated dependencies

## 0.6.2

+ Upgrade to latest IronNode release.

## 0.6.1

+ Exit with non-zero exit code when encrypting/decrypting multiple files and not all of them succeed
+ Exit with non-zero exit code when adding/removing admins or members from a group and some fail

## 0.6.0

+ Added support for Node 12, removed support for Node 9 and 11.
+ Update all dependencies.

## 0.5.5

+ Fixed a bug where the output file displayed on encrypt/decrypt operations was wrong if the `-o` option was used.
+ Updated all dependencies to their latest version.

## 0.5.3

+ Added created and updated times to output of `file:info`, `group:list`, and `group:info` commands.

## 0.5.2

+ Removed unhelpful columns from document info table
+ Better error handling output when commands fail

## 0.5.1

+ Initial public version
