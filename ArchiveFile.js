//require('babel-core/register')({ presets: ['env', 'react']}); // ES6 JS below!
const {fetch_json, gatewayServer, gateway, formats, } = require( './Util');
const prettierBytes = require( "prettier-bytes");
const waterfall = require('async/waterfall');
//const DwebTransports = require('@internetarchive/dweb-transports'); //Not "required" because available as window.DwebTransports by separate import

class ArchiveFile {
    /*
    Represents a single file, currently one that is in the item, but might create sub/super classes to handle other types
    of file e.g. images used in the UI

    Fields:
    metadata: metadata of item - (note will be a pointer into a Detail or Search's metadata so treat as read-only)
    sd: pointer to SmartDict created with Urls (see how did it with Academic)
    */

    constructor({itemid = undefined, metadata = undefined}={}) {
        this.itemid = itemid;
        if (typeof metadata.downloaded !== "undefined") {
            // Support dweb-mirror which stores downloaded in metadata
            this.downloaded = metadata.downloaded;
            delete(metadata.downloaded);
        }
        this.metadata = metadata;
    }

    static new({archiveitem=undefined, filename=undefined, copyDirectory=undefined}={}, cb) {
        /*
         Asynchronously create a new ArchiveFile instance and load its metadata.

         archiveitem:   Instance of ArchiveItem with or without its metadata loaded
         itemid:        Identifier of item (only used if archiveitem not defined)
         metadata:      If defined is the result of a metadata API call for loading in AF.metadata
         filename:      Name of an existing file, (may be multipart e.g. foo/bar)
         copyDirectory  Where to store any data cached, (if running in DwebMirror)
         cb(err, archivefile): passed Archive File
         resolves to:   archivefile if no cb
          errors:        FileNotFound or errors from ArchiveFile() or fetch_metadata()
        */
        if (cb) { return f.call(this, cb) } else { return new Promise((resolve, reject) => f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} }))}
        function f(cb) {
            if (!archiveitem.metadata) {
                archiveitem.fetch_metadata({copyDirectory}, (err, ai) => { // Note will load from cache if available and load ai.metadata and ai.files
                    if (err)  { cb(err) } else { this.new({archiveitem: ai, filename}, cb); } })
            } else {
                const af = archiveitem.files.find(af => af.metadata.name === filename); // af, (undefined if not found)
                return af ? cb(null, af) : cb(new Error(`${archiveitem.itemid}/${filename} not found`));
            }
        }
    };

    name() {
        /* Name suitable for downloading etc */
        return this.metadata.name;
    }

    urls(cb) { //TODO-MIRROR fix this to make sense for _torrent.xml files which dont have sha1 and probably not IPFS
        /*
        cb(err, urls)   passed an array of urls that might be a good place to get this item
        if no cb: resolve to urls
        Throws: Error if fetch_json doesn't succeed, or retrieves something other than JSON
         */
        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cbout) {
            waterfall([
                (cb) => DwebTransports.p_connectedNames(cb),
                (connectedNames, cb) => { // Decide if need to get file-specific metadata because missing dweb urls
                    if  (  (!this.metadata.ipfs && connectedNames.includes("IPFS"))
                        || (!this.metadata.magnetlink && !(this.metadata.name === "__ia_thumb.jpg")) // Want magnetlink, but not if its a thumbnail as causes too many webtorrent downloads
                     // || !this.metadata.contenthash // Dont do another roundtrip just to get contenthash
                        ) {   // Connected to IPFS but dont have IPFS URL yet (not included by default because IPFS caching is slow)
                        let name = this.metadata.name.replace('?', '%3F');  // Fjords: 17BananasIGotThis/17 Bananas? I Got This!.mp3  has a '?' in it
                        // TODO using fetch_json on server is ok, but it would be better to incorporate Gun & Wolk and go via DwebTransports
                        // maybe problem offline but above test should catch cases where no IPFS so not useful
                        fetch_json(`${gatewayServer()}${gateway.url_metadata}${this.itemid}/${encodeURIComponent(name)}`, (err, res)=>{
                            if (!err) this.metadata = res;
                            cb(err); });
                    } else {
                        cb(null);
                    }},
                (cb) => {
                    const res = [this.metadata.ipfs, this.metadata.magnetlink, this.metadata.contenthash].filter(f => !!f);   // Multiple potential sources eliminate any empty
                    res.push(this.httpUrl()); // HTTP link to file (note this was added Oct2018 and might not be correct)
                    cb(null, res);
                }
                ], cbout);
        }
    }

    httpUrl() {
        // This will typically be dweb.me, but may be overridden un URL with mirror=localhost:4244
        return `${gatewayServer()}${gateway.urlDownload}/${this.itemid}/${this.metadata.name}`;
    }
    mimetype() {
        let f =  formats("format", this.metadata.format)
        if (typeof f === "undefined") {
            const ext = this.metadata.name.split('.').pop();
            f =  formats("ext", "."+ext)
        }
        return  (typeof f === "undefined") ? undefined : f.mimetype;
    }
    data(cb) { // Not timedout currently as only used in .blob which could be slow on big files
        // Fetch data, normally you shoud probably be streaming instead.
        // cb(data)
        // Throws TransportError (or poss CodingError) if urls empty or cant fetch
        //TODO-PROMISIFY need cb version of p_rawfetch then use promisify pattern here
        return this.urls()
            .then(urls => DwebTransports.p_rawfetch(urls))
            .then(res => { if (cb) { cb(null, res); return undefined; } else {return res; } })
            .catch(err => { if (cb) { cb(err); return undefined; } else { throw(err); } } )
    }
    async blob() { // Not timedout currently as only used in .blobUrl which could be slow on big files
        return new Blob([await this.data()], {type: this.mimetype()} );
    }
    async blobUrl() { // Not timedout currently as could be slow on big files
        return URL.createObjectURL(await this.blob());
    }
    async p_download(a, options) {
        //Weird workaround for a browser problem, download data as a blob,
        // edit parameters of an anchor to open this file in a new window,
        // and click it to perform the opening.
        let objectURL = await this.blobUrl();
        //browser.downloads.download({filename: this.metadata.name, url: objectURL});   //Doesnt work
        //Downloads.fetch(objectURL, this.metadata.name);   // Doesnt work
        a.href = objectURL;
        a.target= (options && options.target) || "_blank";                      // Open in new window by default
        a.onclick = undefined;
        a.download = this.metadata.name;
        a.click();
        //URL.revokeObjectURL(objectURL)    //TODO figure out when can do this - maybe last one, or maybe dont care?


    }
    sizePretty() {
        try {
            return prettierBytes(parseInt(this.metadata.size));
        } catch(err) {
            console.error("Couldnt get prettierBytes for",this);
            return "???";
        }
    }
    istype(type) {
        // True if specify a type and it matches, or don't specify a type BUT fails if type unrecognized
        let format = formats("format", this.metadata.format);
        //if (!format) console.warn("Format", this.metadata.format, "unrecognized");
        return format && (!type || (format.type === type));
    }
    // noinspection JSUnusedGlobalSymbols
    playable(type) {
        return this.istype(type) && formats("format", this.metadata.format).playable;
    }
    // noinspection JSUnusedGlobalSymbols
    downloadable(type) {
        return this.istype(type) && !!formats("format", this.metadata.format).downloadable;
    }

}
exports = module.exports = ArchiveFile;
