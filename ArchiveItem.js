const ArchiveFile = require("./ArchiveFile");
const ArchiveMember = require("./ArchiveMember");
const Util = require("./Util");

//require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
const debug = require('debug')('dweb-archivecontroller:ArchiveItem');
//const DwebTransports = require('@internetarchive/dweb-transports'); //Not "required" because available as window.DwebTransports by separate import
//const DwebObjects = require('@internetarchive/dweb-objects'); //Not "required" because available as window.DwebObjects by separate import
//TODO-NAMING url could be a name

/* Note for Bookreader
    API = RawBookReaderResponse = AI.exportBookReader() = { data: { data, brOptions, lendingInfo, metadata }
    ArchiveItem.bookreader =  file <IDENTIFIER>_bookreader.json = { data, brOptions, lendingInfo, metadata }
 */


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

    static fromMemberFav(m) {
        // Build an ArchiveItem from an entry in a favories (i.e. a IDENTIFIER_member.json file).
        if (m.mediatype === "search") { // Handle weird saved searches,
            return new this({query: m.identifier});
        } else {
            return new this({itemid: m.identifier});
        }
    }
    exportFiles() {
        return this.files.map(f => f.metadata);
    }
    exportMetadataAPI() {
        return {
            files: this.exportFiles(),
            files_count: this.files_count,
            collection_sort_order: this.collection_sort_order,
            collection_titles: this.collection_titles,
            is_dark: this.is_dark,
            dir: this.dir,
            server: this.server,
            members: this.members,
            metadata: this.metadata,
            reviews: this.reviews,
        }
    }
    loadFromMetadataAPI(metaapi) {
        /*
        Apply the results of a metadata API or exportMetadataAPI() call to an ArchiveItem,
        meta:   { metadata, files, reviews, members, and other stuff }
         */
        if (metaapi) {
            console.assert(this.itemid, "itemid should be loaded before here - if legit reason why not, then load from meta.identifier")
            this.files = (metaapi && metaapi.files)
                ? metaapi.files.map((f) => new ArchiveFile({itemid: this.itemid, metadata: f}))
                : [];   // Default to empty, so usage simpler.
            if (metaapi.metadata) {
                const meta = Util.enforceStringOrArray(metaapi.metadata, Util.rules.item); // Just processes the .metadata part
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
            //These will be unexpanded, its expanded by fetch_query (either from cache or in _fetch_query>expandMembers)
            this.members = metaapi.members && metaapi.members.map(o => ArchiveMember.from_fav(o));
            ArchiveItem.extraFields.forEach(k => this[k] = metaapi[k]);
        }
        //return metaapi;// Broken but unused
        return undefined;
    }
    loadFromBookreaderAPI(bookapi) {
        /*
        Apply the results of a bookreader API or exportBookreaderAPI() call to an ArchiveItem, (see notes at page top on which structure is where)
         */
        if (bookapi) {
            console.assert(this.itemid, "itemid should be loaded before here - if legit reason why not, then load from meta.identifier")
            delete(bookapi.data.metadata);  // Dont keep  metadata as its just a duplcate
            this.bookreader = bookapi.data;
        }
        return undefined;
    }


    async fetch() {
        /* Fetch what we can about this item, it might be an item or something we have to search for.
            Fetch item metadata as JSON by talking to Metadata API
            Fetch collection info by an advanced search.
            Goes through gateway.dweb.me so that we can work around a CORS issue (general approach & security questions confirmed with Sam!)

            this.itemid Archive Item identifier
            throws: TypeError or Error if fails esp Unable to resolve name
            resolves to: this
         */
        try {
            await this.fetch_metadata();
            await this.fetch_query(); // Should throw error if fails to fetch
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
    _fetch_metadata(opts, cb) {
        /*
        Fetch the metadata for this item - dont use directly, use fetch_metadata.
         */
        debug('getting metadata for %s', this.itemid);
        // Fetch via Domain record - the dweb:/arc/archive.org/metadata resolves into a table that is dynamic on gateway.dweb.me
        const name = `dweb:${Util.gateway.url_metadata}${this.itemid}`;
        // Fetch using Transports as its multiurl and might not be HTTP urls
        // noinspection JSUnusedLocalSymbols
        const prom = DwebTransports.p_rawfetch([name], {timeoutMS: 5000})    //TransportError if all urls fail (e.g. bad itemid)
            .then((m) => {
                // noinspection ES6ModulesDependencies
                const metaapi = DwebObjects.utils.objectfrom(m); // Handle Buffer or Uint8Array
                if (metaapi.is_dark && !opts.darkOk) { // Only some code handles dark metadata ok
                    this.is_dark = true; // Flagged so wont continuously try and call
                    cb(new Error(`Item ${this.itemid} is dark`));
                } else if (!m.is_dark && (metaapi.metadata.identifier !== this.itemid)) {
                    cb(new Error(`_fetch_metadata didnt read back expected identifier for ${this.itemid}`));
                } else {
                    debug("metadata for %s fetched successfully %s", m.itemid, this.is_dark ? "BUT ITS DARK" : "");
                    this.loadFromMetadataAPI(metaapi); // Loads .item .files .reviews and some other fields
                    cb(null, this);
                }
            }).catch(err => cb(err));
    }
    fetch_bookreader(opts={}, cb) {
            if (cb) { return this._fetch_bookreader(opts, cb) } else { return new Promise((resolve, reject) => this._fetch_bookreader(opts, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
    }
    _fetch_bookreader({page=undefined}={}, cb) {
        console.assert(this.server, "fetch_bookreader must be called after fetch_metadata because it requires specific IA server");
        //TODO-BOOK use naming to redirect to dewb.me and (when gun has hikacker) to GUN
        //TODO-BOOK should be going thru the local server where appropriate
        //TODO-BOOK this was requesting format=jsonp but seems to return json (which is what we want) anyway
        // See also configuration in dweb-archive/BookReaderWrapper.js
        const protocolServer = Util.gatewayServer(this.server); // naming mismatch - gatewayServer is of form http[s]://foo.com
        const [protocol, unused, server] = protocolServer.split('/');
        const parms = Util.parmsFrom({
            id: this.itemid,
            itemPath: this.dir,
            server: server,
            format: "json",
            subPrefix: this.itemid,            // TODO-BOOK where is this used
            requestUri: `/details/${this.itemid}${page ? "/page/"+page : ""}` // Doesnt seem to be used
        })
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

    _appendMembers(newmembers) {
        this.members = this.members ? this.members.concat(newmembers) : newmembers;
    }
    _wrapMembersInResponse(members) {
        return { response: { numFound: undefined, start: this.start, docs: members }}
    }

    _expandMembers(cb) {
        const ids = this.members && this.members.filter(am=>am.mediatype !== "search").filter(am => !am.isExpanded()).map(am => am.identifier);
        if (ids) {
            ArchiveMember.expand(ids, (err, res) => {
                if (!err) {
                    this.members = this.members.map(m => res[m.identifier] || m);
                }
                cb(null, this);  // Dont pass error up, its ok not to be able to expand some or all of them
            });
        } else {
            cb(null, this); // Nothing to expand
        }
    }

    _fetch_query({wantFullResp=false}={}, cb) { // No opts currently
        /*
            rejects: TransportError or CodingError if no urls

            Several differnet scenarios
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
            this._expandMembers((err, self) => { // Always succeeds even if it fails it just leaves members unexpanded.
                if ((typeof this.members === "undefined") || this.members.length < (Math.max(this.page,1)*this.rows)) {
                    // Either cant read file (cos yet cached), or it has a smaller set of results
                    if (this.metadata && this.metadata.search_collection) { // Search will have !this.item example = "ElectricSheep"
                        this.query = this.metadata.search_collection.replace('\"', '"');
                    }
                    if (!this.query && this.metadata && this.metadata.mediatype === "collection") {  //TODO-TEST its possible with this that dont need to define query in Collection classes (MirrorCollection, or dweb-archive)
                        this.query = "collection:"+this.itemid
                    }
                    if (this.query) {   // If this is a "Search" then will come here.
                        const sort = this.collection_sort_order || this.sort || "-downloads"; //TODO remove sort = "-downloads" from various places (dweb-archive, dweb-archivecontroller, dweb-mirror) and add default here
                        Util._query( {
                            output: "json",
                            q: this.query,
                            rows: this.rows,
                            page: this.page,
                            'sort[]': sort,
                            'and[]': this.and,
                            'save': 'yes',
                            'fl': Util.gateway.url_default_fl,  // Ensure get back fields necessary to paint tiles
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
                        cb(null, undefined); // No results return undefined (which is also what the patch in dweb-mirror does if no collection instead of empty array)
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
            Current usage:
            in dweb-mirror/ArchiveItemPatched.relatedItems ... subclassed to expand itself, cache and return obj
            in dweb-mirror/CrawlManager CrawlItem.process uses ArchiveItemPatched.relatedItems
            in dweb-mirror/mirrorHttp/sendRelated wantStream=true
            in dweb-archive/Details/itemDetailsAlsoFound > loadDetailsAlsoFound > TileComponent which needs expansion

            returns either related items object, stream or array of ArchiveMember, via cb or Promise
        */
        if (typeof opts === "function") { cb = opts; opts = {}; } // Allow opts parameter to be skipped
        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cb) {
            const relatedUrl = (DwebArchive.mirror ? (Util.gatewayServer() + Util.gateway.url_related_local) : Util.gateway.url_related) + this.itemid;
            if (wantStream) { // Stream doesnt really make sense unless caching to file
                DwebTransports.createReadStream(relatedUrl, {}, cb);
            } else {
                Util.fetch_json(relatedUrl, (err, rels) => {
                    if (!err && rels && wantMembers) {
                        ArchiveMember.expandRels(rels, cb)
                    } else {
                        cb(err, rels);
                    }
                });
            }
        }
    }

    async thumbnaillinks() {
        await this.fetch_metadata();
        return this.metadata.thumbnaillinks; // Short cut since metadata changes may move this
    }

    thumbnailFile() {
        /*
        Return the thumbnailfile for an item, this should handle the case of whether the item has had metadata fetched or not, and must be synchronous as stored in <img src=> (the resolution is asyncronous)
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

    async itemid() {
        console.assert(false, 'I dont this can ever get called, constructor will be overwriting it');
        await this.fetch_metadata();
        return this.metadata.identifier; // Short cut since metadata changes may move this
    }

    setPlaylist(type) { //TODO could order the playability and pick by preference
        /*
        type:   "audio"
        returns: [ { title
            original: filename of original file
            sources: [ {name, file, urls, type}]  # urls is singular ArchiveFile, type is last file extension (e.g. "jpg"
            } ]

        TODO-FJORDS: This gets a bit painful as there are so many different cases over a decade or more of "best practice"
        Some cases to test for ...
        gd73-02-15.sbd.hall.1580.sbeok.shnf  has no lengths on derived tracks, and original has length = "0"
         */

        // Note Video.js is currently using the .avs, while Audio is using this .playlist

        // This is modelled on the structure passed to jw in the Audio on archive.org
        // Differences: sources.urls=ArchiveFile, image=af instead of single URL, title is just title, prettyduration has duration
        console.assert(this.files, "Should be running playlist after fetch_metadata has loaded .files");
        type = {"video": "video", "audio": "audio", "movies": "video"}[type || this.metadata.mediatype];
        const pl = this.files.reduce( (res, af) => {
                const metadata = af.metadata;
                if (["original","derivative"].includes(metadata.source)) {
                    const original = ((metadata.source === "derivative") ? metadata.original : metadata.name );  // Filename of original
                    if (!res[original]) {
                        res[original] = { title: "UNKNOWN", original: original, sources: [] }; // Create place to push this file whether its original or derivative
                    }
                    const orig = res[original];
                    if ((metadata.source === "original") || (orig.title==="UNKNOWN")) orig.title = metadata.title;
                    let totalsecs;
                    let pretty;
                    if (metadata.length && (metadata.length !== "0")) {
                        if (metadata.length.includes(':')) {
                            const tt = metadata.length.split(':').map(t => parseInt(t));
                            if (tt.length === 3) {
                                totalsecs = ((tt[0] * 60) + tt[1]) * 60 + tt[2];
                            } else if (tt.length === 2) {
                                totalsecs = (tt[0] * 60 + tt[1]);
                            } else if (tt.length === 1) {
                                totalsecs = (tt[0]);
                            }
                            pretty = metadata.length;
                        } else { // Probably of 123.45 form in seconds
                            const secs = parseInt(metadata.length % 60);
                            if (isNaN(secs)) { // Check we could parse it
                                pretty = "";
                                totalsecs = 0;
                            } else {
                                pretty = `${parseInt(metadata.length / 60)}:${secs < 10 ? "0" + secs : secs}`;
                                totalsecs = metadata.length;  // In seconds
                            }
                        }
                        if (totalsecs) { // dont store if we think its 0
                            if (metadata.source === "original" || !orig.prettyduration) orig.prettyduration = pretty;
                            if (metadata.source === "original" || !orig.duration) orig.duration = totalsecs;  // In seconds
                        }
                    }
                    if (af.playable(type)) {
                        res[original].sources.push({
                            name: metadata.name,
                            file: `http://dweb.archive.org/downloads/${this.itemid}/${metadata.name}`,
                            urls: af,
                            type: metadata.name.split('.').pop(),
                        });
                    } else if (af.playable("image")) {
                        if (!res[original].image) res[original].image = af; // Currently loads with first playable one, Tracey is prepping an exposed service to get a prefered one in metadata
                    }
                }
                return res;

            }, {}
        );
        this.playlist = Object.values(pl).filter(p => p.sources.length > 0);
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
ArchiveItem.extraFields = ["collection_sort_order", "collection_titles", "dir", "files_count", "is_dark", "reviews", "server" ]

exports = module.exports = ArchiveItem;
