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
        } else {
          self.repl.displayPrompt();
        }
      });

    }.bind(this))
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
      if (t == 'string')
        return util.inspect(v, { colors: true });
      return t.grey;
    }
    function propertyPreview(p) {
      return p.name.magenta + ': ' + propertyValue(p.type, p.value);
    }
    function showPreview(obj) {
      return obj.className.yellow + " { " + 
         obj.preview.properties.map(propertyPreview).join(', ') + 
      "}";
    }
    if (output.wasThrown) {
      return output.result.description.red;
    }
    if (output.result.type == 'undefined')
      return '';

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
    this.repl.displayPrompt();
    if (cb) cb();
  },

  setTab: function(tab, cb) {
    this.tab = tab;
    var self = this;
    this.client.connectToWebSocket(tab.webSocketDebuggerUrl);
    this.client.removeAllListeners(); 
    this.client.on('connect', function() {
      cb();
      self.client.Console.enable();
      function handleMessage(message) {
        if (message.message.level !== 'log')
          return;
        var prefix = "> ".blue;
        self.writeLn(prefix + message.message.text);
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
