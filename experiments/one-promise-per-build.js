var watcher = require('../watcher');

watcher.then(logItForward);

function logItForward(hash) {
  console.log('RESOLVED:', JSON.stringify(hash));
  watcher.then(logItForward);
}
