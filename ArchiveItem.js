/* global DwebTransports, DwebArchive */
/* eslint-disable camelcase, consistent-return, curly, indent, object-property-newline, no-console, nonblock-statement-body-position */
const debug = require('debug')('dweb-archivecontroller:ArchiveItem');
const ArchiveFile = require('./ArchiveFile');
const ArchiveMember = require('./ArchiveMember');
const { enforceStringOrArray, gateway, objectFrom, ObjectFromEntries, parmsFrom, rules,
  _query, specialidentifiers, collectionSortOrder, excludeParentSortOrder } = require('./Util');
const { routed } = require('./routing');

/* Note for Bookreader
    API = RawBookReaderResponse = AI.exportBookReader() = { data: { data, brOptions, lendingInfo, metadata }
    ArchiveItem.bookreader =  file <IDENTIFIER>_bookreader.json = { data, brOptions, lendingInfo, metadata }
 */

// General purpose utility functions
// Filter an array until f returns true.
function ArrayFilterTill(arr, f) {
  const res = [];
  for (const i in arr) { // noinspection JSUnfilteredForInLoop
    const x = arr[i];
    if (f(x)) { return res; } else { res.push(x); }
  }
  return res;
}

/**
 * Base class representing an Item and/or a Search query (A Collection is both).
 * This is just storage, the UI is in dweb-archive, this class is also used by dweb-mirror to encapsulate access to IA APIs
 *
 * Fields:
 * itemid|identifier: Archive.org reference for object (itemid is legacy - use identifier where possible)
 * item:   Metadata decoded from JSON from metadata search.
 * members:  Array of data from a search.
 * files:  Will hold a list of files when its a single item
 * query:  Either a string e.g. 'bananas' or a an object like {collection: 'mitratest', description: 'bananas'}
 */
class ArchiveItem {

  /**
   *
   * @param identifier IDENTIFIER (optional)
   * @param itemid     IDENTIFIER deprecated
   * @param query      search string e.g. 'foo' or 'creator:foo'
   * @param sort string  e.g. 'title' or '-downloads', only relevant to a query
   * @param metaapi    the result of a call to the metadata API (optional) {metadata:{...},...}
   */
  constructor({ identifier = undefined, itemid = undefined, query = undefined, sort = [], metaapi = undefined } = {}) {
    this.itemid = identifier || itemid; // Legacy itemid parameter
    this.loadFromMetadataAPI(metaapi); // Note - must be after itemid loaded
    this.query = query;
    this.sort = Array.isArray(sort) ? sort : sort ? [sort] : []; // Always an array here
  }

  /**
   * Export a data structure of files suitable for stringify, moves downloaded flag down one level.
   * @returns [ { } ] returns the file metadata with addition of downloaded field, suitable for storing in a cache
   */
  exportFiles() {
    // Note we are storing as AF.downloaded.metadata as only store that, but reading back in AF.constructor converted to AF.downloaded
    return this.files.map(f => Object.assign({ downloaded: f.downloaded }, f.metadata));
  }

  /**
   * Export data in form received from metadata API call (suitable for caching, or passing to a query)
   * @param wantPlaylist boolean  True if want to include the playlist:[] in the results
   * @returns {metadata: {}, ... }  In
   */
  exportMetadataAPI({ wantPlaylist = false } = {}) {
    return Object.assign(
      // SEE-OTHER-ADD-METADATA-API-TOP-LEVEL in dweb-mirror and dweb-archivecontroller
      {
        files: this.exportFiles(),
        members: this.membersFav,
        metadata: this.metadata,
        reviews: this.reviews,
      },
      ObjectFromEntries(ArchiveItem.extraFields.map(k => [k, this[k]])),
      wantPlaylist ? { playlist: this.playlist } : { }
    );
  }

  _mergeExtra(o) {
    // Carefully merge extras into ArchiveItem,
    // In particular this shouldn't merge downloaded:null which is in some corrupt data
    // ai can be an ArchiveItem, or an Object intended to be one
    if (o) {
      ArchiveItem.extraFields.forEach(k => {
        if (o[k]) this[k] = o[k];
      });
    }
  }

