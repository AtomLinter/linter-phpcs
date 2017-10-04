'use babel';

// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';

let semver;
let minimatch;
let helpers;
let path;
let fs;

function loadDeps() {
  if (!semver) {
    semver = require('semver');
  }
  if (!minimatch) {
    minimatch = require('minimatch');
  }
  if (!helpers) {
    helpers = require('atom-linter');
  }
  if (!path) {
    path = require('path');
  }
  if (!fs) {
    fs = require('fs');
  }
}

// Local variables
const execPathVersions = new Map();
const grammarScopes = [
  'source.php',
  'text.html.php', // Workaround for Nuclide bug, see #272
];
let tabWidthDefault;

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

const fixPHPCSColumn = (lineText, givenCol, tabWidth, currentStandards, version) => {
  const defaultTabs = tabWidth === tabWidthDefault;
  let tabLength = tabWidth;
  // NOTE: Between v2.x.y and v3.0.0 the tabWidth can't override standards
  if (semver.satisfies(version, '>=2.0.0 <3.0.1') || defaultTabs) {
    const forcedStandards = new Map();
    forcedStandards.set('PSR2', 4);
    forcedStandards.set('WordPress', 4);
    forcedStandards.set('WordPress-Core', 4);
    forcedStandards.set('WordPress-Docs', 4);
    forcedStandards.set('WordPress-Extra', 4);
    forcedStandards.set('WordPress-VIP', 4);
    forcedStandards.forEach((forcedTabs, standard) => {
      if (currentStandards.includes(standard)) {
        // These standards override the default tab-width
        tabLength = forcedTabs;
      }
    });
  }
  if (semver.satisfies(version, '<2.0.0') && defaultTabs) {
    // PHPCS lower than v2 ignores standards forced tabLength
    tabLength = 1;
  }
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

const getFileRealPath = async filePath =>
  new Promise((resolve, reject) => {
    fs.realpath(filePath, (err, resolvedPath) => {
      if (err) {
        reject(err);
      }
      resolve(resolvedPath);
    });
  });

export default {
  activate() {
    this.idleCallbacks = new Set();
    let depsCallbackID;
    const installLinterPhpcsDeps = () => {
      this.idleCallbacks.delete(depsCallbackID);
      if (!atom.inSpecMode()) {
        require('atom-package-deps').install('linter-phpcs');
      }
      loadDeps();
    };
    depsCallbackID = window.requestIdleCallback(installLinterPhpcsDeps);
    this.idleCallbacks.add(depsCallbackID);

    this.subscriptions = new CompositeDisposable();

    // FIXME: Remove after a few versions
    if (atom.config.get('linter-phpcs.disableExecuteTimeout') !== undefined) {
      atom.config.unset('linter-phpcs.disableExecuteTimeout');
    }

    this.subscriptions.add(
      atom.config.observe('linter-phpcs.executablePath', (value) => {
        this.executablePath = value;
      }),
      atom.config.observe('linter-phpcs.autoExecutableSearch', (value) => {
        this.autoExecutableSearch = value;
      }),
      atom.config.observe('linter-phpcs.disableWhenNoConfigFile', (value) => {
        this.disableWhenNoConfigFile = value;
      }),
      atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) => {
        this.codeStandardOrConfigFile = value;
      }),
      atom.config.observe('linter-phpcs.autoConfigSearch', (value) => {
        this.autoConfigSearch = value;
      }),
      atom.config.observe('linter-phpcs.ignorePatterns', (value) => {
        this.ignorePatterns = value;
      }),
      atom.config.observe('linter-phpcs.displayErrorsOnly', (value) => {
        this.errorsOnly = value;
      }),
      atom.config.observe('linter-phpcs.warningSeverity', (value) => {
        this.warningSeverity = value;
      }),
      atom.config.observe('linter-phpcs.tabWidth', (value) => {
        this.tabWidth = value;
      }),
      atom.config.observe('linter-phpcs.showSource', (value) => {
        this.showSource = value;
      }),
      atom.config.observe('linter-phpcs.excludedSniffs', (value) => {
        this.excludedSniffs = value;
      }),
      atom.config.observe('linter-phpcs.otherLanguages.useCSSTools', (value) => {
        scopeAvailable('source.css', value);
      }),
      atom.config.observe('linter-phpcs.otherLanguages.useJSTools', (value) => {
        scopeAvailable('source.js', value);
      }),
    );

    tabWidthDefault = atom.config.getSchema('linter-phpcs.tabWidth').default;
  },

  deactivate() {
    this.idleCallbacks.forEach(callbackID => window.cancelIdleCallback(callbackID));
    this.idleCallbacks.clear();
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

        if (fileText === '') {
          // Empty file, empty results
          return [];
        }

        loadDeps();
        const fileDir = path.dirname(filePath);

        let executable = this.executablePath;
        const parameters = ['--report=json'];

        // Check if a local PHPCS executable is available
        if (this.autoExecutableSearch) {
          const phpcsNames = ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs'];
          const projExecutable = await helpers.findCachedAsync(fileDir, phpcsNames);

          if (projExecutable !== null) {
            executable = projExecutable;
          }
        }

        // Get the version of the chosen PHPCS
        const version = await getPHPCSVersion(executable);

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
          parameters.push(`--ignore=${this.ignorePatterns.join(',')}`);
        } else if (this.ignorePatterns.some(pattern => minimatch(filePath, pattern))) {
          // We must determine this ourself for lower versions
          return [];
        }

        // Check if a config file exists and handle it
        const confFileNames = [
          '.phpcs.xml', '.phpcs.xml.dist', 'phpcs.xml', 'phpcs.xml.dist',
          'phpcs.ruleset.xml', 'ruleset.xml',
        ];
        const confFile = await helpers.findAsync(fileDir, confFileNames);
        if (this.disableWhenNoConfigFile && !confFile) {
          return [];
        }

        const standard = this.autoConfigSearch && confFile ?
          confFile : this.codeStandardOrConfigFile;
        if (standard) {
          parameters.push(`--standard=${standard}`);
        }
        parameters.push(`--warning-severity=${this.errorsOnly ? 0 : this.warningSeverity}`);
        if (this.tabWidth !== tabWidthDefault) {
          parameters.push(`--tab-width=${this.tabWidth}`);
        }
        if (this.showSource) {
          parameters.push('-s');
        }

        // Ignore any requested Sniffs
        if (this.excludedSniffs.length > 0 && semver.gte(version, '2.6.2')) {
          parameters.push(`--exclude=${this.excludedSniffs.join(',')}`);
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

        const result = await helpers.exec(executable, parameters, execOptions);

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
          const fileRealPath = await getFileRealPath(filePath);
          if (!data.files[fileRealPath]) {
            return [];
          }
          ({ messages } = data.files[fileRealPath]);
        } else {
          // PHPCS v1 can't associate a filename with STDIN input
          if (!data.files.STDIN) {
            return [];
          }
          ({ messages } = data.files.STDIN);
        }

        return messages.map((message) => {
          // fix column in line with tabs
          let { line, column } = message;
          line -= 1;
          const lineText = textEditor.getBuffer().lineForRow(line);

          if (lineText.includes('\t')) {
            column = fixPHPCSColumn(lineText, column, this.tabWidth, standard, version);
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

          if (this.showSource) {
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
