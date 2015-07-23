{CompositeDisposable} = require 'atom'
module.exports =
  config:
    executablePath:
      type: 'string'
      default: ''
      description: "Enter the path to your phpcs executable."
    codeStandardOrConfigFile:
      type: 'string'
      default: 'PSR2'
      description: "Enter path to config file or a coding standard, PSR2 for example."
    ignore:
      type: 'string'
      default: '*.blade.php,*.twig.php'
      description: 'Enter filename patterns to ignore when running the linter.'
    warningSeverity:
      type: 'integer'
      default: 1
      description: "Set the warning severity level. Enter 0 to display errors only."
    tabWidth:
      type: 'integer'
      default: 0
      description: "Set the number of spaces that tab characters represent to the linter. Enter 0 to disable this option."
  activate: ->
    @parameters = []
    @standard = ""
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      unless value
        value = "phpcs" # Let os's $PATH handle the rest
      @command = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) =>
      @standard = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.ignore', (value) =>
      if value
        value = "--ignore=#{value}"
        @parameters[1] = value
      else @parameters[1] = null
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
    helpers = require('atom-linter')
    provider =
      grammarScopes: ['source.php']
      scope: 'file'
      lintOnFly: false
      lint: (textEditor) =>
        filePath = textEditor.getPath()
        parameters = @parameters.filter (item) -> item
        standard = @standard
        command = @command
        if standard is 'PSR2' # default value
          standard = helpers.findFile(path.dirname(filePath), 'phpcs.xml') or standard
        if standard then parameters.push("--standard=#{standard}")
        parameters.push('--report=json')
        parameters.push(filePath)
        return helpers.exec(command, parameters).then (result) ->
          try
            result = JSON.parse(result.toString().trim())
          catch error
            atom.notifications.addError("Error parsing PHPCS response", {detail: "Check your console for more info. It's a known bug on OSX. See https://github.com/AtomLinter/Linter/issues/726", dismissable: true})
            console.log("PHPCS Response", result)
            return []
          return [] unless result.files[filePath]
          return result.files[filePath].messages.map (message) ->
            startPoint = [message.line - 1, message.column - 1]
            endPoint = [message.line - 1, message.column]
            return {
              type: message.type
              text: message.message
              filePath,
              range: [startPoint, endPoint]
            }
