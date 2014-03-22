'use strict';

var hostGlobal = this;

var Mirror = function() {
  this.UNDEFINED = this.createPrimitive(undefined);
  this.globalScope = this.createScope(null);
  this.initGlobalScope(this.globalScope);
};

exports.Mirror = Mirror;

/**
 * Initialize the global scope with buitin properties and functions.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initGlobalScope = function(scope) {
  // Initialize uneditable global properties.
  this.setProperty(scope, 'Infinity',
                   this.createPrimitive(Infinity), true);
  this.setProperty(scope, 'NaN',
                   this.createPrimitive(NaN), true);
  this.setProperty(scope, 'undefined',
                   this.UNDEFINED, true);
  this.setProperty(scope, 'self',
                   scope, false); // Editable.

  // Initialize global objects.
  this.initFunction(scope);
  this.initObject(scope);
  // Unable to set scope's parent prior (this.OBJECT did not exist).
  scope.parent = this.OBJECT;
  this.initArray(scope);
  this.initNumber(scope);
  this.initString(scope);
  this.initBoolean(scope);
  this.initDate(scope);
  this.initMath(scope);

  // Initialize global functions.
  var thisMirror = this;
  var wrapper;
  wrapper = function(num) {
    num = num || thisMirror.UNDEFINED;
    return thisMirror.createPrimitive(isNaN(num.toNumber()));
  };
  this.setProperty(scope, 'isNaN',
                   this.createNativeFunction(wrapper));
  wrapper = function(num) {
    num = num || thisMirror.UNDEFINED;
    return thisMirror.createPrimitive(isFinite(num.toNumber()));
  };
  this.setProperty(scope, 'isFinite',
                   this.createNativeFunction(wrapper));
  wrapper = function(str) {
    str = str || thisMirror.UNDEFINED;
    return thisMirror.createPrimitive(parseFloat(str.toNumber()));
  };
  this.setProperty(scope, 'parseFloat',
                   this.createNativeFunction(wrapper));
  wrapper = function(str, radix) {
    str = str || thisMirror.UNDEFINED;
    radix = radix || thisMirror.UNDEFINED;
    return thisMirror.createPrimitive(
        parseInt(str.toString(), radix.toNumber()));
  };
  this.setProperty(scope, 'parseInt',
                   this.createNativeFunction(wrapper));

  var func = this.createObject(this.FUNCTION);
  func.eval = true;
  this.setProperty(func, 'length', this.createPrimitive(1), true);
  this.setProperty(scope, 'eval', func);

  var strFunctions = ['escape', 'unescape',
                      'decodeURI', 'decodeURIComponent',
                      'encodeURI', 'encodeURIComponent'];
  for (var i = 0; i < strFunctions.length; i++) {
    wrapper = (function(nativeFunc) {
      return function(str) {
        str = str || thisMirror.UNDEFINED;
        return thisMirror.createPrimitive(nativeFunc(str.toString()));
      };
    })(hostGlobal[strFunctions[i]]);
    this.setProperty(scope, strFunctions[i],
                     this.createNativeFunction(wrapper));
  }

};

/**
 * Initialize the Function class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initFunction = function(scope) {
  var thisMirror = this;
  var wrapper;
  // Function constructor.
  wrapper = function(var_args) {
    if (this.parent == thisMirror.FUNCTION) {
      // Called with new.
      var newFunc = this;
    } else {
      var newFunc = thisMirror.createObject(thisMirror.FUNCTION);
    }
    if (arguments.length) {
      var code = arguments[arguments.length - 1].toString();
    } else {
      var code = '';
    }
    var args = [];
    for (var i = 0; i < arguments.length - 1; i++) {
      args.push(arguments[i].toString());
    }
    args = args.join(', ');
    if (args.indexOf(')') != -1) {
      throw new SyntaxError('Function arg string contains parenthesis');
    }
    // Interestingly, the scope for constructed functions is the global scope,
    // even if they were constructed in some other scope.
    newFunc.parentScope = thisMirror.globalScope;
    var ast = acorn.parse('$ = function(' + args + ') {' + code + '};');
    newFunc.node = ast.body[0].expression.right;
    thisMirror.setProperty(newFunc, 'length',
        thisMirror.createPrimitive(newFunc.node.length), true);
    return newFunc;
  };
  this.FUNCTION = this.createObject(null);
  this.setProperty(scope, 'Function', this.FUNCTION);
  // Manually setup type and prototype becuase createObj doesn't recognize
  // this object as a function (this.FUNCTION did not exist).
  this.FUNCTION.type = 'function';
  this.setProperty(this.FUNCTION, 'prototype', this.createObject(null));
  this.FUNCTION.nativeFunc = wrapper;

  // Create stub functions for apply and call.
  // These are processed as special cases in stepCallExpression.
  var node = {
    type: 'FunctionApply_',
    params: [],
    id: null,
    body: null,
    start: 0,
    end: 0
  };
  this.setProperty(this.FUNCTION.properties.prototype, 'apply',
                   this.createFunction(node, {}), false, true);
  var node = {
    type: 'FunctionCall_',
    params: [],
    id: null,
    body: null,
    start: 0,
    end: 0
  };
  this.setProperty(this.FUNCTION.properties.prototype, 'call',
                   this.createFunction(node, {}), false, true);

  // Function has no parent to inherit from, so it needs its own mandatory
  // toString and valueOf functions.
  wrapper = function() {
    return thisMirror.createPrimitive(this.toString());
  };
  this.setProperty(this.FUNCTION.properties.prototype, 'toString',
                   this.createNativeFunction(wrapper), false, true);
  this.setProperty(this.FUNCTION, 'toString',
                   this.createNativeFunction(wrapper), false, true);
  wrapper = function() {
    return thisMirror.createPrimitive(this.valueOf());
  };
  this.setProperty(this.FUNCTION.properties.prototype, 'valueOf',
                   this.createNativeFunction(wrapper), false, true);
  this.setProperty(this.FUNCTION, 'valueOf',
                   this.createNativeFunction(wrapper), false, true);
};

/**
 * Initialize the Object class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initObject = function(scope) {
  var thisMirror = this;
  var wrapper;
  // Object constructor.
  wrapper = function(var_args) {
    if (this.parent == thisMirror.OBJECT) {
      // Called with new.
      var newObj = this;
    } else {
      var newObj = thisMirror.createObject(thisMirror.OBJECT);
    }
    return newObj;
  };
  this.OBJECT = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'Object', this.OBJECT);

  wrapper = function() {
    return thisMirror.createPrimitive(this.toString());
  };
  this.setProperty(this.OBJECT.properties.prototype, 'toString',
                   this.createNativeFunction(wrapper), false, true);
  wrapper = function() {
    return thisMirror.createPrimitive(this.valueOf());
  };
  this.setProperty(this.OBJECT.properties.prototype, 'valueOf',
                   this.createNativeFunction(wrapper), false, true);
};

/**
 * Initialize the Array class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initArray = function(scope) {
  var thisMirror = this;
  var getInt = function(obj, def) {
    // Return an integer, or the default.
    var n = obj ? Math.floor(obj.toNumber()) : def;
    if (isNaN(n)) {
      n = def;
    }
    return n;
  };
  var wrapper;
  // Array constructor.
  wrapper = function(var_args) {
    if (this.parent == thisMirror.ARRAY) {
      // Called with new.
      var newArray = this;
    } else {
      var newArray = thisMirror.createObject(thisMirror.ARRAY);
    }
    var first = arguments[0];
    if (first && first.type == 'number') {
      if (isNaN(thisMirror.arrayIndex(first))) {
        throw new RangeError('Invalid array length');
      }
      newArray.length = first.data;
    } else {
      for (var i = 0; i < arguments.length; i++) {
        newArray.properties[i] = arguments[i];
      }
      newArray.length = i;
    }
    return newArray;
  };
  this.ARRAY = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'Array', this.ARRAY);

  wrapper = function() {
    if (this.length) {
      var value = this.properties[this.length - 1];
      delete this.properties[this.length - 1];
      this.length--;
    } else {
      var value = thisMirror.UNDEFINED;
    }
    return value;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'pop',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(var_args) {
    for (var i = 0; i < arguments.length; i++) {
      this.properties[this.length] = arguments[i];
      this.length++;
    }
    return thisMirror.createPrimitive(this.length);
  };
  this.setProperty(this.ARRAY.properties.prototype, 'push',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function() {
    if (this.length) {
      var value = this.properties[0];
      for (var i = 1; i < this.length; i++) {
        this.properties[i - 1] = this.properties[i];
      }
      this.length--;
      delete this.properties[this.length];
    } else {
      var value = thisMirror.UNDEFINED;
    }
    return value;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'shift',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(var_args) {
    for (var i = this.length - 1; i >= 0; i--) {
      this.properties[i + arguments.length] = this.properties[i];
    }
    this.length += arguments.length;
    for (var i = 0; i < arguments.length; i++) {
      this.properties[i] = arguments[i];
    }
    return thisMirror.createPrimitive(this.length);
  };
  this.setProperty(this.ARRAY.properties.prototype, 'unshift',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function() {
    for (var i = 0; i < this.length / 2; i++) {
      var tmp = this.properties[this.length - i - 1]
      this.properties[this.length - i - 1] = this.properties[i];
      this.properties[i] = tmp;
    }
    return thisMirror.UNDEFINED;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'reverse',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(index, howmany, var_args) {
    index = getInt(index, 0);
    if (index < 0) {
      index = Math.max(this.length + index, 0);
    } else {
      index = Math.min(index, this.length);
    }
    howmany = getInt(howmany, Infinity);
    howmany = Math.min(howmany, this.length - index);
    var removed = thisMirror.createObject(thisMirror.ARRAY);
    // Remove specified elements.
    for (var i = index; i < index + howmany; i++) {
      removed.properties[removed.length++] = this.properties[i];
      this.properties[i] = this.properties[i + howmany];
    }
    for (var i = index + howmany; i < this.length; i++) {
      delete this.properties[i];
    }
    this.length -= howmany;
    // Insert specified items.
    for (var i = this.length - 1; i >= index; i--) {
      this.properties[i + arguments.length - 2] = this.properties[i];
    }
    this.length += arguments.length - 2;
    for (var i = 2; i < arguments.length; i++) {
      this.properties[index + i - 2] = arguments[i];
    }
    return removed;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'splice',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(opt_begin, opt_end) {
    var list = thisMirror.createObject(thisMirror.ARRAY);
    var begin = getInt(opt_begin, 0);
    if (begin < 0) {
      begin = this.length + begin;
    }
    begin = Math.max(0, Math.min(begin, this.length));
    var end = getInt(opt_end, this.length);
    if (end < 0) {
      end = this.length + end;
    }
    end = Math.max(0, Math.min(end, this.length));
    var length = 0;
    for (var i = begin; i < end; i++) {
      var element = thisMirror.getProperty(this, i);
      thisMirror.setProperty(list, length++, element);
    }
    return list;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'slice',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(opt_separator) {
    if (!opt_separator || opt_separator.data === undefined) {
      var sep = undefined;
    } else {
      var sep = opt_separator.toString();
    }
    var text = [];
    for (var i = 0; i < this.length; i++) {
      text[i] = this.properties[i];
    }
    return thisMirror.createPrimitive(text.join(sep));
  };
  this.setProperty(this.ARRAY.properties.prototype, 'join',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(var_args) {
    var list = thisMirror.createObject(thisMirror.ARRAY);
    var length = 0;
    // Start by copying the current array.
    for (var i = 0; i < this.length; i++) {
      var element = thisMirror.getProperty(this, i);
      thisMirror.setProperty(list, length++, element);
    }
    // Loop through all arguments and copy them in.
    for (var i = 0; i < arguments.length; i++) {
      var value = arguments[i];
      if (thisMirror.isa(value, thisMirror.ARRAY)) {
        for (var j = 0; j < value.length; j++) {
          var element = thisMirror.getProperty(value, j);
          thisMirror.setProperty(list, length++, element);
        }
      } else {
        thisMirror.setProperty(list, length++, value);
      }
    }
    return list;
  };
  this.setProperty(this.ARRAY.properties.prototype, 'concat',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(searchElement, opt_fromIndex) {
    searchElement = searchElement || thisMirror.UNDEFINED;
    var fromIndex = getInt(opt_fromIndex, 0);
    if (fromIndex < 0) {
      fromIndex = this.length + fromIndex;
    }
    fromIndex = Math.max(0, Math.min(fromIndex, this.length));
    for (var i = fromIndex; i < this.length; i++) {
      var element = thisMirror.getProperty(this, i);
      if (thisMirror.comp(element, searchElement) == 0) {
        return thisMirror.createPrimitive(i);
      }
    }
    return thisMirror.createPrimitive(-1);
  };
  this.setProperty(this.ARRAY.properties.prototype, 'indexOf',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(searchElement, opt_fromIndex) {
    searchElement = searchElement || thisMirror.UNDEFINED;
    var fromIndex = getInt(opt_fromIndex, this.length);
    if (fromIndex < 0) {
      fromIndex = this.length + fromIndex;
    }
    fromIndex = Math.max(0, Math.min(fromIndex, this.length));
    for (var i = fromIndex; i >= 0; i--) {
      var element = thisMirror.getProperty(this, i);
      if (thisMirror.comp(element, searchElement) == 0) {
        return thisMirror.createPrimitive(i);
      }
    }
    return thisMirror.createPrimitive(-1);
  };
  this.setProperty(this.ARRAY.properties.prototype, 'lastIndexOf',
                   this.createNativeFunction(wrapper), false, true);
};

/**
 * Initialize the Number class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initNumber = function(scope) {
  var thisMirror = this;
  var wrapper;
  // Number constructor.
  wrapper = function(value) {
    value = value ? value.toNumber() : 0;
    if (this.parent == thisMirror.NUMBER) {
      this.toBoolean = function() {return !!value;};
      this.toNumber = function() {return value;};
      this.toString = function() {return String(value);};
      return undefined;
    } else {
      return thisMirror.createPrimitive(value);
    }
  };
  this.NUMBER = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'Number', this.NUMBER);

  var numConsts = ['MAX_VALUE', 'MIN_VALUE', 'NaN', 'NEGATIVE_INFINITY',
                   'POSITIVE_INFINITY'];
  for (var i = 0; i < numConsts.length; i++) {
    this.setProperty(this.NUMBER, numConsts[i],
                     this.createPrimitive(Number[numConsts[i]]));
  }

  wrapper = function(fractionDigits) {
    fractionDigits = fractionDigits ? fractionDigits.toNumber() : undefined;
    var n = this.toNumber();
    return thisMirror.createPrimitive(n.toExponential(fractionDigits));
  };
  this.setProperty(this.NUMBER.properties.prototype, 'toExponential',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(digits) {
    digits = digits ? digits.toNumber() : undefined;
    var n = this.toNumber();
    return thisMirror.createPrimitive(n.toFixed(digits));
  };
  this.setProperty(this.NUMBER.properties.prototype, 'toFixed',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(precision) {
    precision = precision ? precision.toNumber() : undefined;
    var n = this.toNumber();
    return thisMirror.createPrimitive(n.toPrecision(precision));
  };
  this.setProperty(this.NUMBER.properties.prototype, 'toPrecision',
                   this.createNativeFunction(wrapper), false, true);
};

/**
 * Initialize the String class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initString = function(scope) {
  var thisMirror = this;
  var wrapper;
  // String constructor.
  wrapper = function(value) {
    value = (value || thisMirror.UNDEFINED).toString();
    if (this.parent == thisMirror.STRING) {
      this.toBoolean = function() {return !!value;};
      this.toNumber = function() {return Number(value);};
      this.toString = function() {return value;};
      this.valueOf = function() {return value;};
      this.data = value;
      return undefined;
    } else {
      return thisMirror.createPrimitive(value);
    }
  };
  this.STRING = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'String', this.STRING);

  var functions = ['toLowerCase', 'toUpperCase',
                   'toLocaleLowerCase', 'toLocaleUpperCase'];
  for (var i = 0; i < functions.length; i++) {
    var wrapper = (function(nativeFunc) {
      return function() {
        return thisMirror.createPrimitive(nativeFunc.apply(this));
      };
    })(String.prototype[functions[i]]);
    this.setProperty(this.STRING.properties.prototype, functions[i],
                     this.createNativeFunction(wrapper), false, true);
  }

  // Trim function may not exist in host browser.  Write them from scratch.
  wrapper = function() {
    var str = this.toString();
    return thisMirror.createPrimitive(str.replace(/^\s+|\s+$/g, ''));
  };
  this.setProperty(this.STRING.properties.prototype, 'trim',
                   this.createNativeFunction(wrapper), false, true);
  wrapper = function() {
    var str = this.toString();
    return thisMirror.createPrimitive(str.replace(/^\s+/g, ''));
  };
  this.setProperty(this.STRING.properties.prototype, 'trimLeft',
                   this.createNativeFunction(wrapper), false, true);
  wrapper = function() {
    var str = this.toString();
    return thisMirror.createPrimitive(str.replace(/\s+$/g, ''));
  };
  this.setProperty(this.STRING.properties.prototype, 'trimRight',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(num) {
    var str = this.toString();
    num = (num || thisMirror.UNDEFINED).toNumber();
    return thisMirror.createPrimitive(str.charAt(num));
  };
  this.setProperty(this.STRING.properties.prototype, 'charAt',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(num) {
    var str = this.toString();
    num = (num || thisMirror.UNDEFINED).toNumber();
    return thisMirror.createPrimitive(str.charCodeAt(num));
  };
  this.setProperty(this.STRING.properties.prototype, 'charCodeAt',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(searchValue, fromIndex) {
    var str = this.toString();
    searchValue = (searchValue || thisMirror.UNDEFINED).toString();
    fromIndex = fromIndex ? fromIndex.toNumber() : undefined;
    return thisMirror.createPrimitive(
        str.indexOf(searchValue, fromIndex));
  };
  this.setProperty(this.STRING.properties.prototype, 'indexOf',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(searchValue, fromIndex) {
    var str = this.toString();
    searchValue = (searchValue || thisMirror.UNDEFINED).toString();
    fromIndex = fromIndex ? fromIndex.toNumber() : undefined;
    return thisMirror.createPrimitive(
        str.lastIndexOf(searchValue, fromIndex));
  };
  this.setProperty(this.STRING.properties.prototype, 'lastIndexOf',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(separator, limit) {
    var str = this.toString();
    separator = separator ? separator.toString() : undefined;
    limit = limit ? limit.toNumber() : undefined;
    var jsList = str.split(separator, limit);
    var pseudoList = thisMirror.createObject(thisMirror.ARRAY);
    for (var i = 0; i < jsList.length; i++) {
      thisMirror.setProperty(pseudoList, i,
          thisMirror.createPrimitive(jsList[i]));
    }
    return pseudoList;
  };
  this.setProperty(this.STRING.properties.prototype, 'split',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(indexA, indexB) {
    var str = this.toString();
    indexA = indexA ? indexA.toNumber() : undefined;
    indexB = indexB ? indexB.toNumber() : undefined;
    return thisMirror.createPrimitive(str.substring(indexA, indexB));
  };
  this.setProperty(this.STRING.properties.prototype, 'substring',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(start, length) {
    var str = this.toString();
    start = start ? start.toNumber() : undefined;
    length = length ? length.toNumber() : undefined;
    return thisMirror.createPrimitive(str.substr(start, length));
  };
  this.setProperty(this.STRING.properties.prototype, 'substr',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(var_args) {
    var str = this.toString();
    for (var i = 0; i < arguments.length; i++) {
      str += arguments[i].toString();
    }
    return thisMirror.createPrimitive(str);
  };
  this.setProperty(this.STRING.properties.prototype, 'concat',
                   this.createNativeFunction(wrapper), false, true);
};

/**
 * Initialize the Boolean class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initBoolean = function(scope) {
  var thisMirror = this;
  var wrapper;
  // Boolean constructor.
  wrapper = function(value) {
    value = value ? value.toBoolean() : false;
    if (this.parent == thisMirror.STRING) {
      this.toBoolean = function() {return value;};
      this.toNumber = function() {return Number(value);};
      this.toString = function() {return String(value);};
      this.valueOf = function() {return value;};
      return undefined;
    } else {
      return thisMirror.createPrimitive(value);
    }
  };
  this.BOOLEAN = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'Boolean', this.BOOLEAN);
};

/**
 * Initialize the Date class.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initDate = function(scope) {
  var thisMirror = this;
  var wrapper;
  // Date constructor.
  wrapper = function(a, b, c, d, e, f, h) {
    if (this.parent == thisMirror.DATE) {
      var newDate = this;
    } else {
      var newDate = thisMirror.createObject(thisMirror.DATE);
    }
    var dateString = a;
    if (!arguments.length) {
      newDate.date = new Date();
    } else if (arguments.length == 1 && (dateString.type == 'string' ||
        thisMirror.isa(dateString, thisMirror.STRING))) {
      newDate.date = new Date(dateString.toString());
    } else {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
        args[i] = arguments[i] ? arguments[i].toNumber() : undefined
      }
      // Sadly there is no way to use 'apply' on a constructor.
      if (args.length == 1) {
        newDate.date = new Date(args[0]);
      } else if (args.length == 2) {
        newDate.date = new Date(args[0], args[1]);
      } else if (args.length == 3) {
        newDate.date = new Date(args[0], args[1], args[2]);
      } else if (args.length == 4) {
        newDate.date = new Date(args[0], args[1], args[2], args[3]);
      } else if (args.length == 5) {
        newDate.date = new Date(args[0], args[1], args[2], args[3], args[4]);
      } else if (args.length == 7) {
        newDate.date = new Date(args[0], args[1], args[2], args[3], args[4],
                                args[5]);
      } else {
        newDate.date = new Date(args[0], args[1], args[2], args[3], args[4],
                                args[5], args[6]);
      }
    }
    newDate.toString = function() {return String(this.date);};
    newDate.toNumber = function() {return Number(this.date);};
    newDate.valueOf = function() {return this.date.valueOf();};
    return newDate;
  };
  this.DATE = this.createNativeFunction(wrapper);
  this.setProperty(scope, 'Date', this.DATE);

  // Static methods on Date.
  wrapper = function() {
    return thisMirror.createPrimitive(new Date().getTime());
  };
  this.setProperty(this.DATE, 'now',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(dateString) {
    dateString = dateString ? dateString.toString() : undefined;
    return thisMirror.createPrimitive(Date.parse(dateString));
  };
  this.setProperty(this.DATE, 'parse',
                   this.createNativeFunction(wrapper), false, true);

  wrapper = function(a, b, c, d, e, f, h) {
    var args = [];
    for (var i = 0; i < arguments.length; i++) {
      args[i] = arguments[i] ? arguments[i].toNumber() : undefined;
    }
    return thisMirror.createPrimitive(Date.UTC.apply(Date, args));
  };
  this.setProperty(this.DATE, 'UTC',
                   this.createNativeFunction(wrapper), false, true);

  // Getter methods.
  var getFunctions = ['getDate', 'getDay', 'getFullYear', 'getHours',
      'getMilliseconds', 'getMinutes', 'getMonth', 'getSeconds', 'getTime',
      'getTimezoneOffset', 'getUTCDate', 'getUTCDay', 'getUTCFullYear',
      'getUTCHours', 'getUTCMilliseconds', 'getUTCMinutes', 'getUTCMonth',
      'getUTCSeconds', 'getYear'];
  for (var i = 0; i < getFunctions.length; i++) {
    wrapper = (function(nativeFunc) {
      return function() {
        return thisMirror.createPrimitive(this.date[nativeFunc]());
      };
    })(getFunctions[i]);
    this.setProperty(this.DATE.properties.prototype, getFunctions[i],
                     this.createNativeFunction(wrapper), false, true);
  }

  // Setter methods.
  var setFunctions = ['setDate', 'setFullYear', 'setHours', 'setMilliseconds',
      'setMinutes', 'setMonth', 'setSeconds', 'setTime', 'setUTCDate',
      'setUTCFullYear', 'setUTCHours', 'setUTCMilliseconds', 'setUTCMinutes',
      'setUTCMonth', 'setUTCSeconds', 'setYear'];
  for (var i = 0; i < setFunctions.length; i++) {
    wrapper = (function(nativeFunc) {
      return function(var_args) {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          args[i] = arguments[i] ? arguments[i].toNumber() : undefined;
        }
        return thisMirror.createPrimitive(
            this.date[nativeFunc].apply(this.date, args));
      };
    })(setFunctions[i]);
    this.setProperty(this.DATE.properties.prototype, setFunctions[i],
                     this.createNativeFunction(wrapper), false, true);
  }

  // Conversion getter methods.
  var getFunctions = ['toDateString', 'toISOString', 'toGMTString',
      'toLocaleDateString', 'toLocaleString', 'toLocaleTimeString',
      'toTimeString', 'toUTCString'];
  for (var i = 0; i < getFunctions.length; i++) {
    wrapper = (function(nativeFunc) {
      return function() {
        return thisMirror.createPrimitive(this.date[nativeFunc]());
      };
    })(getFunctions[i]);
    this.setProperty(this.DATE.properties.prototype, getFunctions[i],
                     this.createNativeFunction(wrapper), false, true);
  }
};

/**
 * Initialize Math object.
 * @param {!Object} scope Global scope.
 */
