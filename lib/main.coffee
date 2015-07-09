{CompositeDisposable} = require 'atom'
module.exports =
  config:
    executablePath:
      type: 'string'
      default: ''
    codeStandardOrConfigFile:
      type: 'string'
      default: 'PSR2'
      description: "Enter path to config file or a coding standard, PSR2 for example"
    ignore:
      type: 'string'
      default: '*.blade.php,*.twig.php'
    warningSeverity:
      type: 'integer'
      default: 1
    tabWidth:
      type: 'integer'
      default: 0
  activate: ->
    @parameters = new Array(5)
    @parameters.push('--report=json')
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
        parameters.push(filePath)
        return helpers.exec(command, parameters).then (result) ->
          result = JSON.parse(result)
          return result.files[filePath].messages.map (message) ->
            startPoint = [message.line - 1, message.column - 1]
            endPoint = [message.line - 1, message.column]
            return {
              type: message.type
              text: message.message
              filePath,
              range: [startPoint, endPoint]
            }