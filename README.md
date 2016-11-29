linter-phpcs
=========================
[![Build Status](https://travis-ci.org/AtomLinter/linter-phpcs.svg)](https://travis-ci.org/AtomLinter/linter-phpcs)
[![Dependency Status](https://david-dm.org/AtomLinter/linter-phpcs.svg)](https://david-dm.org/AtomLinter/linter-phpcs)
[![apm](https://img.shields.io/apm/v/linter-phpcs.svg)](https://atom.io/packages/linter-phpcs)
[![apm](https://img.shields.io/apm/dm/linter-phpcs.svg)](https://atom.io/packages/linter-phpcs)

This linter plugin for [Linter](https://github.com/steelbrain/linter) provides
an interface to [phpcs](http://pear.php.net/package/PHP_CodeSniffer/). It will
be used with files that have the "PHP" and "HTML" syntax.

### phpcs Installation
Before using this plugin, you must ensure that `phpcs` is installed on your system. To install `phpcs`, do the following:

0. Install [php](http://php.net).
0. Install [pear](http://pear.php.net).
0. Install `phpcs` by typing the following in a terminal:
```ShellSession
pear install PHP_CodeSniffer
```

Now you can proceed to install the linter-phpcs plugin.

### Package Installation
You can then install this package either from within Atom or by running the
following command:
```ShellSession
$ apm install linter-phpcs
```
Note: If you do not already have the `linter` package installed it will be installed
for you to provide an interface for this package.

### Instructions for windows

Windows doesn't know how to execute `.phar` files by default, therefore we have to create a `.bat` wrapper for it. To get `phpcs.phar` working with
`linter-phpcs` you should create a `phpcs.bat` in the same folder and write these at it's contents, once you have created it, you should point
`linter-phpcs` to that bat file instead of phar one.

```
@ECHO OFF
C:\path\to\php.exe "%~dp0phpcs.phar" %*
```
