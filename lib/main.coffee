module.exports =
  config:
    phpcsExecutablePath:
      type: 'string'
      default: ''
    phpcsConfigFile:
      type: 'string'
      default: ''
    standard:
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