Mirror.prototype.initMath = function(scope) {
  var thisMirror = this;
  var myMath = this.createObject(this.OBJECT);
  this.setProperty(scope, 'Math', myMath);
  var mathConsts = ['E', 'LN2', 'LN10', 'LOG2E', 'LOG10E', 'PI',
                    'SQRT1_2', 'SQRT2'];
  for (var i = 0; i < mathConsts.length; i++) {
    this.setProperty(myMath, mathConsts[i],
                     this.createPrimitive(Math[mathConsts[i]]));
  }
  var numFunctions = ['abs', 'acos', 'asin', 'atan', 'atan2', 'ceil', 'cos',
                      'exp', 'floor', 'log', 'max', 'min', 'pow', 'random',
                      'round', 'sin', 'sqrt', 'tan'];
  for (var i = 0; i < numFunctions.length; i++) {
    var wrapper = (function(nativeFunc) {
      return function() {
        for (var j = 0; j < arguments.length; j++) {
          arguments[j] = arguments[j].toNumber();
        }
        return thisMirror.createPrimitive(
            nativeFunc.apply(Math, arguments));
      };
    })(Math[numFunctions[i]]);
    this.setProperty(myMath, numFunctions[i],
                     this.createNativeFunction(wrapper));
  }
};

/**
 * Is an object of a certain class?
 * @param {Object} child Object to check.
 * @param {!Object} parent Class of object.
 * @return {boolean} True if object is the class or inherits from it.
 *     False otherwise.
 */
