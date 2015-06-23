var watcher = require('../watcher');
watcher.on('change', function(hash) {
  console.log('CHANGE:', JSON.stringify(hash));
});
