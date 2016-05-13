{CompositeDisposable} = require 'atom'
module.exports =
  config:
    executablePath:
      type: 'string'
      default: 'phpcs'
      description: 'Enter the path to your phpcs executable.'
      order: 1
    disableExecuteTimeout:
      type: 'boolean'
      default: false
      description: 'Disable the 10 second timeout on running phpcs'
      order: 2
    codeStandardOrConfigFile:
      type: 'string'
      default: 'PSR2'
      description: 'Enter path to config file or a coding standard, PSR2 for example.'
      order: 3
    disableWhenNoConfigFile:
      type: 'boolean'
      default: false
      description: 'Disable the linter when the default configuration file is not found.'
      order: 4
    autoConfigSearch:
      title: 'Search for configuration files'
      type: 'boolean'
      default: true
      description: 'Automatically search for any `phpcs.xml`, `phpcs.xml.dist`, `phpcs.ruleset.xml` or `ruleset.xml` ' +
        'file to use as configuration. Overrides custom standards defined above.'
      order: 5
    ignorePatterns:
      type: 'array'
      default: ['*.blade.php', '*.twig.php']
      items:
        type: 'string'
      description: 'Enter filename patterns to ignore when running the linter.'
      order: 6
    displayErrorsOnly:
      type: 'boolean'
      default: false
      description: 'Ignore warnings and display errors only.'
      order: 7
    warningSeverity:
      type: 'integer'
      default: 1
      description: 'Set the warning severity level. Available when "Display Errors Only" is not checked.'
      order: 8
    tabWidth:
      type: 'integer'
      default: 0
      description: 'Set the number of spaces that tab characters represent to ' +
        'the linter. Enter 0 to disable this option.'
      order: 9
    showSource:
      type: 'boolean'
      default: true
      description: 'Show source in message.'
      order: 10

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
    @subscriptions.add atom.config.observe('linter-phpcs.displayErrorsOnly', (value) =>
      if value
        @parameters[2] = "--warning-severity=0"
      else
        @parameters[2] = "--warning-severity=" + atom.config.get('linter-phpcs.warningSeverity')
    )
    @subscriptions.add atom.config.observe('linter-phpcs.warningSeverity', (value) =>
      if not atom.config.get('linter-phpcs.displayErrorsOnly')
        @parameters[2] = "--warning-severity=#{value}"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      if value
        value = "--tab-width=#{value}"
        @parameters[3] = value
      else @parameters[3] = null
    )
    @subscriptions.add atom.config.observe('linter-phpcs.showSource', (value) =>
      if value
        @parameters.push('-s')
      else if (@parameters.indexOf('-s') isnt -1)
        @parameters.splice(@parameters.indexOf('-s'), 1)
      @showSource = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.disableExecuteTimeout', (value) =>
      @disableExecuteTimeout = value
    )

  deactivate: ->
    @subscriptions.dispose()

  provideLinter: ->
    path = require 'path'
    helpers = require 'atom-linter'
    minimatch = require 'minimatch'
    escapeHtml = require 'escape-html'
    provider =
      name: 'PHPCS'
      grammarScopes: ['source.php']
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
        confFile = helpers.find(path.dirname(filePath),
          ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml'])
        standard = if @autoConfigSearch and confFile then confFile else @standard
        legacy = @legacy
        execprefix = ''
        return [] if @disableWhenNoConfigFile and not confFile
        if standard then parameters.push("--standard=#{standard}")
        parameters.push('--report=json')
        execprefix = 'phpcs_input_file: ' + filePath + eolChar unless legacy
        text = execprefix + textEditor.getText()
        execOptions = {stdin: text}
        if @disableExecuteTimeout then execOptions.timeout = Infinity
        if confFile then execOptions.cwd = path.dirname(confFile)
        return helpers.exec(command, parameters, execOptions).then (result) =>
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
          return messages.map (message) =>
            startPoint = [message.line - 1, message.column - 1]
            endPoint = [message.line - 1, message.column]
            ret = {
              type: message.type
              filePath,
              range: [startPoint, endPoint]
            }
            if @showSource
              ret.html = '<span class="badge badge-flexible">' + (message.source or 'Unknown') + '</span> '
              ret.html += escapeHtml(message.message)
            else
              ret.text = message.message
            return ret
