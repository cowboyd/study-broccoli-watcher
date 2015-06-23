var broccoli = require('broccoli');
var Watcher = require('broccoli/lib/watcher');

var tree = broccoli.loadBrocfile();
var builder = new broccoli.Builder(tree);
module.exports = new Watcher(builder);
