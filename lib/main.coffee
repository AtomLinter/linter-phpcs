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
    @standard = ""
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      unless value
        value = "phpcs" # Let os's $PATH handle the rest
      @command = "#{value} --report=json"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) =>
      @standard = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.ignore', (value) =>
      if value
        value = "--ignore=#{value}"
        @parameters[2] = value
      else @parameters[2] = null
    )
    @subscriptions.add atom.config.observe('linter-phpcs.warningSeverity', (value) =>
      @parameters[3] = "--warning-severity=#{value}"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      if value
        value = "--tab-width=#{value}"
        @parameters[4] = value
      else @parameters[4] = null
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
        command = @parameters.join(' ')
        standard = @standard
        unless standard
          standard = helpers.findFile(path.dirname(filePath), 'phpcs.xml')
        if standard then command += " --standard=#{@standard}"
        return new Promise (resolve) ->
          message = {filePath, type: 'Error', text: 'Something went wrong', range:[[0,0], [0,1]]}
          resolve([message])