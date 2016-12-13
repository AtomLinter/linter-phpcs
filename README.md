# linter-phpcs

[![Build Status][travisci-badge]][travisci]
[![Dependency Status][dabviddm-badge]][daviddm]
[![apm](https://img.shields.io/apm/v/linter-phpcs.svg)][linter-phpcs]
[![apm](https://img.shields.io/apm/dm/linter-phpcs.svg)][linter-phpcs]

## Description

This is a provider for [Linter][] that provides an interface to
[PHP_CodeSniffer][PHPCS] (PHPCS). It supports files that have the "PHP" and
"HTML" syntax.

## Installation

### PHPCS Installation

Before using this plugin, you must ensure that `phpcs` is installed and
available on your `$PATH`. To install `phpcs`, the following:

1.  Install [PHP](http://php.net).
2.  Install [Composer](https://getcomposer.org/).
3.  Install `phpcs` by typing the following in a terminal:

    ```ShellSession
    composer global require "squizlabs/php_codesniffer=*"
    ```

Full installation steps, including alternate installation methods, can be found
on the PHPCS site [here][phpcs-install].

### Package Installation

You can then install this package either from within Atom or by running the
following command:

```ShellSession
$ apm install linter-phpcs
```

Note: If you do not already have the Linter package installed it will be
installed for you to provide an interface for this package. If you are using an
alternative interface simply disable the Linter package.

[travisci]: https://travis-ci.org/AtomLinter/linter-phpcs
[travisci-badge]: https://travis-ci.org/AtomLinter/linter-phpcs.svg
[daviddm]: https://david-dm.org/AtomLinter/linter-phpcs
[dabviddm-badge]: https://david-dm.org/AtomLinter/linter-phpcs.svg
[linter-phpcs]: https://atom.io/packages/linter-phpcs
[Linter]: https://github.com/steelbrain/linter
[PHPCS]: https://github.com/squizlabs/PHP_CodeSniffer
[phpcs-install]: https://github.com/squizlabs/PHP_CodeSniffer#installation
