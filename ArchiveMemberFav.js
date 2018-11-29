const ArchiveMember = require("./ArchiveMember");
const Util = require("./Util");

class ArchiveMemberFav extends ArchiveMember {
    /*
        There are gratuitous differences between the fields in Related items; fav..members; and searches,
     */

    constructor(o) {
        // All this really does is turn o into an instance of class ArchiveMember
        //Handle weirdness in JSON where different type returned depending on none/1/many and possibly other weirdness
        super(ArchiveMember.processMetadataFjords(o, Util.rules.memberFav));
    }

}
exports = module.exports = ArchiveMemberFav;
