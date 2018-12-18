Release Checklist
=================

* Decide on the new version number and update it in the `package.json` file.
* Write the `CHANGELOG.md` entry for the release.
* Commit `package.json` and `CHANGELOG.md` files.
* Run `npm publish --dry-run` which will do a dry run of the release and runs the unit tests. Make sure everything looks good.
* Run `npm publish`.
* Add a tag for the release, `git tag {version}` and `git push origin {version}`.