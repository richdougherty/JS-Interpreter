/**
 * @license
 * JavaScript Interpreter
 *
 * Copyright 2013 Google Inc.
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
 * @fileoverview Interpreting JavaScript in JavaScript.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

var acorn = require('acorn');
var mirror = require('./mirror');
var hostGlobal = this;

/**
 * Create a new interpreter.
 * @param {string} code Raw JavaScript text.
 * @param {Function} opt_initFunc Optional initialization function.  Used to
 *     define APIs.  When called it is passed the interpreter object and the
 *     global scope object.
 * @constructor
 */
var Interpreter = function(code, opt_initFunc, opt_mirror) {
  this.ast = acorn.parse(code);
  this.mirror = opt_mirror || new mirror.Mirror();
  // Run any user-provided initialization.

  var scope = this.mirror.globalScope;
  this.populateScope_(this.ast, scope);
  if (opt_initFunc) {
    opt_initFunc.call(this, this, scope);
  }

  this.stateStack = [{node: this.ast, scope: scope, thisExpression: scope}];
};

/**
 * Execute one step of the interpreter.
 * @return {boolean} True if a step was executed, false if no more instructions.
 */
Interpreter.prototype.step = function() {
  if (this.stateStack.length == 0) {
    return false;
  }
  var state = this.stateStack[0];
  this['step' + state.node.type]();
  return true;
};

/**
 * Execute the interpreter to program completion.
 */
Interpreter.prototype.run = function() {
  while(this.step()) {};
};

/**
 * Returns the current scope from the stateStack.
 * @return {!Object} Current scope dictionary.
 */
Interpreter.prototype.getScope = function() {
  for (var i = 0; i < this.stateStack.length; i++) {
    if (this.stateStack[i].scope) {
      return this.stateStack[i].scope;
    }
  }
  throw 'No scope found.';
};

/**
 * Create a new scope for the given node.
 * @param {!Object} node AST node (program or function).
 * @param {!Object} scope Scope dictionary to populate.
 * @private
 */
Interpreter.prototype.populateScope_ = function(node, scope) {
  if (node.type == 'VariableDeclaration') {
    for (var i = 0; i < node.declarations.length; i++) {
      this.mirror.setProperty(scope, node.declarations[i].id.name, undefined);
    }
  } else if (node.type == 'FunctionDeclaration') {
    this.mirror.setProperty(scope, node.id.name,
        this.mirror.createFunction(node, scope));
    return;  // Do not recurse into function.
  } else if (node.type == 'FunctionExpression') {
    return;  // Do not recurse into function.
  }
  var thisIterpreter = this;
  function recurse(child) {
    if (child.constructor == thisIterpreter.ast.constructor) {
      thisIterpreter.populateScope_(child, scope);
    }
  }
  for (var name in node) {
    var prop = node[name];
    if (prop && typeof prop == 'object') {
      if (typeof prop.length == 'number' && prop.splice) {
        // Prop is an array.
        for (var i = 0; i < prop.length; i++) {
          recurse(prop[i]);
        }
      } else {
        recurse(prop);
      }
    }
  }
};


// Functions to handle each node type.

Interpreter.prototype['stepArrayExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  var n = state.n || 0;
  if (!state.array) {
    state.array = this.mirror.createObject(this.ARRAY);
  } else {
    this.mirror.setProperty(state.array, n - 1, state.value);
  }
  if (node.elements[n]) {
    state.n = n + 1;
    this.stateStack.unshift({node: node.elements[n]});
  } else {
    state.array.length = state.n || 0;
    this.stateStack.shift();
    this.stateStack[0].value = state.array;
  }
};