  /**
   * Imports API data and loads fields, it process some of the Fjords (endless edge cases)
   * @param metaapi {metadata:{}, ...}  Passed something either from Metadata API call, or faked to look like it
   */
  loadFromMetadataAPI(metaapi) {
    if (metaapi) {
      console.assert(typeof this.itemid !== 'undefined', 'itemid should be loaded before here - if legit reason why not, then load from meta.identifier');
      this.files = (metaapi && metaapi.files)
        ? metaapi.files.map((f) => new ArchiveFile({
          itemid: this.itemid,
          // Note code did show this.magnetlink, so maybe called that way, but I'm finding magnetlink in metaapi when
          // called directly in browser after call to metadata API - if called other way make this metaapi.magnetlink || this.magnetlink
          magnetlink: metaapi.magnetlink,
          metadata: f }))
        : []; // Default to empty, so usage simpler.
      if (metaapi.metadata) {
        const meta = enforceStringOrArray(metaapi.metadata, rules.item); // Just processes the .metadata part
        if (meta.mediatype === 'education') {
          // Typically miscategorized, have a guess !
          if (this.files.find(af => af.playable('video')))
            meta.mediatype = 'movies';
          else if (this.files.find(af => af.playable('text')))
            meta.mediatype = 'texts';
          else if (this.files.find(af => af.playable('image')))
            meta.mediatype = 'image';
          debug('Metadata Fjords - switched mediatype on %s from "education" to %s', meta.identifier, meta.mediatype);
        }
        if (meta.mediatype === 'texts' && this.files.find(af => af.metadata.format === 'Abbyy GZ')) {
          // We have one of these fake Epub files that for reasons unclear aren't derived and stored, but built/cached on demand, fake it
          // TODO-EPUB get size and downloaded from file in DM when already cached
          if (!this.files.find(af => af.metadata.format === 'Epub'))
            this.files.push(new ArchiveFile({ // Intentionally not passing magnetlink its not in the torrent
              itemid: this.itemid, metadata: { name: this.itemid + '.epub', format: 'Epub' } }));
          if (!this.files.find(af => af.metadata.format === 'Kindle'))
            this.files.push(new ArchiveFile({ // Intentionally not passing magnetlink its not in the torrent
              itemid: this.itemid, metadata: { name: this.itemid + '.mobi', format: 'Kindle' } }));
        }
        this.metadata = meta;
      }
      // These will be unexpanded if comes from favorites, its expanded by fetch_query (either from cache or in _fetch_query>expandMembers)
      this.membersFav = metaapi.members && metaapi.members.map(o => ArchiveMember.fromFav(o));
      this._mergeExtra(metaapi);
      if (metaapi.playlist) {
        this.playlist = this.processPlaylist(metaapi.playlist);
      }
    }
  }

  /**
   *
   * Apply the results of a bookreader API or exportBookreaderAPI() call to an ArchiveItem, (see notes at page top on which structure is where)
   * @param bookapi       Result of call to bookreader API
   * @returns {undefined}
   */
  loadFromBookreaderAPI(bookapi) {
    if (bookapi) {
      console.assert(typeof this.itemid !== 'undefined', 'itemid should be loaded before here - if legit reason why not, then load from meta.identifier');
      delete (bookapi.data.metadata); // Dont keep  metadata as its just a duplicate
      this.bookreader = bookapi.data;
    }
  }

  /**
   *
   * Fetch the metadata for this item if it hasn't already been.
   * This function is intended to be monkey-patched in dweb-mirror to define caching.
   * Its monkeypatched because of all the places inside dweb-archive that call fetch_query
   *
   * @param opts {
   *          noCache Set Cache-Control no-cache header (note in dweb-mirror version this stops it reading the cache)
   *          darkOK bool True if a dark item is ok, return empty, otherwise a dark item will throw an error
   *          }
   * @param cb(err, this)
   * @returns {Promise<ARCHIVEITEM> if no cb passed}
   */
  fetch_metadata(opts = {}, cb) {
    if (typeof opts === 'function') { cb = opts; opts = {}; } // Allow opts parameter to be skipped
    if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
    function f(cb1) {
      // noinspection JSPotentiallyInvalidUsageOfClassThis
      if (this.itemid && !(this.metadata || this.is_dark)) { // If have not already fetched (is_dark means no .metadata field)
        // noinspection JSPotentiallyInvalidUsageOfClassThis
        this._fetch_metadata(opts, cb1); // Processes Fjords & Loads .metadata .files etc
      } else {
        cb1(null, this);
      }
    }
  }

  /**
   *
   * @param optionalMetaapi   result of Metadata API call (optional)
   * @returns {boolean}       true if item (or optionalMetaapi if passed) has a playlist
   */
  hasPlaylist(optionalMetaapi) {
    // Encapsulate the heuristic as to whether this has a playlist
    const metaapi = optionalMetaapi || this;
    // This is run in _fetch_metadata before metadata gets cleaned up (after which collection is always an array)
    const collection = Array.isArray(metaapi.metadata.collection) ? metaapi.metadata.collection : [metaapi.metadata.collection];
    return (
      (!metaapi.is_dark)
      && ['audio', 'etree', 'movies'].includes(metaapi.metadata.mediatype)
      && !collection.some(c => ['tvnews', 'tvarchive'].includes(c)) // See also this heuristic in subtype()
    );
  }

