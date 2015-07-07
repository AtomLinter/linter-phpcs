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
    @command = new Array(5)
    @standard = ""
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      unless value
        value = "phpcs" # Let os's $PATH handle the rest
      @command[0] = "#{value} --report=json"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.codeStandardOrConfigFile', (value) =>
      @standard = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.ignore', (value) =>
      if value
        value = "--ignore=#{value}"
        @command[2] = value
      else @command[2] = null
    )
    @subscriptions.add atom.config.observe('linter-phpcs.warningSeverity', (value) =>
      @command[3] = "--warning-severity=#{value}"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      if value
        value = "--tab-width=#{value}"
        @command[4] = value
      else @command[4] = null
    )

  deactivate: ->
    @subscriptions.dispose()

  provideLinter: ->
    helpers = require('atom-linter')
    provider =
      grammarScopes: ['source.php']
      scope: 'file'
      lintOnFly: false
      lint: (textEditor) =>
        filePath = textEditor.getPath()
        command = @command.join(' ')
        if @standard then command += " --standard=#{@standard}"
        console.log command
        return new Promise (resolve)->
          message = {filePath, type: 'Error', text: 'Something went wrong', range:[[0,0], [0,1]]}
          resolve([message])