Interpreter.prototype['stepAssignmentExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.doneLeft) {
    state.doneLeft = true;
    this.stateStack.unshift({node: node.left, components: true});
  } else if (!state.doneRight) {
    state.doneRight = true;
    state.leftSide = state.value;
    this.stateStack.unshift({node: node.right});
  } else {
    this.stateStack.shift();
    var leftSide = state.leftSide;
    var rightSide = state.value;
    var value;
    if (node.operator == '=') {
      value = rightSide;
    } else {
      var leftValue = this.mirror.getValue(this.getScope(), leftSide);
      var rightValue = rightSide;
      var leftNumber = leftValue.toNumber();
      var rightNumber = rightValue.toNumber();
      if (node.operator == '+=') {
        var left, right;
        if (leftValue.type == 'string' || rightValue.type == 'string') {
          left = leftValue.toString();
          right = rightValue.toString();
        } else {
          left = leftNumber;
          right = rightNumber;
        }
        value = left + right;
      } else if (node.operator == '-=') {
        value = leftNumber - rightNumber;
      } else if (node.operator == '*=') {
        value = leftNumber * rightNumber;
      } else if (node.operator == '/=') {
        value = leftNumber / rightNumber;
      } else if (node.operator == '%=') {
        value = leftNumber % rightNumber;
      } else if (node.operator == '<<=') {
        value = leftNumber << rightNumber;
      } else if (node.operator == '>>=') {
        value = leftNumber >> rightNumber;
      } else if (node.operator == '>>>=') {
        value = leftNumber >>> rightNumber;
      } else if (node.operator == '&=') {
        value = leftNumber & rightNumber;
      } else if (node.operator == '^=') {
        value = leftNumber ^ rightNumber;
      } else if (node.operator == '|=') {
        value = leftNumber | rightNumber;
      } else {
        throw 'Unknown assignment expression: ' + node.operator;
      }
      value = this.mirror.createPrimitive(value);
    }
    this.mirror.setValue(this.getScope(), leftSide, value);
    this.stateStack[0].value = value;
  }
};

Interpreter.prototype['stepBinaryExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.doneLeft) {
    state.doneLeft = true;
    this.stateStack.unshift({node: node.left});
  } else if (!state.doneRight) {
    state.doneRight = true;
    state.leftValue = state.value;
    this.stateStack.unshift({node: node.right});
  } else {
    this.stateStack.shift();
    var leftSide = state.leftValue;
    var rightSide = state.value;
    var value;
    var comp = this.mirror.comp(leftSide, rightSide);
    if (node.operator == '==' || node.operator == '!=') {
      value = comp === 0;
      if (node.operator == '!=') {
        value = !value;
      }
    } else if (node.operator == '===' || node.operator == '!==') {
      if (leftSide.isPrimitive && rightSide.isPrimitive) {
        value = leftSide.data === rightSide.data;
      } else {
        value = leftSide === rightSide;
      }
      if (node.operator == '!==') {
        value = !value;
      }
    } else if (node.operator == '>') {
      value = comp == 1;
    } else if (node.operator == '>=') {
      value = comp == 1 || comp === 0;
    } else if (node.operator == '<') {
      value = comp == -1;
    } else if (node.operator == '<=') {
      value = comp == -1 || comp === 0;
    } else if (node.operator == '+') {
      if (leftSide.type == 'string' || rightSide.type == 'string') {
        var leftValue = leftSide.toString();
        var rightValue = rightSide.toString();
      } else {
        var leftValue = leftSide.toNumber();
        var rightValue = rightSide.toNumber();
      }
      value = leftValue + rightValue;
    } else if (node.operator == 'in') {
      value = this.mirror.hasProperty(rightSide, leftSide);
    } else {
      var leftValue = leftSide.toNumber();
      var rightValue = rightSide.toNumber();
      if (node.operator == '-') {
        value = leftValue - rightValue;
      } else if (node.operator == '*') {
        value = leftValue * rightValue;
      } else if (node.operator == '/') {
        value = leftValue / rightValue;
      } else if (node.operator == '%') {
        value = leftValue % rightValue;
      } else if (node.operator == '&') {
        value = leftValue & rightValue;
      } else if (node.operator == '|') {
        value = leftValue | rightValue;
      } else if (node.operator == '^') {
        value = leftValue ^ rightValue;
      } else if (node.operator == '<<') {
        value = leftValue << rightValue;
      } else if (node.operator == '>>') {
        value = leftValue >> rightValue;
      } else if (node.operator == '>>>') {
        value = leftValue >>> rightValue;
      } else {
        throw 'Unknown binary operator: ' + node.operator;
      }
    }
    this.stateStack[0].value = this.mirror.createPrimitive(value);
  }
};

