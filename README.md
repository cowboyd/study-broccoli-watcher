## A Study of Broccoli's Watcher

> This is a log of my experience. It's mostly just stream of
> consciousness, and so may jump around and be confusing. If you want
> to play along, just `npm install` and you're good to go!

In order to integrate broccoli with karma, I need to know more about
how the watcher works. Unfortunately, there is very little to go on
with regards to documentation. There is no API documentation, and
watcher source file itself contains code only. I have several
questions about it because it looks like I'll need to instantiate one
directly in order to integrate it with karma. I've decided to document
this micro-research so that others, myself included may reap some
small benefit from it in the future.

### What does the broccoli callback interface look like?

From the what I've seen in other projects and what it looks like from
a source dive, it supports a promise-like API. E.g:

```javascript
var Watcher = require('broccoli/watcher');
var watcher = new Watcher(getBuilder())
watcher.then(function() {
  //do stuff?
});
```

Do I need to re-register and re-register a promise callback every time?

Actually looking into the source, it appears that the
[watcher emits events on `change` and on `error`](https://github.com/broccolijs/broccoli/blob/9923afe8f7c9ad7a05b5ebaf9a3233114214fdcd/lib/watcher.js#L52-L54). Is
that how I'm supposed to use it? Seems more likely. Let's give it a try.

To get started, I'll make a sample directory to watch with a single
file called sample/touch.me

and then a brocfile that builds `sample`.

It looks like the `Watcher` constructor takes a `builder` object. Not
sure what that is, but looking at the
[implementation in broccoli/cli](https://github.com/broccolijs/broccoli/blob/97585400e0babc1b33721fb2337ed9ded55f74fa/lib/cli.js#L61-L64),
it appears that a builder is some transformation on a brocfile.

What is this `loadBrocfile()`? [I found it here](https://github.com/broccolijs/broccoli/blob/21a778ed1d74c4321f9bdc596b7f5081868420d3/lib/index.js#L3), which means that it [is
actually defined here](https://github.com/broccolijs/broccoli/blob/21a778ed1d74c4321f9bdc596b7f5081868420d3/lib/builder.js#L89-L112). I'd
thought to try and get away with not having a brocfile, like be able
to specify which file to load, but it appears that it is hard-coded to
`Brocfile.js`, but it looks like from
[these lines](https://github.com/broccolijs/broccoli/blob/21a778ed1d74c4321f9bdc596b7f5081868420d3/lib/builder.js#L101-L102)
 that requiring the brocfile ought to return a function always?
 Because it appears to invoke that function with the broccoli module
 as an argument. Not really sure what that's about. Is that a
 node/commonjs thing, or a Broccoli thing? Since this is
 about the Watcher, I won't delve into that.

That said, my Brocfile will look like this:

```js
module.exports = 'sample'
```

And I'll preconfigure my watcher so that I can re-use it in my
various scripts:

`watcher.js`:
```javascript
var broccoli = require('broccoli');
var Watcher = require('broccoli/lib/watcher');

var tree = broccoli.loadBrocfile();
var builder = new broccoli.Builder(tree);
module.exports = new Watcher(builder);
```

`experiments/event-api.js`
```javascript
var watcher = require('../watcher');
watcher.on('change', function(hash) {
  console.log('change', JSON.stringify(hash));
});
```

Now I'll start up the watcher.

```
$ node experiments/event-api.js                                                                                                                                       ◼
CHANGE: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```

Cool! That was actually easier to get working than I expected.

The first thing I was suprised to see was that it fired the change
event immediately. It makes total sense upon reflection, after all,
you do want to get notification about the completion of the initial
build, but it did suprise me because the word 'change' implies some
sort of transition from the initial state. Naming the event
`on('build')` might be less confusing.

So now, if I run the touch me script in that directory will it
indicate a change?

```
$ sample/touch.me
```

Yup! Just as expected:

```
$ node experiments/event-api.js
CHANGE: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":1,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```

What about adding a file?:

```
$ touch sample/another.file
```

blammo!

```
$ node experiments/event-api.js
CHANGE: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":1,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":2,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```

And if I remove that file?

```
$ rm sample/another.file
```

It's almost as if it were designed for this :)

```
$ node experiments/event-api.js
CHANGE: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":1,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":2,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
CHANGE: {"directory":"sample","graph":{"id":3,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```


### Blocking

Another thing I noticed right off the bat was that just by being
present, the watcher, caused the process to block until it received
`SIGINT`. In other words, I had to hit `ctrl-c` to make it
quit. What's up with that? It seems like the desired behavior, but
what triggers it? Is it the builder, or the watcher.

To find out, lets write a script that contains everything in
`watcher.js` but without the actual wather instantiation.

`experiments/is-it-the-builder.js`:
```javascript
var broccoli = require('broccoli');
var tree = broccoli.loadBrocfile();
var builder = new broccoli.Builder(tree);
```

which yields:
```
$ node experiments/is-it-the-builder.js                                                                                                                               ✱
$
```

It exits immediately, so it must be the watcher. My guess is that it
is related to
[this call to `setTimetout()`](https://github.com/broccolijs/broccoli/blob/9923afe8f7c9ad7a05b5ebaf9a3233114214fdcd/lib/watcher.js#L69). I'm
not a hardcore noder, but my guess is that the process will not quit
as long as there is a remaining computation scheduled. In this case,
the watcher is always scheduling the next check inside the current
one. so there is never an opportunity for the process to wind down.

### Is there a way to manually stop the watcher?

There doesn't appeart to be an exit path from the watcher. There may
be, but it is not apparent. Exploring the intersection of error
handling and process control from a watching process is a separate
line of inquiry. Right now, I'm angling for the karma plugin. To that
end, i need a way to make sure that a build is complete *before* I do
a test run. In other words, I have the following sequence.

1. start the karma server (this initiates a build)
1. invoke `karma run` at some later point. The build may not be
complete.
1. the build completes
1. the test suite runs and reports back results.

I need (2) or (3) to be able to happen in either order. Or, once the
server is running:

1. developer makes a change.
1. build starts
1. developer invokes `karma run`
1. build completes
1. test run begins.

(3), and (4) could happen in any order, but (5) should only happen,
once (4) is complete. Which sounds like a `Promise` is just what the
doctor ordered, right? Let's see what happens with the promise api.

Let's make a script that registers a promise handler.

`experiments/promise-api.js`:
```javascript
var watcher = require('../watcher');

watcher.then(function(hash) {
  console.log('RESOVLED:', JSON.stringify(hash));
});
```

invoking this:
```
$ node experiments/promise-api.js                                                                                                                                 ⏎ ✱ ◼
RESOVLED: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```

I guess it isn't a suprise that the resolved value of the promise is
the same as the argument to the event handler. Now let's check what
happens if we touch the file:

```
$ sample/touch.me
```

```
$ node experiments/promise-api.js                                                                                                                                 ⏎ ✱ ◼
RESOVLED: {"directory":"sample","graph":{"id":0,"description":"String","subtrees":[],"selfTime":0,"totalTime":0},"totalTime":0}
```

Aha! and this is what I want... no matter how many times I touch the
file, it only logs out the RESOLVED for the very first build. That
way, in my karma plugin, I'll have a custom executor that will wait
until the *current* build finishes, before actually executing the test
suite.

## Conclusions

#### The Bad

It's poorly documented. There is no clear way to stop a watcher from
watching other than via a SIGINT. Which APIs are public and which are
private is unclear. E.g. I'm pretty sure I shouldn't be calling
`addWatchDir()` directly, but that isn't clear when approaching the
class with zero context.

#### The Good

Broccoli Watcher definitely provides the primitives I need to make a
robust karma plugin. By building on a low level Promise-like api, it
allows you to synchronize imperative actions with a build, but also
provides for a purely reactive configuration via events.

The litmus test of good software is that it allows you to use it
without modification, and that's definitely the case here.

Let the karma pipe dream continue!
