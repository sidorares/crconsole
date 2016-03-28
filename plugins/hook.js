module.exports = function(chrome, repl) {
  chrome.Runtime.evaluate({expression: 'window.__CRCONSOLE_HOOK__ = function (type, payload) { }' }, function(err, res) {
    chrome.send('Debugger.getFunctionDetails', { functionId: res.result.objectId }, function(err, res) {
      chrome.Debugger.setBreakpoint(res.details, function(err, setBpRes) {
        self._hookScriptId = res.details.location.scriptId;
      });
    });
  });
}
