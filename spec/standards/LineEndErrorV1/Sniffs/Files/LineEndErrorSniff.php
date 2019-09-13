<?php

class LineEndErrorV1_Sniffs_Files_LineEndErrorSniff implements PHP_CodeSniffer_Sniff {
	public function register() {
		return [T_OPEN_TAG];
	}

	public function process(PHP_CodeSniffer_File $phpcsFile, $stackPtr) {
		$tokens = $phpcsFile->getTokens();

		// Errors are reported at the last token of every line.
		for ($i = 0; $i < $phpcsFile->numTokens; $i++) {
			if (!isset($tokens[($i + 1)]) || $tokens[($i + 1)]['line'] > $tokens[$i]['line']) {
				// Token is the last on a line.
				$phpcsFile->addError("Line End Error", $i, 'LineEndError');
			}
		}

		return ($phpcsFile->numTokens + 1);
	}
}
