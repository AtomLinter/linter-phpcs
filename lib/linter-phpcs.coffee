linterPath = atom.packages.getLoadedPackage("linter").path
Linter = require "#{linterPath}/lib/linter"

class LinterPhpcs extends Linter
  # The syntax that the linter handles. May be a string or
  # list/tuple of strings. Names should be all lowercase.
  @syntax: ['text.html.php', 'source.php']

  # A string, list, tuple or callable that returns a string, list or tuple,
  # containing the command line (with arguments) used to lint.
  cmd: 'phpcs --report=checkstyle --standard=@standard'

  executablePath: null

  linterName: 'phpcs'

  # A regex pattern used to extract information from the executable's output.
  regex: '.*line="(?<line>[0-9]+)" column="(?<col>[0-9]+)" severity="((?<error>error)|(?<warning>warning))" message="(?<message>.*)" source'

  standard: null

  constructor: (editor)->
    super(editor)

    atom.config.observe 'linter-phpcs.phpcsExecutablePath', =>
      @executablePath = atom.config.get 'linter-phpcs.phpcsExecutablePath'

    atom.config.observe 'linter-phpcs.standard', =>
      @standard = atom.config.get 'linter-phpcs.standard'

  destroy: ->
    atom.config.unobserve 'linter-phpcs.phpcsExecutablePath'
    atom.config.unobserve 'linter-phpcs.standard'

  getCmd:(filePath) ->
    cmd = super(filePath)
    cmd.replace('@standard', @standard)

module.exports = LinterPhpcs
