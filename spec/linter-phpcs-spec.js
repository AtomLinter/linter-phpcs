'use babel';

import * as path from 'path';

const lint = require('../lib/main.js').provideLinter().lint;

const goodPath = path.join(__dirname, 'files', 'good.php');
const badPath = path.join(__dirname, 'files', 'bad.php');
const tabsPath = path.join(__dirname, 'files', 'tabs.php');
const emptyPath = path.join(__dirname, 'files', 'empty.php');

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
          expect(messages[0].type).toBe('ERROR');
          expect(messages[0].text).not.toBeDefined();
          expect(messages[0].html).toBe('' +
            '<span class="badge badge-flexible">Generic.PHP.LowerCaseConstant.Found</span>' +
            ' TRUE, FALSE and NULL must be lowercase; ' +
            'expected &quot;true&quot; but found &quot;TRUE&quot;');
          expect(messages[0].filePath).toBe(badPath);
          expect(messages[0].range).toEqual([[1, 5], [1, 9]]);
        }),
      ),
    );
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
          expect(messages[1].type).toBe('ERROR');
          expect(messages[1].text).not.toBeDefined();
          expect(messages[1].html).toBe('' +
            '<span class="badge badge-flexible">Generic.PHP.LowerCaseConstant.Found</span>' +
            ' TRUE, FALSE and NULL must be lowercase; ' +
            'expected &quot;true&quot; but found &quot;TRUE&quot;');
          expect(messages[1].filePath).toBe(tabsPath);
          expect(messages[1].range).toEqual([[2, 6], [2, 10]]);
        }),
      ),
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
