/* global DwebTransports */
/* eslint-disable consistent-return *//* because of promisify pattern */
// require('babel-core/register')({presets: ['env', 'react']}); // ES6 JS below!
const canonicaljson = require('@stratumn/canonicaljson');
const debug = require('debug')('dweb-archivecontroller:Util');
const itemRules = require('./itemRules');
const { routed } = require('./routing');

function fetchJson(url, cb) {
  /*

        // TODO DEPRECATED - should be replaced with httptools.p_GET
        url:   to be fetched - construct CORS safe JSON enquiry.
        throws: TypeError if cant fetch
        throws: Error if fetch doesnt return JSON.
        throws: Error if fail to fetch
        returns Decoded json response via cb or promise
         */
  debug('DEPRECATED fetchJson: %s', url);
  const prom = fetch(new Request(url, // Throws TypeError on failed fetch
    {
      method: 'GET',
      headers: new Headers(),
      mode: 'cors',
      cache: 'default',
      redirect: 'follow', // Chrome defaults to manual
    }
  )).then(response => {
    if (response.ok) {
      if (response.headers.get('Content-Type').startsWith('application/json')) {
        return response.json(); // response.json is a promise resolving to JSON already parsed
      } else {
        const t = response.text(); // promise resolving to text
        throw new Error(`Unable to fetch, return was not JSON - got: ${response.headers.get('Content-Type')} ${t}`);
      }
    } else { // response not OK (some files e.g. https://dweb.archive.org/metadata/kaled_jalil/001.mp3 get !response.ok instead of error
      // Note - if copy this for binary files, make sure to look at TransportHTTP which uses response.arrayBuffer
      throw new Error(`failed to fetch ${url} message=${response.status} ${response.statusText}`);
    }
  });
  // if (cb) { prom.catch((err) => cb(err)).then((res)=>cb(null,res)); } else { return prom; } // Unpromisify pattern v2
  if (cb) { prom.then((res) => cb(null, res)).catch((err) => cb(err)); } else { return prom; } // Unpromisify pattern v3
}


function enforceStringOrArray(meta, rules) { // See ArchiveItem.loadMetadataFromAPI for other Fjord handling
  // The Archive is nothing but edge cases, handle some of them here so the code doesnt have to !
  // Note this called by ArchiveMember and ArchiveItem and will probably be called by ArchiveFiles so keep it generic and put class-specifics in Archive*.processMetadataFjord
  const res = {};
  Object.keys(meta).forEach(f => {
    if (rules.nonrepeatable_fields.includes(f)) {
      if (Array.isArray(meta[f])) {
        if (meta[f].length > 1) {
          debug('WARNING: Metadata Fjords - multi item in non-repeating field %s on %s, choosing first', f, meta.identifier);
        }
        res[f] = (meta[f].length > 0) ? meta[f][0] : '';
        // Old standard would have it undefined if not in singletons else "" - can do that if we test for undefined anywhere
      } else {
        // Already converted to string and want a string
        res[f] = meta[f];
      }
    } else {
      res[f] = Array.isArray(meta[f]) ? meta[f] // arrays already ok
        : (typeof (meta[f]) === 'string') ? [meta[f]] // strings should be turned into array
          : (typeof (meta[f]) === 'object') ? meta[f] // Dont muck with objects that aren't arrays
            : []; // nothing mean an empty array
    }
  });
  rules.required_fields.filter(f => (typeof res[f] === 'undefined'))
    .forEach(f => {
      debug('WARNING: Metadata Fjords - required field %s missing from %s', f, meta.identifier);
      res[f] = rules.nonrepeatable_fields.includes(f) ? '' : [];
    });
  return res;
}

// === Configuration info ====