Mirror.prototype.isa = function(child, parent) {
  if (!child || !parent) {
    return false;
  } else if (child.parent == parent) {
    return true;
  } else if (!child.parent || !child.parent.prototype) {
    return false;
  }
  return this.isa(child.parent.prototype, parent);
};

/**
 * Compares two objects against each other.
 * @param {!Object} a First object.
 * @param {!Object} b Second object.
 * @return {number} -1 if a is smaller, 0 if a == b, 1 if a is bigger,
 *     NaN if they are not comparible.
 */
Mirror.prototype.comp = function(a, b) {
  if (a.isPrimitive && typeof a == 'number' && isNaN(a.data) ||
      b.isPrimitive && typeof b == 'number' && isNaN(b.data)) {
    return NaN;
  }
  if (a.isPrimitive && b.isPrimitive) {
    a = a.data;
    b = b.data;
  } else {
    // TODO: Handle other types.
    return NaN;
  }
  if (a < b) {
    return -1;
  } else if (a > b) {
    return 1;
  }
  return 0;
};

/**
 * Is a value a legal integer for an array?
 * @param {*} n Value to check.
 * @return {number} Zero, or a positive integer if the value can be
 *     converted to such.  NaN otherwise.
 */
Mirror.prototype.arrayIndex = function(n) {
  n = Number(n);
  if (!isFinite(n) || n != Math.floor(n) || n < 0) {
    return NaN;
  }
  return n;
};

