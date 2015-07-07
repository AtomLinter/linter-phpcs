linterPath = atom.packages.getLoadedPackage("linter").path
Linter = require "#{linterPath}/lib/linter"
findFile = require "#{linterPath}/lib/util"
{CompositeDisposable} = require 'atom'

class LinterPhpcs extends Linter
  # The syntax that the linter handles. May be a string or
  # list/tuple of strings. Names should be all lowercase.
  @syntax: ['text.html.php', 'source.php']

  linterName: 'phpcs'

  # A regex pattern used to extract information from the executable's output.
  regex: '.*line="(?<line>[0-9]+)" column="(?<col>[0-9]+)" severity="((?<error>error)|(?<warning>warning))" message="(?<message>.*)" source'

  executablePath: null

  constructor: (editor)->
    super(editor)

    @disposables = new CompositeDisposable()

    @disposables.add atom.config.observe 'linter-phpcs.phpcsExecutablePath', =>
      @executablePath = atom.config.get 'linter-phpcs.phpcsExecutablePath'

    @disposables.add atom.config.observe 'linter-phpcs.standard', =>
      @updateCommand()

    @disposables.add atom.config.observe 'linter-phpcs.ignore', =>
      @updateCommand()

    @disposables.add atom.config.observe 'linter-phpcs.enableWarning', =>
      @updateCommand()

    @disposables.add atom.config.observe 'linter-phpcs.tabWidth', =>
      @updateCommand()

  destroy: ->
    super
    @disposables.dispose()

  updateCommand: ->
    standard = atom.config.get 'linter-phpcs.standard'
    ignore = atom.config.get 'linter-phpcs.ignore'
    warning = atom.config.get 'linter-phpcs.enableWarning'
    tabWidth = atom.config.get 'linter-phpcs.tabWidth'

    @cmd = "phpcs --report=checkstyle --warning-severity=#{warning}"

    # Check for per-project settings and fall back to editor settings
    # if none are found.
    config = findFile @cwd, ['phpcs.xml']
    if config
      @cmd += " --standard=#{config}"

    else
      if standard
        @cmd += " --standard=#{standard}"

      if ignore
        @cmd += " --ignore=#{ignore}"
        
      if tabWidth
        @cmd += " --tab-width=#{tabWidth}"

  # Parse HTML character entities in output.
  formatMessage: (match) ->
    map = {
      quot: '"'
      amp: '&'
      lt: '<'
      gt: '>'
    }
    message = match.message

    for key,value of map
      regex = new RegExp '&' + key + ';', 'g'
      message = message.replace(regex, value)

    return message

module.exports = LinterPhpcs
