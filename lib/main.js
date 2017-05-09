'use babel';

import path from 'path';
import semver from 'semver';
import minimatch from 'minimatch';
import * as helpers from 'atom-linter';
// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';

// Local variables
const execPathVersions = new Map();
const grammarScopes = ['source.php'];

// Settings
let executablePath;
let autoExecutableSearch;
let disableWhenNoConfigFile;
let codeStandardOrConfigFile;
let autoConfigSearch;
let ignorePatterns;
let errorsOnly;
let warningSeverity;
let tabWidth;
let showSource;
let excludedSniffs;

const determineExecVersion = async (execPath) => {
  const versionString = await helpers.exec(execPath, ['--version'], { ignoreExitCode: true });
  const versionPattern = /^PHP_CodeSniffer version (\d+\.\d+\.\d+)/i;
  const match = versionString.match(versionPattern);
  if (match !== null) {
    execPathVersions.set(execPath, match[1]);
  }
};

const getPHPCSVersion = async (execPath) => {
  if (!execPathVersions.has(execPath)) {
    await determineExecVersion(execPath);
  }
  return execPathVersions.get(execPath);
};

const fixPHPCSColumn = (lineText, line, givenCol) => {
  // Almost all PHPCS sniffs default to replacing tabs with 4 spaces
  // This is horribly wrong, but that's how it works currently
  const tabLength = tabWidth > 0 ? tabWidth : 4;
  let column = givenCol;
  let screenCol = 0;
  for (let col = 0; col < lineText.length; col += 1) {
    const char = lineText[col];
    if (char === '\t') {
      screenCol += tabLength - (screenCol % tabLength);
    } else {
      screenCol += 1;
    }
    if (screenCol >= column) {
      column = col + 1;
      break;
    }
  }
  return column;
};

const scopeAvailable = (scope, available) => {
  if (available === false && grammarScopes.includes(scope)) {
    grammarScopes.splice(grammarScopes.indexOf(scope), 1);
  } else if (available === true && !grammarScopes.includes(scope)) {
    grammarScopes.push(scope);
  }
};