  _fetch_metadata({ darkOk = undefined, noCache = undefined } = {}, cb) {
    /*
    Fetch the metadata for this item - dont use directly, use fetch_metadata.
     */
    // If the itemid is one of the special ids and we are not talking to a mirror then load the predefined 'special' metadata
    const special = specialidentifiers[this.itemid];
    if (!(typeof DwebArchive !== 'undefined' && DwebArchive.mirror) && typeof special !== 'undefined') {
      this.loadFromMetadataAPI({ metadata: special });
      cb(null, this);
    } else {
      debug('getting metadata for %s', this.itemid);
      // Note dweb-archivecontoller/routing.js resolver will direct this to Gun, dweb-metadata service etc
      const urls = routed('https://archive.org/metadata/' + this.itemid);
      // Fetch using Transports as its multiurl and might not be HTTP urls
      // noinspection JSUnusedLocalSymbols
      DwebTransports.fetch(urls, { noCache, timeoutMS: 5000 }, (err, m) => { // TransportError if all urls fail (e.g. bad itemid)
        if (err) {
          cb(new Error(`Unable to fetch metadata for ${this.itemid}\n ${err.message}`));
        } else {
          // noinspection ES6ModulesDependencies
          const metaapi = objectFrom(m); // Handle Buffer or Uint8Array
          if (metaapi.is_dark && !darkOk) { // Only some code handles dark metadata ok
            this.is_dark = true; // Flagged so wont continuously try and call
            // TODO the \n here is ignored, need the DetailsError to convert to <BR> or handle a real linebreak same way
            cb(new Error('This item is no longer available. \nItems may be taken down for various reasons, including by decision of the uploader or due to a violation of our Terms of Use.'));
          } else if (!metaapi.is_dark && (metaapi.metadata.identifier !== this.itemid)) {
            cb(new Error(`_fetch_metadata didnt read back expected identifier for ${this.itemid}`));
          } else {
            debug('metadata for %s fetched successfully %s', this.itemid, this.is_dark ? 'BUT ITS DARK' : '');
            if (this.hasPlaylist(metaapi)) {
              // Fetch and process a playlist (see processPlaylist for documentation of result)
              const playlistUrls = routed(`https://archive.org/embed/${this.itemid}?output=json`);
              DwebTransports.fetch(playlistUrls, { noCache }, (err1, res) => { // TODO-PLAYLIST add to other transports esp Gun and cache in DwebMirror
                if (err1) {
                  cb(new Error('Unable to read playlist: ' + err1.message));
                } else {
                  metaapi.playlist = res;
                  this.loadFromMetadataAPI(metaapi); // Loads .metadata .files .reviews and some other fields
                  cb(null, this);
                }
              });
            } else { // Dont need playlist and the embed code has a bug on other mediatypes.
              this.loadFromMetadataAPI(metaapi); // Loads .metadata .files .reviews and some other fields
              cb(null, this);
            }
          }
        }
      });
    }
  }

