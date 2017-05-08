'use babel';

import * as path from 'path';
// eslint-disable-next-line no-unused-vars, import/no-extraneous-dependencies
import { it, fit, wait, beforeEach, afterEach } from 'jasmine-fix';

const lint = require('../lib/main.js').provideLinter().lint;

const goodPath = path.join(__dirname, 'files', 'good.php');
const badPath = path.join(__dirname, 'files', 'bad.php');
const tabsPath = path.join(__dirname, 'files', 'tabs.php');
const emptyPath = path.join(__dirname, 'files', 'empty.php');
const longCP1251Path = path.join(__dirname, 'files', 'long.cp1251.php');
const shortCP1251Path = path.join(__dirname, 'files', 'short.cp1251.php');

describe('The phpcs provider for Linter', () => {
  beforeEach(async () => {
    atom.workspace.destroyActivePaneItem();
    await atom.packages.activatePackage('linter-phpcs');
    await atom.packages.activatePackage('language-php');
  });

  it('should be in the packages list', () =>
    expect(atom.packages.isPackageLoaded('linter-phpcs')).toBe(true),
  );

  it('should be an active package', () =>
    expect(atom.packages.isPackageActive('linter-phpcs')).toBe(true),
  );

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
      expect(messages[0].excerpt).toBe('' +
        '[Generic.PHP.LowerCaseConstant.Found]' +
        ' TRUE, FALSE and NULL must be lowercase; ' +
        'expected "true" but found "TRUE"');
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
      const messages = await lint(editor);
      expect(messages.length).toBe(1);
      expect(messages[0].excerpt).toMatch(/Line exceeds/);
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
    beforeEach(async () => {
      atom.config.set('linter-phpcs.tabWidth', 4);
      editor = await atom.workspace.open(tabsPath);
    });

    it('finds at least two messages', async () => {
      const messages = await lint(editor);
      expect(messages.length).toBeGreaterThan(1);
    });

    it('verifies the second message', async () => {
      const messages = await lint(editor);
      expect(messages[1].severity).toBe('error');
      expect(messages[1].description).not.toBeDefined();
      expect(messages[1].excerpt).toBe('' +
        '[Generic.PHP.LowerCaseConstant.Found]' +
        ' TRUE, FALSE and NULL must be lowercase; ' +
        'expected "true" but found "TRUE"');
      expect(messages[1].location.file).toBe(tabsPath);
      expect(messages[1].location.position).toEqual([[2, 6], [2, 10]]);
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
    atom.config.set('linter-phpcs.excludedSniffs', ['Generic.PHP.LowerCaseConstant']);
    const editor = await atom.workspace.open(badPath);
    const messages = await lint(editor);
    // Note that we have earlier checked that it should be 1 normally
    expect(messages.length).toBe(0);
  });
});
