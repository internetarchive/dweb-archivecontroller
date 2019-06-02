const ArchiveFile = require("./ArchiveFile");
const ArchiveMember = require("./ArchiveMember");
const {enforceStringOrArray, fetch_json, gateway, gatewayServer, objectFrom, parmsFrom, rules, _query} = require("./Util");

//require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
const debug = require('debug')('dweb-archivecontroller:ArchiveItem');
//const DwebTransports = require('@internetarchive/dweb-transports'); //Not "required" because available as window.DwebTransports by separate import
//const DwebObjects = require('@internetarchive/dweb-objects'); //Not "required" because available as window.DwebObjects by separate import
//TODO-NAMING url could be a name

/* Note for Bookreader
    API = RawBookReaderResponse = AI.exportBookReader() = { data: { data, brOptions, lendingInfo, metadata }
    ArchiveItem.bookreader =  file <IDENTIFIER>_bookreader.json = { data, brOptions, lendingInfo, metadata }
 */

// General purpose utility functions
// Filter an array until f returns true.
ArrayFilterTill = function(arr, f) { const res = []; for( let i in arr) { // noinspection JSUnfilteredForInLoop
    const x=arr[i]; if (f(x)) { return res } else { res.push(x)} }  return res; };
class ArchiveItem {
    /*
    Base class representing an Item and/or a Search query (A Collection is both).
    This is just storage, the UI is in ArchiveBase and subclasses, theoretically this class could be used for a server or gateway app with no UI.

    Fields:
    itemid: Archive.org reference for object
    item:   Metadata decoded from JSON from metadata search.
    members:  Array of data from a search.
    files:  Will hold a list of files when its a single item

    Once subclass SmartDict
    _urls:  Will be list of places to retrieve this data (not quite a metadata call)
     */


    constructor({itemid = undefined, query = undefined, metaapi = undefined}={}) {
        this.itemid = itemid;
        this.loadFromMetadataAPI(metaapi); // Note - must be after itemid loaded
        this.query = query;
    }

    /* Almost certainly OBSolete , though looks correct
    static fromMemberFav(m) {
        // Build an ArchiveItem from an entry in a favorites (i.e. a IDENTIFIER_member.json file).
        // Almost certainly
        if (m.mediatype === "search") { // Handle weird saved searches,
            return new this({query: m.identifier});
        } else {
            return new this({itemid: m.identifier});
        }
    }
    */
    exportFiles() {  // Note overridden in dweb-mirror.ArchiveItemPatched
        return this.files.map(f => f.metadata);
    }
    exportMetadataAPI({wantPlaylist=false}={}) {
        return Object.assign(
            {
                files: this.exportFiles(),
                files_count: this.files_count,
                collection_sort_order: this.collection_sort_order,
                collection_titles: this.collection_titles,
                crawl: this.crawl, // For dweb-mirror
                downloaded: this.downloaded,
                is_dark: this.is_dark,
                dir: this.dir,
                server: this.server,
                members: this.members,
                metadata: this.metadata,
                reviews: this.reviews,
            },
            wantPlaylist ? { playlist: this.playlist} : { }
        )

    }
    loadFromMetadataAPI(metaapi) {
        /*
        Apply the results of a metadata API or exportMetadataAPI() call to an ArchiveItem,
        meta:   { metadata, files, reviews, members, and other stuff }
         */
        //TODO - I think this is skipping reviews which should be stored
        if (metaapi) {
            console.assert(typeof this.itemid !== "undefined", "itemid should be loaded before here - if legit reason why not, then load from meta.identifier");
            this.files = (metaapi && metaapi.files)
                ? metaapi.files.map((f) => new ArchiveFile({itemid: this.itemid, metadata: f}))
                : [];   // Default to empty, so usage simpler.
            if (metaapi.metadata) {
                const meta = enforceStringOrArray(metaapi.metadata, rules.item); // Just processes the .metadata part
                if (meta.mediatype === "education") {
                    // Typically miscategorized, have a guess !
                    if (this.files.find(af => af.playable("video")))
                        meta.mediatype = "movies";
                    else if (this.files.find(af => af.playable("text")))
                        meta.mediatype = "texts";
                    else if (this.files.find(af => af.playable("image")))
                        meta.mediatype = "image";
                    debug('Metadata Fjords - switched mediatype on %s from "education" to %s', meta.identifier, meta.mediatype);
                }
                this.metadata = meta;
            }
            //These will be unexpanded if comes from favorites, its expanded by fetch_query (either from cache or in _fetch_query>expandMembers)
            this.members = metaapi.members && metaapi.members.map(o => ArchiveMember.fromFav(o));
            ArchiveItem.extraFields.forEach(k => this[k] = metaapi[k]);
            if (metaapi.playlist) {
                this.playlist = this.processPlaylist(metaapi.playlist);
            }
        }
        //return metaapi;// Broken but unused
        return undefined;
    }
    loadFromBookreaderAPI(bookapi) {
        /*
        Apply the results of a bookreader API or exportBookreaderAPI() call to an ArchiveItem, (see notes at page top on which structure is where)
         */
        if (bookapi) {
            console.assert(typeof this.itemid !== "undefined", "itemid should be loaded before here - if legit reason why not, then load from meta.identifier");
            delete(bookapi.data.metadata);  // Dont keep  metadata as its just a duplicate
            this.bookreader = bookapi.data;
        }
        return undefined;
    }


