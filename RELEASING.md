# Release Checklist

* update the version in `Cargo.toml` according to semver before tagging for release
* push a tag matching the version in `Cargo.toml`.
  * a release build will be run against it which will upload artifacts to a github release
  * the version in `Cargo.toml` will be uploaded to crates.io
