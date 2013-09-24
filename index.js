var util = require("util"),
    url = require("url"),
    path = require("path"),
    repl = require("repl"),
    colors = require("colors"),
    chrome = require("chrome-remote-interface");

const PROP_SHOW_COUNT = 5;

module.exports = ChromeREPL;

function ChromeREPL() {}

ChromeREPL.prototype = {
  
  start: function(options) {
    this.connect(options, function(err, tab) {
      if (err) throw err;
      var self = this;

      console.log(tab.url.yellow);

      this.setTab(tab, function() {
        if (!self.repl) {
          self.repl = repl.start({
            prompt: self.getPrompt(),
            eval: self.eval.bind(self),
            input: process.stdin,
            output: process.stdout,
            writer: self.writer.bind(self)
          });
          self.defineCommands();
          self.replComplete  = self.repl.complete;
          self.repl.complete = self.complete.bind(self);
        } else {
          self.repl.displayPrompt();
        }
      });

    }.bind(this))
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
       expr = this;
       partial = '';
    } else if (path.length === 1) {
       expr = this;
       partial = path[0];
    } else {
       expr = path.slice(0, -1).join('.');
       partial = path[path.length -1];
    }
    var lineStart = line.slice(0, lastExpr.length - partial.length);
    var evalParams = {
       expression: expr, 
       objectGroup: "completion",
       includeCommandLineAPI: true,
       doNotPauseOnExceptionsAndMuteConsole: true,
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
        return done(null, [[], line]);
      if (res.result.type === 'object') {
        completionsForObj(res.result.objectId, function(err, completions) {
           var allProps = Object.keys(completions.result.value);
           var completions = allProps
             .filter(function(c) { return c.indexOf(partial) == 0 })
             .map(   function(c) { return lineStart + c });
           done([completions, line]);
        });
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
    client.listTabs(options.host, options.port, function(err, tabs) {
      if(err) return cb(err);
      cb(null, tabs[0]);
    });
  },

  writer: function(output) {

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
      return obj.className.yellow + " { " + 
         obj.preview.properties.map(propertyPreview).join(', ') + 
      " }";
    }
    if (output.wasThrown) {
      return output.result.description.red;
    }
    if (output.result.type == 'undefined')
      return ''; //return 'undefined'.gray;

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
    this.repl.prompt = '';
    this.repl.displayPrompt();
    this.repl.outputStream.write(str + '\n');
    this.repl.prompt = this.getPrompt();
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
      self.client.Runtime.enable();
      self.client.Runtime.executionContextCreated(function(ctxInfo) {
        self.runtimeContext = ctxInfo.context
      });
      self.client.Console.enable();
      function handleMessage(message) {
        // TODO: handle objects. reuse eval's mirroring
        //console.log(JSON.stringify(message, null, 4));
        var stack = message.message.stackTrace;
        if (message.message.level !== 'log')
          return;
        var prefix = "> ".blue;
        var messageText = prefix + message.message.text;
        //if (stack.length > 1 && stack[1].functionName == 'InjectedScript._evaluateOn')
        //  self.write('\n' + messageText + '\n');   // assume it's invoked from console - we don't need to scroll screen
        //else 
          self.writeLn(messageText); // assume it's from user interaction - insert message above prompt
        self.repl.displayPrompt();
      }
      self.client.Console.messageAdded(function(message) {
        self.lastMessage = message;
        handleMessage(message);
      });
      // TODO: implement counter. Meanwhile, just repeat last message
      self.client.Console.messageRepeatCountUpdated(function() {
        handleMessage(self.lastMessage);
      });
      self.repl.prompt = self.getPrompt();
      self.repl.displayPrompt();
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
    this.client.Runtime.evaluate({expression: input, generatePreview: true}, function(err, resp) {
      return cb(null, resp);
    });
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
    this.repl.defineCommand('tabs', {
      help: 'list currently open tabs',
      action: this.listTabs.bind(this)
    })

    this.repl.defineCommand('quit', {
      help: 'quit crconsole',
      action: this.quit
    })

    this.repl.defineCommand('switch', {
      help: 'switch to evaluating in another tab by index',
      action: this.switchTab.bind(this)
    })
  },

  switchTab: function(index) {
    this.client.close();
    var self = this;
    this.client.listTabs(this.options.host, this.options.port, function(err, tabs) {
      if (err) throw err;
      var tab = tabs[index];

      if (!tab) {
        this.write("no tab at index " + index + "\n");
        this.repl.displayPrompt();
      }
      else {
        self.setTab(tab, function() {
          self.write((self.tab.url + "\n").yellow);
        });
      }

    }.bind(this));
  },

  listTabs: function() {
    this.client.listTabs(this.host, this.options.port, function(err, tabs) {
      if (err) throw err;

      var strs = "";
      for (var i in tabs) {
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
