'use babel';

import * as path from 'path';

const lint = require('../lib/main.js').provideLinter().lint;

const goodPath = path.join(__dirname, 'files', 'good.php');
const badPath = path.join(__dirname, 'files', 'bad.php');
const tabsPath = path.join(__dirname, 'files', 'tabs.php');
const emptyPath = path.join(__dirname, 'files', 'empty.php');
const longCP1251Path = path.join(__dirname, 'files', 'long.cp1251.php');
const shortCP1251Path = path.join(__dirname, 'files', 'short.cp1251.php');

describe('The phpcs provider for Linter', () => {
  beforeEach(() => {
    atom.workspace.destroyActivePaneItem();
    waitsForPromise(() => {
      atom.packages.activatePackage('linter-phpcs');
      return atom.packages.activatePackage('language-php').then(() =>
        atom.workspace.open(goodPath),
      );
    });
  });

  it('should be in the packages list', () =>
    expect(atom.packages.isPackageLoaded('linter-phpcs')).toBe(true),
  );

  it('should be an active package', () =>
    expect(atom.packages.isPackageActive('linter-phpcs')).toBe(true),
  );

  describe('checks bad.php and', () => {
    let editor = null;
    beforeEach(() =>
      waitsForPromise(() =>
        atom.workspace.open(badPath).then((openEditor) => { editor = openEditor; }),
      ),
    );

    it('verifies the results', () =>
      waitsForPromise(() =>
        lint(editor).then((messages) => {
          expect(messages.length).toBe(1);
          expect(messages[0].severity).toBe('error');
          expect(messages[0].description).not.toBeDefined();
          expect(messages[0].excerpt).toBe('' +
            '[Generic.PHP.LowerCaseConstant.Found]' +
            ' TRUE, FALSE and NULL must be lowercase; ' +
            'expected "true" but found "TRUE"');
          expect(messages[0].location.file).toBe(badPath);
          expect(messages[0].location.position).toEqual([[1, 5], [1, 9]]);
        }),
      ),
    );
  });

  describe('checks long.cp1251.php and', () => {
    let editor = null;
    beforeEach(() =>
      waitsForPromise(() =>
        atom.workspace.open(longCP1251Path).then((openEditor) => {
          editor = openEditor;
          editor.getBuffer().setEncoding('windows1251');
          // setting encoding will trigger async reload, so let's wait for that
          // otherwise linter-phpcs will notice the file has changed and will abort linting
          return new Promise((resolve) => {
            editor.getBuffer().onDidReload(resolve);
          });
        }),
      ),
    );
    it('reports line length warning', () => {
      waitsForPromise(() =>
        lint(editor).then((messages) => {
          expect(messages.length).toBe(1);
          expect(messages[0].excerpt).toMatch(/Line exceeds/);
        }),
      );
    });
  });

  describe('checks short.cp1251.php and', () => {
    let editor = null;
    beforeEach(() =>
      waitsForPromise(() =>
        atom.workspace.open(shortCP1251Path).then((openEditor) => {
          editor = openEditor;
          editor.getBuffer().setEncoding('windows1251');
          // setting encoding will trigger async reload, so let's wait for that
          // otherwise linter-phpcs will notice the file has changed and will abort linting
          return new Promise((resolve) => {
            editor.getBuffer().onDidReload(resolve);
          });
        }),
      ),
    );
    it('reports no errors nor warnings', () => {
      waitsForPromise(() =>
        lint(editor).then(messages =>
          expect(messages.length).toBe(0),
        ),
      );
    });
  });

  describe('checks tabs.php and', () => {
    let editor = null;
    beforeEach(() => {
      atom.config.set('linter-phpcs.tabWidth', 4);
      waitsForPromise(() =>
        atom.workspace.open(tabsPath).then((openEditor) => { editor = openEditor; }),
      );
    });

    it('finds at least two messages', () =>
      waitsForPromise(() =>
        lint(editor).then(messages =>
          expect(messages.length).toBeGreaterThan(1),
        ),
      ),
    );

    it('verifies the second message', () =>
      waitsForPromise(() =>
        lint(editor).then((messages) => {
          expect(messages[1].severity).toBe('error');
          expect(messages[1].description).not.toBeDefined();
          expect(messages[1].excerpt).toBe('' +
            '[Generic.PHP.LowerCaseConstant.Found]' +
            ' TRUE, FALSE and NULL must be lowercase; ' +
            'expected "true" but found "TRUE"');
          expect(messages[1].location.file).toBe(tabsPath);
          expect(messages[1].location.position).toEqual([[2, 6], [2, 10]]);
        }),
      ),
    );

    it('verifies the position when tabWidth = 2', () =>
      waitsForPromise(() => {
        atom.config.set('linter-phpcs.tabWidth', 2);
        atom.config.set('linter-phpcs.codeStandardOrConfigFile', 'PEAR');
        return lint(editor).then((messages) => {
          const lastMessage = messages[messages.length - 1];
          expect(lastMessage.excerpt).toBe('' +
            '[Generic.Files.LineLength.TooLong]' +
            ' Line exceeds 85 characters; ' +
            'contains 124 characters');
          expect(lastMessage.location.position).toEqual([[3, 122], [3, 123]]);
        });
      }),
    );

    it('verifies the position when tabWidth = 6', () =>
      waitsForPromise(() => {
        atom.config.set('linter-phpcs.tabWidth', 6);
        atom.config.set('linter-phpcs.codeStandardOrConfigFile', 'PEAR');
        return lint(editor).then((messages) => {
          const lastMessage = messages[messages.length - 1];
          expect(lastMessage.excerpt).toBe('' +
            '[Generic.Files.LineLength.TooLong]' +
            ' Line exceeds 85 characters; ' +
            'contains 128 characters');
          expect(lastMessage.location.position).toEqual([[3, 122], [3, 123]]);
        });
      }),
    );
  });

  it('finds nothing wrong with an empty file', () =>
    waitsForPromise(() =>
      atom.workspace.open(emptyPath).then(editor =>
        lint(editor).then(messages => expect(messages.length).toBe(0)),
      ),
    ),
  );

  it('finds nothing wrong with a valid file', () =>
    waitsForPromise(() =>
      atom.workspace.open(goodPath).then(editor =>
        lint(editor).then(messages => expect(messages.length).toBe(0)),
      ),
    ),
  );

  it('allows specifying sniffs to ignore', () => {
    atom.config.set('linter-phpcs.excludedSniffs', ['Generic.PHP.LowerCaseConstant']);
    waitsForPromise(() =>
      atom.workspace.open(badPath).then(editor =>
        lint(editor).then(messages =>
          // Note that we have earlier checked that it should be 1 normally
          expect(messages.length).toBe(0),
        ),
      ),
    );
  });
});