/**
 * Create a new data object for a primitive.
 * @param {undefined|null|boolean|number|string} data Data to encapsulate.
 * @return {!Object} New data object.
 */
Mirror.prototype.createPrimitive = function(data) {
  var type = typeof data;
  var obj = {
    data: data,
    isPrimitive: true,
    type: type,
    toBoolean: function() {return Boolean(this.data);},
    toNumber: function() {return Number(this.data);},
    toString: function() {return String(this.data);},
    valueOf: function() {return this.data;}
  };
  if (type == 'number') {
    obj.parent = this.NUMBER;
  } else if (type == 'string') {
    obj.parent = this.STRING;
  } else if (type == 'boolean') {
    obj.parent = this.BOOLEAN;
  }
  return obj;
};

/**
 * Create a new data object.
 * @param {Object} parent Parent constructor function.
 * @return {!Object} New data object.
 */
Mirror.prototype.createObject = function(parent) {
  var obj = {
    isPrimitive: false,
    type: 'object',
    parent: parent,
    fixed: Object.create(null),
    nonenumerable: Object.create(null),
    properties: Object.create(null),
    toBoolean: function() {return true;},
    toNumber: function() {return 0;},
    toString: function() {return '[' + this.type + ']';},
    valueOf: function() {return this;}
  };
  // Functions have prototype objects.
  if (this.isa(obj, this.FUNCTION)) {
    obj.type = 'function';
    this.setProperty(obj, 'prototype', this.createObject(this.OBJECT || null));
  };
  // Arrays have length.
  if (this.isa(obj, this.ARRAY)) {
    obj.length = 0;
    obj.toString = function() {
      var strs = [];
      for (var i = 0; i < this.length; i++) {
        strs[i] = this.properties[i].toString();
      }
      return strs.join(',');
    };
  };

  return obj;
};

