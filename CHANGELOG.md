# Changelog

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