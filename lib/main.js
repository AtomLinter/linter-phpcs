'use babel';

// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';
import * as helpers from 'atom-linter';
import path from 'path';
import minimatch from 'minimatch';
import escapeHtml from 'escape-html';

// Local variables
const execPathVersions = new Map();

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
  },

  deactivate() {
    this.subscriptions.dispose();
  },

  provideLinter() {
    return {
      name: 'PHPCS',
      grammarScopes: ['source.php'],
      scope: 'file',
      lintOnFly: true,
      lint: async (textEditor) => {
        const filePath = textEditor.getPath();
        const fileText = textEditor.getText();
        const fileDir = path.dirname(filePath);

        // Check if a config file exists and handle it
        const confFile = await helpers.findAsync(
          fileDir, ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml']
        );
        if (disableWhenNoConfigFile && !confFile) {
          return [];
        }

        // Check if a local PHPCS executable is available
        if (autoExecutableSearch) {
          const executable = await helpers.findCachedAsync(
            fileDir, ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs']
          );

          if (executable !== null) {
            executablePath = executable;
          }
        }

        const parameters = ['--report=json'];
        // Get the version of the chosen PHPCS
        const version = await getPHPCSVersion(executablePath);
        const legacy = version.major < 2;

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

        const standard = autoConfigSearch && confFile ? confFile : codeStandardOrConfigFile;
        if (standard) {
          parameters.push(`--standard=${standard}`);
        }
        parameters.push(`--warning-severity=${errorsOnly ? 0 : warningSeverity}`);
        if (tabWidth) {
          parameters.push(`--tab-width=${tabWidth}`);
        }
        if (showSource) {
          parameters.push('-s');
        }

        const eolChar = textEditor.getBuffer().lineEndingForRow(0);
        const execPrefix = !legacy ? `phpcs_input_file: ${filePath}${eolChar}` : '';
        const text = execPrefix + fileText;

        const execOptions = {
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
        if (legacy) {
          if (!data.files.STDIN) {
            return [];
          }
          messages = data.files.STDIN.messages;
        } else {
          if (!data.files[filePath]) {
            return [];
          }
          messages = data.files[filePath].messages;
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
