/**
 * This is an alternative to DwebTransports, designed to provide a bridge while DwebTransports is:
 *
 * a) Slimmed down, all transports should be optional
 * b) More moduler, e.g. names should only be loaded when needed
 * c) Incorporate the cache as a module
 * d) dweb-archivecontroller should probably not use names
 */
//TODO -handle name, or better dont use them.

import httptools from './httptools.js';
import stream from 'readable-stream';

function _httpurl(urls) {
  if (!Array.isArray(urls)) {
    return _httpurl([urls])
  } else {
    return urls.find(u => u.startsWith('http'));
  }
}
class DwebTransports {

  static p_connectedNames(cb) {
    cb(null, 'HTTP');
  }

  static fetch(urls, opts, cb) {
      httptools.p_GET(_httpurl(urls), opts, cb);
  }

  static _createReadStream(url, opts) {
    /*
    The function, encapsulated and inside another function by p_f_createReadStream (see docs)
    NOTE THIS DOESNT WONT WORK FOR <VIDEO> tags, but shouldnt be using it there anyway - reports stream.on an filestream.pipe aren't functions

    :param file:    Webtorrent "file" as returned by webtorrentfindfile
    :param opts: { start: byte to start from; end: optional end byte }
    :returns stream: The readable stream - it is returned immediately, though won't be sending data until the http completes
     */
    // This breaks in browsers ... as 's' doesn't have .pipe but has .pipeTo and .pipeThrough neither of which work with stream.PassThrough
    // TODO See https://github.com/nodejs/readable-stream/issues/406 in case its fixed in which case enable createReadStream in constructor above.
    debug("createreadstream %s %o", Url.parse(url).href, opts);
    let through;
    through = new stream.PassThrough();
    httptools.p_GET(this._url(url, servercommands.rawfetch), Object.assign({wantstream: true}, opts))
      .then(s => s.pipe(through))
      // Note any .catch is happening AFTER through returned
      .catch(err => {
        console.warn(this.name, "createReadStream caught error", err.message);
        if (typeof through.destroy === 'function') {
          through.destroy(err); // Will emit error & close and free up resources
          // caller MUST implimit through.on('error', err=>) or will generate uncaught error message
        } else {
          through.emit('error', err);
        }
      });
    return through; // Returns "through" synchronously, before the pipe is setup
  }


  static async p_f_createReadStream(urls, {wanturl = false, preferredTransports = []} = {}) {
    console.assert(!wanturl, "DwebTransportsAlternative doesnt support p_f_createReadStream with wanturl");
    url = _httpurl(urls);
    return function (opts) { return this._createReadStream(url, opts); };
  }
  static createReadStream(urls, opts, cb) {
      cb(null, this._createReadStream(_httpurl(urls), opts));
  }
}
DwebTransports.httptools = httptools; // Plug it where ArchiveItem and consumers of this repo expect to find it
window.DwebTransports = DwebTransports;
export default DwebTransports;