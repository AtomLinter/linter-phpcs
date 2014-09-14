module.exports =
  configDefaults:
    phpcsExecutablePath: null
    standard: 'PSR2'
    ignore: '*.blade.php,*.twig.php'
    EnableWarning: 1

  activate: ->
    console.log 'activate linter-phpcs'
