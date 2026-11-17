{
  description = "Ironhide rust.";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    rust-overlay,
    flake-utils,
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [(import rust-overlay)];
      pkgs = import nixpkgs {inherit system overlays;};
      rusttoolchain =
        pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
      cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
    in rec {
      # `nix build`
      packages = {
        ironhide =
          (pkgs.makeRustPlatform {
            cargo = rusttoolchain;
            rustc = rusttoolchain;
          })
          .buildRustPackage {
            # ironhide = pkgs.rustPlatform.buildRustPackage {
            pname = cargoToml.package.name;
            inherit (cargoToml.package) version;
            src = ./.;
            cargoLock.lockFile = ./Cargo.lock;
            nativeBuildInputs = with pkgs;
              [rusttoolchain pkg-config];
            # buildRustPackage's cargoUseSystemLibs hook sets AWS_LC_SYS_USE_SYSTEM=1,
            # so aws-lc-sys looks for aws-lc through pkg-config instead of vendoring it.
            buildInputs = with pkgs;
              [aws-lc];
          };
        default = packages.ironhide;
      };

      # nix develop
      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs;
          [rusttoolchain];
      };
    });
}
