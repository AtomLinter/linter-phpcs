{CompositeDisposable} = require 'atom'
module.exports =
  config:
    executablePath:
      type: 'string'
      default: 'phpcs'
      description: 'Enter the path to your phpcs executable.'
      order: 1
    codeStandardOrConfigFile:
      type: 'string'
      default: 'PSR2'
      description: 'Enter path to config file or a coding standard, PSR2 for example.'
      order: 2
    disableWhenNoConfigFile:
      type: 'boolean'
      default: false
      description: 'Disable the linter when the default configuration file is not found.'
      order: 3
    autoConfigSearch:
      title: 'Search for configuration files'
      type: 'boolean'
      default: true
      description: 'Automatically search for any `phpcs.xml` or `phpcs.ruleset.xml` ' +
        'file to use as configuration. Overrides custom standards defined above.'
      order: 4
    ignorePatterns:
      type: 'array'
      default: ['*.blade.php', '*.twig.php']
      items:
        type: 'string'
      description: 'Enter filename patterns to ignore when running the linter.'
      order: 5
    includePatterns:
      type: 'array'
      default: ['source.php']
      items:
        type: 'string'
      description: 'Enter grammar scopes to include when running the linter. Useful for also linting JavaScript (source.js) or CSS (source.css).'
      order: 6
    warningSeverity:
      type: 'integer'
      default: 1
      description: 'Set the warning severity level. Enter 0 to display errors only.'
      order: 7
    tabWidth:
      type: 'integer'
      default: 0
      description: 'Set the number of spaces that tab characters represent to ' +
        'the linter. Enter 0 to disable this option.'
      order: 8

  activate: ->
    require('atom-package-deps').install()
    helpers = require 'atom-linter'
    @parameters = []
    @standard = ''
    @legacy = false
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      @command = value
      # Determine if legacy mode needs to be set up (in case phpcs version = 1)
      helpers.exec(@command, ['--version']).then (result) =>
        versionPattern = /^PHP_CodeSniffer version ([0-9]+)/i
        version = result.match versionPattern
        if version and version[1] is '1'
          @legacy = true
    )
    @subscriptions.add atom.config.observe('linter-phpcs.disableWhenNoConfigFile', (value) =>
      @disableWhenNoConfigFile = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) =>
      @standard = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.autoConfigSearch', (value) =>
      @autoConfigSearch = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.ignorePatterns', (value) =>
      # Translate the old setting to the new array method
      oldSetting = atom.config.get('linter-phpcs.ignore', (old) ->
        value = old.split(',') if old
        atom.config.unset('linter-phpcs.ignore')
      )
      @ignore = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.includePatterns', (value) =>
      @grammarScopes = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.warningSeverity', (value) =>
      @parameters[2] = "--warning-severity=#{value}"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      if value
        value = "--tab-width=#{value}"
        @parameters[3] = value
      else @parameters[3] = null
    )

  deactivate: ->
    @subscriptions.dispose()

  provideLinter: ->
    path = require 'path'
    helpers = require 'atom-linter'
    minimatch = require 'minimatch'
    provider =
      name: 'PHPCS'
      grammarScopes: @grammarScopes
      scope: 'file'
      lintOnFly: true
      lint: (textEditor) =>
        filePath = textEditor.getPath()

        # Check if file should be ignored
        baseName = path.basename filePath
        return [] if @ignore.some (pattern) -> minimatch baseName, pattern

        eolChar = textEditor.getBuffer().lineEndingForRow(0)
        parameters = @parameters.filter (item) -> item
        command = @command
        confFile = helpers.find(path.dirname(filePath), ['phpcs.xml', 'phpcs.ruleset.xml'])
        standard = if @autoConfigSearch and confFile then confFile else @standard
        legacy = @legacy
        execprefix = ''
        return [] if @disableWhenNoConfigFile and not confFile
        if standard then parameters.push("--standard=#{standard}")
        parameters.push('--report=json')
        execprefix = 'phpcs_input_file: ' + filePath + eolChar unless legacy
        text = execprefix + textEditor.getText()
        return helpers.exec(command, parameters, {stdin: text}).then (result) ->
          try
            result = JSON.parse(result.toString().trim())
          catch error
            atom.notifications.addError('Error parsing PHPCS response', {
              detail: 'Something went wrong attempting to parse the PHPCS output.',
              dismissable: true}
            )
            console.log('PHPCS Response', result)
            return []
          if legacy
            return [] unless result.files.STDIN
            messages = result.files.STDIN.messages
          else
            return [] unless result.files[filePath]
            messages = result.files[filePath].messages
          return messages.map (message) ->
            startPoint = [message.line - 1, message.column - 1]
            endPoint = [message.line - 1, message.column]
            return {
              type: message.type
              text: message.message
              filePath,
              range: [startPoint, endPoint]
            }
