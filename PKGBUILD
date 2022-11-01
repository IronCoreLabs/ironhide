# Maintainer: IronCore Labs <info@ironcorelabs.com>
pkgname=ironhide
pkgver=1.0.0
pkgrel=1
pkgdesc="Tool to easily encrypt and decrypt files to users and groups. Similar to GPG, but usable at scale. "
arch=('x86_64')
url="https://github.com/IronCoreLabs/ironhide"
license=('AGPL_3')
depends=()
makedepends=('cargo' 'jq')
source=("$pkgname-$pkgver.tar.gz::https://github.com/IronCoreLabs/$pkgname/archive/$pkgver.tar.gz")
sha512sums=('9321532e4bf633ecd200d98873b6773230d046d7bd075f223f09a68531cef4e4138f01c6b41e0f8697805963ae7e0d44d542c6d94025d9a06fbbef3562c17734') # todo

build() {
  cd "$pkgname-$pkgver" || exit

  cargo build --release --locked --message-format=json-render-diagnostics |
  jq -r 'select(.out_dir) | select(.package_id | startswith("ironhide ")) | .out_dir' > out_dir
}

check() {
  cd "$pkgname-$pkgver" || exit

  cargo test --release --locked
}

package() {
  cd "$pkgname-$pkgver" || exit
  # local OUT_DIR=$(<out_dir)

  install -Dm755 "target/release/ironhide" "$pkgdir/usr/bin/ironhide"

  # install -Dm644 "complete/_ironhide" "$pkgdir/usr/share/zsh/site-functions/_ironhide"
  # install -Dm644 "$OUT_DIR"/ironhide.bash "$pkgdir/usr/share/bash-completion/completions/ironhide"
  # install -Dm644 "$OUT_DIR"/ironhide.fish "$pkgdir/usr/share/fish/vendor_completions.d/ironhide.fish"
  # install -Dm644 "$OUT_DIR"/ironhide.1 "$pkgdir/usr/share/man/man1/ironhide.1"

  install -Dm644 "README.md" "$pkgdir/usr/share/doc/${pkgname}/README.md"
  install -Dm644 "LICENSE" "$pkgdir/usr/share/licenses/${pkgname}/LICENSE"
}