Interpreter.prototype['stepBreakStatement'] = function() {
  var state = this.stateStack.shift();
  var node = state.node;
  var label = null;
  if (node.label) {
    label = node.label.name;
  }
  state = this.stateStack.shift();
  while (state && state.node.type != 'callExpression') {
    if (label ? label == state.label : state.isLoop) {
      return;
    }
    state = this.stateStack.shift();
  }
  throw new SyntaxError('Illegal break statement');
};

Interpreter.prototype['stepBlockStatement'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  var n = state.n_ || 0;
  if (node.body[n]) {
    state.n_ = n + 1;
    this.stateStack.unshift({node: node.body[n]});
  } else {
    this.stateStack.shift();
  }
};

Interpreter.prototype['stepCallExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.doneCallee_) {
    state.doneCallee_ = true;
    this.stateStack.unshift({node: node.callee, components: true});
  } else {
    if (!state.func_) {
      // Determine value of the function.
      if (state.value.type == 'function') {
        state.func_ = state.value;
      } else {
        state.member_ = state.value[0];
        state.func_ = this.mirror.getValue(this.getScope(), state.value);
        if (!state.func_ || state.func_.type != 'function') {
          throw new TypeError((state.func_ && state.func_.type) +
                              ' is not a function');
        }
      }
      // Determine value of 'this' in function.
      if (state.node.type == 'NewExpression') {
        state.funcThis_ = this.mirror.createObject(state.func_);
        state.isConstructor_ = true;
      } else if (state.value.length) {
        state.funcThis_ = state.value[0];
      } else {
        state.funcThis_ =
            this.stateStack[this.stateStack.length - 1].thisExpression;
      }
      state.arguments = [];
      var n = 0;
    } else {
      var n = state.n_;
      if (state.arguments.length != node.arguments.length) {
        state.arguments[n - 1] = state.value;
      }
    }
    if (node.arguments[n]) {
      state.n_ = n + 1;
      this.stateStack.unshift({node: node.arguments[n]});
    } else if (!state.doneExec) {
      state.doneExec = true;
      if (state.func_.node &&
          (state.func_.node.type == 'FunctionApply_' ||
           state.func_.node.type == 'FunctionCall_')) {
        state.funcThis_ = state.arguments.shift();
        if (state.func_.node.type == 'FunctionApply_') {
          // Unpack all the arguments from the provided array.
          var argsList = state.arguments.shift();
          if (argsList && this.mirror.isa(argsList, this.ARRAY)) {
            state.arguments = [];
            for (var i = 0; i < argsList.length; i++) {
              state.arguments[i] = this.mirror.getProperty(argsList, i);
            }
          } else {
            state.arguments = [];
          }
        }
        state.func_ = state.member_;
      }
      if (state.func_.node) {
        var scope =
            this.mirror.createScope(state.func_.parentScope);
        this.populateScope_(state.func_.node.body);
        // Add all arguments.
        for (var i = 0; i < state.func_.node.params.length; i++) {
          var paramName = this.mirror.createPrimitive(state.func_.node.params[i].name);
          var paramValue = state.arguments.length > i ? state.arguments[i] :
              this.mirror.UNDEFINED;
          this.mirror.setProperty(scope, paramName, paramValue);
        }
        // Build arguments variable.
        var argsList = this.mirror.createObject(this.ARRAY);
        for (var i = 0; i < state.arguments.length; i++) {
          this.mirror.setProperty(argsList, this.mirror.createPrimitive(i),
                           state.arguments[i]);
        }
        this.mirror.setProperty(scope, 'arguments', argsList);
        var funcState = {
          node: state.func_.node.body,
          scope: scope,
          thisExpression: state.funcThis_
        };
        this.stateStack.unshift(funcState);
      } else if (state.func_.nativeFunc) {
        state.value = state.func_.nativeFunc.apply(state.funcThis_,
                                                   state.arguments);
      } else if (state.func_.eval) {
        var code = state.arguments[0];
        if (!code) {
          state.value = this.mirror.UNDEFINED;
        } else if (!code.isPrimitive) {
          // JS does not parse String objects:
          // eval(new String('1 + 1')) -> '1 + 1'
          state.value = code;
        } else {
          var evalInterpreter = new Interpreter(code.toString());
          evalInterpreter.stateStack[0].scope.parentScope =
              this.getScope();
          var state = {
            node: {type: 'Eval_'},
            interpreter: evalInterpreter
          };
          this.stateStack.unshift(state);
        }
      } else {
        throw new TypeError('function not a function (huh?)');
      }
    } else {
      this.stateStack.shift();
      this.stateStack[0].value = state.isConstructor_ ?
          state.funcThis_ : state.value;
    }
  }
};

