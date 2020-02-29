/* eslint-disable object-property-newline */
/**
 * Export all of the public components here
 */

const ArchiveFile = require('./ArchiveFile');
const ArchiveItem = require('./ArchiveItem');
const ArchiveMember = require('./ArchiveMember');
const RawBookReaderResponse = require('./RawBookReaderResponse');
const RawBookReaderJSONResponse = require('./RawBookReaderJSONResponse');
// Add specific cases here as used elsewhere.
const { torrentConfigDefault, dwebMagnetLinkFrom, dwebTorrentObjectFrom, btihQueryUrl } = require('./mungeTorrent');
const { formats, gateway, homeQuery, ObjectDeeperAssign,
  ObjectFromEntries, ObjectMap, ObjectFilter, parmsFrom, specialidentifiers } = require('./Util');
const { routed } = require('./routing');

exports = module.exports = { ArchiveFile, ArchiveItem, ArchiveMember, RawBookReaderResponse, RawBookReaderJSONResponse,
  torrentConfigDefault, dwebMagnetLinkFrom, dwebTorrentObjectFrom, btihQueryUrl,
  formats, gateway, homeQuery, ObjectDeeperAssign,
  ObjectFromEntries, ObjectMap, ObjectFilter, parmsFrom, specialidentifiers,
  routed
};
if (typeof window !== 'undefined') { window.DwebArchiveController = exports; }
module.exports = exports;


// Code review 2019-12-17 by Mitra
