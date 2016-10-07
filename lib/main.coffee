{CompositeDisposable} = require 'atom'
helpers = require 'atom-linter'

module.exports =
  activate: ->
    require('atom-package-deps').install()
    @subscriptions = new CompositeDisposable

    @legacy = false
    @subscriptions.add atom.config.observe('linter-phpcs.executablePath', (value) =>
      @command = value
      # Determine if legacy mode needs to be set up (in case phpcs version = 1)
      helpers.exec(@command, ['--version']).then (result) =>
        versionPattern = /^PHP_CodeSniffer version ([0-9]+)/i
        version = result.match versionPattern
        if version and version[1] is '1'
          @legacy = true
    )
    @subscriptions.add atom.config.observe('linter-phpcs.autoExecutableSearch', (value) =>
      @autoExecutableSearch = value
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
      @ignore = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.displayErrorsOnly', (value) =>
      @errorsOnly = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.warningSeverity', (value) =>
      @warningSeverity = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.tabWidth', (value) =>
      @tabWidth = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.showSource', (value) =>
      @showSource = value
    )
    @subscriptions.add atom.config.observe('linter-phpcs.disableExecuteTimeout', (value) =>
      @disableExecuteTimeout = value
    )

  deactivate: ->
    @subscriptions.dispose()

  provideLinter: ->
    path = require 'path'
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

        # Check if a config file exists and handle it
        confFile = helpers.find(path.dirname(filePath),
          ['phpcs.xml', 'phpcs.xml.dist', 'phpcs.ruleset.xml', 'ruleset.xml'])
        return [] if @disableWhenNoConfigFile and not confFile

        command = @command
        legacy = @legacy

        # Check if a local phpcs executable is available
        executable = helpers.find(path.dirname(filePath),
          ['vendor/bin/phpcs.bat', 'vendor/bin/phpcs']) if @autoExecutableSearch

        if executable
          command = executable

          # Determine if legacy mode needs to be set up (in case phpcs version = 1)
          helpers.exec(command, ['--version']).then (result) =>
            versionPattern = /^PHP_CodeSniffer version ([0-9]+)/i
            version = result.match versionPattern
            if version and version[1] is '1'
              legacy = true

        parameters = ['--report=json']
        standard = if @autoConfigSearch and confFile then confFile else @standard
        parameters.push("--standard=#{standard}") if standard

        parameters.push("--warning-severity=#{if @errorsOnly then 0 else @warningSeverity}")
        parameters.push("--tab-width=#{@tabWidth}") if @tabWidth
        parameters.push('-s') if @showSource

        eolChar = textEditor.getBuffer().lineEndingForRow(0)
        execPrefix = if not legacy then 'phpcs_input_file: ' + filePath + eolChar else ''
        text = execPrefix + textEditor.getText()
        execOptions = {stdin: text}
        execOptions.timeout = Infinity if @disableExecuteTimeout
        execOptions.cwd = path.dirname(confFile) if confFile
        execOptions.ignoreExitCode = true

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

            # fix column in line with tabs
            column = message.column
            if @tabWidth > 1
              line = textEditor.lineTextForBufferRow(message.line - 1)
              if line.includes "\t"
                screenCol = 0
                for char, col in line
                  if char is "\t"
                    screenCol += @tabWidth - (screenCol % @tabWidth)
                  else
                    screenCol += 1
                  if screenCol >= column
                    column = col + 1
                    break

            startPoint = [message.line - 1, column - 1]
            endPoint = [message.line - 1, column]
            msg = {
              type: message.type
              filePath,
              range: [startPoint, endPoint]
            }
            if @showSource
              msg.html = '<span class="badge badge-flexible">' + (message.source or 'Unknown') + '</span> '
              msg.html += escapeHtml(message.message)
            else
              msg.text = message.message
            return msg
