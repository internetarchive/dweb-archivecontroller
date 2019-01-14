const ArchiveMember = require("./ArchiveMember");
const Util = require("./Util");
const debug = require("debug")("archive-controller:ArchiveMemberSearch")

class ArchiveMemberSearch extends ArchiveMember {
    /*
        There are gratuitous differences between the fields in Related items; fav..members; and searches,
     */

    constructor(o) {
        // All this really does is turn o into an instance of class ArchiveMember
        //Handle weirdness in JSON where different type returned depending on none/1/many and possibly other weirdness
        super(ArchiveMember.processMetadataFjords(o, Util.rules.memberSearch));
    }

    static expandRels(rels, cb) {
        // Expand result of a RelatedItems call to Gio's API
        // rels {hits: {hits: [id: ... ] }}
        // return [ArchiveSearchMember*] via cb(err,res) or Promise
        if (cb) { try { f.call(this, cb) } catch(err) { cb(err)}} else { return new Promise((resolve, reject) => { try { f.call(this, (err, res) => { if (err) {reject(err)} else {resolve(res)} })} catch(err) {reject(err)}})} // Promisify pattern v2
        function f(cb) {
            this.expand(rels.hits.hits.map(r => r._id), (err, searchmembersdict) => {
                if (err) {
                    cb(err)
                } else {
                    cb(null, rels.map(r => searchmembersdict[r._id])); // Can be undefined, but shouldnt see rels should all be valid
                }
            });
        }
    }
    static expand(ids, cb) {
        /* Expand ids into the Search Docs that can be used to paint tiles or collection lists
            ids [ identifier ]
            cb(err, { id1: ArchiveSearch(id1) }

            Pathway is ...  ArchiveItem._fetch_query > ArchiveMemberSearch.expand
        */
        if (ids && ids.length) {
            Util._query({
                output: "json",
                q: 'identifier:('+ ids.join(' OR ') + ")", // Note it will be URLencoded, don't use "%20OR%20"
                rows: ids.length,
                page: 1,
                'sort[]': "identifier",
                'fl': Util.gateway.url_default_fl,  // Ensure get back fields necessary to paint tiles
            }, (err, j) => {
                if (err) {
                    debug("Unable to expand ids for %s %s", this.itemid, err.message);
                    cb(err);
                } else {
                    // Note some of these might still not be expanded if query partially or fully fails to expand
                    // index should only be the expanded ones
                    const res = Object.indexFrom(j.response.docs.filter(o=>o.publicdate).map(o => new ArchiveMemberSearch(o)), as => as.identifier); // { id1: as; id2: as2 }
                    cb(null, res);
                }
            })
        } else { // Short cut, no ids so dont need to do the query.
            cb(null, {});
        }
    }
    isExpanded() {
        console.assert(this.publicdate && this.title, "Debugging check for half-expanded ArchiveMemberSearches");
        return true;
    }

}



exports = module.exports = ArchiveMemberSearch;
