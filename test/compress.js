var path = require('path');
var assert = require('assert');
var csso = require('../lib');
var parse = csso.syntax.parse;
var walk = csso.syntax.walk;
var generate = csso.syntax.generate;
var compress = csso.compress;
var tests = require('./fixture/compress');

function normalize(str) {
    return (str || '').replace(/\n|\r\n?|\f/g, '\n');
}

function createCompressTest(name, test) {
    var testFn = function() {
        var compressed = csso.minify(test.source, test.options);

        assert.equal(normalize(compressed.css), normalize(test.compressed), 'compress by minify()');

        var ast = parse(test.source);
        var compressedAst = compress(ast, test.options).ast;
        var css = generate(compressedAst);

        assert.equal(normalize(css), normalize(test.compressed), 'compress step by step');
    };

    if (path.basename(name)[0] === '_') {
        it.skip(name, testFn);
    } else {
        it(name, testFn);
    }
};

describe('compress', function() {
    for (var name in tests) {
        createCompressTest(name, tests[name]);
    }

    it('should remove white spaces in transformed AST', function() {
        var WHITESPACE = {
            type: 'WhiteSpace',
            loc: null,
            value: ' '
        };
        var ast = parse(
            '.a { border: 1px solid red; display: block } .b { color: red }' +
            '@media all { .a { border: 1px solid red; display: block } .b { color: red } }'
        );

        // add white spaces
        walk(ast, function(node) {
            // don't touch some lists
            if (node.type === 'SelectorList' ||
                node.type === 'MediaQueryList') {
                return;
            }

            // insert white spaces in the beginning, in the ending and between items
            if (node.children) {
                node.children.each(function(node, item, list) {
                    list.insertData(WHITESPACE, item);
                });
                node.children.appendData(WHITESPACE);
            }
        });

        assert.equal(
            generate(compress(ast).ast),
            '.a{border:1px solid red;display:block}.b{color:red}@media all{.a{border:1px solid red;display:block}.b{color:red}}'
        );
    });

    describe('should return the same ast as input by default', function() {
        it('compress stylesheet', function() {
            var ast = parse('.test{color:red}');
            var resultAst = compress(ast).ast;

            assert(ast === resultAst);
        });

        it('compress block', function() {
            var ast = parse('color:#ff0000;width:1px', { context: 'declarationList' });
            var resultAst = compress(ast).ast;

            assert(ast === resultAst);
            assert.equal(generate(ast), 'color:red;width:1px');
        });
    });

    describe('csso.minifyBlock()', function() {
        it('should compress block', function() {
            var compressed = csso.minifyBlock('color: rgba(255, 0, 0, 1); width: 0px; color: #ff0000');

            assert.equal(compressed.css, 'width:0;color:red');
        });

        it('should not affect options', function() {
            var options = { foo: 1 };

            csso.minifyBlock('', options);

            assert.deepEqual(options, { foo: 1 });
        });
    });

    describe('restructure option', function() {
        var css = '.a{color:red}.b{color:red}';

        it('should apply `restructure` option', function() {
            assert.equal(csso.minify(css, { restructure: false }).css, css);
            assert.equal(csso.minify(css, { restructure: true }).css, '.a,.b{color:red}');
        });

        it('`restructuring` is alias for `restructure`', function() {
            assert.equal(csso.minify(css, { restructuring: false }).css, css);
            assert.equal(csso.minify(css, { restructuring: true }).css, '.a,.b{color:red}');
        });

        it('`restructure` option should has higher priority', function() {
            assert.equal(csso.minify(css, { restructure: false, restructuring: true }).css, css);
            assert.equal(csso.minify(css, { restructure: true, restructuring: false }).css, '.a,.b{color:red}');
        });

        it('should restructure by default', function() {
            assert.equal(csso.minify(css).css, '.a,.b{color:red}');
        });
    });

    describe('comments option', function() {
        var css = '/*! first *//*! second *//*! third */';
        var all = '/*! first */\n/*! second */\n/*! third */';

        it('shouldn\'t remove exclamation comments by default', function() {
            assert.equal(csso.minify(css).css, all);
        });

        it('shouldn\'t remove exclamation comments when comments is true', function() {
            assert.equal(csso.minify(css, { comments: true }).css, all);
        });

        it('shouldn\'t remove exclamation comments when comments is "exclamation"', function() {
            assert.equal(csso.minify(css, { comments: 'exclamation' }).css, all);
        });

        it('should remove every exclamation comment when comments is false', function() {
            assert.equal(csso.minify(css, { comments: false }).css, '');
        });

        it('should remove every exclamation comment when comments is "none"', function() {
            assert.equal(csso.minify(css, { comments: 'none' }).css, '');
        });

        it('should remove every exclamation comment when comments has wrong value', function() {
            assert.equal(csso.minify(css, { comments: 'foo' }).css, '');
        });

        it('should remove every exclamation comment except first when comments is "first-exclamation"', function() {
            assert.equal(csso.minify(css, { comments: 'first-exclamation' }).css, '/*! first */');
        });
    });

    describe('debug option', function() {
        function runDebug(css, options) {
            var output = [];
            var tmp = console.error;

            try {
                console.error = function() {
                    output.push(Array.prototype.slice.call(arguments).join(' '));
                };

                csso.minify(css || '', options);
            } finally {
                console.error = tmp;
                return output;
            }
        }

        it('should output nothing to stderr if debug is not set', function() {
            assert(runDebug('.foo { color: red }').length === 0);
            assert(runDebug('.foo { color: red }', { debug: false }).length === 0);
            assert(runDebug('.foo { color: red }', { debug: 0 }).length === 0);
        });

        it('level 1', function() {
            var output = runDebug('.foo { color: red }', { debug: true });
            assert(output.length > 0);
            assert(output.join('').indexOf('.foo') === -1);

            var output = runDebug('.foo { color: red }', { debug: 1 });
            assert(output.length > 0);
            assert(output.join('').indexOf('.foo') === -1);
        });

        it('level 2', function() {
            // should truncate source to 256 chars
            var output = runDebug(new Array(40).join('abcdefgh') + ' { color: red }', { debug: 2 });
            assert(output.length > 0);
            assert(output.join('').indexOf('abcdefgh...') !== -1);
        });

        it('level 3', function() {
            // shouldn't truncate source
            var output = runDebug(new Array(40).join('abcdefgh') + ' { color: red }', { debug: 3 });
            assert(output.length > 0);
            assert(output.join('').indexOf('abcdefgh...') === -1);
        });
    });

    it('should not fail if no ast passed', function() {
        assert.equal(generate(compress().ast, true), '');
    });
});
