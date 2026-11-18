# Release Checklist

* update the version in `Cargo.toml` according to semver before tagging for release
* push a tag matching the version in `Cargo.toml`, with no `v` prefix
  * a release build will be run against it which will upload artifacts to a github release
  * the github release starts as a draft and is un-drafted once every artifact is attached
  * the version in `Cargo.toml` will be uploaded to crates.io

## Rehearsing the crates.io publish

Publishing uses crates.io [Trusted Publishing](https://crates.io/docs/trusted-publishing), so there's no API token to rotate. The trust relationship is registered on crates.io against this repo and `release.yaml`, and it has to be in place before a release can publish.

To exercise that config without cutting a release, run the `release` workflow from the Actions tab and leave `dry_run` on. It skips the binary jobs and runs `cargo publish --dry-run`. Do it after bumping the version, so the rehearsal isn't checking a version that's already on crates.io.

Pushing a tag always publishes for real. The `inputs` context is empty outside a manual run, so `dry_run` has no effect on the tag path regardless of its default.