Interpreter.prototype['stepConditionalExpression'] = function() {
  var state = this.stateStack[0];
  if (!state.done) {
    if (!state.test) {
      state.test = true;
      this.stateStack.unshift({node: state.node.test});
    } else {
      state.done = true;
      if (state.value.toBoolean() && state.node.consequent) {
        this.stateStack.unshift({node: state.node.consequent});
      } else if (!state.value.toBoolean() && state.node.alternate) {
        this.stateStack.unshift({node: state.node.alternate});
      }
    }
  } else {
    this.stateStack.shift();
    if (state.node.type == 'ConditionalExpression') {
      this.stateStack[0].value = state.value;
    }
  }
};

Interpreter.prototype['stepContinueStatement'] = function() {
  var node = this.stateStack[0].node;
  var label = null;
  if (node.label) {
    label = node.label.name;
  }
  var state = this.stateStack[0];
  while (state && state.node.type != 'callExpression') {
    if (state.isLoop) {
      if (!label || (label == state.label)) {
        return;
      }
    }
    this.stateStack.shift();
    state = this.stateStack[0];
  }
  throw new SyntaxError('Illegal continue statement');
};

Interpreter.prototype['stepDoWhileStatement'] = function() {
  var state = this.stateStack[0];
  state.isLoop = true;
  if (state.node.type == 'DoWhileStatement' && state.test === undefined) {
    // First iteration of do/while executes without checking test.
    state.value = this.mirror.createPrimitive(true);
    state.test = true;
  }
  if (!state.test) {
    state.test = true;
    this.stateStack.unshift({node: state.node.test});
  } else {
    state.test = false;
    if (!state.value.toBoolean()) {
      this.stateStack.shift();
    } else if (state.node.body) {
      this.stateStack.unshift({node: state.node.body});
    }
  }
};

Interpreter.prototype['stepEmptyStatement'] = function() {
  this.stateStack.shift();
};

Interpreter.prototype['stepEval_'] = function() {
  var state = this.stateStack[0];
  if (!state.interpreter.step()) {
    this.stateStack.shift();
    this.stateStack[0].value = state.interpreter.value || this.mirror.UNDEFINED;
  }
};

Interpreter.prototype['stepExpressionStatement'] = function() {
  var state = this.stateStack[0];
  if (!state.done) {
    state.done = true;
    this.stateStack.unshift({node: state.node.expression});
  } else {
    this.stateStack.shift();
    // Save this value to the interpreter for use as a return value if
    // this code is inside an eval function.
    this.value = state.value;
  }
};

Interpreter.prototype['stepForInStatement'] = function() {
  var state = this.stateStack[0];
  state.isLoop = true;
  var node = state.node;
  if (!state.doneVariable_) {
    state.doneVariable_ = true;
    var left = node.left;
    if (left.type == 'VariableDeclaration') {
      // Inline variable declaration: for (var x in y)
      left = left.declarations[0].id;
    }
    this.stateStack.unshift({node: left, components: true});
  } else if (!state.doneObject_) {
    state.doneObject_ = true;
    state.variable = state.value;
    this.stateStack.unshift({node: node.right});
  } else {
    if (typeof state.iterator == 'undefined') {
      // First iteration.
      state.object = state.value;
      state.iterator = 0;
    }
    var name = null;
    done: do {
      var i = state.iterator;
      for (var prop in state.object.properties) {
        if (prop in state.object.nonenumerable) {
          continue;
        }
        if (i == 0) {
          name = prop;
          break done;
        }
        i--;
      }
      state.object = state.object.parent &&
          state.object.parent.properties.prototype;
      state.iterator = 0;
    } while (state.object);
    state.iterator++;
    if (name === null) {
      this.stateStack.shift();
    } else {
      this.mirror.setValueToScope(this.getScope(), state.variable, this.mirror.createPrimitive(name));
      if (node.body) {
        this.stateStack.unshift({node: node.body});
      }
    }
  }
};

