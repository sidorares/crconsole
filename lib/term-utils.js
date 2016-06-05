module.exports.getCursorPosition = function getCursorPosition(cb) {
  var wasRaw = process.stdin.isRaw;
  if (!wasRaw)
    process.stdin.setRawMode(true);
  process.stdin.once('data', function(buf) {
    if (!wasRaw)
      process.stdin.setRawMode(false);
    var coords = buf.toString().replace(/[^0-9;]/g, '').split(';').map(Number)
    var res = { row: coords[0], column: coords[1]}
    cb(res);
  })
  process.stdout.write("\033[6n");
}

module.exports.cursorTo = function (x, y) {
  process.stdout.write('\x1b[' + (y + 1) + ';' + (x + 1) + 'H');
};
