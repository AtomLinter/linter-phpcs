'use babel';

// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';
import * as helpers from 'atom-linter';
import path from 'path';
import minimatch from 'minimatch';
import escapeHtml from 'escape-html';

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
let disableExecuteTimeout;
let excludedSniffs;

const determineExecVersion = async (execPath) => {
  const versionString = await helpers.exec(execPath, ['--version']);
  const versionPattern = /^PHP_CodeSniffer version (\d+)\.(\d+)\.(\d+)/i;
  const version = versionString.match(versionPattern);
  const ver = {};
  if (version !== null) {
    ver.major = Number.parseInt(version[1], 10);
    ver.minor = Number.parseInt(version[2], 10);
    ver.patch = Number.parseInt(version[3], 10);
  } else {
    ver.major = 0;
    ver.minor = 0;
    ver.patch = 0;
  }
  execPathVersions.set(execPath, ver);
};

const getPHPCSVersion = async (execPath) => {
  if (!execPathVersions.has(execPath)) {
    await determineExecVersion(execPath);
  }
  return execPathVersions.get(execPath);
};

const fixPHPCSColumn = (textEditor, line, givenCol) => {
  const lineText = textEditor.lineTextForBufferRow(line);
  let column = givenCol;
  if (lineText.includes('\t')) {
    let screenCol = 0;
    for (let col = 0; col < lineText.length; col += 1) {
      const char = lineText[col];
      if (char === '\t') {
        screenCol += tabWidth - (screenCol % tabWidth);
      } else {
        screenCol += 1;
      }
      if (screenCol >= column) {
        column = col + 1;
        break;
      }
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

    this.subscriptions.add(
      atom.config.observe('linter-phpcs.executablePath', (value) => {
        executablePath = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.autoExecutableSearch', (value) => {
        autoExecutableSearch = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.disableWhenNoConfigFile', (value) => {
        disableWhenNoConfigFile = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) => {
        codeStandardOrConfigFile = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.autoConfigSearch', (value) => {
        autoConfigSearch = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.ignorePatterns', (value) => {
        ignorePatterns = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.displayErrorsOnly', (value) => {
        errorsOnly = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.warningSeverity', (value) => {
        warningSeverity = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.tabWidth', (value) => {
        tabWidth = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.showSource', (value) => {
        showSource = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.disableExecuteTimeout', (value) => {
        disableExecuteTimeout = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.excludedSniffs', (value) => {
        excludedSniffs = value;
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.otherLanguages.useCSSTools', (value) => {
        scopeAvailable('source.css', value);
      })
    );
    this.subscriptions.add(
      atom.config.observe('linter-phpcs.otherLanguages.useJSTools', (value) => {
        scopeAvailable('source.js', value);
      })
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
      lintOnFly: true,
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
            fileDir, ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs']
          );

          if (executable !== null) {
            executablePath = executable;
          }
        }

        // Get the version of the chosen PHPCS
        const version = await getPHPCSVersion(executablePath);

        // Check if file should be ignored
        if (version.major > 2) {
          // PHPCS v3 and up support this with STDIN files
          parameters.push(`--ignore=${ignorePatterns.join(',')}`);
        } else {
          // We must determine this ourself for lower versions
          const baseName = path.basename(filePath);
          if (ignorePatterns.some(pattern => minimatch(baseName, pattern))) {
            return [];
          }
        }

        // Check if a config file exists and handle it
        const confFile = await helpers.findAsync(fileDir,
          ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml']
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
        if (excludedSniffs.length > 0 && (
          version.major > 2 ||
          (version.major === 2 && version.minor > 6) ||
          (version.major === 2 && version.minor === 6 && version.patch > 1)
        )) {
          parameters.push(`--exclude=${excludedSniffs.join(',')}`);
        }

        // Determine the method of setting the file name
        let text;
        if (version.major >= 3 || (version.major === 2 && version.minor >= 6)) {
          // PHPCS 2.6 and above support sending the filename in a flag
          parameters.push(`--stdin-path="${filePath}"`);
          text = fileText;
        } else if ((version.major === 2 && version.minor < 6) || version.major < 2) {
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

        const execOptions = {
          cwd: projectPath,
          stdin: text,
          ignoreExitCode: true,
        };
        if (disableExecuteTimeout) {
          execOptions.timeout = Infinity;
        }
        if (confFile) {
          execOptions.cwd = path.dirname(confFile);
        }

        const result = await helpers.exec(executablePath, parameters, execOptions);

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
        if (version.major >= 3 || (version.major === 2 && version.minor >= 6)) {
          if (!data.files[`"${filePath}"`]) {
            return [];
          }
          messages = data.files[`"${filePath}"`].messages;
        } else if (version.major === 2 && version.minor < 6) {
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
          if (tabWidth > 1) {
            column = fixPHPCSColumn(textEditor, line, column);
          }
          column -= 1;

          const msg = {
            type: message.type,
            filePath,
            range: helpers.rangeFromLineNumber(textEditor, line, column),
          };

          if (showSource) {
            msg.html = `<span class="badge badge-flexible">${message.source || 'Unknown'}</span> `;
            msg.html += escapeHtml(message.message);
          } else {
            msg.text = message.message;
          }

          return msg;
        });
      },
    };
  },
};
