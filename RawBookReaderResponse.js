const debug = require('debug')('RawBookReaderResponse');

class RawBookReaderResponse {
    /*
    Exactly the data structure returned from BookReaderJSIA.php
    { data { data, brOptions, lendingInfo, metadata }
    TODO-IAUX this is intended to match equivalent class in IAUX
    TODO - refactor to use this
     */
    constructor(props) {
        // Create a new API from props, using a shallow copy (may switch to deeper copy if reqd)
        //[ "data", "brOptions", "lendingInfo", "metadata"].forEach( k => this[k] = props[k]);
        this.data = props.data;
    }

    static fromArchiveItem(from) {
        // Create a RawBookReaderResponse from a ArchiveItem (typically to then be exported)
        return new this({ data: Object.assign({}, from.bookreader, {metadata: from.metadata})});
    }
    cooked({server=undefined, protocol=undefined}={}) {
        // Cook the results of the API for passing to browser (with or without mirror) - alternative to asking for '.data"
        // TODO-BOOK This could be running in different places, document where here.
        // TODO-BOOK if reqd, use DwebArchive.mirror as test if running on browser with mirror.

        /* Typical no-mirror scenario
            browser calls fetch_bookreader which forwards to datanode
            datanode returns with server=DATANODE and urls https://DATANODE...
            Browser uses this url to request page from DATANODE
         */
        /* Typical mirror scenario
            browser calls fetch_bookreader which forwards to localhost with server=localhost:4244
            Mirror catches this, calls fetch_bookreader which fetches from datanode or dweb.me with server=DATANODE
            datanode returns with server=DATANODE and urls https://DATANODE... which is what gets cached
            Mirror cooks (in mirrorHttp) based on browser's server= when returning to browser
            Browser uses cooked url to request page from mirror
         */

        if (server) {
            const oldServer = this.data.brOptions.server;
            this.data.brOptions.data.forEach(d1 => d1.forEach(d2 => d2.uri = d2.uri.replace(oldServer, server)))
            //TODO-BOOK need to edit https to http
        }
        if (protocol) {
            this.data.brOptions.data.forEach(d1 => d1.forEach(d2 => d2.uri = d2.uri.replace("https", protocol)))
        }
        return this.data;
    }
}
exports = module.exports = RawBookReaderResponse;
