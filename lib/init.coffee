module.exports =
  config:
    phpcsExecutablePath:
      type: 'string'
      default: ''
    phpcsConfigXmlPath:
      type: 'string'
      default: ''
    phpcsConfigXmlFile:
      type: 'string'
      default: 'phpcs.xml'
    standard:
      type: 'string'
      default: 'PSR2'
    ignore:
      type: 'string'
      default: '*.blade.php,*.twig.php'
    enableWarning:
      type: 'integer'
      default: 1

  activate: ->
    console.log 'activate linter-phpcs'
