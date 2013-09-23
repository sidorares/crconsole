#!/usr/bin/env node

var program = require('commander');
var ChromeREPL = require("../index.js");

program
  .version('0.0.1')
  .option('-p, --port <port>', 'specify the port [9222]', Number, 9222)
  .option('-h, --host <host>', 'developer tools host [localhost]', String, 'localhost')
  .parse(process.argv);

var repl = new ChromeREPL();
repl.start(program);
