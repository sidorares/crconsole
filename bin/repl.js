#!/usr/bin/env node

var program = require('commander');
var ChromeREPL = require("../index.js");

program
  .version(require('../package.json').version)
  .option('-p, --port <port>', 'specify the port [9222]', Number, 9222)
  .option('-a, --host <host>', 'developer tools host address [localhost]', String, 'localhost')
  .option('-s, --start', 'start chrome auromatically and wait for debugger', Boolean, false)
  .option('-c, --canary', 'prefer canary over stable chrome', Boolean, false)
  .parse(process.argv);

var repl = new ChromeREPL();

if (program.start) {
  startChrome(function(err) {
    if (err) {
      console.log(err);
      return;
    }
    repl.start(program);
  });
} else {
  repl.start(program);
}

function startChrome(cb) {
  var MAX_TIMEOUT = 5000;
  var startTime = new Date();
  var chrome_runner = require('node-chrome-runner');
  var versions;
  if (program.canary)
    versions = [chrome_runner.chromePaths.canary];
  var c = chrome_runner.runChrome({
    versions: versions,
    args:['--remote-debugging-port=' + program.port]
  });
  var net = require('net');
  process.stdout.write('Waiting for chrome to start: ');
  function tryConnect() {
    var conn = net.connect(program.port);
    conn.on('error', function() {
      process.stdout.write('.')
      if (new Date() - startTime < MAX_TIMEOUT)
        setTimeout(tryConnect, 300);
      else
        cb(new Error('timed out waiting for remote debugger available on port ' + program.port));
    });
    conn.on('connect', function() {
      console.log('');
      conn.end();
      cb();
    });
  }
  tryConnect();
}