  /**
   * Fetch and store data from bookreader API
   * @param opts { page }        doesnt appear to be used
   * @param cb(err, ARCHIVEITEM)
   * @returns {Promise<ARCHIVEITEM>|void} if no cb passed
   */
  fetch_bookreader(opts = {}, cb) {
    if (cb) { return this._fetch_bookreader(opts, cb); } else { return new Promise((resolve, reject) => this._fetch_bookreader(opts, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
  }

  _fetch_bookreader({ page = undefined } = {}, cb) {
    console.assert(this.server, 'fetch_bookreader must be called after fetch_metadata because it requires specific IA server');
    // TODO-BOOK this was requesting format=jsonp but seems to return json (which is what we want) anyway
    // See also configuration in dweb-archive/BookReaderWrapper.js
    const protocolServer = (typeof DwebArchive !== 'undefined' && DwebArchive.mirror) || 'https://www-dweb-cors.dev.archive.org';
    const [unusedProtocol, unused, server] = protocolServer.split('/');
    const subPrefixFile = this.files.find(f => f.metadata.format.startsWith('Single Page Processed'));
    const subPrefix = subPrefixFile ? subPrefixFile.metadata.name.slice(0,subPrefixFile.metadata.name.lastIndexOf('_')) : undefined;
    const parms = parmsFrom({
      subPrefix,
      server,
      audioLinerNotes: this.metadata.mediatype === 'audio' ? 1 : 0,
      id: this.itemid,
      itemPath: this.dir,
      format: 'json',
      requestUri: `/details/${this.itemid}${page ? '/page/'+page : ''}` // Doesnt seem to be used
    });
    const url = routed(`https://archive.org/BookReader/BookReaderJSIA.php?${parms}`, { wantOneHttp: true }); // Not really a valid url as would need to be a datanode
    DwebTransports.httptools.p_GET(url, {}, (err, res) => {
      if (res) {
        delete res.data.metadata; // Duplicates ai.metadata
        this.bookreader = res.data; // undefined if err
      }
      cb(err, this);
    });
  }

  /**
   *
   * Action a query, return the array of docs found and store the accumulated search on .members
   * Subclassed in Account.js since dont know the query till the metadata is fetched
   *
   * This function is intended to be monkey-patched in dweb-mirror to define caching.
   * Its monkeypatched because of all the places inside dweb-archive that call fetch_query
   * Patch will call _fetch_query
   * Errs include if failed to fetch
   *
   * @param opts {
   *    wantFullResp,  set to true if want to get the result of the search query (because proxying) rather than just the docs
   *    noCache}
   * @param cb(err. [ARCHIVEMEMBER])
   * @returns {Promise<[ARCHIVEMEMBER]>|void} (if no cb passed)
   */
  fetch_query(opts = {}, cb) { // opts = {wantFullResp=false}
    if (cb) { return this._fetch_query(opts, cb); } else { return new Promise((resolve, reject) => this._fetch_query(opts, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
  }

  /**
   * Fetch next page of query
   * @param opts (see fetch_query)
   * @param cb(err, [ARCHIVEMEMBER])
   */
  more(opts, cb) {
    this.page++;
    this.fetch_query(opts, (err, newmembers) => {
      if (err) { this.page--; } // Decrement page back if error
      cb(err, newmembers);
    });
  }

  /**
   *
   * Return current page of results, note that page 1 is the 0th..rows-1 items, and page 0 is same as page 1.
   * @param wrapInResponse  TRUE if want it to look like an advancedsearch.php response
   * @returns [ARCHIVEMEMBER]
   */
  currentPageOfMembers(wrapInResponse) {
    return wrapInResponse
      ? { response: { numFound: this.numFound, start: this.start, docs: this.currentPageOfMembers(false) } } // Quick recurse
      : this.membersFav.concat(this.membersSearch).slice((Math.max(1, this.page) - 1) * this.rows, this.page * this.rows);
  }

  currentPageOfMembersFail() {
    // Probably failed if: wanted (based on page) more than in members(Search+Fav) and numFound is more than this
    // Note be careful about using numFound if havent done search at all (now or in dweb-mirror previously)
    const membersCombinedLength = (this.membersFav.length + this.membersSearch.length);
    return (this.page * this.rows > membersCombinedLength) && (membersCombinedLength < this.numFound);
  }

  _expandMembers(cb) {
    // Dont actually need to expand this.membersSearch, will be result of search, or cached and so expanded already
    ArchiveMember.expandMembers(this.membersFav, (err, mm) => {
      if (!err) {
        this.membersFav = mm;
      }
      cb(null, this); // Dont pass error up, its ok not to be able to expand some or all of them
    });
  }

  _buildQuery() {
    // Build a query if not already explicitly set
    if (!this.query) { // Check if query has been defined, and if not set it up
      this.query = [
        // TODO may want to turn this into a 'member' query if running to mirror, then have mirror cache on item and run this algorithm
        // Catch any collections - note 'collection: might need to be first to catch a pattern match in mirror
        this.itemid && this.metadata && this.metadata.mediatype === 'collection' && 'collection:' + this.itemid,
        // Now two kinds of simple lists, but also only on collections
        this.metadata && this.metadata.search_collection && "(" + this.metadata.search_collection.replace('\\"', '"') + ")",
        this.itemid && this.metadata && this.metadata.mediatype === 'collection' && this.itemid && 'simplelists__items:' + this.itemid,
        this.itemid && this.metadata && this.metadata.mediatype === 'collection' && this.itemid && 'simplelists__holdings:' + this.itemid,
        // Search will have !this.item example = 'ElectricSheep'
        this.metadata && this.metadata.mediatype === 'account' && 'uploader:' + this.metadata.uploader,
      ].filter(f => !!f).join(' OR '); // OR any non empty ones
    }
  }

  /**
   * Heuristic to determine default sort order - its baked into the PHP on archive.org but not sure where.
   * TV News is defined in  petabox/TV.inc/is_tv_collection()
   * Note the sort order depends on the collection it is part of.
   * @returns {array}
   * @private
   */
  defaultSortArr() {
    const ownOrderDef = Object.entries(collectionSortOrder).find(kv => kv[1].includes(this.itemid)); // Pre-defined
    const parentOrderDef = this.metadata && this.metadata.collection && (Object.entries(collectionSortOrder)
      .find(kv => this.metadata.collection.some(c => kv[1].includes(c))));
    return (
      (Array.isArray(this.sort) && this.sort.length)
      ? this.sort
      : this.sort.length // string
      ? [this.sort]
      : this.itemid && this.itemid.startsWith('fav-')
      ? ['-updatedate']
      : ownOrderDef
      ? [ownOrderDef[0]]
      : parentOrderDef && !excludeParentSortOrder.includes(this.itemid)
      ? [parentOrderDef[0]]
      : (this.metadata && this.metadata.mediatype === 'account')
      ? ['-publicdate']
      : ['-downloads']
    );
  }

  _fetch_query({wantFullResp = false, noCache = false } = {}, cb) { // No opts currently
    /*
        rejects: TransportError or CodingError if no urls

        Several different scenarios
        Defined by a members.json file e.g. 'fav-brewster'
        Defined by a metadata.search_collection e.g. 'ElectricSheep'
        Defined by mediatype:collection, query should be q=collection:<IDENTIFIER>
        Defined by simple Lists  e.g. vtmas_disabilityresources
        Defined by query - e.g. from searchbox

        Note this is complicated because of handling paged requests that might be out of order, it tries to self correct
        so the query sent upstream might not match the request.
    */
    // First we look for the fav-xyz type collection, where there is an explicit JSON of the members
    try {
      // Make it easier rather than testing each time
      if (!Array.isArray(this.membersFav)) this.membersFav = [];
      if (!Array.isArray(this.membersSearch)) this.membersSearch = [];
      this._expandMembers((unusederr, unusedSelf) => { // Always succeeds even if it fails it just leaves members unexpanded.
        if ((this.membersFav.length + this.membersSearch.length) < (Math.max(this.page, 1) * this.rows)) {
          // Either cant read file (cos yet cached), or it has a smaller set of results
          this._buildQuery(); // Build query if not explicitly set
          if (this.query) { // If this is a 'Search' then will come here.
            const sort = this.defaultSortArr();
            const queryObj = {
              output: 'json',
              q: this.query,
              rows: this.rows,
              page: this.page,
              'sort[]': sort,
              'and[]': this.and,
              'save': 'yes',
              'fl': gateway.url_default_fl, // Ensure get back fields necessary to paint tiles
            };
            // Handle the cases here we are jumping ahead beyond current page - best to fill in the gap
            const expectedCurrentLengthMembersSearch = (this.rows * (this.page - 1));
            const expectedFinalLengthMembersSearch = this.rows * (this.page - 1);
            if (expectedCurrentLengthMembersSearch !== this.membersSearch.length) {
              if ((this.membersSearch.length * 2) >= expectedFinalLengthMembersSearch) {
                // Half way there, can get in one go, but look ahead a bit anyway.
                queryObj.page = 2;
                queryObj.rows = this.membersSearch.length;
              } else {
                // Not half way there reread the lot.
                this.membersSearch = [];
                queryObj.page = 1;
                queryObj.rows = (this.rows * this.page);
              }
              debug('_fetch_query filling in the gap retrieved so far=%s expected %s fetching page=%s rows=%s', this.membersSearch.length, expectedCurrentLengthMembersSearch, queryObj.page, queryObj.rows);
            }
            _query(queryObj, { noCache }, (err, j) => {
              if (err) { // Will get error 'failed to fetch' if fails
                debug('ERROR _fetch_query %s', err.message);
                cb(null, this.currentPageOfMembers(wantFullResp));
                // Note not calling cb(err,undefined) because if fail to fetch more items the remainder may be good especially if offline
                // 2019-01-20 Mitra - I'm not sure about this change, on client maybe wrong, on mirror might be right.
                // TODO 2019-08-27 see https://github.com/internetarchive/dweb-mirror/issues/248 want ability to see error and requeue
              } else {
                const oldids = this.membersSearch.map(am => am.identifier);
                const corruptOrder = j.response.docs.find(o => oldids.includes(o.identifier)); // Shouldnt be any overlap
                // If the order is corrupt we should do the full search but we'll fake it and pretend its just one big page
                if (!corruptOrder) {
                  this.membersSearch = this.membersSearch.concat(j.response.docs.map(o => new ArchiveMember(o)));
                  this.start = j.response.start;
                  this.numFound = j.response.numFound;
                  this.downloaded = j.response.downloaded;
                  if (j.response.crawl) this.crawl = j.response.crawl;
                  cb(null, this.currentPageOfMembers(wantFullResp));
                } else {
                  debug('Search order corruption - correcting by requery');
                  Object.assign(queryObj, { rows: this.page * this.rows, page: 1});
                  _query(queryObj, { noCache }, (err1, j1) => {
                    if (err1) {
                      debug('ERROR re-query failed %s rows=%s page=%s', queryObj.q, queryObj.rows, queryObj.page);
                    } else {
                      this.membersSearch = j1.response.docs.map(o => new ArchiveMember(o));
                      this.start = j1.response.start;
                      this.numFound = j1.response.numFound;
                      this.downloaded = j1.response.downloaded;
                      if (j1.response.crawl) this.crawl = j1.response.crawl;
                    }
                    cb(null, this.currentPageOfMembers(wantFullResp));
                  });
                }
              }});
            return; // Will cb above after query
          }
          // Neither query, nor metadata.search_collection nor file/ITEMID_members.json so not really a collection
        }
        // If did not do the query, just return what we've got
        cb(null, this.currentPageOfMembers(wantFullResp));
      });
    } catch (err) {
      console.error('Caught unexpected error in ArchiveItem._fetch_query',err);
      cb(err);
    }
  }

  /**
   *
   * @param wantStream boolean    TRUE if want result as a stream (for the http server)
   * @param wantMembers           TRUE if want results converted to an array of ArchiveMember
   * @param noCache               TRUE to send cache skipping headers
   * @param cb(err, [ARCHIVEMEMBER] || {hits: {hits: [{}]}}
   * @returns {Promise<unknown>}   If no cb passed
   */
  relatedItems({ wantStream = false, wantMembers = false, noCache = false } = {}, cb) { // TODO-RELOAD set this
    /* This is complex because handles three cases, where want a stream, the generic result of the query or the results expanded to Tile-able info
        returns either related items object, stream or array of ArchiveMember, via cb or Promise

        Current usage:
        In ia-components/.../RelatedItems (wantMembers)
        Note that wantStream is currently only used by callers of ArchiveItemPatched, thought it should work

        It is also replaced in ArchiveItemPatched to use the cache and that function is used ..
        in dweb-mirror/CrawlManager CrawlItem.process uses ArchiveItemPatched.relatedItems(wantMembers) to crawl
        in dweb-mirror/mirrorHttp/sendRelated (wantStream) to proxy to a client

    */
    if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
    function f(cb1) {
      const relatedUrl = routed(`https://be-api.us.archive.org/mds/v1/get_related/all/${this.itemid}`);
      if (wantStream) { // Stream doesnt really make sense unless caching to file
        // noinspection JSCheckFunctionSignatures
        DwebTransports.createReadStream(relatedUrl, {}, cb1);
      } else {
        // Maybe problem if offline but I believe error propagates up
        DwebTransports.fetch(relatedUrl, { noCache }, (err, res) => {
          if (err) {
            cb1(err);
          } else {
            try {
              const rels = objectFrom(res);
              cb1(null, wantMembers ? rels.hits.hits.map(r => ArchiveMember.fromRel(r)) : rels);
            } catch (err1) {
              cb1(err1); // Usually bad json
            }
          }
        })
      }
    }
  }

  /**
   * Find the file to use for the thumbnail
   * this should handle the case of whether the item has had metadata fetched or not,
   * and must be synchronous as stored in <img src=> (the resolution is asynchronous)
   *
   * @returns {ARCHIVEFILE || undefined}
   */
  thumbnailFile() {
    // New items should have __ia_thumb.jpg but older ones dont
    return this.files && this.files.find(af => af.metadata.name === '__ia_thumb.jpg'
      || af.metadata.name.endsWith('_itemimage.jpg'));
  }

  /**
   * Get a thumbnail for a video - may extend to other types, return the ArchiveFile
   * This is used to select the file for display and also in dweb-mirror to cache it
   * Heuristic is to select the 2nd thumbnail from the thumbs/ directory (first is often a blank screen)
   *
   * @returns ARCHIVEFILE || undefined
   */
  videoThumbnailFile() {
    console.assert(this.files, 'videoThumbnailFile: assumes setup .files before');
    console.assert(this.metadata.mediatype === 'movies', 'videoThumbnailFile only valid for movies');
    if (this.playlist[0] && this.playlist[0].imageurls) {
      return this.playlist[0].imageurls;
    } else {
      const videoThumbnailUrls = this.files.filter(fi => (fi.metadata.name.includes(`${this.itemid}.thumbs/`))); // Array of ArchiveFile
      return videoThumbnailUrls.length
        ? videoThumbnailUrls[Math.min(videoThumbnailUrls.length - 1, 1)]
        : this.thumbnailFile(); // If none then return ordinary thumbnail, or undefined if no thumbnail for item either
    }
  }

  /**
   * Find the first file that can be played
   * @param type string Type of file to play from range in format field of util._formatarr e.g. 'PDF' or 'JPEG Thumb'
   * @returns ARCHIVEFILE|undefined
   */
  playableFile(type) {
    return this.files.find(fi => fi.playable(type));  // Can be undefined if none included
  }

  /**
   * Convert a filename to a ArchiveFile, can be undefined
   * @param filename
   * @returns ARCHIVEFILE|undefined
   */
  fileFromFilename(filename) {
    return filename ? this.files.find(f => f.metadata.name === filename) : undefined
  }

  /**
   * Process the rawplaylist and add fields to make it into something usable.
   * this must have files read before calling this.
   * @param rawplaylist  As returned by API - or an already cooked processed version
   * @returns [ {
        title,
        autoplay,
        duration    (secs),
        prettyduration  string e.g. 3:23.2
        image,      root-relative url
        imagename,  filename portion - may include subdirectory
        imageurls,  Archivefile
        orig:       filename of original file
        sources: [ { // optional files to play for the track
            file,   root-relative url (unusable)
            name,   filename portion - may include subdirectory
            type,
            url,    Archivefile
            height,
            width }  ]
        tracks: [ ] // Not really tracks, its things like subtitles
   */
  processPlaylist(rawplaylist) {
    // filename is because (some) of the files in the API are returned as root relative urls,
    function filename(rootrelativeurl) { return rootrelativeurl ? rootrelativeurl.split('/').slice(3).join('/') : undefined; }
    function processTrack(t) {
      // Add some fields to the track to make it usable
      // Note old setPlaylist returned .original, callers have been changed to expect .orig
      t.imagename = filename(t.image);
      // noinspection JSPotentiallyInvalidUsageOfClassThis
      t.imageurls = this.fileFromFilename(t.imagename); // An ArchiveFile
      t.sources.forEach(s => {
        // 'file' is unusable root-relative URL but its not used by callers
        s.name = filename(s.file); // Filename
        s.urls = this.fileFromFilename(s.name); // An ArchiveFile from which can get the urls
      });
      const seconds = parseInt(t.duration, 10);
      const secs = seconds % 60;
      t.prettyduration = isNaN(secs) ? '' : `${Math.floor(parseInt(t.duration, 10) / 60)}:${secs < 10 ? '0' + secs : secs}`;
      return t;
    }
    return ArrayFilterTill(rawplaylist, t => t.autoplay === false).map(t => processTrack.call(this, t));
  }

  /**
   * Find the minimum set of files needed to display a details page, includes for example a version of a video that can be played and its thumbnail
   * @param config (optional) { experimental: { epubdownload}}  if true enables epubs so they are crawled
   * @returns [ARCHIVEFILE] | undefined
   */
  minimumForUI({ crawlEpubs = undefined } = {}) {
    // This will be tuned for different mediatype etc}
    // Note mediatype will have been retrieved and may have been rewritten by processMetadataFjords from 'education'
    console.assert(this.metadata || this.is_dark, 'Should either be metadata or is_dark');
    if (this.is_dark) { return undefined; }
    const minimumFiles = [];
    if (this.itemid) { // Exclude 'search'
      console.assert(this.files, 'minimumForUI assumes .files already set up');
      const thumbnailFiles = this.files.filter(af =>
        af.metadata.name === '__ia_thumb.jpg'
        || af.metadata.name.endsWith('_itemimage.jpg')
      );
      // Note thumbnail is also explicitly saved by saveThumbnail
      minimumFiles.push(...thumbnailFiles);
      switch (this.metadata.mediatype) {
        case 'search': // Pseudo-item
          break;
        case 'collection': // TODO-THUMBNAILS
          break;
        case 'texts': // TODO-THUMBNAILS
          if (this.subtype() === 'carousel') {
            minimumFiles.push(...this.files4carousel());
          }
          if (crawlEpubs) {
            const epub = this.files.find(af => af.metadata.format === 'Epub'); // First Epub, which will only be there if possible, unlikely to be more than one
            if (epub) minimumFiles.push(epub);
          }
          break; // for texts subtype=bookreader  use the Text Reader anyway so dont know which files needed - done in pages handling in crawler
        case 'image':
          minimumFiles.push(this.files.find(fi => fi.playable('image'))); // First playable image is all we need
          break;
        case 'audio': // TODO-THUMBNAILS check that it can find the image for the thumbnail with the way the UI is done. Maybe make ReactFake handle ArchiveItem as teh <img>
        case 'etree': // Generally treated same as audio, at least for now
          console.assert(this.playlist, 'minimumforUI expects playlist');
          // Almost same logic for video & audio
          minimumFiles.push(...Object.values(this.playlist).map(track => track.sources[0].urls)); // First source from each (urls is a single ArchiveFile in this case)
          // Audio uses the thumbnail image, puts URLs direct in html, but that always includes http://archive.org/services/img/itemid which should get canonicalized
          break;
        case 'movies':
          if (this.subtype === 'tv') {
            return undefined; // We don't know how to display TV so there are no minimumForUI
          } else {
            console.assert(this.playlist, 'minimumforUI expects playlist');
            // Almost same logic for video & audio
            minimumFiles.push(...Object.values(this.playlist).map(track => track.sources[0].urls)); // First source from each (urls is a single ArchiveFile in this case)
            // noinspection JSUnresolvedFunction
            const v = this.videoThumbnailFile();
            if (v) minimumFiles.push(v);
          }
          break;
        case 'account':
          break;
        default:
        // TODO Not yet supporting software, zotero (0 items); data; web because rest of dweb-archive doesnt
      }
    }
    return minimumFiles;
  }

  isPalmLeaf() {
    return this.metadata && this.metadata["external-identifier"] && this.metadata["external-identifier"].some(ei => ei.includes("//palmleaf.org"));
  }
  /**
   * Find what kind of text or what kind of movie, used to pick the appropriate UX
   * @returns {string|undefined|*}
   */
  subtype() {
    // Heuristic to figure out what kind of texts we have, this will evolve as @tracey gradually releases more info :-)
    // Return a subtype used by different mechanisms to make decisions
    // From @hank in slack.bookreader-libre 2019-07-16 i believe it needs at least an image stack (i.e., a file whose format begins with
    // `Single Page Processed...`) and a scandata file (i.e., a file whose format is either `Scandata` or `Scribe Scandata ZIP`).
    if (!this.itemid)
      return undefined; // Not applicable if identifier not defined.
    console.assert(this.metadata && this.files,'Setup metadata and files before subtype which is synchronous');
    switch (this.metadata.mediatype) {
      // If add subtypes for a new mediatype (other than texts, audio, movies) then needed also in Page.jsx
      case 'texts':
        // const hasPDF = this.files.find(f => f.metadata.format.endsWith('PDF'));
        const hasSPP = this.files.find(f => f.metadata.format.startsWith('Single Page Processed')
                                            && (f.metadata.format.endsWith('ZIP') || f.metadata.format.endsWith('Tar')));
        const hasScandata = this.files.find(f => ['Scandata', 'Scribe Scandata ZIP'].includes(f.metadata.format));
        return (hasSPP && hasScandata)
          ? 'bookreader'
          : 'carousel'; // e.g. thetaleofpeterra14838gut
      case 'movies':
        return (this.metadata.collection && this.metadata.collection.some( c => ['tvnews', 'tvarchive'].includes(c))) // See same heuristic in hasPlaylist()
        ? 'tv'
        : undefined;
      case 'audio':
        return this.files.find(af => af.metadata.format === 'JSON SRT')
        ? 'radio'
        : (this.metadata.collection
            && ['acdc', 'samples_only', 'meridamexico'].some(c => this.metadata.collection.includes(c)))
        ? 'album'
        : undefined;
      default:
        return undefined;
    }
  }

  /**
   * Convert the files into slides in an array. Next step would be to process for carousel
   * This algorithm works for thetaleofpeterra14838gut its probably not universal
   * @returns [ARCHIVEFILE]
   */
  files4carousel() {
    return this.files
      .filter(f => f.metadata.format === 'JPEG')
      .sort((a, b) => (a.metadata.name < b.metadata.name) ? -1 : (a.metadata.name > b.metadata.name) ? 1 : 0);
  }

  pageManifests() {
    return [].concat(...this.bookreader.brOptions.data);
  }

  pageManifestFrom({ leafNum }) {
    return this.pageManifests().find(pm => pm.leafNum === leafNum);
  }
}

/**
 * Array of fields that are added to the top level of the raw metadata API for dweb-archive and dweb-mirror
 * @type {*[]}
 */
ArchiveItem.extraFields = ['collection_sort_order', 'collection_titles', 'crawl', 'downloaded', 'dir', 'files_count',
  'is_dark', 'magnetlink', 'numFound', 'server'];

exports = module.exports = ArchiveItem;

// Code review by Mitra 2019-12-14
