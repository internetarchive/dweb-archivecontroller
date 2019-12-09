const bencode = require('bencode');
const magnet = require('magnet-uri');
const sha1 = require('simple-sha1');
module.exports.toMagnetURI = magnet.encode
// TODO have dweb-torrent import this

const torrentConfigDefault = {
  trackers: ['wss://dweb.archive.org:6969', // TODO-DM242/torrent
    'wss://tracker.btorrent.xyz',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.fastcast.nz'
  ],
  "urlList": ["https://archive.org/download/"]
}


/**
 *
 * @param archiveArray    Array of bytes for torrent in archive form (i.e. bad trackers etc)
 * @param archiveBuffer   Buffer for torrent in archive form (i.e. bad trackers etc)
 * @param config
 * @returns {Object|Array|Buffer|String|Number}
 */
function torrentObjectFrom({array=undefined, buffer=undefined}) {
  return bencode.decode(
    array
      ? Buffer.from(array)
      : buffer
  );
}
function dwebTorrentObjectFrom({archiveArray=undefined, archiveBuffer=undefined, config=torrentConfigDefault }) {
  const torrentObject = torrentObjectFrom({array: archiveArray, buffer: archiveBuffer}); // archiveTorrentObject with broken tracker and url-list fields
  torrentObject["announce-list"] = torrentObject["announce-list"].map(b=>b.toString())
  torrentObject["announce-list"].push(...config.trackers);
  torrentObject["url-list"] = config.urlList; // archive.org default includes absolute data server and root-relative
  return torrentObject; // Now converted to dwebTorrentObject
}
function dwebTorrentFrom({archiveArray=undefined, archiveBuffer=undefined, config=torrentConfigDefault}) {
  return bencode.encode(
    dwebTorrentObjectFrom({archiveArray, archiveArray, config})
  );
}
function webTorrentObjectFrom({torrentObject=undefined, torrentUrl=undefined}) {
  // Convert a torrentObject (dweb or archive) into a object of form needed by WT code
  return Object.assign({},
    torrentObject,
    {
      announce: torrentObject["announce-list"],
      "announce-list": undefined,
      infoHash: sha1.sync(bencode.encode(torrentObject.info)),
      urlList: torrentObject["url-list"],
      "url-list": undefined,
      "xs": torrentUrl,
    });
}
function dwebMagnetLinkFrom({archiveArray=undefined, archiveBuffer=undefined, config=torrentConfigDefault, dwebTorrentUrl=undefined}) {
  // Convert a buffer or array into a object of form needed by WT code
  return magnet.encode(
    webTorrentObjectFrom({
      torrentUrl: dwebTorrentUrl,
      torrentObject: dwebTorrentObjectFrom({ archiveArray, archiveBuffer, config }),
    })
  );
}
exports = module.exports = { dwebMagnetLinkFrom, webTorrentObjectFrom, dwebTorrentFrom, dwebTorrentObjectFrom, torrentObjectFrom, torrentConfigDefault };