Interpreter.prototype['stepForStatement'] = function() {
  var state = this.stateStack[0];
  state.isLoop = true;
  var node = state.node;
  var mode = state.mode || 0;
  if (mode == 0) {
    state.mode = 1;
    if (node.init) {
      this.stateStack.unshift({node: node.init});
    }
  } else if (mode == 1) {
    state.mode = 2;
    if (node.test) {
      this.stateStack.unshift({node: node.test});
    }
  } else if (mode == 2) {
    state.mode = 3;
    if (state.value && !state.value.toBoolean()) {
      // Loop complete.  Bail out.
      this.stateStack.shift();
    } else if (node.body) {
      this.stateStack.unshift({node: node.body});
    }
  } else if (mode == 3) {
    state.mode = 1;
    if (node.update) {
      this.stateStack.unshift({node: node.update});
    }
  }
};

Interpreter.prototype['stepFunctionDeclaration'] = function() {
  this.stateStack.shift();
};

Interpreter.prototype['stepFunctionExpression'] = function() {
  var state = this.stateStack[0];
  this.stateStack.shift();
  this.stateStack[0].value = this.mirror.createFunction(state.node);
};

Interpreter.prototype['stepIdentifier'] = function() {
  var state = this.stateStack[0];
  this.stateStack.shift();
  var name = this.mirror.createPrimitive(state.node.name);
  this.stateStack[0].value =
      state.components ? name : this.mirror.getValueFromScope(this.getScope(), name);
};

Interpreter.prototype['stepIfStatement'] =
    Interpreter.prototype['stepConditionalExpression'];

Interpreter.prototype['stepLabeledStatement'] = function() {
  // No need to hit this node again on the way back up the stack.
  var state = this.stateStack.shift();
  this.stateStack.unshift({node: state.node.body,
                          label: state.node.label.name});
};

Interpreter.prototype['stepLiteral'] = function() {
  var state = this.stateStack[0];
  this.stateStack.shift();
  this.stateStack[0].value = this.mirror.createPrimitive(state.node.value);
};

Interpreter.prototype['stepLogicalExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (node.operator != '&&' && node.operator != '||') {
    throw 'Unknown logical operator: ' + node.operator;
  }
  if (!state.doneLeft_) {
    state.doneLeft_ = true;
    this.stateStack.unshift({node: node.left});
  } else if (!state.doneRight_) {
    if ((node.operator == '&&' && !state.value.toBoolean()) ||
        (node.operator == '||' && state.value.toBoolean())) {
      // Shortcut evaluation.
      this.stateStack.shift();
      this.stateStack[0].value = state.value;
    } else {
      state.doneRight_ = true;
      this.stateStack.unshift({node: node.right});
    }
  } else {
    this.stateStack.shift();
    this.stateStack[0].value = state.value;
  }
};

Interpreter.prototype['stepMemberExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.doneObject_) {
    state.doneObject_ = true;
    this.stateStack.unshift({node: node.object});
  } else if (!state.doneProperty_) {
    state.doneProperty_ = true;
    state.object = state.value;
    this.stateStack.unshift({
      node: node.property,
      components: !node.computed
    });
  } else {
    this.stateStack.shift();
    if (state.components) {
      this.stateStack[0].value = [state.object, state.value];
    } else {
      this.stateStack[0].value = this.mirror.getProperty(state.object, state.value);
    }
  }
};

Interpreter.prototype['stepNewExpression'] =
    Interpreter.prototype['stepCallExpression'];

Interpreter.prototype['stepObjectExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  var valueToggle = state.valueToggle;
  var n = state.n || 0;
  if (!state.object) {
    state.object = this.mirror.createObject(this.OBJECT);
  } else {
    if (valueToggle) {
      state.key = state.value;
    } else {
      this.mirror.setProperty(state.object, state.key, state.value);
    }
  }
  if (node.properties[n]) {
    if (valueToggle) {
      state.n = n + 1;
      this.stateStack.unshift({node: node.properties[n].value});
    } else {
      this.stateStack.unshift({node: node.properties[n].key, components: true});
    }
    state.valueToggle = !valueToggle;
  } else {
    this.stateStack.shift();
    this.stateStack[0].value = state.object;
  }
};

Interpreter.prototype['stepProgram'] =
    Interpreter.prototype['stepBlockStatement'];

