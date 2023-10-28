var util = require("util"),
    url = require("url"),
    path = require("path"),
    repl = require("repl"),
    colors = require("colors"),
    chrome = require("chrome-remote-interface");

var cdir = require('./lib/cdir.js');
var cardinal = require('cardinal');
var resolveCardinalTheme = require('cardinal/settings').resolveTheme;
var EventEmitter = require('events');


var react = require('./plugins/react');

const PROP_SHOW_COUNT = 5;
const highlightConfig = {
  "showInfo": true,
  "showRulers":false,
  "showExtensionLines":false,
  "contentColor":{"r":111,"g":168,"b":220,"a":0.66},
  "paddingColor":{"r":147,"g":196,"b":125,"a":0.55},
  "borderColor":{"r":255,"g":229,"b":153,"a":0.66},
  "marginColor":{"r":246,"g":178,"b":107,"a":0.66},
  "eventTargetColor":{"r":255,"g":196,"b":196,"a":0.66},
  "shapeColor":{"r":96,"g":82,"b":177,"a":0.8},
  "shapeMarginColor":{"r":96,"g":82,"b":127,"a":0.6},
  "displayAsMaterial":true
};

module.exports = ChromeREPL;

function ChromeREPL() {}

ChromeREPL.prototype = {

  start: function(options) {
    this.connect(options, function(err, tab) {
      if (err) throw err;
      var self = this;
      this.bufferedMessages = [];
      self.screencasting = false;
      this.setTab(tab, function() {
        self.mouse = require('term-mouse')(); //{ input: self.repl.inputStream, output: self.repl.outputStream });
        self.mouse.stop();
        self.createRepl();
      });

    }.bind(this))
  },

  createRepl: function() {
    var self = this;
    if (self.repl) {
      self.repl.close();
      self.repl = null;
    }
    if (!self.repl) {
      self.repl = repl.start({
        prompt: self.getPrompt(),
        eval: self.eval.bind(self),
        input: process.stdin,
        output: process.stdout,
        writer: self.writer.bind(self)
      });
      if (!self.repl.setPrompt) { // assume node pre0.12 or io.js
        self.repl.setPrompt = function(p) {
          self.repl.prompt = p;
        };
      }
      self.defineCommands();
      self.replComplete  = self.repl.complete;
      self.repl.complete = self.complete.bind(self);
      require('repl-story')(self.repl, process.env.HOME + '/.crmux_history');
    }
  },

  complete: function (line, callback) {
    var self = this;
    // TODO: .tab .switch .exit .help completions (but don't do local context completions)
    //this.replComplete.call(this.repl, line, function(err, cs) {
    //    return callback(null, cs);
    //  if (cs[0].length != 0) // we have repl command completions, don't need to avaluate in browser
    //     return callback(null, cs);
      self.chromeCompleter(line, callback);
    //});
  },

  injectedCompleterObj: function getCompletions(primitiveType) {
    var object;
    if (primitiveType==="string")
      object = new String("");
    else if(primitiveType==="number")
      object = new Number(0);
    else if(primitiveType==="boolean")
      object = new Boolean(false);
    else
      object=this;
    var resultSet={};
    for(var o=object;o;o=o.__proto__)
    {
      try {
        var names=Object.getOwnPropertyNames(o);
        for(var i=0;i<names.length;++i)
          resultSet[names[i]]=true;
      } catch(e) {}
    }
    return resultSet;
  },

  chromeCompleter: function (line, callback) {
    // TODO: object properties completions only atm
    // TODO: to add numbers, strings, etc use this evals:
    // evaluate( '(' + self.injectedCompleterObj.toString() + ')(\"string\");
    // evaluate( '(' + self.injectedCompleterObj.toString() + ')(\"number\");
    // evaluate( '(' + self.injectedCompleterObj.toString() + ')(\"boolean"\);

    var self = this;

    var completionsForObj = function(id, callback) {
      var params = {
        objectId: id,
        functionDeclaration: self.injectedCompleterObj.toString(),
        doNotPauseOnExceptionsAndMuteConsole: true,
        returnByValue: true,
        generatePreview:false
      };
      self.client.Runtime.callFunctionOn(params, function(err, res) {
         callback(err, res);
      });
    };
    var lastExpr = line.trim().split(/[ {}();\/\\]+/).slice(-1)[0];
    if (!lastExpr)
      return callback(null, [[], line]);
    // TODO obj['longproperyname completer in addition to obj.longproperyname
    var path = lastExpr.split('.');
    var expr, partial;
    if (path.length === 0) {
       expr = 'this';
       partial = '';
    } else if (path.length === 1) {
       expr = 'this';
       partial = path[0];
    } else {
       expr = path.slice(0, -1).join('.');
       partial = path[path.length -1];
    }
    var lineStart = line.slice(0, lastExpr.length - partial.length);

    // repl comands, not chrome completion
    var lineDot = line.split('.');
    if (lineDot.length > 1 && lineDot[0].trim() === '') {
      partial = lineDot[1];
      completions = Object.keys(self.repl.commands)
        .filter(function(c) { return c.indexOf('.' + partial) == 0 })
        .map(   function(c) { return lineDot[0] + c });
      return callback(null, [completions, line]);
    }

    var evalParams = {
      expression: expr,
      objectGroup: "completion",
      includeCommandLineAPI: true,
      doNotPauseOnExceptionsAndMuteConsole: true,
      // TODO: not sure why I used contextId, it looks like it works better without context ( defaults to global ? )
      contextId: self.runtimeContext.id,
      returnByValue:false,
      generatePreview:false
    }
    this.client.Runtime.evaluate(evalParams, function(err, res) {
      function done(params) {
        self.client.Runtime.releaseObjectGroup({"objectGroup":"completion"});
        callback(null, params);
      }
      if (res.wasThrown)
        return done([[], line]);
      if (res.result.type === 'object') {
        completionsForObj(res.result.objectId, function(err, completions) {
           var allProps = Object.keys(completions.result.value);
           var completions = allProps
             .filter(function(c) { return c.indexOf(partial) == 0 })
             .map(   function(c) { return lineStart + c });
           done([completions, line]);
        });
      } else {
        // TODO get completions for String and Number
        done([[], line]);
      }
    });
  },

  connect: function(options, cb) {
    var self = this;
    self.options = options;
    var client = chrome.createClient();
    client.on("error", function(error) {
      console.log(error);
    });
    self.client = client;
    if (options.websocket) {
      return cb(null, {
        url: '',
        webSocketDebuggerUrl: options.websocket
      });
    } else {
      client.listTabs(options.host, options.port, function(err, tabs) {
        if(err) return cb(err);
        // TODO: skip tabs without webSocketDebuggerUrl (likely already being debugged)
        cb(null, tabs[0]);
      });
    }
  },

  writer: function(output) {
    var self = this;
    if (!output) {
      self.client.DOM.hideHighlight();
      return ''
    }

    // if result is domNode, highlight it, if not - hide
    //console.log(output, output && output.objectId && output.subtype === 'node');
    if (output.result && output.result.objectId && output.result.subtype === 'node') {
      // TODO FIXME: always return nodeId:0 for some reason
      // Would like to push nodeId to consoleApi via DOM.setInspectedNode but need nodeId for this
      // self.client.DOM.requestNode({ objectId: output.result.objectId }, function(err, node) {
      //  console.log('NODE:::', err, node);
        self.client.DOM.highlightNode({
          //nodeId: node.nodeId,
          objectId: output.result.objectId,
          highlightConfig: highlightConfig
        })
      //});
    } else {
      self.client.DOM.hideHighlight();
    }
    // TODO: check if result is React component and highlight it

    function propertyValue(t, v) {
      if (t === 'string')
        return util.inspect(v, { colors: true });
      else if (t === 'number' || t === 'boolean')
        return v.toString().blue;
      else if (t === 'object' && v == 'null')
        return 'null'.blue;
      else if (t === 'undefined')
        return 'undefined'.gray;
      return t.grey;
    }
    function propertyPreview(p) {
      return p.name.magenta + ': ' + propertyValue(p.type, p.value);
    }
    function showPreview(obj) {
      if (!obj.preview) {
        return obj.className.yellow;
      }
      return obj.className.yellow + " { " +
         obj.preview.properties.map(propertyPreview).join(', ') +
      " }";
    }
    if (output.wasThrown) {
      return output.result.description.red;
    }
    if (output.result.type == 'object' && output.result.subtype == 'null') {
      return 'null'.blue;
    }
    if (output.result.type == 'function') {
      return '[Function]'.cyan;
    }
    if (output.result.type == 'undefined')
      return 'undefined'.blue;

    if (!output || output.result.type != "object") {
      // let inspect do its thing if it's a literal
      return util.inspect(output.result.value, { colors: true });
    }
    if (output.result.type === "object") {
      return showPreview(output.result);
    }
  },

  write: function(str, cb) {
    this.repl.outputStream.write(str, cb);
  },

  writeLn: function(str, cb) {
    this.repl.setPrompt('');
    this.repl.displayPrompt();
    this.repl.outputStream.write(str + '\n');
    this.repl.setPrompt(this.getPrompt());
    //this.repl.displayPrompt();
    if (cb) cb();
  },

  setTab: function(tab, cb) {
    this.tab = tab;
    var self = this;
    this.client.connectToWebSocket(tab.webSocketDebuggerUrl);
    this.client.removeAllListeners();
    this.client.on('connect', function() {
      cb();
      self._scripts = {};
      self._breakpoints = {};
      self.hookBridge = new EventEmitter();
      self.client.Runtime.disable();
      self.client.Runtime.enable();
      self.client.Runtime.executionContextCreated(function(ctxInfo) {
        self.runtimeContext = ctxInfo.context
      });
      self.client.Debugger.enable();
      self.client.Console.enable();
      self.client.send('DOM.enable');
      self.client.Debugger.scriptParsed(function(script) {
        self._scripts[script.scriptId] = script;
      })

      self.hookBridge.on('foo', function(m) {
        console.log('got foo!', m);
      })

      self.handleMessage = function(message) {
        if (self.screencasting) {
          self.bufferedMessages.push(message);
          return;
        }
        // TODO: handle objects. reuse eval's mirroring
        //console.log(JSON.stringify(message, null, 4));
        var stack = message.message.stackTrace;
        /* if (message.message.level !== 'log')
          return;
        var prefix = "> ".blue; */
        var messageLevel = message.message.level;
        var prefix = '> ';
        if (messageLevel === 'info') {
          prefix = prefix.blue;
        } else if (messageLevel === 'warn') {
          prefix = prefix.yellow;
        } else if (messageLevel === 'error') {
          prefix = prefix.red;
        }
        var messageText = prefix + message.message.text;
        //if (stack.length > 1 && stack[1].functionName == 'InjectedScript._evaluateOn')
        //  self.write('\n' + messageText + '\n');   // assume it's invoked from console - we don't need to scroll screen
        //else
          self.writeLn(messageText); // assume it's from user interaction - insert message above prompt
        self.repl.displayPrompt();
      }

      self._http_requests = {};
      self.client.Network.enable();
      self.client.Network.requestWillBeSent(function(r) {
        //console.log(r);
        //console.log(self._http_requests);
        var saved = self._http_requests[r.requestId];
        if (!saved) {
          saved = {};
          self._http_requests[r.requestId] = saved;
        }
        saved.request = r;
      });
      self.client.Network.responseReceived(function(r) {
        //console.log(r);
        //console.log(self._http_requests);
        var saved = self._http_requests[r.requestId];
        if (!saved) {
          saved = {};
          self._http_requests[r.requestId] = saved;
        }
        saved.response = r;
      });

      self.client.Console.messageAdded(function(message) {
        self.lastMessage = message;
        self.handleMessage(message);
      });

      // TODO: implement counter. Meanwhile, just repeat last message
      self.client.Console.messageRepeatCountUpdated(function() {
        handleMessage(self.lastMessage);
      });
      self.repl.setPrompt(self.getPrompt());

      // TODO: move to lib/dom.js
      self.client.on('DOM.inspectNodeRequested', function(node) {
        self.client.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.backendNodeId]}, function(err, nodes) {
          var nodeId = nodes.nodeIds[0];
          // TODO: replace with event emitter
          if (self.onNodeSelected)
            self.onNodeSelected(nodeId, node.backendNodeId)
        });
      });

      self.displayBacktrace = function() {
        var pad = function () {
          if (i > 99) return '';
          if (9 > 9) return ' ';
          return '   ';
        }

        var frames = "";
        var f;
        for (var i=0; i < self._breakFrames.length; ++i) {
          f = self._breakFrames[i]
          var s = self._scripts[f.location.scriptId];
          var loc = ':' + f.location.lineNumber + ':' + f.location.columnNumber;
          var title = s.url ? s.url : '<script ' + f.location.scriptId + '>';
          var cur = i == self._breakFrameId ? '>' : ' ';
          frames += cur + pad(i) + i + ' ' + title + loc + ' ' + f.this.className + '.' + f.functionName + '\n'
        }
        self.writeLn(frames);
      }

      /*
      self.client.Runtime.evaluate({expression: 'window.__CRCONSOLE_HOOK__ = function (type, payload) { }' }, function(err, res) {
        self.client.send('Debugger.getFunctionDetails', { functionId: res.result.objectId }, function(err, res) {
          self.client.Debugger.setBreakpoint(res.details, function(err, setBpRes) {
            console.log(res);
            self._hookScriptId = res.details.location.scriptId;
          });
        });
      });
      */

      self.breakpointsForLocation = function(location) {
        var res = null;
        if (self._breakpoints[location.scriptId] && self._breakpoints[location.scriptId][location.lineNumber])
          res = self._breakpoints[location.scriptId][location.lineNumber];
        return res;
      }

      self.displaySource = function(n) {
        var NUM_LINES = n || 5;
        function pad(maxLine, breakLine, num) {
          var spaces = '                       ';
          var w = String(maxLine).length;
          var n = String(num);
          n = spaces.slice(0, w - n.length) + n;
          if (num == breakLine) {
            n = '> ' + n + ' ';
          } else {
            n = '  ' + n + ' ';
          }
          return n;
        }

        var frame = self._breakFrames[self._breakFrameId];
        var lineNumber   = frame.location.lineNumber;
        var columnNumber = frame.location.columnNumber;
        self.client.Debugger.getScriptSource({ scriptId: frame.location.scriptId }, function(err, resp) {
          self.writeLn('break in ' + [lineNumber, columnNumber].join(':'))
          var startLine = lineNumber - NUM_LINES;
          var lastLine  = lineNumber + NUM_LINES;
          var out = [];
          var src = cardinal.highlight(resp.scriptSource, {
            theme: resolveCardinalTheme()
          }).split('\n');
          for (var i=startLine; i < lastLine; ++i) {
            var prefix = pad(lastLine, lineNumber, i);
            var bpsForLine = self.breakpointsForLocation({
              scriptId: frame.location.scriptId,
              lineNumber: i
            });
            if (bpsForLine) {
              prefix = prefix.red;
            }

            if (src[i])
              out.push(prefix + src[i]);
          }
          self.writeLn(out.join('\n'));
          // TODO mark current column with underline?
          //self.writeLn(src[lineNumber].underline);
          self.repl.setPrompt(frame.this.className + '.' + frame.functionName + '() > ');
          self.repl.displayPrompt();
        });
      }

      function handleHook(params) {
        if (params.callFrames && params.callFrames[0] && params.callFrames[0].location.scriptId == self._hookScriptId) {
          var callFrameId = params.callFrames[0].callFrameId;
          self.client.Debugger.evaluateOnCallFrame({
            callFrameId: callFrameId,
            expression: 'type' // must be string
          }, function(err, respType) {
            self.client.Debugger.evaluateOnCallFrame({
              callFrameId: callFrameId,
              expression: 'payload' // must bestring
            }, function(err, respPayload) {
              self.hookBridge.emit(respType.result.value, respPayload.result)
              self.client.Debugger.resume();
            });
          });
          return true;
        }
        return false;
      }

      self.client.Debugger.paused(function(params) {
        var hookHandled = handleHook(params);
        if (hookHandled)
          return;

        self._breakFrameId = 0;
        self._breakFrames = params.callFrames;
        self.client.send('Page.setOverlayMessage', {message: 'paused in crconsole'});
        self.displaySource();
      });

      self.client.Debugger.resumed(function(params) {
        self.client.send('Page.setOverlayMessage', {});
        self.repl.setPrompt(self.getPrompt());
        self.repl.displayPrompt();
      });

      //self.client.CSS.enable();
      //self.client.CSS.getAllStyleSheets(function() {
      //  console.log('getAllStyleSheets');
      //  console.log(arguments);
      //});

      //self.client.CSS.styleSheetAdded(function() {
      //  console.log('css added');
      //  console.log(arguments);
      //});
      //self.client.CSS.styleSheetRemoved(function() {
      //  console.log('css removed');
      //  console.log(arguments);
      //});
      //self.client.CSS.styleSheetChanged(function() {
      //  console.log('css changed');
      //  console.log(arguments);
      //});

    });
  },

  getPrompt: function() {
    var parts = url.parse(this.tab.url);

    var name = parts.hostname;
    if (!name) {
      name = path.basename(parts.path);
    }
    return name + "> ";
  },

  // compliant with node REPL module eval function reqs
  eval: function(cmd, context, filename, cb) {
    this.evalInTab(cmd, cb);
  },

  evalInTab: function(input, cb) {
    var removeBrackets = function(input) {
      // node repl adds () to eval input while iojs not
      // try to detect here and remove
      if (input.slice(-2) === '\n)' && input.slice(0,1) == '(')
        return input.slice(1,-2).trim();
      return input.trim();
    };
    var self = this;
    if (!self._breakFrames) {
      this.client.Runtime.evaluate({
        expression: removeBrackets(input),
        //generatePreview: true,
        //objectGroup: 'console',
        //contextId: self.runtimeContext.id,
        includeCommandLineAPI: true
      }, function(err, resp) {
        //cdir(resp, { cb: function() {
        //  cb(null, resp);
        //}});
        //console.log(resp);
        return cb(null, resp);
      });
    } else {
      var frame = self._breakFrames[self._breakFrameId];
      this.client.Debugger.evaluateOnCallFrame({
        callFrameId: frame.callFrameId,
        expression: removeBrackets(input)
      }, function(err, resp) {
        return cb(null, resp);
      });
    }
  },

  transformResult: function(result) {
    switch (result.type) {
      case "undefined":
        return undefined;
      case "null":
        return null;
    }
    return result;
  },

  defineCommands: function() {

    var self = this;

    this.repl.defineCommand('tabs', {
      help: 'list currently open tabs',
      action: this.listTabs.bind(this)
    });

    this.repl.defineCommand('quit', {
      help: 'quit crconsole',
      action: this.quit
    });

    this.repl.defineCommand('switch', {
      help: 'switch to evaluating in another tab by index',
      action: this.switchTab.bind(this)
    });

    this.repl.defineCommand('open', {
      help: 'open new tab',
      action: this.addTab.bind(this)
    });

    this.repl.defineCommand('s', {
      help: 'step into',
      action: function() {
        self.client.Debugger.stepInto();
      }
    });

    this.repl.defineCommand('bt', {
      help: 'back trace',
      action: function() {
        if (!self._breakFrames) {
          self.writeLn('Can\'t show backtrace: not stopped in debugger.');
        } else {
          self.displayBacktrace();
        }
      }
    });

    this.repl.defineCommand('up', {
      help: 'move up one or more frames',
      action: function(n) {
        if (n)
          n = parseInt(n);
        else
          n = 1;
        if (!self._breakFrames) {
          self.writeLn('Can\'t show backtrace: not stopped in debugger.');
        } else {
          self._breakFrameId += n
          if (self._breakFrameId >= self._breakFrames.length)
            self._breakFrameId = self._breakFrames.length - 1;
          self.displayBacktrace();
          self.displaySource()
        }
      }
    });

    this.repl.defineCommand('down', {
      help: 'move down one or more frames',
      action: function(n) {
        if (n)
          n = parseInt(n);
        else
          n = 1;
        if (!self._breakFrames) {
          self.writeLn('Can\'t show backtrace: not stopped in debugger.');
        } else {
          self._breakFrameId -= n
          if (self._breakFrameId < 0)
            self._breakFrameId = 0;
          self.displayBacktrace();
          self.displaySource();
        }
      }
    });

    this.repl.defineCommand('screen', {
      help: 'show screenshot',
      action: function(scaleStr) {
        var scale = parseFloat(scaleStr);
        if (!scale)
          scale = 0.5;
        var dimensions = "(function() { var body = document.body; var html = document.documentElement;"
        dimensions += "var width = Math.max( body.scrollWidth, body.offsetWidth,"
        dimensions += "html.clientWidth, html.scrollWidth, html.offsetWidth ); return width;})()";
        self.client.Runtime.evaluate({ expression: dimensions }, function(err, res) {
          var width = res.result.value * scale;
          self.client.Page.captureScreenshot(function(err, res) {
            var data = res.data;
            getCursorPosition(function(posBeforeFrame) {
              var control = '\033]1337;File=;inline=1;width=' + width + 'px:' + data + '\07';
              //var control = '\033]1337;File=test;inline=1:' + data + '\07';
              //
              self.write(control);
              getCursorPosition(function(posAfterFrame) {
                console.log(posBeforeFrame, posAfterFrame);
              });
            });
          });
        });
      }
    });

    self._startInspect = function(mode) {
      if (!mode) {
        //self.writeLn('need one of [searchForNode, searchForUAShadowDOM, showLayoutEditor, none] as argument');
        //return;
        mode = 'searchForNode';
      }
      // TODO: paddingColor, margin color etc
      // see https://chromedevtools.github.io/debugger-protocol-viewer/DOM/#type-HighlightConfig
      self.client.send('DOM.setInspectMode', {
        mode: mode,
        highlightConfig: {
          showInfo: true,
          showRulers: true,
          contentColor: {
            r: 100,
            g: 20,
            b: 20,
            a: 0.1
          }
        }
      });
    }

    self._stopInspect = function(mode) {
      self.client.send('DOM.setInspectMode', { mode: 'none' });
    }

    this.repl.defineCommand('inspect', {
      help: 'set inspect mode',
      action: function(mode) {
        self._startInspect();
        self.onNodeSelected = function(nodeId) {
          self.writeLn('select node to see inner html');
          self.client.send('DOM.getOuterHTML', { nodeId: nodeId }, function(err, res) {
            // TODO: highlight html
            self._stopInspect();
            self.client.send('DOM.setInspectedNode', { nodeId: nodeId});
            self.writeLn(res.outerHTML);
            self.onNodeSelected = null;
            self.repl.displayPrompt();
          });
        }
      }
    });

    // WIP: allow to record to gif?
    // see https://github.com/sidorares/rfbrecord

    var up = function up (i, save) {
      i = i || 1;
      if (i > 0) {
        while(i--) {
          self.write(!save ? '\033[K\033[1A\r' : '\033[1A\r');
        }
      }
    };

    var cursorTo = require('./lib/term-utils.js').cursorTo;
    var getCursorPosition = require('./lib/term-utils.js').getCursorPosition;

    this.repl.defineCommand('screencast', {
      help: 'start screencast',
      action: function() {
        self.screencasting = true;
        self.client.send('Page.startScreencast',
        //self.client.Page.startScreencast({
        {
          format: 'png',
          quality: 100
        }, function(err, res) {
          //console.log('AAAAA', err, res);
        })
        var firstFrame = true;
        var heightRows = 20; //process.stdout.columns - 5; //40;
        var lastFrameRows = 0;
        var lastMeta = null;

        var frameStartCursor = null;

        var onFrame = function(params) {
          //if (firstFrame) {
          //  for (var i =0; i < heightRows; ++i)
          //    process.stdout.write('\n');
          //}
          //up(heightRows, true);


          lastMeta = params.metadata;
          var data = params.data;
          //var deviceAspect = params.metadata.deviceWidth / params.metadata.deviceHeight;
          //var ttyAspect = process.stdout.columns / process.stdout.rows;
          // heightRows = process.stdout.rows - 5;
          //else {
          //
          //}
          //var control = '\033]1337;File=;inline=1;height=' + heightRows + ':' + data + '\07';
          var control = '\n\033]1337;File=;inline=1;height=auto:' + data + '\07';
          getCursorPosition(function(posBeforeFrame) {
            //var control = '\033]1337;File=;inline=1;width=10:' + data + '\07';
            //if (!firstFrame)
            //  up(10*heightRows+1, true);
            //else
            //  up(process.stdout.columns)
            if (!firstFrame) {
              cursorTo(frameStartCursor.column-1, frameStartCursor.row-1);
              //cursorTo(0, 20);
              //console.log(frameStartCursor.row, frameStartCursor.column);
            } else {
              frameStartCursor = posBeforeFrame
              firstFrame = false;
            }
            //self.write(control);
            getCursorPosition(function(posAfterFrame) {
              //console.log(posBeforeFrame, posAfterFrame)
                self.client.send('Page.screencastFrameAck', {
                   sessionId: params.sessionId
                });
                //console.log(posBeforeFrame, posAfterFrame)
                //process.stdout.write(JSON.stringify([posBeforeFrame, posAfterFrame]));
            });
          });
        };

        self.client.on('Page.screencastFrame', onFrame);
        var history = self.repl.history;
        var mouseEvent = null;
        var handleData = function (b) {
          if (b[0] == 3) {
            self.client.send('Page.stopScreencast');
            self.client.removeListener('Page.screencastFrame', onFrame);
            self.mouse.stop();
            process.stdin.removeListener('data', handleData);
            self.mouse.removeListener('event', mouseEvent);
            process.stdin.setRawMode(false);
            self.createRepl();
            self.repl.history = history;
            self.screencasting = false;
            var m;
            while(m = self.bufferedMessages.shift()) {
              self.handleMessage(m);
            }
          } else {
            var s = b.toString('utf8');
            var evt = {}
            // todo find if there is mapping table ansi -> keycode names
            if (b[0] == 0x7f) {
              evt.code = 'Backspace';
              keyIdentifier: 'U+0008';
              evt.type = 'keyDown'
              self.client.send('Input.dispatchKeyEvent', evt);
              self.client.send('Input.dispatchKeyEvent', {
                code: 'Backspace',
                keyIdentifier: 'U+0008',
                type: 'keyUp'
              });
            } else {
              evt.text = s;
              evt.type = 'char'
              self.client.send('Input.dispatchKeyEvent', evt);
            }
          }
        };
        var mouseEvent = function(e) {
          //console.log('you clicked %d,%d with the %s mouse button', e.x, e.y, e.button);
          console.log(e);
          //if (!lastMeta)
          //  return;
          //var deviceY = Math.floor(e.y/heightRows*lastMeta.deviceHeight);
          //var deviceX = Math.floor(0.5*e.x/heightRows*lastMeta.deviceHeight);
          //console.log(e.x, e.y, deviceX, deviceY);

          var deviceX = e.x*3;
          var deviceY = (e.y-1)*7;

          self.client.send('Input.dispatchMouseEvent', {
            type: 'mouseMoved', // mousePressed, mouseReleased, mouseMoved.
            x: deviceX,
            y: deviceY
          }, function(err, res) {
            //console.log('Input.dispatchMouseEvent', err, res)
          });
        };
        self.repl.on('close', function() {
            process.stdin.setRawMode(true);
            self.mouse.start();
            self.mouse.on('move', mouseEvent);
            process.stdin.on('data', handleData);
        });
        self.repl.close();
      }
    })

    // TODO: add number of steps as a parameter
    this.repl.defineCommand('n', {
      help: 'step next',
      action: function() {
        self.client.Debugger.stepOver();
      }
    });

    this.repl.defineCommand('o', {
      help: 'step out',
      action: function() {
        self.client.Debugger.stepOut();
      }
    });

    this.repl.defineCommand('c', {
      help: 'continue',
      action: function() {
        self.client.Debugger.resume();
      }
    });

    this.repl.defineCommand('list', {
      help: 'list source',
      action: function(n) {
        if (n)
          n = parseInt(n);
        else
          n = 5;
        if (!self._breakFrames) {
          self.writeLn('Can\'t show backtrace: not stopped in debugger.');
        } else {
          self.displaySource(n);
        }
      }
    })

    this.repl.defineCommand('sb', {
      help: 'set breakpoint',
      action: function(condition) {
        if (!self._breakFrames) {
          self.writeLn('Can\'t set breakpoint: not stopped in debugger.');
        } else {
          var frame = self._breakFrames[self._breakFrameId];
          var params = {
            location: frame.location
          }
          if (condition)
            params.condition = condition;

          var existingBreakpoint = self.breakpointsForLocation(frame.location);
          if (existingBreakpoint) {
            // remove bp
            self.client.Debugger.removeBreakpoint({
              breakpointId: existingBreakpoint
            }, function(err, res) {
              delete self._breakpoints[frame.location.scriptId][frame.location.lineNumber];
              self.displaySource();
            })

          } else {
            // add bp
            self.client.Debugger.setBreakpoint(params, function(err, setBpRes) {
              if (err) {
                self.displaySource();
                return;
              }
              var actualLocation = setBpRes.actualLocation;
              var breakpointId = setBpRes.breakpointId;

              if (!self._breakpoints[actualLocation.scriptId])
                self._breakpoints[actualLocation.scriptId] = {}
              self._breakpoints[actualLocation.scriptId][actualLocation.lineNumber] = breakpointId;
              self.displaySource();
            })
          }
        }
      }
    })


    this.repl.defineCommand('react', function(command) {
      function getAgent(cb) {
        if (!self._reactAgent) {
          react(self.client, self.repl, function(err, agentId) {
            self._reactAgent = agentId;
            cb(null, self._reactAgent);
          });
        } else {
          cb(null, self._reactAgent);
        }
      }

      if (command == 'inspect') {
        self._startInspect();
        self.onNodeSelected = function(nodeId) {
          getAgent(function(err, agentId) {
            // agent -> get element for node
            // print node
            // set window.$r to point to node
            self.client.Runtime.evaluate({ expression: 'window' }, function(err, globalRes) {
              console.log(globalRes);
              self.client.send('DOM.resolveNode', { nodeId: nodeId}, function(err, nodeRes) {
                self._stopInspect();
                var params = {
                  objectId: agentId,
                  arguments: [{objectId: agentId}, nodeRes.object, globalRes.result],
                  functionDeclaration: `function(agent, node, global) {
                    var id = agent.getIDForNode(node);
                    var data = agent.elementData.get(id);
                    if (data && data.publicInstance) {
                      global.$r4 = global.$3;
                      global.$r3 = global.$r2;
                      global.$r2 = global.$r1;
                      global.$r1 = global.$r;
                      global.$r = data.publicInstance;
                    }
                    //console.log(global, global.$r);
                    //console.log(id)
                    //console.log(data)
                    return JSON.stringify(agent._subTree(data));
                  }
                  `,
                  doNotPauseOnExceptionsAndMuteConsole: true,
                  returnByValue: true,
                  generatePreview:false
                };
                self.client.Runtime.callFunctionOn(params, function(err, res) {
                  console.log(err, res);
                });
              });
            });
          });
        }
        return;
      }

      getAgent(function(err, agentId) {
        var params = {
          objectId: agentId,
          arguments: [{objectId: agentId}],
          // TODO: this.getTree and no arguments?
          functionDeclaration: 'function(agent) { return agent.getTree() }',
          doNotPauseOnExceptionsAndMuteConsole: true,
          returnByValue: true,
          generatePreview:false
        };
        self.client.Runtime.callFunctionOn(params, function(err, res) {
          var reactTree = JSON.parse(res.result.value);
          self.writeLn(res.result.value, function() {
            self.repl.displayPrompt();
          });
          //cdir(reactTree, { cb: function() {
          //  self.repl.displayPrompt();
          //}});
        });
      });
    });

    this.repl.defineCommand('net', {
      help: 'network',
      action: function(cmd) {
        if (cmd.indexOf('list') === 0) {
          var results = '';
          var ids = Object.keys(self._http_requests);
          var data = ids.map( function(reqId) {
            var obj = self._http_requests[reqId];
            if (!obj.request) return; // request was sent before crconsole connected to browser, ignore this for now
            var req = obj.request.request;
            var resp = obj.response ? obj.response.response : undefined;
            results += ' ' + reqId + '> '  +  req.method + ' ' + req.url + ' -> ';
            if (!resp) {
              results += ' [pending]\n';
            } else {
              results += resp.status + '/' + resp.statusText + ' ' + resp.mimeType + ' ' + obj.response.type + '\n';
            }
            return 0;
          })
          self.writeLn(results, function() {
            self.repl.displayPrompt();
          });
        } else if (cmd.indexOf('show') === 0) {
          var parts = cmd.split(/[ \t]+/);
          var id = parts[1];
          var obj = self._http_requests[id];
          if (!obj) {
            self.writeLn('Not found: ' + id);
            return;
          }
          self.client.Network.getResponseBody({requestId: id}, function(err, res) {
            if (obj.response.response.mimeType == 'application/json') {
              try {
                self.writeLn(util.inspect(JSON.parse(res.body), { colors: true }));
              } catch(e) {
                self.writeLn('Invalid JSON, displaying raw content: \n' + res.body);
              }
            } else {
              var control = '\033]1337;File=test;inline=1:' + res.body + '\07'
              self.writeLn(control);
            }
          })
        } else if (cmd.indexOf('request') === 0) {
          var parts = cmd.split(/[ \t]+/);
          var id = parts[1];
          var obj = self._http_requests[id];
          if (!obj) {
            self.writeLn('Not found: ' + id);
            return;
          }
          cdir(obj.request, { cb: function() {
             self.repl.displayPrompt();
          }});
        } else if (cmd.indexOf('response') === 0) {
          var parts = cmd.split(/[ \t]+/);
          var id = parts[1];
          var obj = self._http_requests[id];
          if (!obj) {
            self.writeLn('Not found: ' + id);
            return;
          }
          cdir(obj.response, { cb: function() {
             self.repl.displayPrompt();
          }});
        }
      }
    });
  },

  addTab: function(url) {
    var self = this;
    if ( (url.slice(0,7) != 'http://') && (url.slice(0,8) != 'https://') ) {
      url = 'http://' + url;
    }
    this.client.openTab(this.options.host, this.options.port, url, function(err, tab) {
      if (err) throw err;
      self.setTab(tab, function() {
        self.write((self.tab.url + "\n").yellow);
        self.repl.setPrompt(self.tab.url + '>');
        self.repl.displayPrompt();
      });
    });
  },

  switchTab: function(index) {
    this.client.close();
    var self = this;
    self._reactAgent = null;
    this.client.listTabs(this.options.host, this.options.port, function(err, tabs) {
      if (err) throw err;
      var tab = tabs[index];

      if (!tab) {
        this.write("no tab at index " + index + "\n");
      }
      else {
        self.setTab(tab, function() {
          self.write((self.tab.url + "\n").yellow);
          self.repl.displayPrompt();
        });
      }

    }.bind(this));
  },

  listTabs: function() {
    this.client.listTabs(this.options.host, this.options.port, function(err, tabs) {
      if (err) throw err;

      var strs = "";
      for (var i =0; i < tabs.length; ++i) {
        strs += "[" + i + "] " + tabs[i].url + "\n";
      }

      this.write(strs);
      this.repl.displayPrompt();
    }.bind(this));
  },

  quit: function() {
    process.exit(0);
  }
}
