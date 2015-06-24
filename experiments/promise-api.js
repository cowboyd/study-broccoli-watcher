var watcher = require('../watcher');

watcher.then(function(hash) {
  console.log('RESOVLED:', JSON.stringify(hash));
});
