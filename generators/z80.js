/**
 * @license
 * Visual Blocks Language
 *
 * Copyright 2012 Google Inc.
 * https://developers.google.com/blockly/
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Helper functions for generating Z80 for blocks.
 * @author haroldoop@gmail.com (Haroldo de Oliveira Pinheiro)
 */
'use strict';

goog.provide('Blockly.Z80');

goog.require('Blockly.Generator');


/**
 * Z80 code generator.
 * @type !Blockly.Generator
 */
Blockly.Z80 = new Blockly.Generator('Z80');

/**
 * List of illegal variable names.
 * This is not intended to be a security feature.  Blockly is 100% client-side,
 * so bypassing this list is trivial.  This is intended to prevent users from
 * accidentally clobbering a built-in object or function.
 * @private
 */
Blockly.Z80.addReservedWords(
	'ld'
);

/**
 * Order of operation ENUMs.
 */
Blockly.Z80.ORDER_ATOMIC = 0;         // 0 "" ...
Blockly.Z80.ORDER_MEMBER = 1;         // . []
Blockly.Z80.ORDER_NEW = 1;            // new
Blockly.Z80.ORDER_FUNCTION_CALL = 2;  // ()
Blockly.Z80.ORDER_INCREMENT = 3;      // ++
Blockly.Z80.ORDER_DECREMENT = 3;      // --
Blockly.Z80.ORDER_LOGICAL_NOT = 4;    // !
Blockly.Z80.ORDER_BITWISE_NOT = 4;    // ~
Blockly.Z80.ORDER_UNARY_PLUS = 4;     // +
Blockly.Z80.ORDER_UNARY_NEGATION = 4; // -
Blockly.Z80.ORDER_TYPEOF = 4;         // typeof
Blockly.Z80.ORDER_VOID = 4;           // void
Blockly.Z80.ORDER_DELETE = 4;         // delete
Blockly.Z80.ORDER_MULTIPLICATION = 5; // *
Blockly.Z80.ORDER_DIVISION = 5;       // /
Blockly.Z80.ORDER_MODULUS = 5;        // %
Blockly.Z80.ORDER_ADDITION = 6;       // +
Blockly.Z80.ORDER_SUBTRACTION = 6;    // -
Blockly.Z80.ORDER_BITWISE_SHIFT = 7;  // << >> >>>
Blockly.Z80.ORDER_RELATIONAL = 8;     // < <= > >=
Blockly.Z80.ORDER_IN = 8;             // in
Blockly.Z80.ORDER_INSTANCEOF = 8;     // instanceof
Blockly.Z80.ORDER_EQUALITY = 9;       // == != === !==
Blockly.Z80.ORDER_BITWISE_AND = 10;   // &
Blockly.Z80.ORDER_BITWISE_XOR = 11;   // ^
Blockly.Z80.ORDER_BITWISE_OR = 12;    // |
Blockly.Z80.ORDER_LOGICAL_AND = 13;   // &&
Blockly.Z80.ORDER_LOGICAL_OR = 14;    // ||
Blockly.Z80.ORDER_CONDITIONAL = 15;   // ?:
Blockly.Z80.ORDER_ASSIGNMENT = 16;    // = += -= *= /= %= <<= >>= ...
Blockly.Z80.ORDER_COMMA = 17;         // ,
Blockly.Z80.ORDER_NONE = 99;          // (...)

/**
 * Initialise the database of variable names.
 */
Blockly.Z80.init = function() {
  // Create a dictionary of definitions to be printed before the code.
  Blockly.Z80.definitions_ = Object.create(null);
  // Create a dictionary of definitions to be printed after the code.
  Blockly.Z80.strings_ = {
	strings: {},
	nextNum: 1
  };
  // Create a dictionary mapping desired function names in definitions_
  // to actual function names (to avoid collisions with user functions).
  Blockly.Z80.functionNames_ = Object.create(null);

  if (!Blockly.Z80.variableDB_) {
    Blockly.Z80.variableDB_ =
        new Blockly.Names(Blockly.Z80.RESERVED_WORDS_);
  } else {
    Blockly.Z80.variableDB_.reset();
  }

  var defvars = [];
  var variables = Blockly.Variables.allVariables();
  var ramAddr = 0x00;
  for (var x = 0; x < variables.length; x++) {
    defvars[x] = Blockly.Z80.variableDB_.getName(variables[x], Blockly.Variables.NAME_TYPE) + 
		':\tequ UsrRAMStart + $' + ramAddr.toString(16).toUpperCase() +
		'\t; ' + variables[x];
	ramAddr += 2;
  }
  Blockly.Z80.definitions_['variables'] = defvars.join('\n');
};

/**
 * Prepend the generated code with the variable definitions.
 * @param {string} code Generated code.
 * @return {string} Completed code.
 */
Blockly.Z80.finish = function(code) {
  // Convert the definitions dictionary into a list.
  var definitions = [];
  for (var name in Blockly.Z80.definitions_) {
    definitions.push(Blockly.Z80.definitions_[name]);
  }
  
  // Convert the string definitions dictionary
  var stringDefs = [];
  for (var string in Blockly.Z80.strings_.strings) {
	stringDefs.push(Blockly.Z80.strings_.strings[string] + ':\tdb ' + Blockly.Z80.quote_(string) + ', 0');
  }
  
  var generatedSource =
		'\tinclude "hardware.asm"\n\n' +
		definitions.join('\n\n') + 
		'\n\nMAIN:\n' + code + 
		'\n\nprogram_done:\tjr program_done' +
		'\n\n\n' + stringDefs.join('\n') +
		'\n\n' +
		'\tinclude "data.asm"\n';
		
  var optimizedSource = Blockly.Z80.optimizeSource_(generatedSource);
  var formattedSource = Blockly.Z80.formatSource_(optimizedSource);
		
  return formattedSource;
};

