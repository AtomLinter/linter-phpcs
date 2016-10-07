'use babel';

// eslint-disable-next-line import/extensions, import/no-extraneous-dependencies
import { CompositeDisposable } from 'atom';
import * as helpers from 'atom-linter';
import path from 'path';
import minimatch from 'minimatch';
import escapeHtml from 'escape-html';

// Local variables
const legacyExec = new Map();

// Settings
let executablePath;
let autoExecutableSearch;
let disableWhenNoConfigFile;
let codeStandardOrConfigFile;
let autoConfigSearch;
let ignore;
let errorsOnly;
let warningSeverity;
let tabWidth;
let showSource;
let disableExecuteTimeout;

const isLegacyExec = async (execPath) => {
  // Determine if legacy mode needs to be set up (in case phpcs version = 1)
  if (legacyExec.has(execPath)) {
    return legacyExec.get(execPath);
  }
  const versionString = await helpers.exec(execPath, ['--version']);
  const versionPattern = /^PHP_CodeSniffer version ([0-9]+)/i;
  const version = versionString.match(versionPattern);
  if (version && version[1] === '1') {
    legacyExec.set(execPath, true);
  } else {
    legacyExec.set(execPath, false);
  }
  return legacyExec.get(execPath);
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
        ignore = value;
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

        // Check if file should be ignored
        const baseName = path.basename(filePath);
        if (ignore.some(pattern => minimatch(baseName, pattern))) {
          return [];
        }

        // Check if a config file exists and handle it
        const confFile = await helpers.findAsync(
          fileDir, ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml']
        );
        if (disableWhenNoConfigFile && !confFile) {
          return [];
        }

        // Check if a local PHPCS executable is available
        if (autoExecutableSearch) {
          const executable = await helpers.findAsync(
            fileDir, ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs']
          );

          if (executable !== null) {
            executablePath = executable;
          }
        }
        const legacy = await isLegacyExec(executablePath);

        const parameters = ['--report=json'];

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
