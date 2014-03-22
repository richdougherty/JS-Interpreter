'use strict';

var Interpreter = require('../lib/interpreter.js');

/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/

exports['awesome'] = {
  setUp: function(done) {
    // setup here
    done();
  },
  'run integer expression': function(test) {
    var reflGlobal;
    var interp = new Interpreter('var x = 1;', function(interp, scope) {
      reflGlobal = scope;
    });
    interp.run();
    var reflx = interp.mirror.getProperty(reflGlobal, "x");
    var refl1 = interp.mirror.createPrimitive(1);
    var comp = interp.mirror.comp(reflx, refl1);
    test.equal(comp, 0);
    test.done();
  }
};
