#!/usr/bin/env node
process.env.DEBUG=process.env.DEBUG + "test:*";
const debug = require('debug')('test:*');
console.log("STARTING TEST");

const {_formatarr} = require('./Util');

console.log("TESTING MIMETYPES");
byMimetype = {}

// Organize
_formatarr.forEach( f => {
  const m = f["mimetype"];
  if (!byMimetype[m]) byMimetype[m] = [];
  byMimetype[m].push(f);
})

function report(label, m, ff) {
  debug("%s %s", label, m);
  ff.forEach(f => debug('   %o', f));
}

Object.entries(byMimetype).forEach(mff => {
  m = mff[0];
  ff = mff[1];
  if (ff.length > 1) { // Have some duplication.
    countext = ff.filter(f=>f.ext).length;
    countformat = ff.filter(f=>f.format).length;
    countdownloadable = ff.filter(f=>f.downloadable).length;
    if ((countext === 1) && (countformat < ff.length)) {
      //Have some formats with extensions and some without, should probably merge
      report("Can probably copy extension to some of these", m, ff)
    }
    if ((countformat === 1) && (countext < ff.length)) {
      //Have some formats with extensions and some without, should probably merge
      report("Can probably copy format to some of these", m, ff);
    }
    /* Looks like this is not a good test
      if ((countdownloadable !== 0) && (countdownloadable !== ff.length)) {
        report("Maybe copy downloadable", m, ff);
      }
    */
    //console.log("Duplicate",m)
    //ff.forEach( f => console.log(f));

  }
})
debug("List of archive formats not downloadable for Carl")
_formatarr.filter(f => f.format && !f.downloadable).forEach(f => {
  console.log(f.format);
})