    async fetch({noCache=undefined}={}) {   //TODO-API add noCache
        /* Fetch what we can about this item, it might be an item or something we have to search for.
            Fetch item metadata as JSON by talking to Metadata API
            Fetch collection info by an advanced search.
            Goes through gateway.dweb.me so that we can work around a CORS issue (general approach & security questions confirmed with Sam!)

            this.itemid Archive Item identifier
            throws: TypeError or Error if fails esp Unable to resolve name
            resolves to: this
         */
        try {
            await this.fetch_metadata({noCache});
            await this.fetch_query({noCache}); // Should throw error if fails to fetch //TODO-RELOAD fetch_query ignores noCache currently
            return this;
        } catch(err) {
            throw(err); // Typically a failure to fetch
        }
    }

    fetch_metadata(opts={}, cb) {
        /*
        Fetch the metadata for this item if it hasn't already been.

        This function is intended to be monkey-patched in dweb-mirror to define caching.
        Its monkeypatched because of all the places inside dweb-archive that call fetch_query

        opts {
            noCache     Set Cache-Control no-cache header. Note - in monkeypatched version in dweb-mirror this stops it reading the cache
        }
        cb(err, this) or if undefined, returns a promise resolving to 'this'
         */
        if (typeof opts === "function") { cb = opts; // noinspection JSUnusedAssignment
            opts = {}; } // Allow opts parameter to be skipped

        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cb) {
            // noinspection JSPotentiallyInvalidUsageOfClassThis
            if (this.itemid && !(this.metadata || this.is_dark)) { // If havent already fetched (is_dark means no .metadata field)
                // noinspection JSPotentiallyInvalidUsageOfClassThis
                this._fetch_metadata(opts, cb); // Processes Fjords & Loads .metadata .files etc
            } else {
                cb(null, this);
            }
        }
    }
    _fetch_metadata({darkOk=undefined, noCache=undefined}={}, cb) {
        /*
        Fetch the metadata for this item - dont use directly, use fetch_metadata.
         */
        debug('getting metadata for %s', this.itemid);
        // Fetch via Domain record - the dweb:/arc/archive.org/metadata resolves into a table that is dynamic on gateway.dweb.me
        const name = `dweb:${gateway.url_metadata}${this.itemid}`;
        // Fetch using Transports as its multiurl and might not be HTTP urls
        // noinspection JSUnusedLocalSymbols
        DwebTransports.fetch([name], {noCache, timeoutMS: 5000}, (err, m) => {   //TransportError if all urls fail (e.g. bad itemid)
            if (err) {
                cb(err);
            } else {
                // noinspection ES6ModulesDependencies
                const metaapi = objectFrom(m); // Handle Buffer or Uint8Array
                if (metaapi.is_dark && !darkOk) { // Only some code handles dark metadata ok
                    this.is_dark = true; // Flagged so wont continuously try and call
                    cb(new Error(`Item ${this.itemid} is dark`));
                } else if (!metaapi.is_dark && (metaapi.metadata.identifier !== this.itemid)) {
                    cb(new Error(`_fetch_metadata didnt read back expected identifier for ${this.itemid}`));
                } else {
                    debug("metadata for %s fetched successfully %s", metaapi.itemid, this.is_dark ? "BUT ITS DARK" : "");
                    if (['audio','etree','movies'].includes(metaapi.metadata.mediatype)) {
                        // Fetch and process a playlist (see processPlaylist for documentation of result)
                        const playlistUrl = (((typeof DwebArchive  !== "undefined") && DwebArchive.mirror) ? (gatewayServer() + gateway.url_playlist_local + "/" + this.itemid) : `https://archive.org/embed/${this.itemid}?output=json`);
                        DwebTransports.fetch([playlistUrl], {noCache}, (err, res) => { //TODO-PLAYLIST add to other transports esp Gun and cache in DwebMirror
                            if (err) {
                                cb(new Error("Unable to read playlist: "+ err.message));
                            } else {
                                metaapi.playlist = res;
                                this.loadFromMetadataAPI(metaapi); // Loads .metadata .files .reviews and some other fields //TODO-PLAYLIST move to after fetched playlist
                                cb(null, this);
                            }
                        });
                    } else { // Dont need playlist and the embed code has a bug on other mediatypes.
                        this.loadFromMetadataAPI(metaapi); // Loads .metadata .files .reviews and some other fields //TODO-PLAYLIST move to after fetched playlist
                        cb(null, this)
                    }
                }
            }
        });
    }
    fetch_bookreader(opts={}, cb) {
        if (cb) { return this._fetch_bookreader(opts, cb) } else { return new Promise((resolve, reject) => this._fetch_bookreader(opts, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
    }
    _fetch_bookreader({page=undefined}={}, cb) {
        console.assert(this.server, "fetch_bookreader must be called after fetch_metadata because it requires specific IA server");
        //TODO-BOOK use naming to redirect to dweb.me and (when gun has hijacker) to GUN
        //TODO-BOOK should be going thru the local server where appropriate
        //TODO-BOOK this was requesting format=jsonp but seems to return json (which is what we want) anyway
        // See also configuration in dweb-archive/BookReaderWrapper.js
        const protocolServer = gatewayServer(this.server); // naming mismatch - gatewayServer is of form http[s]://foo.com
        const [protocol, unused, server] = protocolServer.split('/');
        const parms = parmsFrom({
            id: this.itemid,
            itemPath: this.dir,
            server: server,
            format: "json",
            subPrefix: this.itemid,            // TODO-BOOK where is this used
            requestUri: `/details/${this.itemid}${page ? "/page/"+page : ""}` // Doesnt seem to be used
        });
        const url=`${protocolServer}/BookReader/BookReaderJSIA.php?${parms}`;
        DwebTransports.httptools.p_GET(url, {}, (err, res) => {
            if (res) {
                delete res.data.metadata;   // Duplicates ai.metadata
                this.bookreader = res.data; // undefined if err
            }
            cb(err, this)
        });
    }
    fetch_query(opts={}, cb) { // opts = {wantFullResp=false}
        /*  Action a query, return the array of docs found and store the accumulated search on .members
            Subclassed in Account.js since dont know the query till the metadata is fetched

            This function is intended to be monkey-patched in dweb-mirror to define caching.
            Its monkeypatched because of all the places inside dweb-archive that call fetch_query
            Patch will call _fetch_query
            Returns a promise or calls cb(err, [ArchiveMember*]);
            Errs include if failed to fetch
            wantFullResp set to true if want to get the result of the search query (because proxying) rather than just the docs
        */
        if (cb) { return this._fetch_query(opts, cb) } else { return new Promise((resolve, reject) => this._fetch_query(opts, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
    }

    more(opts, cb) {
        // Fetch next page of query
        // opts as defined in fetch_query
        // cb( err, [ ArchiveMember*] )
        this.page++;
        this.fetch_query(opts, (err, newmembers) => {
            if (err) { this.page--; } // Decrement page back if error
            cb(err, newmembers);
        });
    }

    _appendMembers(newmembers) {
        if (!this.members) {
            this.members = newmembers;
        } else {
            const oldids = this.members.map(am => am.identifier)
            this.members = this.members.concat(
                newmembers.filter(m => !oldids.includes(m.identifier))
            );
        }
    }
    _wrapMembersInResponse(members) {
        return { response: { numFound: undefined, start: this.start, docs: members }}
    }

    _expandMembers(cb) {
        ArchiveMember.expandMembers(this.members, (err, mm) => {
            if (!err) {
                this.members = mm;
            }
            cb(null, this);  // Dont pass error up, its ok not to be able to expand some or all of them
        });
    }

    _fetch_query({wantFullResp=false}={}, cb) { // No opts currently
        /*
            rejects: TransportError or CodingError if no urls

            Several different scenarios
            Defined by a members.json file e.g. "fav-brewster"
            Defined by a metadata.search_collection e.g. "ElectricSheep"
            Defined by mediatype:collection, query should be q=collection:<IDENTIFIER>
            Defined by simple Lists  e.g. vtmas_disabilityresources
            Defined by query - e.g. from searchbox

        */
        // First we look for the fav-xyz type collection, where there is an explicit JSON of the members
        try {
            // noinspection JSUnusedLocalSymbols
            // noinspection JSUnusedLocalSymbols
            this.page = this.page || 1; // Page starts at 1, sometimes set to 0, or left undefined.
            this._expandMembers((unusederr, self) => { // Always succeeds even if it fails it just leaves members unexpanded.
                if ((typeof this.members === "undefined") || this.members.length < (Math.max(this.page,1)*this.rows)) {
                    // Either cant read file (cos yet cached), or it has a smaller set of results

                    if (!this.query) { // Check if query has been defined, and if not set it up
                        this.query = [
                            //TODO may want to turn this into a "member" query if running to mirror, then have mirror cache on item and run this algorithm
                            // Catch any collections - note "collection: might need to be first to catch a pattern match in mirror
                            this.itemid && this.metadata && this.metadata.mediatype === "collection" && "collection:" + this.itemid,
                            // Now two kinds of simple lists, but also only on collections
                            this.itemid && this.metadata && this.metadata.mediatype === "collection" && this.itemid && "simplelists__items:" + this.itemid,
                            this.itemid && this.metadata && this.metadata.mediatype === "collection" && this.itemid && "simplelists__holdings:" + this.itemid,
                            // Search will have !this.item example = "ElectricSheep"
                            this.metadata && this.metadata.search_collection && this.metadata.search_collection.replace('\"', '"'),
                        ].filter(f => !!f).join(" OR "); // OR any non empty ones
                    }
                    if (this.query) {   // If this is a "Search" then will come here.
                        const sort = this.collection_sort_order || this.sort || "-downloads"; //TODO remove sort = "-downloads" from various places (dweb-archive, dweb-archivecontroller, dweb-mirror) and add default here
                        _query( {
                            output: "json",
                            q: this.query,
                            rows: this.rows,
                            page: this.page,
                            'sort[]': sort,
                            'and[]': this.and,
                            'save': 'yes',
                            'fl': gateway.url_default_fl,  // Ensure get back fields necessary to paint tiles
                        }, (err, j) => {
                            if (err) { // Will get error "failed to fetch" if fails
                                debug("_fetch_query %s", err.message)
                                // Note not calling cb(err,undefined) because if fail to fetch more items the remainder may be good especially if offline
                                // 2019-01-20 Mitra - I'm not sure about this change, on client maybe wrong, on mirror might be right.
                            } else {
                                const newmembers = j.response.docs.map(o => new ArchiveMember(o));
                                this._appendMembers(newmembers);
                                this.start = j.response.start;
                                this.numFound = j.response.numFound;
                            }
                            //cb(null, wantFullResp ? j : newmembers);  // wantFullResp is used when proxying unmodified result
                            const newmembers = (this.members || []).slice((this.page - 1) * this.rows, this.page * this.rows);
                            cb(null, wantFullResp ? this._wrapMembersInResponse(newmembers) : newmembers);
                        });
                    } else { // Neither query, nor metadata.search_collection nor file/ITEMID_members.json so not really a collection
                        const newmembers = (this.members || []).slice((this.page - 1) * this.rows, this.page * this.rows);
                        cb(null, wantFullResp ? this._wrapMembersInResponse(newmembers) : newmembers);
                    }
                } else {
                    const newmembers = this.members.slice((this.page - 1) * this.rows, this.page * this.rows);
                    cb(null, wantFullResp ? this._wrapMembersInResponse(newmembers) : newmembers);
                }
            });
        } catch(err) {
            console.error('Caught unexpected error in ArchiveItem._fetch_query',err);
            cb(err);
        }
    }

    relatedItems({wantStream = false, wantMembers = false} = {}, cb) {
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
        function f(cb) {
            const relatedUrl = (((typeof DwebArchive  !== "undefined")  && DwebArchive.mirror)  ? (gatewayServer() + gateway.url_related_local) : gateway.url_related) + this.itemid;
            if (wantStream) { // Stream doesnt really make sense unless caching to file
                DwebTransports.createReadStream(relatedUrl, {}, cb);
            } else {
                // TODO this should be using DwebTransports via Gun & Wolk as well
                // Maybe problem if offline but I believe error propogates up
                fetch_json(relatedUrl, (err, rels) => {
                    if (!err && rels && wantMembers) {
                        cb(err, rels.hits.hits.map(r=>ArchiveMember.fromRel(r)))
                    } else {
                        cb(err, rels);
                    }
                });
            }
        }
    }

    async thumbnaillinks() {
        //- maybe Obsolete as thumbnails usually shown from ArchiveMember
        await this.fetch_metadata();
        return this.metadata.thumbnaillinks; // Short cut since metadata changes may move this
    }

    thumbnailFile() {
        /*
        Return the thumbnailfile for an item, this should handle the case of whether the item has had metadata fetched or not, and must be synchronous as stored in <img src=> (the resolution is asynchronous)
         */
        // New items should have __ia_thumb.jpg but older ones dont
        let af = this.files && this.files.find(af => af.metadata.name === "__ia_thumb.jpg"
            || af.metadata.name.endsWith("_itemimage.jpg"));
        if (!af) {
            const metadata =  {
                format: "JPEG Thumb",
                name:   "__ia_thumb.jpg",
                // Could also set source:"original",rotation:"0",
            };
            // noinspection JSUnresolvedVariable
            const ipfs = this.metadata && this.metadata.thumbnaillinks.find(f=>f.startsWith("ipfs:")); // Will be empty if no thumbnaillinks
            if (ipfs) metadata.ipfs = ipfs;
            af = new ArchiveFile({itemid: this.itemid, metadata });
            this.files.push(af); // So found by next call for thumbnailFile - if haven't loaded metadata no point in doing this
        }
        return af;
    }

    videoThumbnailFile() {
        // Get a thumbnail for a video - may extend to other types, return the ArchiveFile
        // This is used to select the file for display and also in dweb-mirror to cache it
        // Heuristic is to select the 2nd thumbnail from the thumbs/ directory (first is often a blank screen)
        console.assert(this.files, "videoThumbnaillinks: assumes setup .files before");
        console.assert(this.metadata.mediatype === "movies", "videoThumbnaillinks only valid for movies");
        const videothumbnailurls = this.files.filter(fi => (fi.metadata.name.includes(`${this.itemid}.thumbs/`))); // Array of ArchiveFile
        return videothumbnailurls[Math.min(videothumbnailurls.length-1,1)];
    }
    playableFile(type) {
        return this.files.find(fi => fi.playable(type));  // Can be undefined if none included
    }

    processPlaylist(rawplaylist) {
        /* Process the rawplaylist and add fields to make it into something usable.
        this must have files read before calling this.
        rawplaylist:    As returned by API - or an already cooked processed version
        returns: [ {
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
        // filename is because (some) of the files in the API are returned as root relative urls,
        function filename(rootrelativeurl) { return rootrelativeurl.split('/').slice(3).join('/'); }
        function processTrack(t) {
            // Add some fields to the track to make it usable
            // Note old setPlaylist returned .original, callers have been changed to expect .orig
            t.imagename = filename(t.image);
            t.imageurls = this.files.find(f => f.metadata.name === t.imagename);   // An ArchiveFile
            t.sources.forEach(s => {
                // "file" is unusable root-relative URL but its not used by callers
                s.name = filename(s.file);                       // Filename
                s.urls = this.files.find(f => f.metadata.name === s.name);   // An ArchiveFile from which can get the urls
            });
            const seconds = parseInt(t.duration);
            const secs = seconds % 60;
            t.prettyduration = isNaN(secs) ? "" : `${Math.floor(parseInt(t.duration) / 60)}:${secs < 10 ? "0" + secs : secs}`;
            return t;
        }
        return ArrayFilterTill(rawplaylist, t => t.autoplay === false).map(t=>processTrack.call(this,t));
    }

    setPlaylist(unusedtype) {
        console.assert(this.playlist); // Should be have been set during fetch_metadata > fetch_playlist
    }

    minimumForUI() {
        /*
         returns: [ ArchiveFile* ]  minimum files required to play this item
        */
        // This will be tuned for different mediatype etc}
        // Note mediatype will have been retrieved and may have been rewritten by processMetadataFjords from "education"
        const minimumFiles = [];
        if (this.itemid) { // Exclude "search"
            console.assert(this.files, "minimumForUI assumes .files already set up");
            const thumbnailFiles = this.files.filter(af =>
                af.metadata.name === "__ia_thumb.jpg"
                || af.metadata.name.endsWith("_itemimage.jpg")
            );
            // Note thumbnail is also explicitly saved by saveThumbnail
            minimumFiles.push(...thumbnailFiles);
            switch (this.metadata.mediatype) {
                case "search": // Pseudo-item
                    break;
                case "collection": //TODO-THUMBNAILS
                    break;
                case "texts": //TODO-THUMBNAILS for text - texts use the Text Reader anyway so dont know which files needed
                    break;
                case "image":
                    minimumFiles.push(this.files.find(fi => fi.playable("image"))); // First playable image is all we need
                    break;
                case "audio":  //TODO-THUMBNAILS check that it can find the image for the thumbnail with the way the UI is done. Maybe make ReactFake handle ArchiveItem as teh <img>
                case "etree":   // Generally treated same as audio, at least for now
                    if (!this.playlist) { // noinspection JSUnresolvedFunction
                        this.setPlaylist();
                    }
                    // Almost same logic for video & audio
                    minimumFiles.push(...Object.values(this.playlist).map(track => track.sources[0].urls)); // First source from each (urls is a single ArchiveFile in this case)
                    // Audio uses the thumbnail image, puts URLs direct in html, but that always includes http://dweb.me/thumbnail/itemid which should get canonicalized
                    break;
                case "movies":
                    if (!this.playlist) { // noinspection JSUnresolvedFunction
                        this.setPlaylist();
                    }
                    // Almost same logic for video & audio
                    minimumFiles.push(...Object.values(this.playlist).map(track => track.sources[0].urls)); // First source from each (urls is a single ArchiveFile in this case)
                    // noinspection JSUnresolvedFunction
                    minimumFiles.push(this.videoThumbnailFile());
                    break;
                case "account":
                    break;
                default:
                //TODO Not yet supporting software, zotero (0 items); data; web because rest of dweb-archive doesnt
            }
        }
        return minimumFiles;
    };

}
ArchiveItem.extraFields = ["collection_sort_order", "collection_titles", "dir", "files_count", "is_dark", "reviews", "server", "crawl", "downloaded"];

exports = module.exports = ArchiveItem;