/**
 * Create a new function.
 * @param {Object} node AST node defining the function.
 * @param {Object} opt_scope Optional parent scope.
 * @return {!Object} New function.
 */
Mirror.prototype.createFunction = function(node, opt_scope) {
  var func = this.createObject(this.FUNCTION);
  func.parentScope = opt_scope || this.getScope();
  func.node = node;
  this.setProperty(func, 'length',
                   this.createPrimitive(func.node.params.length), true);
  return func;
};

/**
 * Create a new native function.
 * @param {!Function} nativeFunc JavaScript function.
 * @return {!Object} New function.
 */
Mirror.prototype.createNativeFunction = function(nativeFunc) {
  var func = this.createObject(this.FUNCTION);
  func.nativeFunc = nativeFunc;
  this.setProperty(func, 'length',
                   this.createPrimitive(nativeFunc.length), true);
  return func;
};

/**
 * Fetch a property value from a data object.
 * @param {!Object} obj Data object.
 * @param {*} name Name of property.
 * @return {!Object} Property value (may be UNDEFINED).
 */
Mirror.prototype.getProperty = function(obj, name) {
  name = name.toString();
  // Special cases for magic length property.
  if (this.isa(obj, this.STRING)) {
    if (name == 'length') {
      return this.createPrimitive(obj.data.length);
    }
    var n = this.arrayIndex(name);
    if (!isNaN(n) && n < obj.data.length) {
      return this.createPrimitive(obj.data[n]);
    }
  } else if (this.isa(obj, this.ARRAY) && name == 'length') {
    return this.createPrimitive(obj.length);
  }
  while (true) {
    if (obj.properties && name in obj.properties) {
      return obj.properties[name];
    }
    if (obj.parent && obj.parent.properties &&
        obj.parent.properties.prototype) {
      obj = obj.parent.properties.prototype;
    } else {
      // No parent, reached the top.
      break;
    }
  }
  return this.UNDEFINED;
};

