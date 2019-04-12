const ArchiveFile = require("./ArchiveFile");
const Util = require("./Util");
const debug = require('debug')('dweb-archivecontroller:ArchiveMember');

class ArchiveMember {
    /*
        Not quite an item, a member is the result of either a search query or the ITEMID_members.json file.
        It can point to an item.
        An array of these can sit in the members field of an item.
     */

    constructor(o) {
        // All this really does is turn o into an instance of class ArchiveMember
        // And copy into initial fields
        // Super class will have checked matches contract
        Object.keys(o).map(k => this[k] = o[k]);
    }

    static processMetadataFjords(meta, rules) {
        return Util.enforceStringOrArray(meta, rules);  // TODO-IAJS this is probably wrong now, will use wrong set of rules
    }
    httpUrl() {
        return `${Util.gatewayServer()}${Util.gateway.url_servicesimg}${this.identifier}`;  // Supported by dweb-mirror & gateway as well
    }
    urls() {
        // Return single or array of urls
        return this.thumbnaillinks ? this.thumbnaillinks : this.httpUrl();
    }
    async p_urls() {    // Its synchronous but maybe used asynchronously e.g. by ReactFake.p_loadImg > p_resolveUrls
        return await this.urls();
    }
    collection0() {
        // The first collection listed, for ArchiveMemberFav this is probably undefined
        return (this.collection && this.collection.length) ? this.collection[0] : undefined;
    }
    isExpanded() {
        return this.publicdate && this.title;
    }
}
exports = module.exports = ArchiveMember;