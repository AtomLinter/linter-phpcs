'use babel';

import * as path from 'path';
import { satisfies } from 'semver';
import {
  // eslint-disable-next-line no-unused-vars
  it, fit, wait, beforeEach, afterEach,
} from 'jasmine-fix';
import linterPhpcs, { getPHPCSVersion, loadDeps } from '../lib/main';

const { lint } = linterPhpcs.provideLinter();

const goodPath = path.join(__dirname, 'files', 'good.php');
const badIncPath = path.join(__dirname, 'files', 'bad.inc');
const badLibPath = path.join(__dirname, 'files', 'bad.lib');
const badModulePath = path.join(__dirname, 'files', 'bad.module');
const badPath = path.join(__dirname, 'files', 'bad.php');
const tabsPath = path.join(__dirname, 'files', 'tabs.php');
const emptyPath = path.join(__dirname, 'files', 'empty.php');
const longCP1251Path = path.join(__dirname, 'files', 'long.cp1251.php');
const shortCP1251Path = path.join(__dirname, 'files', 'short.cp1251.php');
const standardsPath = path.join(__dirname, 'standards');

async function throwingLint(editor) {
  try {
    await lint(editor);
  } catch (e) {
    return true;
  }
  return false;
}

describe('The phpcs provider for Linter', () => {
  let phpcsVer;
  beforeEach(async () => {
    atom.workspace.destroyActivePaneItem();
    await atom.packages.activatePackage('linter-phpcs');
    await atom.packages.activatePackage('language-php');
    loadDeps();
    phpcsVer = await getPHPCSVersion('phpcs');
  });

  it('should be in the packages list', () => {
    expect(atom.packages.isPackageLoaded('linter-phpcs')).toBe(true);
  });

  it('should be an active package', () => {
    expect(atom.packages.isPackageActive('linter-phpcs')).toBe(true);
  });

  describe('checks bad.php and', () => {
    let editor = null;
    beforeEach(async () => {
      editor = await atom.workspace.open(badPath);
    });

    it('verifies the results', async () => {
      const messages = await lint(editor);
      expect(messages.length).toBe(1);
      expect(messages[0].severity).toBe('error');
      expect(messages[0].description).not.toBeDefined();
      expect(messages[0].excerpt).toBe(''
        + '[Generic.PHP.LowerCaseConstant.Found]'
        + ' TRUE, FALSE and NULL must be lowercase; '
        + 'expected "true" but found "TRUE"');
      expect(messages[0].location.file).toBe(badPath);
      expect(messages[0].location.position).toEqual([[1, 5], [1, 9]]);
    });
  });

  describe('checks long.cp1251.php and', () => {
    let editor = null;
    beforeEach(async () => {
      editor = await atom.workspace.open(longCP1251Path);
      const buffer = editor.getBuffer();
      buffer.setEncoding('windows1251');
      // setting encoding will trigger async reload, so let's wait for that
      // otherwise linter-phpcs will notice the file has changed and will abort linting
      return new Promise((resolve) => {
        buffer.onDidReload(resolve);
      });
    });

    it('reports line length warning', async () => {
      if (satisfies(phpcsVer, '<2')) {
        // PHPCS v1 has a bug with cp1251 encoded files and gives invalid points
        expect(await throwingLint(editor)).toBe(true);
      } else {
        const messages = await lint(editor);
        expect(messages.length).toBe(1);
        expect(messages[0].excerpt).toMatch(/Line exceeds/);
      }
    });
  });

  describe('checks short.cp1251.php and', () => {
    let editor = null;
    beforeEach(async () => {
      editor = await atom.workspace.open(shortCP1251Path);
      const buffer = editor.getBuffer();
      buffer.setEncoding('windows1251');
      // setting encoding will trigger async reload, so let's wait for that
      // otherwise linter-phpcs will notice the file has changed and will abort linting
      return new Promise((resolve) => {
        buffer.onDidReload(resolve);
      });
    });

    it('reports no errors nor warnings', async () => {
      const messages = await lint(editor);
      expect(messages.length).toBe(0);
    });
  });

  describe('checks tabs.php and', () => {
    let editor = null;

    function checkTabMessage(tabMessage) {
      expect(tabMessage.severity).toBe('error');
      expect(tabMessage.description).not.toBeDefined();
      expect(tabMessage.excerpt).toBe(''
        + '[Generic.PHP.LowerCaseConstant.Found]'
        + ' TRUE, FALSE and NULL must be lowercase; '
        + 'expected "true" but found "TRUE"');
      expect(tabMessage.location.file).toBe(tabsPath);
      // Note that for broken versions (v2.0.0 through v3.0.0) the tab width
      // setting is ignored. We can't test the raw value returned here, but we
      // can check that it is being handled correctly.
      expect(tabMessage.location.position).toEqual([[2, 6], [2, 10]]);
    }

    beforeEach(async () => {
      // NOTE: The default PSR2 standard forces tabWidth to 4
      atom.config.set('linter-phpcs.codeStandardOrConfigFile', 'PEAR');
      editor = await atom.workspace.open(tabsPath);
    });

    it('works with a the default tab-width', async () => {
      const messages = await lint(editor);
      expect(messages.length).toBe(4);
      const tabMessage = messages[3];
      checkTabMessage(tabMessage);
    });

    it('works with a non-default tab-width', async () => {
      atom.config.set('linter-phpcs.tabWidth', 12);
      const messages = await lint(editor);
      let tabMessage;
      if (satisfies(phpcsVer, '<2')) {
        expect(messages.length).toBe(2);
        [, tabMessage] = messages;
      } else {
        expect(messages.length).toBe(3);
        [, , tabMessage] = messages;
      }
      checkTabMessage(tabMessage);
    });

    describe('handles forced standards properly', () => {
      it('works with the default tab width', async () => {
        atom.config.set('linter-phpcs.codeStandardOrConfigFile', 'PSR2');
        const messages = await lint(editor);
        let tabMessage;
        if (satisfies(phpcsVer, '<2')) {
          expect(messages.length).toBe(3);
          [, , tabMessage] = messages;
        } else {
          expect(messages.length).toBe(2);
          [, tabMessage] = messages;
        }
        checkTabMessage(tabMessage);
      });

      it('works with a forced tab width', async () => {
        atom.config.set('linter-phpcs.codeStandardOrConfigFile', 'PSR2');
        atom.config.set('linter-phpcs.tabWidth', 12);
        const messages = await lint(editor);
        let tabMessage;
        if (satisfies(phpcsVer, '<2')) {
          expect(messages.length).toBe(1);
          [tabMessage] = messages;
        } else {
          expect(messages.length).toBe(2);
          [, tabMessage] = messages;
        }
        checkTabMessage(tabMessage);
      });

      it('works with tabs error at the end of the line', async () => {
        const lineEndError = path.join(standardsPath,
          `LineEndError${satisfies(phpcsVer, '<3') ? 'V1' : ''}`);
        atom.config.set('linter-phpcs.codeStandardOrConfigFile', lineEndError);
        atom.config.set('linter-phpcs.tabWidth', 2);
        const messages = await lint(editor);
        expect(messages.length).toBe(4);
      });
    });
  });

  it('finds nothing wrong with an empty file', async () => {
    const editor = await atom.workspace.open(emptyPath);
    const messages = await lint(editor);
    expect(messages.length).toBe(0);
  });

  it('finds nothing wrong with a valid file', async () => {
    const editor = await atom.workspace.open(goodPath);
    const messages = await lint(editor);
    expect(messages.length).toBe(0);
  });

  it('allows specifying sniffs to ignore', async () => {
    if (satisfies(phpcsVer, '<2.6.2')) {
      // Versions below v2.6.2 don't support excluding sniffs
      expect(true).toBe(true);
    } else {
      const editor = await atom.workspace.open(badPath);
      let messages = await lint(editor);
      expect(messages.length).toBe(1);
      atom.config.set('linter-phpcs.excludedSniffs', ['Generic.PHP.LowerCaseConstant']);
      messages = await lint(editor);
      expect(messages.length).toBe(0);
    }
  });

  it('allows specifying other extentions', async () => {
    const editor = await atom.workspace.open(badModulePath);
    let messages = await lint(editor);
    // extensions are ignored by phpcs for v1.* and v2.*
    const expected = satisfies(phpcsVer, '<3.0.0') ? 1 : 0;
    expect(messages.length).toBe(expected);
    atom.config.set('linter-phpcs.includeExtensions', ['module']);
    messages = await lint(editor);
    expect(messages.length).toBe(1);
  });

  it('allows php, inc, lib extentions by default', async () => {
    let editor = await atom.workspace.open(badModulePath);
    let messages = await lint(editor);
    // extensions are ignored by phpcs for v1.* and v2.*
    const expected = satisfies(phpcsVer, '<3.0.0') ? 1 : 0;
    expect(messages.length).toBe(expected);
    editor = await atom.workspace.open(badPath);
    messages = await lint(editor);
    expect(messages.length).toBe(1);
    editor = await atom.workspace.open(badIncPath);
    messages = await lint(editor);
    expect(messages.length).toBe(1);
    editor = await atom.workspace.open(badLibPath);
    messages = await lint(editor);
    expect(messages.length).toBe(1);
  });
});
