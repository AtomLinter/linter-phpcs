#!/bin/sh

if [ "$LPHP_OS" = "linux" ]; then
  URL="https://atom.io/download/deb"
  FILE="atom-amd64.deb"
  ATOM_DIR=/usr/bin
elif [ "$LPHP_OS" = "osx" ]; then
  URL="https://atom.io/download/mac"
  FILE="atom.zip"
  ATOM_DIR=atom/Atom.app/Contents/Resources/app
fi

echo "Downloading latest Atom release..."
curl -s -L "$URL" \
  -H 'Accept: application/octet-stream' \
  -o "$FILE"

if [ "$LPHP_OS" = "linux" ]; then
  sudo apt-get update
  sudo apt-get install gvfs-bin
  sudo apt-get install xvfb
  sudo apt-get install libgtk2.0-0
  sudo dpkg --install atom-amd64.deb || true
  sudo apt-get -f install -y
  APM=apm
elif [ "$LPHP_OS" = "osx" ]; then
  echo "Updating PHP to 5.6"
  curl -s http://php-osx.liip.ch/install.sh | bash -s 5.6
  export PATH="/usr/local/php5/bin:$PATH"
  mkdir atom
  unzip -q "$FILE" -d atom
  export PATH="$PWD/$ATOM_DIR/apm/bin:$PATH"
  APM="$ATOM_DIR/apm/node_modules/.bin/apm"
fi

echo "Installing Composer"
php -r "readfile('https://getcomposer.org/installer');" | sudo php -- --filename=composer
sudo php composer config -g github-oauth.github.com cc4a091c096e7d3cfe053c3f669fb840be60ab98
export PATH="$PATH:$HOME/.composer/vendor/bin"

echo "Installing PHP_CodeSniffer"
sudo php composer global require "squizlabs/php_codesniffer"

echo "Using Atom version:"
if [ "$LPHP_OS" = "linux" ]; then
  atom -v
elif [ "$LPHP_OS" = "osx" ]; then
  ATOM_PATH=./atom $ATOM_DIR/atom.sh -v
fi

echo "Using PHP version:"
php --version

echo "Using PHP_CodeSniffer version:"
phpcs --version

echo "Downloading package dependencies..."
$APM clean
$APM install

TEST_PACKAGES="${APM_TEST_PACKAGES:=none}"

if [ "$TEST_PACKAGES" != "none" ]; then
  echo "Installing atom package dependencies..."
  for pack in $TEST_PACKAGES ; do
    $APM install $pack
  done
fi

if [ -f ./node_modules/.bin/coffeelint ]; then
  if [ -d ./lib ]; then
    echo "Linting package..."
    ./node_modules/.bin/coffeelint lib
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
  if [ -d ./spec ]; then
    echo "Linting package specs..."
    ./node_modules/.bin/coffeelint spec
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
fi

if [ -f ./node_modules/.bin/eslint ]; then
  if [ -d ./lib ]; then
    echo "Linting package..."
    ./node_modules/.bin/eslint lib
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
  if [ -d ./spec ]; then
    echo "Linting package specs..."
    ./node_modules/.bin/eslint spec
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
fi

if [ -f ./node_modules/.bin/standard ]; then
  if [ -d ./lib ]; then
    echo "Linting package..."
    ./node_modules/.bin/standard lib/**/*.js
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
  if [ -d ./spec ]; then
    echo "Linting package specs..."
    ./node_modules/.bin/standard spec/**/*.js
    rc=$?; if [ $rc != 0 ]; then exit $rc; fi
  fi
fi

echo "Running specs..."
if [ "$LPHP_OS" = "linux" ]; then
  $APM test
elif [ "$LPHP_OS" = "osx" ]; then
  ATOM_PATH=./atom $APM test --path $ATOM_DIR/atom.sh
fi

exit