/*
A table, and a function to access it.

The table is an array of information about formats, useful for converting between the multitude of ways that formats are used at the Archive.

It is incomplete, there does not appear to be any consistent usable tables in petabox, but various partial mappings done in different places

Each row of the array corresponds to a unique format, any field may be duplicated.

The table is intentionally not exported, but could be if code needs to use it.

format:         as used in file metadata
ext:            file extension
type:           mediatype
mimetype:       As in Content-type http header
playable:       true if suitable for playing, usually this is smaller format videos and audio etc
downloadable:   Set to the upper case string used for sorting in the downloads bar on details page

Use as follows:

formats(field, value, {first=false})

field: of _formatarr to check
value: value to check for,
first:  true to return first match or undefined, false for array

formats("format", "VBR MP3", {first: true}).downloadable

TODO expand to other formats - see mimetypes list from petabox
TODO fill in missing fields, esp format fiel
Git petabox/www/common/FormatGetter.inc has the ones with ext and name, but nothing else
Git petabox/etc/nginx/mime.types has 2 mappings of ext to mimetype
*/
// Note copy of this in ia-components/util.js and dweb-archivecontroller/util.js
const _formatarr = [
  { format: 'VBR MP3', ext: '_vbr.m3u', type: 'audio', mimetype: 'audio/mpeg3', playable: true, downloadable: 'VBR MP3' },
  { format: 'Ogg Vorbis', ext: undefined, type: 'audio', mimetype: 'audio/TODO', playable: true, downloadable: 'OGG VORBIS' },
  { format: '128Kbps MP3', ext: '_128kb.m3u', type: 'audio', mimetype: 'audio/mpeg3', playable: false, downloadable: '128KBPS MP3' },
  { format: '64Kbps MP3', ext: '_64kb.m3u', type: 'audio', mimetype: 'audio/mpeg3', playable: false, downloadable: '64KBPS MP3' },
  { format: undefined, ext: '.m3u', type: 'audio', mimetype: 'audio/x-mpegurl', playable: undefined, downloadable: undefined },
  { format: 'LibriVox Apple Audiobook', type: 'audio', mimetype: 'application/octet-stream', playable: false, downloadable: 'LIBRIVOX APPLE AUDIOBOOK' },
  { format: 'JPEG', ext: '.jpeg', type: 'image', mimetype: 'image/jpeg', playable: true, downloadable: 'JPEG' },
  { format: 'PNG', ext: '.png', type: 'image', mimetype: 'image/png', playable: true, downloadable: 'PNG' },
  { format: 'Animated GIF', ext: '.gif', type: 'image', mimetype: 'image/gif', playable: true, downloadable: undefined }, // ON ArtOfCommunitySecondEdition on a.o not downloadable
  { format: 'JPEG Thumb', ext: undefined, type: 'image', mimetype: 'image/jpeg', playable: false, downloadable: undefined },
  { format: 'JPEG 250px Thumb', ext: undefined, type: 'image', mimetype: 'image/jpeg', playable: false, downloadable: 'JPEG 250PX THUMB' },
  { format: 'JPEG 500px Thumb', ext: undefined, type: 'image', mimetype: 'image/jpeg', playable: false, downloadable: 'JPEG 500PX THUMB' },
  { format: 'Spectrogram', ext: undefined, type: 'image', mimetype: 'image/png', playable: false, downloadable: 'SPECTROGRAM' },
  { format: 'Item Image', ext: undefined, type: 'image', mimetype: 'image/jpeg', playable: true, downloadable: 'JPEG' }, // Note we might be lying about the type - at least some are JPG
  { format: 'Thumbnail', ext: undefined, type: 'image', mimetype: 'image/jpeg', playable: true, downloadable: 'JPEG' }, // Note we might be lying about the type - at least some are JPG
  { format: 'PDF', ext: '.pdf', type: 'text', mimetype: 'application/pdf', playable: true, downloadable: 'PDF' },
  { format: 'HTML', ext: '.html', type: 'text', mimetype: 'text/html', playable: false, downloadable: 'HTML' },
  { format: 'HTML', ext: '.htm', type: 'text', mimetype: 'text/html', playable: false, downloadable: 'HTML' },
  { format: 'Hypertext', ext: '.htm', type: 'text', mimetype: 'text/html', playable: false, downloadable: 'HYPERTEXT' },
  { format: 'HTML', ext: '.shtml', type: 'text', mimetype: 'text/html', playable: false, downloadable: 'HTML' },
  { format: 'DjVuTXT', ext: undefined, type: 'text', mimetype: 'text/plain', playable: false, downloadable: 'FULL TEXT' },
  { format: 'Text PDF', ext: '.pdf', type: 'text', mimetype: 'application/pdf', playable: true, downloadable: 'PDF' },
  { format: 'h.264', ext: undefined, type: 'video', mimetype: 'video/mp4', playable: true, downloadable: 'H.264' },
  { format: '512Kb MPEG4', ext: undefined, type: 'video', mimetype: 'video/mp4', playable: true, downloadable: '512KB MPEG' },
  { format: '256Kb MPEG4', ext: undefined, type: 'video', mimetype: 'video/mp4', playable: true, downloadable: '256KB MPEG' },
  { format: 'MPEG4', ext: undefined, type: 'video', mimetype: 'video/mp4', playable: true, downloadable: 'MPEG4' },
  { format: '64Kb MPEG4', ext: undefined, type: 'video', mimetype: 'video/mp4', playable: false, downloadable: '64KB MPEG' },
  { format: 'MPEG2', ext: '.mpeg', type: 'video', mimetype: 'video/mpeg', playable: false, downloadable: 'MPEG2' },
  { format: 'MPEG1', ext: undefined, type: 'video', mimetype: 'video/mpeg', playable: false, downloadable: 'MPEG1' },
  { format: 'Ogg Video', ext: '.ogv', type: 'video', mimetype: 'video/ogg', playable: false, downloadable: 'OGG VIDEO' },
  { format: 'Archive BitTorrent', ext: '.torrent', type: 'other', mimetype: 'application/x-bittorrent', playable: false, downloadable: 'TORRENT' },
  { format: 'Unknown', ext: undefined, type: 'unknown', mimetype: 'unknown', playable: false, downloadable: undefined },
  { format: 'Abbyy GZ', ext: undefined, type: 'other', mimetype: 'application/octet-stream', playable: false, downloadable: 'ABBYY GZ' },
  { format: 'Djvu XML', ext: undefined, type: 'other', mimetype: 'text/xml', playable: false, downloadable: undefined },
  { format: 'Single Page Processed JP2 ZIP', ext: undefined, type: 'other', mimetype: 'application/octet-stream', playable: false, downloadable: 'SINGLE PAGE PROCESSED JP2 ZIP' },
  { format: 'Scandata', ext: undefined, type: 'other', mimetype: 'text/xml', playable: false, downloadable: undefined },
  { format: '7z', ext: '.7z', type: 'application', mimetype: 'application/x-7z-compressed', playable: undefined, downloadable: undefined },
  { format: 'Advanced Audio Coding', ext: '.aac', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Amiga Disk File', ext: '.adf', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Android Package Archive', ext: '.apk', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Apple Lossless Audio', ext: '.m4a', type: 'audio', mimetype: 'audio/mpeg', playable: undefined, downloadable: undefined },
  { format: 'Audacity Project', ext: '.aup', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'BZIP2', ext: '.bz2', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Backup', ext: '.bak', type: 'application', mimetype: 'application/x-trash', playable: undefined, downloadable: undefined },
  { format: 'Berkeley DB Java Edition', ext: '.jdb', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined }, // used by Heritri
  { format: 'CD Audio Track Shortcut', ext: '.cda', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined }, // generally a mistaken uploa:
  { format: 'CUIL', ext: '.cuil', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined }, // Files provided by cuil.com which hold their crawl data
  { format: 'Cascading Style Sheet', ext: '.css', type: undefined, mimetype: 'text/css', playable: undefined, downloadable: undefined },
  { format: 'Crowley IDF', ext: '.idf', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Crowley QPF', ext: '.qpf', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Cue Sheet', ext: '.cue', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'DVD Info Backup', ext: '.bup', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'DVD Info', ext: '.ifo', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Excel', ext: '.xls', type: 'application', mimetype: 'application/vnd.ms-excel', playable: undefined, downloadable: undefined },
  { format: 'Excel', ext: '.xlsx', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Flac', ext: '.flac', type: 'audio', mimetype: 'audio/flac', playable: undefined, downloadable: undefined },
  { format: 'Flash Authoring', ext: '.fla', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'GIF', ext: '.gif', type: 'image', mimetype: 'image/gif', playable: true, downloadable: 'GIF' },
  { format: 'h.264/MPEG2-TS', ext: '.mts', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Information', ext: '.nfo', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Item Tile', ext: '.jpg', type: 'image', mimetype: 'image/jpeg', playable: undefined, downloadable: 'ITEM TILE' },
  { format: 'JSON', ext: '.json', type: 'application', mimetype: 'application/json', playable: undefined, downloadable: undefined },
  { format: 'M3U', ext: '.m3u8', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Mac OS X Disk Image', ext: '.dmg', type: 'application', mimetype: 'application/x-apple-diskimage', playable: undefined, downloadable: undefined },
  { format: 'Metadata', ext: '.xml', type: 'other', mimetype: 'text/xml', playable: false, downloadable: undefined }, // _reviews.xml is this format and is not downloadable
  { format: 'Microsoft Reader', ext: '.lit', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'OCLC xISBN JSON', ext: '_xisbn.json', type: 'application', mimetype: 'application/json', playable: undefined, downloadable: 'OCLC XISBN JSON' },
  { format: 'OpenDocument Spreadsheet', ext: '.ods', type: 'application', mimetype: 'application/vnd.oasis.opendocument.spreadsheet', playable: undefined, downloadable: undefined },
  { format: 'OpenDocument Text Document', ext: '.odt', type: 'application', mimetype: 'application/vnd.oasis.opendocument.text', playable: undefined, downloadable: undefined },
  { format: 'Powerpoint', ext: '.ppt', type: 'application', mimetype: 'application/vnd.ms-powerpoint', playable: undefined, downloadable: undefined },
  { format: 'Powerpoint', ext: '.pptx', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Rich Text Format', ext: '.rtf', type: undefined, mimetype: 'text/rtf', playable: undefined, downloadable: undefined },
  { format: 'Rich Text Format', ext: '.rtf', type: undefined, mimetype: 'application/rtf', playable: undefined, downloadable: undefined },
  { format: 'SHNtool MD5 Checksums', ext: '.st5', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Simple File Verification', ext: '.sfv', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Sony Reader Format', ext: '.lrf', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Storage Media Image', ext: '.2mg', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: '+Storage Media Image', ext: '.do', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Storage Media Image', ext: '.dsk', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Storage Media Image', ext: '.po', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Tab-Separated Values', ext: '.tsv', type: 'text', mimetype: 'text/tab-separated-values', playable: undefined, downloadable: undefined },
  { format: 'Text', ext: '.txt', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: 'TEXT' },
  { format: 'TrueType Font', ext: '.ttf', type: 'font', mimetype: 'font/ttf', playable: undefined, downloadable: undefined },
  { format: 'Webex Advanced Recording File', ext: '.wma', type: 'audio', mimetype: 'audio/x-ms-wma', playable: undefined, downloadable: undefined },
  { format: 'Windows Executable', ext: '.exe', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: 'Windows Media Audio', ext: '.wma', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Windows Screensaver', ext: '.scr', type: undefined, mimetype: undefined, playable: undefined, downloadable: undefined },
  { format: 'Word Document', ext: '.doc', type: 'application', mimetype: 'application/msword', playable: false, downloadable: undefined },
  { format: 'Word Document', ext: '.docx', type: 'application', mimetype: 'application/msword', playable: false, downloadable: undefined },
  { format: 'XML', ext: '.xml', type: 'text', mimetype: 'text/xml', playable: false, downloadable: 'XML' },
  { format: 'youtube-dl Video Description File', ext: '.description', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: 'TEXT' },
  { format: 'ZIP', ext: '.zip', type: 'application', mimetype: 'application/zip', playable: false, downloadable: 'ZIP' },
  { format: undefined, ext: '.3gp', type: 'video', mimetype: 'video/3gpp', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.3gpp', type: 'video', mimetype: 'video/3gpp', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ai', type: 'application', mimetype: 'application/postscript', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.asf', type: 'video', mimetype: 'video/x-ms-asf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.asx', type: 'video', mimetype: 'video/x-ms-asf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.avi', type: 'video', mimetype: 'video/x-msvideo', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bin', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bmp', type: 'image', mimetype: 'image/x-ms-bmp', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cco', type: 'application', mimetype: 'application/x-cocoa', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.crt', type: 'application', mimetype: 'application/x-x509-ca-cert', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.der', type: 'application', mimetype: 'application/x-x509-ca-cert', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dll', type: 'application', mimetype: 'application/x-msdos-program', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ear', type: 'application', mimetype: 'application/java-archive', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.eot', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.eps', type: 'application', mimetype: 'application/postscript', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.flv', type: 'video', mimetype: 'video/x-flv', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hqx', type: 'application', mimetype: 'application/mac-binhex40', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.htc', type: 'text', mimetype: 'text/x-component', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ico', type: 'image', mimetype: 'image/x-icon', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ico', type: 'image', mimetype: 'image/vnd.microsoft.icon', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.img', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jad', type: 'text', mimetype: 'text/vnd.sun.j2me.app-descriptor', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jar', type: 'application', mimetype: 'application/java-archive', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jardiff', type: 'application', mimetype: 'application/x-java-archive-diff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jng', type: 'image', mimetype: 'image/x-jng', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jnlp', type: 'application', mimetype: 'application/x-java-jnlp-file', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jpg', type: 'image', mimetype: 'image/jpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.js', type: 'application', mimetype: 'application/javascript', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kar', type: 'audio', mimetype: 'audio/midi', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.log', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mathml', type: 'text', mimetype: 'text/mathml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mid', type: 'audio', mimetype: 'audio/midi', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.midi', type: 'audio', mimetype: 'audio/midi', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mml', type: 'text', mimetype: 'text/mathml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mng', type: 'video', mimetype: 'video/x-mng', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mov', type: 'video', mimetype: 'video/quicktime', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mp3', type: 'audio', mimetype: 'audio/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpg', type: 'video', mimetype: 'video/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.msm', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.msp', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pdf', type: 'application', mimetype: 'application/pdf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pem', type: 'application', mimetype: 'application/x-x509-ca-cert', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pl', type: 'application', mimetype: 'application/x-perl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pl', type: 'text', mimetype: 'text/x-perl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.png', type: 'image', mimetype: 'image/png', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.prc', type: 'application', mimetype: 'application/x-pilot', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ps', type: 'application', mimetype: 'application/postscript', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ra', type: 'audio', mimetype: 'audio/x-realaudio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rpm', type: 'application', mimetype: 'application/x-redhat-package-manager', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rss', type: 'application', mimetype: 'application/rss+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rss', type: 'text', mimetype: 'text/xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.run', type: 'application', mimetype: 'application/x-makeself', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sea', type: 'application', mimetype: 'application/x-sea', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sit', type: 'application', mimetype: 'application/x-stuffit', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.swf', type: 'application', mimetype: 'application/x-shockwave-flash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tif', type: 'image', mimetype: 'image/tiff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tiff', type: 'image', mimetype: 'image/tiff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.war', type: 'application', mimetype: 'application/java-archive', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wbmp', type: 'image', mimetype: 'image/vnd.wap.wbmp', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wml', type: 'text', mimetype: 'text/vnd.wap.wml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmlc', type: 'application', mimetype: 'application/vnd.wap.wmlc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmv', type: 'video', mimetype: 'video/x-ms-wmv', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xpi', type: 'application', mimetype: 'application/x-xpinstall', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.%', type: 'application', mimetype: 'application/x-trash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.abw', type: 'application', mimetype: 'application/x-abiword', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.aif', type: 'audio', mimetype: 'audio/x-aiff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.aifc', type: 'audio', mimetype: 'audio/x-aiff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.aiff', type: 'audio', mimetype: 'audio/x-aiff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.alc', type: 'chemical', mimetype: 'chemical/x-alchemy', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.art', type: 'image', mimetype: 'image/x-jg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.asc', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.asn', type: 'chemical', mimetype: 'chemical/x-ncbi-asn1-spec', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.aso', type: 'chemical', mimetype: 'chemical/x-ncbi-asn1-binary', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.atom', type: 'application', mimetype: 'application/atom', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.atom', type: 'application', mimetype: 'application/atom+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.atomcat', type: 'application', mimetype: 'application/atomcat+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.atomsrv', type: 'application', mimetype: 'application/atomserv+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.au', type: 'audio', mimetype: 'audio/basic', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.b', type: 'chemical', mimetype: 'chemical/x-molconn-Z', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bat', type: 'application', mimetype: 'application/x-msdos-program', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bcpio', type: 'application', mimetype: 'application/x-bcpio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bib', type: 'text', mimetype: 'text/x-bibtex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.boo', type: 'text', mimetype: 'text/x-boo', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.book', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.bsd', type: 'chemical', mimetype: 'chemical/x-crossfire', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.c', type: 'text', mimetype: 'text/x-csrc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.c++', type: 'text', mimetype: 'text/x-c++src', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.c3d', type: 'chemical', mimetype: 'chemical/x-chem3d', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cab', type: 'application', mimetype: 'application/x-cab', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cac', type: 'chemical', mimetype: 'chemical/x-cache', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cache', type: 'chemical', mimetype: 'chemical/x-cache', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cap', type: 'application', mimetype: 'application/cap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cascii', type: 'chemical', mimetype: 'chemical/x-cactvs-binary', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cat', type: 'application', mimetype: 'application/vnd.ms-pki.seccat', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cbin', type: 'chemical', mimetype: 'chemical/x-cactvs-binary', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cbr', type: 'application', mimetype: 'application/x-cbr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cbz', type: 'application', mimetype: 'application/x-cbz', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cc', type: 'text', mimetype: 'text/x-c++src', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cdf', type: 'application', mimetype: 'application/x-cdf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cdr', type: 'image', mimetype: 'image/x-coreldraw', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cdt', type: 'image', mimetype: 'image/x-coreldrawtemplate', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cdx', type: 'chemical', mimetype: 'chemical/x-cdx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cdy', type: 'application', mimetype: 'application/vnd.cinderella', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cef', type: 'chemical', mimetype: 'chemical/x-cxf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cer', type: 'chemical', mimetype: 'chemical/x-cerius', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.chm', type: 'chemical', mimetype: 'chemical/x-chemdraw', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.chrt', type: 'application', mimetype: 'application/x-kchart', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cif', type: 'chemical', mimetype: 'chemical/x-cif', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.class', type: 'application', mimetype: 'application/java-vm', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cls', type: 'text', mimetype: 'text/x-tex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cmdf', type: 'chemical', mimetype: 'chemical/x-cmdf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cml', type: 'chemical', mimetype: 'chemical/x-cml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cod', type: 'application', mimetype: 'application/vnd.rim.cod', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.com', type: 'application', mimetype: 'application/x-msdos-program', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cpa', type: 'chemical', mimetype: 'chemical/x-compass', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cpio', type: 'application', mimetype: 'application/x-cpio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cpp', type: 'text', mimetype: 'text/x-c++src', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cpt', type: 'image', mimetype: 'image/x-corelphotopaint', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.crl', type: 'application', mimetype: 'application/x-pkcs7-crl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.csf', type: 'chemical', mimetype: 'chemical/x-cache-csf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.csh', type: 'text', mimetype: 'text/x-csh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.csm', type: 'chemical', mimetype: 'chemical/x-csml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.csml', type: 'chemical', mimetype: 'chemical/x-csml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.csv', type: 'text', mimetype: 'text/csv', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ctab', type: 'chemical', mimetype: 'chemical/x-cactvs-binary', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ctx', type: 'chemical', mimetype: 'chemical/x-ctx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cu', type: 'application', mimetype: 'application/cu-seeme', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cub', type: 'chemical', mimetype: 'chemical/x-gaussian-cube', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cxf', type: 'chemical', mimetype: 'chemical/x-cxf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.cxx', type: 'text', mimetype: 'text/x-c++src', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.d', type: 'text', mimetype: 'text/x-dsrc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dat', type: 'chemical', mimetype: 'chemical/x-mopac-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dcr', type: 'application', mimetype: 'application/x-director', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.deb', type: 'application', mimetype: 'application/x-debian-package', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.deb', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dif', type: 'video', mimetype: 'video/dv', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.diff', type: 'text', mimetype: 'text/x-diff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dir', type: 'application', mimetype: 'application/x-director', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.djv', type: 'image', mimetype: 'image/x.djvu', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.djvu', type: 'image', mimetype: 'image/x.djvu', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dl', type: 'video', mimetype: 'video/dl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dms', type: 'application', mimetype: 'application/x-dms', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dot', type: 'application', mimetype: 'application/msword', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dv', type: 'video', mimetype: 'video/dv', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dvi', type: 'application', mimetype: 'application/x-dvi', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dx', type: 'chemical', mimetype: 'chemical/x-jcamp-dx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.dxr', type: 'application', mimetype: 'application/x-director', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.emb', type: 'chemical', mimetype: 'chemical/x-embl-dl-nucleotide', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.embl', type: 'chemical', mimetype: 'chemical/x-embl-dl-nucleotide', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.eml', type: 'message', mimetype: 'message/rfc822', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ent', type: 'chemical', mimetype: 'chemical/x-pdb', playable: undefined, downloadable: undefined },
  { format: 'Epub', ext: '.epub', type: 'application', mimetype: 'application/epub+zip', playable: undefined, downloadable: 'EPUB' },
  { format: undefined, ext: '.etx', type: 'text', mimetype: 'text/x-setext', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ez', type: 'application', mimetype: 'application/andrew-inset', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fb', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fbdoc', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fch', type: 'chemical', mimetype: 'chemical/x-gaussian-checkpoint', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fchk', type: 'chemical', mimetype: 'chemical/x-gaussian-checkpoint', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fig', type: 'application', mimetype: 'application/x-xfig', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fli', type: 'video', mimetype: 'video/fli', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.fm', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.frame', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.frm', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gal', type: 'chemical', mimetype: 'chemical/x-gaussian-log', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gam', type: 'chemical', mimetype: 'chemical/x-gamess-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gamin', type: 'chemical', mimetype: 'chemical/x-gamess-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gau', type: 'chemical', mimetype: 'chemical/x-gaussian-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gcd', type: 'text', mimetype: 'text/x-pcs-gcd', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gcf', type: 'application', mimetype: 'application/x-graphing-calculator', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gcg', type: 'chemical', mimetype: 'chemical/x-gcg8-sequence', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gen', type: 'chemical', mimetype: 'chemical/x-genbank', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gf', type: 'application', mimetype: 'application/x-tex-gf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gjc', type: 'chemical', mimetype: 'chemical/x-gaussian-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gjf', type: 'chemical', mimetype: 'chemical/x-gaussian-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gl', type: 'video', mimetype: 'video/gl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gnumeric', type: 'application', mimetype: 'application/x-gnumeric', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gpt', type: 'chemical', mimetype: 'chemical/x-mopac-graph', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gsf', type: 'application', mimetype: 'application/x-font', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gsm', type: 'audio', mimetype: 'audio/x-gsm', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gtar', type: 'application', mimetype: 'application/x-gtar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.gz', type: 'application', mimetype: 'application/x-gzip', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.h', type: 'text', mimetype: 'text/x-chdr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.h++', type: 'text', mimetype: 'text/x-c++hdr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hdf', type: 'application', mimetype: 'application/x-hdf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hh', type: 'text', mimetype: 'text/x-c++hdr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hin', type: 'chemical', mimetype: 'chemical/x-hin', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hpp', type: 'text', mimetype: 'text/x-c++hdr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hs', type: 'text', mimetype: 'text/x-haskell', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hta', type: 'application', mimetype: 'application/hta', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.hxx', type: 'text', mimetype: 'text/x-c++hdr', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ica', type: 'application', mimetype: 'application/x-ica', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ice', type: 'x-conference', mimetype: 'x-conference/x-cooltalk', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ics', type: 'text', mimetype: 'text/calendar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.icz', type: 'text', mimetype: 'text/calendar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ief', type: 'image', mimetype: 'image/ief', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.iges', type: 'model', mimetype: 'model/iges', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.igs', type: 'model', mimetype: 'model/iges', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.iii', type: 'application', mimetype: 'application/x-iphone', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.inp', type: 'chemical', mimetype: 'chemical/x-gamess-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ins', type: 'application', mimetype: 'application/x-internet-signup', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.iso', type: 'application', mimetype: 'application/x-iso9660-image', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.isp', type: 'application', mimetype: 'application/x-internet-signup', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ist', type: 'chemical', mimetype: 'chemical/x-isostar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.istr', type: 'chemical', mimetype: 'chemical/x-isostar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.java', type: 'text', mimetype: 'text/x-java', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jdx', type: 'chemical', mimetype: 'chemical/x-jcamp-dx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jmz', type: 'application', mimetype: 'application/x-jmol', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jp2', type: 'image', mimetype: 'image/jp2', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.jpe', type: 'image', mimetype: 'image/jpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.key', type: 'application', mimetype: 'application/pgp-keys', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kil', type: 'application', mimetype: 'application/x-killustrator', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kin', type: 'chemical', mimetype: 'chemical/x-kinemage', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kml', type: 'application', mimetype: 'application/vnd.google-earth.kml+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kmz', type: 'application', mimetype: 'application/vnd.google-earth.kmz', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kpr', type: 'application', mimetype: 'application/x-kpresenter', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kpt', type: 'application', mimetype: 'application/x-kpresenter', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ksp', type: 'application', mimetype: 'application/x-kspread', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kwd', type: 'application', mimetype: 'application/x-kword', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.kwt', type: 'application', mimetype: 'application/x-kword', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.latex', type: 'application', mimetype: 'application/x-latex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.less', type: 'text', mimetype: 'text/css', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lha', type: 'application', mimetype: 'application/x-lha', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lhs', type: 'text', mimetype: 'text/x-literate-haskell', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lsf', type: 'video', mimetype: 'video/x-la-asf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lsx', type: 'video', mimetype: 'video/x-la-asf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ltx', type: 'text', mimetype: 'text/x-tex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lyx', type: 'application', mimetype: 'application/x-lyx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lzh', type: 'application', mimetype: 'application/x-lzh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.lzx', type: 'application', mimetype: 'application/x-lzx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.m4b', type: 'audio', mimetype: 'audio/mp4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.m4p', type: 'audio', mimetype: 'audio/mp4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.m4v', type: 'video', mimetype: 'video/x-m4v', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.maker', type: 'application', mimetype: 'application/x-maker', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.man', type: 'application', mimetype: 'application/x-troff-man', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.manifest', type: 'text', mimetype: 'text/cache-manifest', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.markdown', type: 'text', mimetype: 'text/x-markdown', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mcif', type: 'chemical', mimetype: 'chemical/x-mmcif', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mcm', type: 'chemical', mimetype: 'chemical/x-macmolecule', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.md', type: 'text', mimetype: 'text/x-markdown', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mdb', type: 'application', mimetype: 'application/msaccess', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.me', type: 'application', mimetype: 'application/x-troff-me', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mesh', type: 'model', mimetype: 'model/mesh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mif', type: 'application', mimetype: 'application/x-mif', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mm', type: 'application', mimetype: 'application/x-freemind', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mmd', type: 'chemical', mimetype: 'chemical/x-macromodel-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mmf', type: 'application', mimetype: 'application/vnd.smaf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mmod', type: 'chemical', mimetype: 'chemical/x-macromodel-input', playable: undefined, downloadable: undefined },
  { format: 'Kindle', ext: '.mobi', type: 'application', mimetype: 'application/x-mobipocket-ebook', playable: undefined, downloadable: 'KINDLE' },
  { format: undefined, ext: '.moc', type: 'text', mimetype: 'text/x-moc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mol', type: 'chemical', mimetype: 'chemical/x-mdl-molfile', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mol2', type: 'chemical', mimetype: 'chemical/x-mol2', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.moo', type: 'chemical', mimetype: 'chemical/x-mopac-out', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mop', type: 'chemical', mimetype: 'chemical/x-mopac-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mopcrt', type: 'chemical', mimetype: 'chemical/x-mopac-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.movie', type: 'video', mimetype: 'video/x-sgi-movie', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mp2', type: 'audio', mimetype: 'audio/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mp4', type: 'video', mimetype: 'video/mp4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mp4v', type: 'video', mimetype: 'video/mp4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpc', type: 'chemical', mimetype: 'chemical/x-mopac-input', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpe', type: 'video', mimetype: 'video/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpeg4', type: 'video', mimetype: 'video/mp4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpega', type: 'audio', mimetype: 'audio/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mpga', type: 'audio', mimetype: 'audio/mpeg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ms', type: 'application', mimetype: 'application/x-troff-ms', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.msh', type: 'model', mimetype: 'model/mesh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.msi', type: 'application', mimetype: 'application/x-msi', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mvb', type: 'chemical', mimetype: 'chemical/x-mopac-vib', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.mxu', type: 'video', mimetype: 'video/vnd.mpegurl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.nb', type: 'application', mimetype: 'application/mathematica', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.nc', type: 'application', mimetype: 'application/x-netcdf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.nwc', type: 'application', mimetype: 'application/x-nwc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.o', type: 'application', mimetype: 'application/x-object', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.oda', type: 'application', mimetype: 'application/oda', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odb', type: 'application', mimetype: 'application/vnd.oasis.opendocument.database', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odc', type: 'application', mimetype: 'application/vnd.oasis.opendocument.chart', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odf', type: 'application', mimetype: 'application/vnd.oasis.opendocument.formula', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odg', type: 'application', mimetype: 'application/vnd.oasis.opendocument.graphics', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odi', type: 'application', mimetype: 'application/vnd.oasis.opendocument.image', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odm', type: 'application', mimetype: 'application/vnd.oasis.opendocument.text-master', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.odp', type: 'application', mimetype: 'application/vnd.oasis.opendocument.presentation', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.oga', type: 'audio', mimetype: 'audio/ogg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ogg', type: 'application', mimetype: 'application/ogg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ogm', type: 'application', mimetype: 'application/ogg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ogx', type: 'application', mimetype: 'application/ogg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.old', type: 'application', mimetype: 'application/x-trash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.otg', type: 'application', mimetype: 'application/vnd.oasis.opendocument.graphics-template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.oth', type: 'application', mimetype: 'application/vnd.oasis.opendocument.text-web', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.otp', type: 'application', mimetype: 'application/vnd.oasis.opendocument.presentation-template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ots', type: 'application', mimetype: 'application/vnd.oasis.opendocument.spreadsheet-template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ott', type: 'application', mimetype: 'application/vnd.oasis.opendocument.text-template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.oza', type: 'application', mimetype: 'application/x-oz-application', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.p', type: 'text', mimetype: 'text/x-pascal', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.p7r', type: 'application', mimetype: 'application/x-pkcs7-certreqresp', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pac', type: 'application', mimetype: 'application/x-ns-proxy-autoconfig', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pas', type: 'text', mimetype: 'text/x-pascal', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pat', type: 'image', mimetype: 'image/x-coreldrawpattern', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.patch', type: 'text', mimetype: 'text/x-diff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pbm', type: 'image', mimetype: 'image/x-portable-bitmap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pcap', type: 'application', mimetype: 'application/cap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pcf', type: 'application', mimetype: 'application/x-font', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pcf.Z', type: 'application', mimetype: 'application/x-font', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pcx', type: 'image', mimetype: 'image/pcx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pdb', type: 'application', mimetype: 'application/x-pilot', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pdb', type: 'chemical', mimetype: 'chemical/x-pdb', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pfa', type: 'application', mimetype: 'application/x-font', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pfb', type: 'application', mimetype: 'application/x-font', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pgm', type: 'image', mimetype: 'image/x-portable-graymap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pgn', type: 'application', mimetype: 'application/x-chess-pgn', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pgp', type: 'application', mimetype: 'application/pgp-signature', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.php', type: 'application', mimetype: 'application/x-httpd-php', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.php3', type: 'application', mimetype: 'application/x-httpd-php3', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.php3p', type: 'application', mimetype: 'application/x-httpd-php3-preprocessed', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.php4', type: 'application', mimetype: 'application/x-httpd-php4', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.phps', type: 'application', mimetype: 'application/x-httpd-php-source', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pht', type: 'application', mimetype: 'application/x-httpd-php', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.phtml', type: 'application', mimetype: 'application/x-httpd-php', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pk', type: 'application', mimetype: 'application/x-tex-pk', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pls', type: 'audio', mimetype: 'audio/x-scpls', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pm', type: 'application', mimetype: 'application/x-perl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pm', type: 'text', mimetype: 'text/x-perl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pnm', type: 'image', mimetype: 'image/x-portable-anymap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pot', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ppm', type: 'image', mimetype: 'image/x-portable-pixmap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pps', type: 'application', mimetype: 'application/vnd.ms-powerpoint', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.prf', type: 'application', mimetype: 'application/pics-rules', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.prt', type: 'chemical', mimetype: 'chemical/x-ncbi-asn1-ascii', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.psd', type: 'image', mimetype: 'image/x-photoshop', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.py', type: 'text', mimetype: 'text/x-python', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pyc', type: 'application', mimetype: 'application/x-python-code', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.pyo', type: 'application', mimetype: 'application/x-python-code', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.qt', type: 'video', mimetype: 'video/quicktime', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.qtl', type: 'application', mimetype: 'application/x-quicktimeplayer', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ram', type: 'audio', mimetype: 'audio/x-pn-realaudio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rar', type: 'application', mimetype: 'application/x-rar-compressed', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rar', type: 'application', mimetype: 'application/rar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ras', type: 'image', mimetype: 'image/x-cmu-raster', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rd', type: 'chemical', mimetype: 'chemical/x-mdl-rdfile', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rdf', type: 'application', mimetype: 'application/rdf+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rgb', type: 'image', mimetype: 'image/x-rgb', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rhtml', type: 'application', mimetype: 'application/x-httpd-eruby', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rm', type: 'audio', mimetype: 'audio/x-pn-realaudio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rm2', type: 'audio', mimetype: 'audio/x-pn-realaudio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rmvb', type: 'audio', mimetype: 'audio/x-pn-realaudio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.roff', type: 'application', mimetype: 'application/x-troff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ros', type: 'chemical', mimetype: 'chemical/x-rosdal', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rtx', type: 'text', mimetype: 'text/richtext', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.rxn', type: 'chemical', mimetype: 'chemical/x-mdl-rxnfile', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sct', type: 'text', mimetype: 'text/scriptlet', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sd', type: 'chemical', mimetype: 'chemical/x-mdl-sdfile', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sd2', type: 'audio', mimetype: 'audio/x-sd2', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sda', type: 'application', mimetype: 'application/vnd.stardivision.draw', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sdc', type: 'application', mimetype: 'application/vnd.stardivision.calc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sdd', type: 'application', mimetype: 'application/vnd.stardivision.impress', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sdf', type: 'chemical', mimetype: 'chemical/x-mdl-sdfile', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sds', type: 'application', mimetype: 'application/vnd.stardivision.chart', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sdw', type: 'application', mimetype: 'application/vnd.stardivision.writer', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ser', type: 'application', mimetype: 'application/java-serialized-object', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sgf', type: 'application', mimetype: 'application/x-go-sgf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sgl', type: 'application', mimetype: 'application/vnd.stardivision.writer-global', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sgm', type: 'text', mimetype: 'text/sgml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sgml', type: 'text', mimetype: 'text/sgml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sh', type: 'text', mimetype: 'text/x-sh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.shar', type: 'application', mimetype: 'application/x-shar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.shn', type: 'audio', mimetype: 'audio/shn', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sid', type: 'audio', mimetype: 'audio/prs.sid', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sik', type: 'application', mimetype: 'application/x-trash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.silo', type: 'model', mimetype: 'model/mesh', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sis', type: 'application', mimetype: 'application/vnd.symbian.install', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sisx', type: 'x-epoc', mimetype: 'x-epoc/x-sisx-app', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sitx', type: 'application', mimetype: 'application/x-stuffit', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.skd', type: 'application', mimetype: 'application/x-koan', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.skm', type: 'application', mimetype: 'application/x-koan', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.skp', type: 'application', mimetype: 'application/x-koan', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.skt', type: 'application', mimetype: 'application/x-koan', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.smi', type: 'application', mimetype: 'application/smil', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.smil', type: 'application', mimetype: 'application/smil', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.snd', type: 'audio', mimetype: 'audio/basic', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.spc', type: 'chemical', mimetype: 'chemical/x-galactic-spc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.spl', type: 'application', mimetype: 'application/x-futuresplash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.spx', type: 'audio', mimetype: 'audio/ogg', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.src', type: 'application', mimetype: 'application/x-wais-source', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.stc', type: 'application', mimetype: 'application/vnd.sun.xml.calc.template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.std', type: 'application', mimetype: 'application/vnd.sun.xml.draw.template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sti', type: 'application', mimetype: 'application/vnd.sun.xml.impress.template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.stl', type: 'application', mimetype: 'application/vnd.ms-pki.stl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.stw', type: 'application', mimetype: 'application/vnd.sun.xml.writer.template', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sty', type: 'text', mimetype: 'text/x-tex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sv4cpio', type: 'application', mimetype: 'application/x-sv4cpio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sv4crc', type: 'application', mimetype: 'application/x-sv4crc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.svg', type: 'image', mimetype: 'image/svg+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.svgz', type: 'image', mimetype: 'image/svg+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sw', type: 'chemical', mimetype: 'chemical/x-swissprot', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.swfl', type: 'application', mimetype: 'application/x-shockwave-flash', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxc', type: 'application', mimetype: 'application/vnd.sun.xml.calc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxd', type: 'application', mimetype: 'application/vnd.sun.xml.draw', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxg', type: 'application', mimetype: 'application/vnd.sun.xml.writer.global', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxi', type: 'application', mimetype: 'application/vnd.sun.xml.impress', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxm', type: 'application', mimetype: 'application/vnd.sun.xml.math', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.sxw', type: 'application', mimetype: 'application/vnd.sun.xml.writer', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.t', type: 'application', mimetype: 'application/x-troff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tar', type: 'application', mimetype: 'application/x-tar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.taz', type: 'application', mimetype: 'application/x-gtar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tbz', type: 'application', mimetype: 'application/x-bzip-compressed-tar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tcl', type: 'text', mimetype: 'text/x-tcl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tcl', type: 'application', mimetype: 'application/x-tcl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tex', type: 'text', mimetype: 'text/x-tex', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.texi', type: 'application', mimetype: 'application/x-texinfo', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.texinfo', type: 'application', mimetype: 'application/x-texinfo', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.text', type: 'text', mimetype: 'text/plain', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tgf', type: 'chemical', mimetype: 'chemical/x-mdl-tgf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tgz', type: 'application', mimetype: 'application/x-gtar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tk', type: 'application', mimetype: 'application/x-tcl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tk', type: 'text', mimetype: 'text/x-tcl', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tm', type: 'text', mimetype: 'text/texmacs', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tr', type: 'application', mimetype: 'application/x-troff', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ts', type: 'video', mimetype: 'video/MP2T', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.tsp', type: 'application', mimetype: 'application/dsptype', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.udeb', type: 'application', mimetype: 'application/x-debian-package', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.uls', type: 'text', mimetype: 'text/iuls', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.ustar', type: 'application', mimetype: 'application/x-ustar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.val', type: 'chemical', mimetype: 'chemical/x-ncbi-asn1-binary', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vcd', type: 'application', mimetype: 'application/x-cdlink', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vcf', type: 'text', mimetype: 'text/x-vcard', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vcs', type: 'text', mimetype: 'text/x-vcalendar', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vmd', type: 'chemical', mimetype: 'chemical/x-vmd', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vms', type: 'chemical', mimetype: 'chemical/x-vamas-iso14976', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vrm', type: 'x-world', mimetype: 'x-world/x-vrml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vrml', type: 'x-world', mimetype: 'x-world/x-vrml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.vsd', type: 'application', mimetype: 'application/vnd.visio', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wad', type: 'application', mimetype: 'application/x-doom', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wav', type: 'audio', mimetype: 'audio/wav', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wax', type: 'audio', mimetype: 'audio/x-ms-wax', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wbxml', type: 'application', mimetype: 'application/vnd.wap.wbxml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.weba', type: 'audio', mimetype: 'audio/weba', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.webm', type: 'video', mimetype: 'video/webm', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wk', type: 'application', mimetype: 'application/x-123', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wm', type: 'video', mimetype: 'video/x-ms-wm', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmd', type: 'application', mimetype: 'application/x-ms-wmd', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmls', type: 'text', mimetype: 'text/vnd.wap.wmlscript', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmlsc', type: 'application', mimetype: 'application/vnd.wap.wmlscriptc', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmx', type: 'video', mimetype: 'video/x-ms-wmx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wmz', type: 'application', mimetype: 'application/x-ms-wmz', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.woff', type: 'application', mimetype: 'application/octet-stream', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wp5', type: 'application', mimetype: 'application/wordperfect5.1', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wpd', type: 'application', mimetype: 'application/wordperfect', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wrl', type: 'x-world', mimetype: 'x-world/x-vrml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wsc', type: 'text', mimetype: 'text/scriptlet', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wvx', type: 'video', mimetype: 'video/x-ms-wvx', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.wz', type: 'application', mimetype: 'application/x-wingz', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xbm', type: 'image', mimetype: 'image/x-xbitmap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xcf', type: 'application', mimetype: 'application/x-xcf', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xht', type: 'application', mimetype: 'application/xhtml+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xhtml', type: 'application', mimetype: 'application/xhtml+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xhtml', type: 'application', mimetype: 'application/vnd.wap.xhtml+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xlb', type: 'application', mimetype: 'application/vnd.ms-excel', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xlt', type: 'application', mimetype: 'application/vnd.ms-excel', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xpm', type: 'image', mimetype: 'image/x-xpixmap', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xsl', type: 'text', mimetype: 'text/xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xtel', type: 'chemical', mimetype: 'chemical/x-xtel', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xul', type: 'application', mimetype: 'application/vnd.mozilla.xul+xml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xwd', type: 'image', mimetype: 'image/x-xwindowdump', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.xyz', type: 'chemical', mimetype: 'chemical/x-xyz', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.yaml', type: 'text', mimetype: 'text/yaml', playable: undefined, downloadable: undefined },
  { format: undefined, ext: '.zmt', type: 'chemical', mimetype: 'chemical/x-mopac-input', playable: undefined, downloadable: undefined },
];
/* petabox/www/common/FormatGetter.inc has these items, not sure if useful
    '3gpp'      => '3GP',
    '3gpp2'     => '3GP',
    'avi'       => 'Cinepack',//how embarrassing for us, but legacy so leaving...
    'm2v'       => 'MPEG2',
    'm4v'       => 'MPEG4',
    'mpeg'      => 'MPEG2',
    'mpeg-1'    => 'MPEG1',
    'mpeg-2'    => 'MPEG2',
    'mp4'       => 'MPEG4',
    'wmv'       => 'Windows Media',
    'x-m4v'     => 'MPEG4',
    'x-msvideo' => 'Windows Media',
    'x-ms-wmv'  => 'Windows Media',
*/
// Note copy of this in ia-components/util.js and dweb-archivecontroller/util.js
function formats(k, v, { first = true } = {}) {
  const ff = _formatarr.filter(f => f[k] === v);
  return first ? (ff.length ? ff[0] : undefined) : ff;
}

const gateway = {
  'url_default_fl': 'identifier,title,collection,mediatype,downloads,creator,num_reviews,publicdate,item_count,loans__status__status' // Note also used in dweb-mirror
};
// https://archive.org/advancedsearch.php?q=mediatype:collection AND NOT noindex:true AND NOT collection:web AND NOT identifier:(fav-* OR what_cd OR cd OR vinyl OR librarygenesis OR bibalex OR movies OR audio OR texts OR software OR image OR data OR web OR additional_collections OR animationandcartoons OR artsandmusicvideos OR audio_bookspoetry OR audio_foreign OR audio_music OR audio_news OR audio_podcast OR audio_religion OR audio_tech OR computersandtechvideos OR coverartarchive OR culturalandacademicfilms OR ephemera OR gamevideos OR inlibrary OR moviesandfilms OR newsandpublicaffairs OR ourmedia OR radioprograms OR samples_only OR spiritualityandreligion OR stream_only OR television OR test_collection OR usgovfilms OR vlogs OR youth_media)&sort[]=-downloads&rows=10&output=json&save=yes&page=
const homeSkipIdentifiers = ['what_cd', 'cd', 'vinyl', 'librarygenesis', 'bibalex', // per alexis
  'movies', 'audio', 'texts', 'software', 'image', 'data', 'web', // per alexis/tracey
  'additional_collections', 'animationandcartoons', 'artsandmusicvideos', 'audio_bookspoetry',
  'audio_foreign', 'audio_music', 'audio_news', 'audio_podcast', 'audio_religion', 'audio_tech',
  'computersandtechvideos', 'coverartarchive', 'culturalandacademicfilms', 'ephemera',
  'gamevideos', 'inlibrary', 'moviesandfilms', 'newsandpublicaffairs', 'ourmedia',
  'radioprograms', 'samples_only', 'spiritualityandreligion', 'stream_only',
  'television', 'test_collection', 'usgovfilms', 'vlogs', 'youth_media'];
const homeQuery = `mediatype:collection AND NOT noindex:true AND NOT collection:web AND NOT identifier:fav-* AND NOT identifier:( ${homeSkipIdentifiers.join(' OR ')})`;


// Add some fields that the gateways add to repeatable_fields
// itemRules.repeatable_fields.push();
// Add fields that are missing in itemRules
itemRules.repeatable_fields.push('publisher'); // e.g. https://archive.org/metadata/GratefulDead/metadata/publisher

const rules = {
  item: itemRules,
  member: {
    repeatable_fields: ['collection', 'creator', 'comments'],
    nonrepeatable_fields: ['identifier', 'title', 'mediatype', 'downloads', 'num_reviews', 'publicdate', 'item_count', 'loans__status__status', 'updatedate', 'downloaded', 'crawl'],
    required_fields: gateway.url_default_fl.split(',').filter(f => itemRules.required_fields.includes(f))
  },
};
//eslint-disable-next-line no-sequences */
function ObjectFromEntries(arr) { return arr.reduce((res, kv) => (res[kv[0]] = kv[1], res), {}); }
function ObjectFilter(obj, f) { return ObjectFromEntries(Object.entries(obj).filter(kv => f(kv[0], kv[1]))); }
function ObjectMap(obj, f) { return ObjectFromEntries(Object.entries(obj).map(kv => f(kv[0], kv[1]))); }
function ObjectForEach(obj, f) { return Object.entries(obj).forEach(kv => f(kv[0], kv[1])); }
function ObjectIndexFrom(arr, f) { return ObjectFromEntries(arr.map(o => [f(o), o])); }

function ObjectDeeperAssign(res, ...objs) {
  /*
      return res the result of copying the objs into the existing res in order
      its a recursive copy, but not a full deep copy, i.e. if the field is an object, it will be copied, but not strings
      Note that arrays are just copied over the existing value, so it can't be used to add to an array.

      This is syntactically equivalent to Object.assign, i.e. pass {} as the first parameter if you don't want the arguments modified
      res can be a plain Object or most class instances, although interaction with custom getters and setters is not guarranteed.
   */
  objs.forEach(o => {
    if (o) { // handle one or more objects being undefined - easier here than in consumers
      Object.entries(o)
        .forEach(kv => {
          const k = kv[0];
          const v = kv[1];
          if (typeof (v) === 'object' && !Array.isArray(v)) {
            // If its an object, then merge in newer one, creating place to merge it into if reqd.
            res[k] = ObjectDeeperAssign(res[k] || {}, v); // Recurse
          } else {
            res[k] = v;
          }
        });
    }
  });
  return res;
}

function objectFrom(jsonstring) {
  return ((typeof jsonstring === 'string' || jsonstring instanceof Uint8Array) ? canonicaljson.parse(jsonstring) : jsonstring);
}

function parmsFrom(queryobj) {
  // Turn a object into the parameter portion of a URL, encoding where appropriate.
  return Object.entries(queryobj)
    .filter(kv => typeof kv[1] !== 'undefined')
    .map(kv => `${kv[0]}=${encodeURIComponent(kv[1])}`)
    .join('&');
}

/**
 *
 * @param queryobj  e.g. { identifier:(a OR b) }
 * @param opts      {noCache: bool, retries, wantstream} (There are other opts, but not meaningful to a JSON query)
 * @param (err, obj)  TransportError
 *
 * Note badly named, this is widely used
 */
function _query(queryobj, opts = {}, cb) { // No opts currently
  // rejects: TransportError or CodingError if no urls
  if (typeof opts === 'function') { cb = opts; opts = {}; }
  try {
    const urlparms = parmsFrom(queryobj);
    // Note direct call to archive.org leads to CORS fail
    const urls = routed(`https://archive.org/advancedsearch.php?${urlparms}`);
    DwebTransports.fetch(urls, opts, cb);
  } catch (err) {
    debug('ERROR: Caught unhandled error in _query %o', err);
    cb(err);
  }
}
const specialidentifiers = { // SEE-OTHER-ADD-SPECIAL-PAGE in dweb-mirror dweb-archive dweb-archivecontroller
  // "identifier,title,collection,mediatype,downloads,creator,num_reviews,publicdate,item_count,loans__status__status"
  'home': {
    identifier: 'home',
    title: 'Internet Archive home',
    collection: [],
    mediatype: 'collection',
    publicdate: '',
    uploader: '',
    search_collection: homeQuery,
    thumbnaillinks: '/archive/images/settings.svg'
  },
  'local': {
    identifier: 'local',
    title: 'Locally crawled',
    collection: [],
    mediatype: 'collection',
    publicdate: '',
    uploader: '',
    thumbnaillinks: '/archive/images/baseline-home-24px.svg', // TODO find a good icon for this, but note its not currently visible anywhere.
  },
  'settings': {
    identifier: 'settings',
    title: 'Settings',
    collection: [],
    mediatype: 'collection', // It isn't really, but this should be fine
    publicdate: '',
    uploader: '',
    thumbnaillinks: '/archive/images/settings.svg',
  }
};

const torrentRejectList = [ // Baked into torrentmaker at in petabox/sw/bin/ia_make_torrent.py  # See Archive/inTorrent()
  '_archive.torrent', // Torrent file isnt in itself !
  '_files.xml',
  '_reviews.xml',
  '_all.torrent', // aborted abuie torrent-izing
  '_64kb_mp3.zip', // old packaged streamable mp3s for etree
  '_256kb_mp3.zip',
  '_vbr_mp3.zip',
  '_meta.txt', // s3 upload turds
  '_raw_jp2.zip', // scribe nodes
  '_orig_cr2.tar',
  '_orig_jp2.tar',
  '_raw_jpg.tar', // could exclude scandata.zip too maybe...
  '_meta.xml' // Always written after the torrent so cant be in it
];

const collectionSortOrder = { // This defines a collections sort order based on its id.
  '-lastupdate': [],
  '-publicdate': ['tvnews'],
  '-reviewdate': ['librivoxaudio', 'library_of_congress'],
  '-date': ['peterboroughcitydirectories', 'democracy_now', 'democracy_now_vid', 'ianewsletter',
    'eastridgechurchofchrist', 'lighthousebaptistchurch'],
  'titleSorter': ['densho']
};
const parentSortOrder = { // This defines a collections sort order if the collection appears in another specific collection
  '-publicdate': ['tvnews', 'tvarchive'],
  '-date': ['podcasts', 'audio_podcast', 'community_media'],
  'titleSorter': ['densho'],
};
// See petabox/TV.inc/is_tv_collection() for TVNewsKitchen exception
const excludeParentSortOrder = ['TVNewsKitchen'];

/* eslint-disable object-property-newline */
const ACUtil = { enforceStringOrArray, fetchJson, formats, _formatarr, gateway,
  homeQuery, objectFrom, ObjectDeeperAssign, ObjectFilter, ObjectForEach, ObjectFromEntries, ObjectIndexFrom, ObjectMap,
  parmsFrom, rules, _query, specialidentifiers, torrentRejectList, collectionSortOrder, parentSortOrder, excludeParentSortOrder };
exports = module.exports = ACUtil;
