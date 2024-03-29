const bencode = require('bencode');
const magnet = require('magnet-uri');
const sha1 = require('simple-sha1');
const { parmsFrom } = require('./Util.js');
// TODO Using magnet-uri 7.* is ESM only, this wont load on dweb-mirror since dweb-mirror is not an ESM module nor is dweb-archivecontroller
// import magnet from 'magnet-uri';

// module.exports.toMagnetURI = magnet.encode

const torrentConfigDefault = {
  trackers: ['wss://wt.archive.org:6969',
    'wss://tracker.btorrent.xyz',
    'wss://tracker.openwebtorrent.com',
    'wss://tracker.fastcast.nz'
  ],
  // 'urlList': ['https://archive.org/download/']
  // Archive.org/download has rotten cors support - only certain files, no headers on OPTIONS etc ...
  'urlList': ['https://www-dweb-cors.dev.archive.org/download/'],
  'archiveTorrentServer': ['https://www-dweb-cors.dev.archive.org'] // Server that delivers munged torrents
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
function dwebTorrentObjectFrom({archiveArray = undefined, archiveBuffer = undefined, config = torrentConfigDefault }) {
  const torrentObject = torrentObjectFrom({ array: archiveArray, buffer: archiveBuffer }); // archiveTorrentObject with broken tracker and url-list fields
  torrentObject['announce-list'] = torrentObject['announce-list'].map(b => [b.toString()]);
  torrentObject['announce-list'].push(...config.trackers.map(b=>[b]));
  torrentObject['url-list'] = config.urlList; // archive.org default includes absolute data server and root-relative
  return torrentObject; // Now converted to dwebTorrentObject
}
function dwebTorrentFrom({ archiveArray = undefined, archiveBuffer = undefined, config = torrentConfigDefault }) {
  return bencode.encode(
    dwebTorrentObjectFrom({ archiveArray, archiveBuffer, config })
  );
}
function webTorrentObjectFrom({torrentObject=undefined, torrentUrl=undefined}) {
  // Convert a torrentObject (dweb or archive) into a object of form needed by WT code
  return Object.assign({},
    torrentObject,
    {
      announce: torrentObject['announce-list'],
      'announce-list': undefined,
      infoHash: sha1.sync(bencode.encode(torrentObject.info)),
      urlList: torrentObject['url-list'],
      'url-list': undefined,
      'xs': torrentUrl,
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

function btihQueryUrl(btih) {
  const query = parmsFrom({
    q: 'btih:'+btih,
    output: 'json',
    rows: 1,
    fl: 'identifier'  // Only want identifier, not a full ArchiveMember
  });
  return 'https://archive.org/advancedsearch.php?' + query; // Consumer should decide if want to route this url

}

exports = module.exports = { dwebMagnetLinkFrom, webTorrentObjectFrom, dwebTorrentFrom, dwebTorrentObjectFrom, btihQueryUrl,
  torrentObjectFrom, torrentConfigDefault };
