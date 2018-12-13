const ArchiveMember = require("./ArchiveMember");
const Util = require("./Util");

class ArchiveMemberRelated extends ArchiveMember {
    /*
        There are gratuitous differences between the fields in Related items; fav..members; and searches,
     */

    constructor(o) {
        // All this really does is turn o into an instance of class ArchiveMember
        //Handle weirdness in JSON where different type returned depending on none/1/many and possibly other weirdness
        o._source.identifier = o._id;
        super(ArchiveMember.processMetadataFjords(o._source, Util.rules.memberSearch));
    }

}
exports = module.exports = ArchiveMemberRelated;