/**
 * Does the named property exist on a data object.
 * @param {!Object} obj Data object.
 * @param {*} name Name of property.
 * @return {boolean} True if property exists.
 */
Mirror.prototype.hasProperty = function(obj, name) {
  name = name.toString();
  if (obj.isPrimitive) {
    throw new TypeError('Primitive data type has no properties');
  }
  if (name == 'length' &&
      (this.isa(obj, this.STRING) || this.isa(obj, this.ARRAY))) {
    return true;
  }
  if (this.isa(obj, this.STRING)) {
    var n = this.arrayIndex(name);
    if (!isNaN(n) && n < obj.data.length) {
      return true;
    }
  }
  while (true) {
    if (obj.properties && name in obj.properties) {
      return true;
    }
    if (obj.parent && obj.parent.properties &&
        obj.parent.properties.prototype) {
      obj = obj.parent.properties.prototype;
    } else {
      // No parent, reached the top.
      break;
    }
  }
  return false;
};

/**
 * Set a property value on a data object.
 * @param {!Object} obj Data object.
 * @param {*} name Name of property.
 * @param {*} value New property value.
 * @param {boolean} opt_fixed Unchangable property if true.
 * @param {boolean} opt_nonenum Non-enumerable property if true.
 */
Mirror.prototype.setProperty = function(obj, name, value,
                                             opt_fixed, opt_nonenum) {
  name = name.toString();
  if (obj.isPrimitive || obj.fixed[name]) {
    return;
  }
  if (this.isa(obj, this.STRING)) {
    var n = this.arrayIndex(name);
    if (name == 'length' || (!isNaN(n) && n < obj.data.length)) {
      // Can't set length or letters on Strings.
      return;
    }
  }
  if (this.isa(obj, this.ARRAY)) {
    // Arrays have a magic length variable that is bound to the elements.
    var i;
    if (name == 'length') {
      // Delete elements if length is smaller.
      var newLength = this.arrayIndex(value.toNumber());
      if (isNaN(newLength)) {
        throw new RangeError('Invalid array length');
      }
      if (newLength < obj.length) {
        for (i in obj.properties) {
          i = this.arrayIndex(i);
          if (!isNaN(i) && newLength <= i) {
            delete obj.properties[i];
          }
        }
      }
      obj.length = newLength;
      return;  // Don't set a real length property.
    } else if (!isNaN(i = this.arrayIndex(name))) {
      // Increase length if this index is larger.
      obj.length = Math.max(obj.length, i + 1);
    }
  }
  // Set the property.
  obj.properties[name] = value;
  if (opt_fixed) {
    obj.fixed[name] = true;
  }
  if (opt_nonenum) {
    obj.nonenumerable[name] = true;
  }
};

