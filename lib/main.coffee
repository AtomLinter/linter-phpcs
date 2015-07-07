module.exports =
  config:
    phpcsExecutablePath:
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