/**
 * Formats the ASM source to look pretty
 */
Blockly.Z80.formatSource_ = function(source) {
	return source
		// Split lines
		.split(/\r?\n/g)
		// For each line
		.map(function(lin){
			return lin.trim()
				// Each line is formatted as [label:] <tab> [code]
				.replace(/^(\w+:|)\s*(.*)$/, '$1\t$2')
				// Empty out the empty lines
				.replace(/^\s+$/, ''); 
		})
		// Rejoin lines
		.join('\n')
};

/**
 * Naked values are top-level blocks with outputs that aren't plugged into
 * anything.  A trailing semicolon is needed to make this legal.
 * @param {string} line Line of generated code.
 * @return {string} Legal line of code.
 */
Blockly.Z80.scrubNakedValue = function(line) {
  return line + ';\n';
};

/**
 * Encode a string as a properly escaped Z80 string, complete with
 * quotes.
 * @param {string} string Text to encode.
 * @return {string} Z80 string.
 * @private
 */
Blockly.Z80.quote_ = function(string) {
  // TODO: This is a quick hack.  Replace with goog.string.quote
  string = string.replace(/\\/g, '\\\\')
                 .replace(/\n/g, '\\\n')
                 .replace(/'/g, '\\\'')
                 .replace(/"/g, '\\\"');
  return '\"' + string + '\"';
};

Blockly.Z80.registerString_ = function(string) {
	if (!(string in Blockly.Z80.strings_.strings)) {
		Blockly.Z80.strings_.strings[string] = 'str_' + Blockly.Z80.strings_.nextNum++;
	}
	return Blockly.Z80.strings_.strings[string];
}

Blockly.Z80.inputType_ = function(block, inputName) {
	var inputBlock = block.getInputTargetBlock('TEXT');
	var outputCheck = inputBlock && inputBlock.outputConnection && inputBlock.outputConnection.check_;
	return outputCheck && outputCheck.length ? outputCheck[0] : null;
}

/**
 * Common tasks for generating Z80 from blocks.
 * Handles comments for the specified block and any connected value blocks.
 * Calls any statements following this block.
 * @param {!Blockly.Block} block The current block.
 * @param {string} code The Z80 code created for this block.
 * @return {string} Z80 code with comments and subsequent blocks added.
 * @private
 */
Blockly.Z80.scrub_ = function(block, code) {
  var commentCode = '';
  // Only collect comments for blocks that aren't inline.
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    // Collect comment for this block.
    var comment = block.getCommentText();
    if (comment) {
      commentCode += Blockly.Z80.prefixLines(comment, '// ') + '\n';
    }
    // Collect comments for all value arguments.
    // Don't collect comments for nested statements.
    for (var x = 0; x < block.inputList.length; x++) {
      if (block.inputList[x].type == Blockly.INPUT_VALUE) {
        var childBlock = block.inputList[x].connection.targetBlock();
        if (childBlock) {
          var comment = Blockly.Z80.allNestedComments(childBlock);
          if (comment) {
            commentCode += Blockly.Z80.prefixLines(comment, '// ');
          }
        }
      }
    }
  }
  var nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  var nextCode = Blockly.Z80.blockToCode(nextBlock);
  return commentCode + code + nextCode;
};

/**
 * This is a very simple peephole optimizer for the generated ASM code
 */
Blockly.Z80.optimizeSource_ = function(code) {

	// Eliminates extra spaces at beginning and end of each line
	code = code.split('\n').map(function(s){ return s.trim() }).join('\n');
	
	/*
		-- Turns --
		ld hl, 12
		push hl
		ld hl, 34
		pop de
		-- Into --
		ld de, 12
		ld hl, 34
	*/
	code = code.replace(/^ld hl, ([\(\w\)]+)\s+push hl\s+ld hl, ([\(\w\)]+)\s+pop de$/mg, 'ld de, $1\nld hl, $2');

	/*
		-- Turns --
		ld de, 5
		ld hl, 2
		ex de, hl
		or a
		sbc hl, de
		-- Into --
		ld hl, 5
		ld de, 2
		or a
		sbc hl, de
	*/
	code = code.replace(/^ld de, ([\(\w\)]+)\s+ld hl, ([\(\w\)]+)\s+ex de, hl$/mg, 'ld hl, $1\nld de, $2');
	
	/*
		-- Turns --
		ld de, (Value)
		ld hl, 2
		add hl, de
		push hl
		ld hl, 1
		pop de
		call Something
		-- Into --
		ld de, (Value)
		ld hl, 2
		add hl, de
		ex de, hl
		ld hl, 1
		call Something
	*/
	code = code.replace(/^push hl\s+ld hl, ([\(\w\)]+)\s+pop de$/mg, 'ex de, hl\nld hl, $1');
	
	/*
		-- Turns --
		ex de, hl
		ld hl, 1
		ex de, hl
		-- Into --
		ld de, 1
	*/
	code = code.replace(/^ex de, hl\s+ld hl, ([\(\w\)]+)\s+ex de, hl$/mg, 'ld de, $1');
	
	return code
};
