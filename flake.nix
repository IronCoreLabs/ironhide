{
  description = "Ironhide rust.";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-unstable";
    rust-overlay.url = "github:oxalica/rust-overlay";
    flake-utils.url = "github:numtide/flake-utils";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    rust-overlay,
    flake-utils,
    fenix,
    ...
  }:
    flake-utils.lib.eachDefaultSystem (system: let
      overlays = [(import rust-overlay)];
      pkgs = import nixpkgs {inherit system overlays;};
      toolchainToml = builtins.fromTOML (builtins.readFile ./rust-toolchain.toml);
      cargoToml = builtins.fromTOML (builtins.readFile ./Cargo.toml);
    in rec {
      # `nix build`
      packages = {
        # ironhide = (pkgs.makeRustPlatform (fenix.packages.${system}.fromManifest toolchainToml)).buildRustPackage {
        ironhide =
          (pkgs.makeRustPlatform (fenix.packages.${system}.fromToolchainName {
            name = toolchainToml.toolchain.channel;
            sha256 = "sha256-3jVIIf5XPnUU1CRaTyAiO0XHVbJl12MSx3eucTXCjtE=";
          }))
          .buildRustPackage {
            # ironhide = pkgs.rustPlatform.buildRustPackage {
            pname = cargoToml.package.name;
            inherit (cargoToml.package) version name;
            src = ./.;
            cargoLock.lockFile = ./Cargo.lock;
            nativeBuildInputs = with pkgs;
              [rusttoolchain]
              ++ lib.optionals stdenv.isDarwin
              (with darwin.apple_sdk.frameworks; [Security SystemConfiguration]);
          };
        default = packages.ironhide;
      };

      # nix develop
      devShells.default = pkgs.mkShell {
        buildInputs = with pkgs;
          [(pkgs.rust-bin.fromRustupToolchainFile ./rust-toolchain.toml)]
          ++ lib.optionals stdenv.isDarwin
          (with darwin.apple_sdk.frameworks; [Security SystemConfiguration]);
      };
    });
}
