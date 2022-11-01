{
  description = "Ironhide rust.";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, rust-overlay, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };
        rusttoolchain =
          pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml;
        cargoToml = (builtins.fromTOML (builtins.readFile ./Cargo.toml));

      in rec {
        # `nix build`
        packages = {
          ironhide-rs = pkgs.rustPlatform.buildRustPackage {
            pname = cargoToml.package.name;
            version = cargoToml.package.version;
            src = ./.;
            cargoLock.lockFile = ./Cargo.lock;
            nativeBuildInputs = with pkgs;
              [ rusttoolchain ]
              ++ pkgs.lib.optionals pkgs.stdenv.isDarwin
                 [ pkgs.darwin.apple_sdk.frameworks.Security ];
          };
        };
        defaultPackage = packages.ironhide-rs;

        # nix develop
        devShell = pkgs.mkShell {
          buildInputs = with pkgs;
            [ rusttoolchain]
            ++ pkgs.lib.optionals pkgs.stdenv.isDarwin
               [ pkgs.darwin.apple_sdk.frameworks.Security ];
        };

      });
}
