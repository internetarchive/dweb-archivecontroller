const {enforceStringOrArray, gateway, rules, _query} = require("./Util");
const debug = require('debug')('dweb-archivecontroller:ArchiveMember');
const {Object_indexFrom, Object_forEach, specialidentifiers} = require('./Util');

class ArchiveMember {
    /*
        Not quite an item, a member is the result of either a search query or the ITEMID_members.json file.
        It can point to an item.
        An array of these can sit in the members field of an item.
     */

    constructor(o, {unexpanded=false}={}) {
        // All this really does is turn o into an instance of class ArchiveMember
        // And copy into initial fields
        // Super class will have checked matches contract
        const conforming = unexpanded ? o : ArchiveMember.processMetadataFjords(o, rules.member); // If claiming unexpanded dont check data
        Object.keys(conforming).map(k => this[k] = conforming[k]);
        this.unexpanded = unexpanded;   // Flag so can tell whether needs expanding
    }
    static fromRel(rel) {
        return new ArchiveMember(
                Object.assign(
                    rel._source,
                    {
                        identifier: rel._id,
                        creator: rel._source.creatorSorter, //TODO-IA ask Gio to give us creator as well
                    }) );
    }
    static fromIdentifier(identifier) {
        return new ArchiveMember({identifier}, {unexpanded: true});
    }
    static fromFav(fav) {
        // Create a ArchiveMember but flag unexpanded so will get expanded asynchronously elsewhere
        return new ArchiveMember(fav, {unexpanded: true});
    }

    static processMetadataFjords(meta, rules) {
        return enforceStringOrArray(meta, rules);  // TODO-IAJS this is probably wrong now, will use wrong set of rules
    }
    httpUrl() {
        return `${gatewayServer()}${gateway.url_servicesimg}${this.identifier}`;  // Supported by dweb-mirror & gateway as well
    }
    urls() {
        // Return single or array of urls
        return this.thumbnaillinks ? this.thumbnaillinks : this.httpUrl();
    }
    async p_urls() {    // Its synchronous but maybe used asynchronously e.g. by ReactFake.p_loadImg > p_resolveUrls
        return await this.urls();
    }
    collection0() {
        // The first collection listed, (undefined if unexpanded) this is probably undefined
        return (this.collection && this.collection.length) ? this.collection[0] : undefined;
    }
    isExpanded() {
        return !this.unexpanded;
    }

    static expandMembers(members, cb) {
        /* Expand an array of ArchiveMember from a source that might not be giving all the fields (e.g. a favorites list) */
        const ids = members && members.filter(am=>am.mediatype !== "search").filter(am => !am.isExpanded()).map(am => am.identifier);
        if (ids) {
            this.expand(ids, (err, res) => {
                if (!err) {
                    members = members.map(m => res[m.identifier] || m);
                }
                cb(null, members);  // Dont pass error up, its ok not to be able to expand some or all of them
            });
        } else {
            cb(null, members); // Nothing to expand
        }
    }


    static expand(ids, cb) {
        /* Use advancedSearch api to expand an array of ids into a dictionary mapping that id to an ArchiveMember
           This is only currently used when presented with a list of ids for example from a favorites list.

            ids [ identifier ]
            cb(err, { id1: ArchiveMember(id1) }

            Pathway is ...  ArchiveItem._fetch_query > ArchiveMember.expand
        */
        const specialMembers = Object_map(specialidentifiers, (k,v) => [k, new ArchiveMember(v)]);
        const expandableids = ids.filter(id => !Object.keys(specialidentifiers).includes(id)); // Strip out any handled specially
        if (expandableids && expandableids.length) {
            _query({
                output: "json",
                q: 'identifier:('+ expandableids.join(' OR ') + ")", // Note it will be URLencoded, don't use "%20OR%20"
                rows: ids.length,
                page: 1,
                'sort[]': "identifier",
                'fl': gateway.url_default_fl,  // Ensure get back fields necessary to paint tiles
            }, (err, j) => {
                if (err) {
                    debug("Unable to expand ids for %s %s", this.itemid, err.message);
                    cb(err);
                } else {
                    // Note some of these might still not be expanded if query partially or fully fails to expand
                    // index should only be the expanded ones
                    const res = Object_indexFrom(
                            j.response.docs.filter(o=>o.publicdate) // Find results from query that look complete i.e. have publicdate
                                .map(o => new ArchiveMember(o)),    // And turn into ArchiveMember
                            as => as.identifier);                   // And build index of their identifiers { id1: as; id2: as2 }
                    cb(null, Object.assign(res, specialMembers)); // Return with the specialidentifiers
                }
            })
        } else { // Short cut, no ids so dont need to do the query, jsut return the specialidentifiers.
            cb(null, specialMembers);
        }
    }

}

exports = module.exports = ArchiveMember;