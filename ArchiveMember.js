const debug = require('debug')('dweb-archivecontroller:ArchiveMember');
const { enforceStringOrArray, gateway, rules, _query, ObjectIndexFrom, ObjectMap, specialidentifiers } = require('./Util');

class ArchiveMember {
  /*
      Not quite an item, a member is the result of either a search query or the ITEMID_members.json file.
      It can point to an item.
      An array of these can sit in the members field of an item.
   */

  /**
   *
   * All this really does is turn o into an instance of class ArchiveMember
   * And copy into initial fields
   * Super class will have checked matches contract
   * @param o {}          Initializer for member
   * @param unexpanded  True if haven't succeeded to expand yet (so should pass identifier to query)
   */
  constructor(o, { unexpanded = false } = {}) {
    const conforming = unexpanded ? o : ArchiveMember.processMetadataFjords(o, rules.member); // If claiming unexpanded dont check data
    Object.keys(conforming).map(k => this[k] = conforming[k]);
    this.unexpanded = unexpanded; // Flag so can tell whether needs expanding
  }

  /**
   *
   * @param rel {_source: {creatorSorter}} One of the members in a RelatedItems search
   * @returns {ArchiveMember}
   */
  static fromRel(rel) {
    return new ArchiveMember(
      Object.assign(
        rel._source,
        {
          identifier: rel._id,
          creator: rel._source.creatorSorter, // TODO-IA ask Gio to give us creator as well
        })
    );
  }

  /**
   * Create member from an identifier (expand it later)
   * @param identifier
   * @returns {ArchiveMember}
   */
  static fromIdentifier(identifier) {
    return new ArchiveMember({ identifier }, { unexpanded: true });
  }

  /**
   * Create member from favorites list (expand later)
   * @param fav
   * @returns {ArchiveMember}
   */
  static fromFav(fav) {
    return new ArchiveMember(fav, { unexpanded: true });
  }

  /**
   * Check metadata and return it with edge cases removed
   * @param meta Metadata as returned by metadata API
   * @param ruleobj Data structure for rules
   * @returns {{}}
   */
  static processMetadataFjords(meta, ruleobj) {
    return enforceStringOrArray(meta, ruleobj); // TODO this is probably wrong now, will use wrong set of rules
  }

  /**
   * Get the first collection of this member (used for the pop-up in top left of tiles)
   * @returns {*}
   */
  collection0() {
    // The first collection listed, (undefined if unexpanded) this is probably undefined
    return (this.collection && this.collection.length) ? this.collection[0] : undefined;
  }

  /**
   * True if the member has already been expanded.
   * @returns {boolean}
   */
  isExpanded() {
    return !this.unexpanded;
  }

  /**
   * Expand from a source that might not be giving all the fields (e.g. a favorites list)
   * @param members   array of ArchiveMember
   * @param cb(err, [ArchiveMember])
   */
  static expandMembers(members, cb) {
    const ids = members && members.filter(am => am.mediatype !== 'search').filter(am => !am.isExpanded()).map(am => am.identifier);
    if (ids.length) {
      this.expand(ids, (err, res) => {
        if (!err) {
          members = members.map(m => res[m.identifier] || m);
        }
        cb(null, members); // Dont pass error up, its ok not to be able to expand some or all of them
      });
    } else {
      cb(null, members); // Nothing to expand
    }
  }

  /**
   * Use advancedSearch api to expand an array of ids into a dictionary mapping that id to an ArchiveMember
   * This is only currently used when presented with a list of ids for example from a favorites list.
   * Pathway is ...  ArchiveItem._fetch_query > ArchiveMember.expand
   * @param ids [ identifier ]
   * @param cb(err, { id1: ArchiveMember(id1) }
   */
  static expand(ids, cb) {
    const specialMembers = ObjectMap(specialidentifiers, (k, v) => [k, new ArchiveMember(v)]);
    // Was Allowing for special ids, since mirror actually knows the answer better than browser does but can cause unnecessary failures and request for 'home'
    const expandableids = ids.filter(id => !Object.keys(specialidentifiers).includes(id)); // Strip out any handled specially
    if (expandableids && expandableids.length) {
      _query({
        output: 'json',
        q: 'identifier:(' + expandableids.join(' OR ') + ')', // Note it will be URLencoded, don't use '%20OR%20'
        rows: ids.length,
        page: 1,
        'sort[]': 'identifier',
        'fl': gateway.url_default_fl, // Ensure get back fields necessary to paint tiles
      }, (err, j) => {
        if (err) {
          debug('Unable to expand ids identifier=%s ids=%s err= %s', this.itemid || '', ids.join(', '), err.message);
          cb(err);
        } else {
          // Note some of these might still not be expanded if query partially or fully fails to expand
          // index should only be the expanded ones
          const res = ObjectIndexFrom(
            j.response.docs.filter(o => !o.unexpanded) // Find results from query that look complete (was checking publicdate but that doesnt work on home|settings|local)
              .map(o => new ArchiveMember(o)), // And turn into ArchiveMember
            as => as.identifier); // And build index of their identifiers { id1: as; id2: as2 }
          cb(null, Object.assign({}, specialMembers, res)); // Return with the specialidentifiers overridden by result
        }
      });
    } else { // Short cut, no ids so dont need to do the query, just return the specialidentifiers.
      cb(null, specialMembers);
    }
  }
}

exports = module.exports = ArchiveMember;
// Code review - Mitra - 20191227
