{CompositeDisposable} = require 'atom'
module.exports =
  config:
    executablePath:
      type: 'string'
      default: ''
    standardOrConfigFile:
      type: 'string'
      default: 'PSR2'
    ignore:
      type: 'string'
      default: '*.blade.php,*.twig.php'
    enableWarning:
      type: 'integer'
      default: 1
    tabWidth:
      type: 'integer'
      default: 0
  activate: ->
    @command = new Array(5)
    @subscriptions = new CompositeDisposable
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      @command[0] = "#{value} --report=json"
    )
    @subscriptions.add atom.config.observe('linter-phpcs.standardOrConfigFile', (value) =>
      if value
        value = "--standard=#{value}"
      @command[1] = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.ignore', (value) =>
      if value
        value = "--ignore=#{value}"
      @command[2] = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.enableWarning', (value) =>
      if value
        value = "--warning-severity=#{value}"
      @command[3] = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      if value
        value = "--tab-width=#{value}"
      @command[4] = value
    )

  deactivate: ->
    @subscriptions.dispose()

  provideLinter: ->
    helpers = require('atom-linter')
    provider =
      grammarScopes: ['source.php']
      scope: 'file'
      lintOnFly: false
      lint: (textEditor)->
        filePath = textEditor.getPath()
        return new Promise (resolve)->
          message = {filePath, type: 'Error', text: 'Something went wrong', range:[[0,0], [0,1]]}
          resolve([message])