var installGlobalHook = require('./installGlobalHook.js');
var attachRenderer    = require('./attachRenderer.js');
// var installRelayHook = require('./Relay/installRelayHook.js');
var injectAgent = require('./injectAgent.js')

var saveNativeValues = `

  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.nativeObjectCreate = Object.create;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.nativeMap = Map;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.nativeWeakMap = WeakMap;
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__.nativeSet = Set;

`;

var js = (
  ';(' + installGlobalHook.toString() + '(window))\n' +
  //  ';(' + installRelayHook.toString() + '(window))' +
  attachRenderer.toString() +
  saveNativeValues +
  ';(' + injectAgent.toString() + '(window.__REACT_DEVTOOLS_GLOBAL_HOOK__))'
);

function runtimeEval(chrome, src, cb) {
  //console.log(src.split('\n').map((l, i) => i + ' === ' + l).join('\n'))
  chrome.Runtime.evaluate({expression: src}, function(err, res) {
    cb(err, res)
    // TODO: print line with error if errored
    // TODO: move to main helpers
  });
}

module.exports = function(chrome, repl, cb) {
  runtimeEval(chrome, js, function(err, res) {
    console.log(err, res);
    var agentRemoteId = res.result.objectId;
    cb(null, agentRemoteId);
  });
  // TODO does not seem to work. Also probably no way to inject script before attaching debugger
  // looks like need to use extension
  // crome.send('Page.addScriptToEvaluateOnLoad', { scriptSource: js + saveNativeValues }, function(err, res) {
  //  console.log('Page.addScriptToEvaluateOnLoad============', res);
  // });
}