export default {
  activate() {
    require('atom-package-deps').install('linter-phpcs');

    this.subscriptions = new CompositeDisposable();

    // FIXME: Remove after a few versions
    if (atom.config.get('linter-phpcs.disableExecuteTimeout') !== undefined) {
      atom.config.unset('linter-phpcs.disableExecuteTimeout');
    }

    this.subscriptions.add(
      atom.config.observe('linter-phpcs.executablePath', (value) => {
        executablePath = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.autoExecutableSearch', (value) => {
        autoExecutableSearch = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.disableWhenNoConfigFile', (value) => {
        disableWhenNoConfigFile = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) => {
        codeStandardOrConfigFile = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.autoConfigSearch', (value) => {
        autoConfigSearch = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.ignorePatterns', (value) => {
        ignorePatterns = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.displayErrorsOnly', (value) => {
        errorsOnly = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.warningSeverity', (value) => {
        warningSeverity = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.tabWidth', (value) => {
        tabWidth = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.showSource', (value) => {
        showSource = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.excludedSniffs', (value) => {
        excludedSniffs = value;
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.otherLanguages.useCSSTools', (value) => {
        scopeAvailable('source.css', value);
      }),
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.otherLanguages.useJSTools', (value) => {
        scopeAvailable('source.js', value);
      }),
    );
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  provideLinter() {
    return {
      name: 'PHPCS',
      grammarScopes,
      scope: 'file',
      lintsOnChange: true,
      lint: async (textEditor) => {
        const filePath = textEditor.getPath();
        const fileText = textEditor.getText();
        const fileDir = path.dirname(filePath);

        if (fileText === '') {
          // Empty file, empty results
          return [];
        }

        const parameters = ['--report=json'];

        // Check if a local PHPCS executable is available
        if (autoExecutableSearch) {
          const executable = await helpers.findCachedAsync(
            fileDir, ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs'],
          );

          if (executable !== null) {
            executablePath = executable;
          }
        }

        // Get the version of the chosen PHPCS
        const version = await getPHPCSVersion(executablePath);

        // -q (quiet) option is available since phpcs 2.6.2
        if (semver.gte(version, '2.6.2')) {
          parameters.push('-q');
        }

        // --encoding is available since 1.3.0 (RC1, but we ignore that for simplicity)
        // Since PHPCS no longer publishes versions below v1.4.2 the conditional
        // adding of this parameter has been removed.
        parameters.push('--encoding=UTF-8');
        // The actual file encoding is irrelevant, as PHPCS will always get
        // UTF-8 as its input see analysis here:
        // https://github.com/AtomLinter/linter-phpcs/issues/235

        // Check if file should be ignored
        if (semver.gte(version, '3.0.0')) {
          // PHPCS v3 and up support this with STDIN files
          parameters.push(`--ignore=${ignorePatterns.join(',')}`);
        } else if (ignorePatterns.some(pattern => minimatch(filePath, pattern))) {
          // We must determine this ourself for lower versions
          return [];
        }

        // Check if a config file exists and handle it
        const confFile = await helpers.findAsync(fileDir,
          ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml'],
        );
        if (disableWhenNoConfigFile && !confFile) {
          return [];
        }

        const standard = autoConfigSearch && confFile ? confFile : codeStandardOrConfigFile;
        if (standard) {
          parameters.push(`--standard=${standard}`);
        }
        parameters.push(`--warning-severity=${errorsOnly ? 0 : warningSeverity}`);
        if (tabWidth > 1) {
          parameters.push(`--tab-width=${tabWidth}`);
        }
        if (showSource) {
          parameters.push('-s');
        }

        // Ignore any requested Sniffs
        if (excludedSniffs.length > 0 && semver.gte(version, '2.6.2')) {
          parameters.push(`--exclude=${excludedSniffs.join(',')}`);
        }

        // Determine the method of setting the file name
        let text;
        if (semver.gte(version, '2.6.0')) {
          // PHPCS 2.6 and above support sending the filename in a flag
          parameters.push(`--stdin-path=${filePath}`);
          text = fileText;
        } else if (semver.satisfies(version, '>=2.0.0 <2.6.0')) {
          // PHPCS 2.x.x before 2.6.0 supports putting the name in the start of the stream
          const eolChar = textEditor.getBuffer().lineEndingForRow(0);
          text = `phpcs_input_file: ${filePath}${eolChar}${fileText}`;
        } else {
          // PHPCS v1 supports stdin, but ignores all filenames
          text = fileText;
        }

        // Finish off the parameter list
        parameters.push('-');

        // Run PHPCS from the project root, or if not in a project the file directory
        let projectPath = atom.project.relativizePath(filePath)[0];
        if (projectPath === null) {
          projectPath = fileDir;
        }

        const forcedKillTime = 1000 * 60 * 5; // ms * s * m: 5 minutes
        const execOptions = {
          cwd: projectPath,
          stdin: text,
          ignoreExitCode: true,
          timeout: forcedKillTime,
          uniqueKey: `linter-php:${filePath}`,
        };
        if (confFile) {
          execOptions.cwd = path.dirname(confFile);
        }

        const result = await helpers.exec(executablePath, parameters, execOptions);

        if (result === null) {
          // Our specific spawn was terminated by a newer call, tell Linter not
          // to update messages
          return null;
        }

        // Check if the file contents have changed since the lint was triggered
        if (textEditor.getText() !== fileText) {
          // Contents have changed, tell Linter not to update results
          return null;
        }

        let data;
        try {
          data = JSON.parse(result.toString().trim());
        } catch (error) {
          atom.notifications.addError('Error parsing PHPCS response', {
            detail: 'Something went wrong attempting to parse the PHPCS output.',
            dismissable: true,
          });
          // eslint-disable-next-line no-console
          console.log('PHPCS Response', result);
          return [];
        }

        let messages;
        if (semver.gte(version, '2.0.0')) {
          if (!data.files[filePath]) {
            return [];
          }
          messages = data.files[filePath].messages;
        } else {
          // PHPCS v1 can't associate a filename with STDIN input
          if (!data.files.STDIN) {
            return [];
          }
          messages = data.files.STDIN.messages;
        }

        return messages.map((message) => {
          // fix column in line with tabs
          let { line, column } = message;
          line -= 1;
          const lineText = textEditor.getBuffer().lineForRow(line);

          if (lineText.includes('\t')) {
            column = fixPHPCSColumn(lineText, line, column);
          }
          column -= 1;

          let position;
          try {
            position = helpers.generateRange(textEditor, line, column);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error(
              'linter-phpcs:: Invalid point encountered in the attached message',
              {
                message,
                source: {
                  lineLength: lineText.length,
                  lineText,
                },
              },
            );
            throw Error('Invalid point encountered! See console for details.');
          }

          let severity;

          if (message.type) {
            severity = message.type.toLowerCase();
          }

          // severity can only be one of these options
          if (!['error', 'warning', 'info'].includes(severity)) {
            severity = 'warning';
          }

          const msg = {
            severity,
            location: {
              file: filePath,
              position,
            },
          };

          if (showSource) {
            msg.excerpt = `[${message.source || 'Unknown'}] ${message.message}`;
          } else {
            msg.excerpt = message.message;
          }

          return msg;
        });
      },
    };
  },
};