/**
 * Delete a property value on a data object.
 * @param {!Object} obj Data object.
 * @param {*} name Name of property.
 */
Mirror.prototype.deleteProperty = function(obj, name) {
  name = name.toString();
  if (obj.isPrimitive || obj.fixed[name]) {
    return false;
  }
  if (name == 'length' && this.isa(obj, this.ARRAY)) {
    return false;
  }
  return delete obj.properties[name];
};

/**
 * Create a new scope dictionary.
 * @param {!Object} node AST node defining the scope container
 *     (e.g. a function).
 * @param {Object} parentScope Scope to link to.
 * @return {!Object} New scope.
 */
Mirror.prototype.createScope = function(parentScope) {
  var scope = this.createObject(null);
  scope.parentScope = parentScope;
  return scope;
};

/**
 * Retrieves a value from the scope chain.
 * @param {!Object} name Name of variable.
 * @throws {string} Error if identifier does not exist.
 */
Mirror.prototype.getValueFromScope = function(scope, name) {
  var nameStr = name.toString();
  while (scope) {
    if (this.hasProperty(scope, nameStr)) {
      return this.getProperty(scope, nameStr);
    }
    scope = scope.parentScope;
  }
  throw 'Unknown identifier: ' + nameStr;
};

/**
 * Sets a value to the current scope.
 * @param {!Object} name Name of variable.
 * @param {*} value Value.
 */
Mirror.prototype.setValueToScope = function(scope, name, value) {
  var nameStr = name.toString();
  while (scope) {
    if (this.hasProperty(scope, nameStr)) {
      return this.setProperty(scope, nameStr, value);
    }
    scope = scope.parentScope;
  }
  throw 'Unknown identifier: ' + nameStr;
};

/**
 * Gets a value from the scope chain or from an object property.
 * @param {!Object|!Array} left Name of variable or object/propname tuple.
 * @return {!Object} Value.
 */
Mirror.prototype.getValue = function(scope, left) {
  if (left.length) {
    var obj = left[0];
    var prop = left[1];
    return this.getProperty(obj, prop);
  } else {
    return this.getValueFromScope(scope, left);
  }
};

/**
 * Sets a value to the scope chain or to an object property.
 * @param {!Object|!Array} left Name of variable or object/propname tuple.
 * @param {!Object} value Value.
 */
Mirror.prototype.setValue = function(scope, left, value) {
  if (left.length) {
    var obj = left[0];
    var prop = left[1];
    this.setProperty(obj, prop, value);
  } else {
    this.setValueToScope(scope, left, value);
  }
};