Interpreter.prototype['stepReturnStatement'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (node.argument && !state.done) {
    state.done = true;
    this.stateStack.unshift({node: node.argument});
  } else {
    var value = state.value;  // Possibly undefined.
    do {
      this.stateStack.shift();
      if (this.stateStack.length == 0) {
        throw new SyntaxError('Illegal return statement');
      }
      state = this.stateStack[0];
    } while (state.node.type != 'CallExpression');
    state.value = value;
  }
};

Interpreter.prototype['stepSequenceExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  var n = state.n || 0;
  if (node.expressions[n]) {
    state.n = n + 1;
    this.stateStack.unshift({node: node.expressions[n]});
  } else {
    this.stateStack.shift();
    this.stateStack[0].value = state.value;
  }
};

Interpreter.prototype['stepThisExpression'] = function() {
  this.stateStack.shift();
  for (var i = 0; i < this.stateStack.length; i++) {
    if (this.stateStack[i].thisExpression) {
      this.stateStack[0].value = this.stateStack[i].thisExpression;
      return;
    }
  }
  throw 'No this expression found.';
};

Interpreter.prototype['stepThrowStatement'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.argument) {
    state.argument = true;
    this.stateStack.unshift({node: node.argument});
  } else {
    throw state.value.toString();
  }
};

Interpreter.prototype['stepUnaryExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.done) {
    state.done = true;
    var nextState = {node: node.argument};
    if (node.operator == 'delete') {
      nextState.components = true;
    }
    this.stateStack.unshift(nextState);
  } else {
    this.stateStack.shift();
    var value;
    if (node.operator == '-') {
      value = -state.value.toNumber();
    } else if (node.operator == '!') {
      value = !state.value.toNumber();
    } else if (node.operator == '~') {
      value = ~state.value.toNumber();
    } else if (node.operator == 'typeof') {
      value = state.value.type;
    } else if (node.operator == 'delete') {
      if (state.value.length) {
        var obj = state.value[0];
        var name = state.value[1];
      } else {
        var obj = this.getScope();
        var name = state.value;
      }
      value = this.mirror.deleteProperty(obj, name);
    } else if (node.operator == 'void') {
      value = undefined;
    } else {
      throw 'Unknown unary operator: ' + node.operator;
    }
    this.stateStack[0].value = this.mirror.createPrimitive(value);
  }
};

Interpreter.prototype['stepUpdateExpression'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (!state.done) {
    state.done = true;
    this.stateStack.unshift({node: node.argument, components: true});
  } else {
    this.stateStack.shift();
    var leftSide = state.value;
    var leftValue = this.mirror.getValue(this.getScope(), leftSide).toNumber();
    var changeValue;
    if (node.operator == '++') {
      changeValue = this.mirror.createPrimitive(leftValue + 1);
    } else if (node.operator == '--') {
      changeValue = this.mirror.createPrimitive(leftValue - 1);
    } else {
      throw 'Unknown update expression: ' + node.operator;
    }
    this.mirror.setValue(this.getScope(), leftSide, changeValue);
    var returnValue = node.prefix ? returnValue : leftValue;
    this.stateStack[0].value = this.mirror.createPrimitive(returnValue);
  }
};

Interpreter.prototype['stepVariableDeclaration'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  var n = state.n || 0;
  if (node.declarations[n]) {
    state.n = n + 1;
    this.stateStack.unshift({node: node.declarations[n]});
  } else {
    this.stateStack.shift();
  }
};

Interpreter.prototype['stepVariableDeclarator'] = function() {
  var state = this.stateStack[0];
  var node = state.node;
  if (node.init && !state.done) {
    state.done = true;
    this.stateStack.unshift({node: node.init});
  } else {
    if (!this.mirror.hasProperty(this, node.id.name) || node.init) {
      var value = node.init ? state.value : this.mirror.UNDEFINED;
      this.mirror.setValue(this.getScope(), this.mirror.createPrimitive(node.id.name), value);
    }
    this.stateStack.shift();
  }
};

Interpreter.prototype['stepWhileStatement'] =
    Interpreter.prototype['stepDoWhileStatement'];

// Preserve top-level API functions from being pruned by JS compilers.
// Add others as needed.
module.exports = Interpreter;
Interpreter.prototype['step'] = Interpreter.prototype.step;
Interpreter.prototype['run'] = Interpreter.prototype.run;