var util = require("util"),
    url = require("url"),
    path = require("path"),
    repl = require("repl"),
    colors = require("colors"),
    chrome = require("chrome-remote-interface");

//    ChromeClient = require("chrome-remote-interface/lib/chrome.js");

/*
function createClient() {
    var events = require('events');
    var notifier = new events.EventEmitter();
    var c = new ChromeClient({}, notifier);
    notifier.on('connect', function() { c.emit('connect') });
    notifier.on('error', function(e) { c.emit('error', e) });
    return c;
}
*/

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
    //var client = createClient();
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
    if (!output || output.type != "object") {
      // let inspect do its thing if it's a literal
      return util.inspect(output, { colors: true });
    }
    // do our own object summary
    var str = "";
    str += output.class.yellow + " { ";

    var props = {};

    // show first N properties of an object, starting with getters
    var getters = output.safeGetterValues;
    var names = Object.keys(getters).slice(0, PROP_SHOW_COUNT);
    names.map(function(name) {
      props[name] = getters[name];
    })

    // then the own properties
    var ownProps = output.ownProps;
    var remaining = PROP_SHOW_COUNT - names.length;
    if (remaining) {
      names = Object.keys(ownProps).slice(0, remaining);
      names.map(function(name) {
        props[name] = ownProps[name];
      });
    }

    // write out a few properties and their values
    var strs = [];
    for (name in props) {
      var value = props[name].value;
      value = this.transformResult(value);

      if (value && value.type == "object") {
        value = ("[object " + value.class + "]").cyan;
      }
      else {
        value = util.inspect(props[name].value, { colors: true });
      }
      strs.push(name.magenta + ": " + value);
    }
    str += strs.join(", ");

    // write the number of remaining properties
    var total = Object.keys(getters).length + Object.keys(ownProps).length;
    var more = total - PROP_SHOW_COUNT;
    if (more > 0) {
      str += ", ..." + (more + " more").grey
    }
    str += " } ";

    return str;
  },

  write: function(str, cb) {
    this.repl.outputStream.write(str, cb);
  },

  setTab: function(tab, cb) {
    this.tab = tab;
    var self = this;
    this.client.connectToWebSocket(tab.webSocketDebuggerUrl);
    this.client.removeAllListeners(); 
    this.client.on('connect', function() {
      cb();
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
      console.log(resp);
      return cb(resp);

      if (err) throw err;

      if (resp.exception) {
        cb(resp.exceptionMessage);
        return;
      }

      var result = resp.result;

      if (result.type == "object") {
        result.ownPropertiesAndPrototype(function(err, resp) {
          if (err) return cb(err);

          result.safeGetterValues = resp.safeGetterValues;
          result.ownProps = resp.ownProperties;

          cb(null, result);
        })
      }
      else {
        cb(null, this.transformResult(resp.result));
      }
    }.bind(this))
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
