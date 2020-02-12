/* global DwebTransports */
const debug = require('debug')('dweb-archivecontroller:routing');

/*
 * Mapping from archive.org URLs to dweb
 *
 * Note this table looks messy because cors handling at the archive is messy,
 * and also because dweb.me aka dweb.archive.org python gateway is being transitioned out.
 * Should handle archive.org/download/IDENTIFIER/IDENTIFIER_archive.torrent -> www-dweb-torrent.dev.archive.org
 * Not supporting metadata/IDENTIFIER/IDENTIFIER see https://github.com/internetarchive/dweb-archivecontroller/issues/12
 */
const archiveOrg = {
  '.': ['https://www-dweb-cors.dev.archive.org/'], // Handles at least '/about and /bookreader /embed' catch al to go thru cors to archive.org

  // see https://github.com/internetarchive/dweb-mirror/issues/288 re cors issues fails on e.g. http://localhost:4244/details?query=bananas&mirror=&transport=HTTP
  'advancedsearch': ['https://www-dweb-cors.dev.archive.org/advancedsearch.php'], // Works
  'advancedsearch.php': ['https://www-dweb-cors.dev.archive.org/advancedsearch.php'], // Works
  // 'advancedsearch': ['https://dweb.archive.org/advancedsearch'], // Works but dependent on dweb.me
  // 'advancedsearch': ['https://cors.archive.org/advancedsearch.php'], // Fails

  // 'contenthash': ['https://dweb.archive.org/contenthash/'], // TODO Legacy, if need to support should move to static microservice

  // This group are essentially the same thing
  // Note does not support https://archive.org/download/foo which really wants details page, but that shouldnt come here
  'download': ['https://archive.org/cors/'], // Does not support HEAD but efficient since hits web nodes
  // 'download': ['https://www-dweb-cors.dev.archive.org/download'], // Works but direct /cors/ is quicker
  'serve': ['https://archive.org/cors/'], // see example in the metadata.description field in details/commute

  // 'examples': ['https://dweb.archive.org/archive/examples/'], // Legacy, no longer used - only used for demos

  // CORS issues requested in slack with Tracey 2019-nov-27
  'images': ['https://www-dweb-cors.dev.archive.org/images/'],
  // 'images': ['https://cors.archive.org/images/'], // Fails

  // This group go through www-dweb-cors which redirects to data nodes
  'BookReader': {
    'BookReaderJSIA.php': ['https://www-dweb-cors.dev.archive.org/BookReader/BookReaderJSIA.php'],
    'BookReaderImages.php': ['https://www-dweb-cors.dev.archive.org/BookReader/BookReaderImages.php']
  },

  'archive': ['https://www-dweb-cors.deb.archive.org/'], // Legacy

  'services': {
    'img': ['https://archive.org/services/img/'] // Main URL does cors
  },
  'thumbnail': ['https://archive.org/services/img/'], // Deprecated way to get thumbnails when it looked like there might be a different way

  'metadata': [
    'wolk://dweb.archive.org/metadata/', // TODO-TORRENT move wolk hijacker to use dweb-metadata but will work redirected
    'gun:/gun/arc/archive.org/metadata/', // TODO-TORRENT move gunDB hijacker to use dweb-metadata but will work redirected
    'https://www-dweb-metadata.dev.archive.org/metadata/'], // Appends magnet link

  'mds': ['https://be-api.us.archive.org/mds/'], // Currently only '/mds/v1/get_related/all/IDENTIFIER'

  // Redirects to archive.html from standard archive.org urls
  'details': ['https://www-dweb.dev.archive.org/archive.html?item='],
  'search.php': ['https://www-dweb.dev.archive.org/archive.html?query='],
  'search': ['https://www-dweb.dev.archive.org/archive.html?query=']
};
// List of URLS mirrored by dweb-mirror
// Any resolution above that starts with one of these will be replaced by 'mirror' if its passed as a config to Transports
const archiveOrgMirroredUrls = [
  'https://archive.org',
  'https://dweb.archive.org',
  'https://www-dweb-metadata.dev.archive.org',
  'https://www-dweb.dev.archive.org',
  'https://be-api.us.archive.org'
];


// Mapping from domains to the tables that support them
const domains = {
  'dweb:/': {
    arc: { 'archive.org': archiveOrg },
    ipfs: ['http://ipfs.io/ipfs/', 'https://dweb.me/ipfs/'], // TODO maybe need way to say check ipfs: as well ?
  },
  'https://archive.org/': archiveOrg,
  'http://archive.org/': archiveOrg,
  'https://dweb.archive.org/': archiveOrg,
  'https://be-api.us.archive.org/': archiveOrg, // Just /mds/v1/related/all/IDENTIFIER
  '/': archiveOrg // Just passed an absolute URL, assume relative to archive
};


// Try replacing any of our recognized archive API hosts with the mirror
function _resolvedUrlToGatewayUrl(url) { // TODO-ROUTING remove this from DTS
  const prefix = archiveOrgMirroredUrls.find(p => url.startsWith(p));
  return prefix
    ? DwebTransports.mirror + url.slice(prefix.length)
    : url;
}

/**
 * Recursive worker
 * @param parent string
 * @param table object { key: [urlFrag] or key: urlFrag}
 * @param pathArr array
 * @returns [URL]
 * @private
 */
function _recursive(parent, table, pathArr) {
  const name = pathArr.shift();
  let found = table[name];
  if (!found) {
    pathArr.unshift(name); // Didn't use it - pass to return or '.'
  }
  if (!found && table['.']) {
    found = table['.']; // Maybe undefined
  }
  if (!found) {
    debug('WARNING unable to resolve %s in %s', name, parent);
  }
  return ((typeof found === 'object') && !Array.isArray(found))
    ? _recursive(parent + name + '/', found, pathArr)
    : [found, pathArr];
}

function _toUrl(partialUrl, remainder, query) {
  const p = partialUrl + remainder.join('/');
  return query
    ? [p, query].join(p.includes('?') ? '&' : '?')
    : p;
}

/**
 * Resolve path in a domain object
 * @param parent
 * @param domain
 * @param pathAndQuery
 * @returns [url]
 */
function resolveNameInDomain(parent, domain, pathAndQuery) {
  const [path, query] = pathAndQuery.split('?');
  const [foundStrOrArr, remainder] = _recursive(parent, domain, path.split('/')); // recursive
  return Array.isArray(foundStrOrArr)
    ? foundStrOrArr.map(partialUrl => _toUrl(partialUrl, remainder, query))
      .filter(url => !!url)
    : [_toUrl(foundStrOrArr, remainder, query)];
}

/**
 * Resolve a URL into a URL or Array of URLs to pass to DwebTransports.Transports methods
 * @param url
 * @returns [url] or url
 */
function resolveName(url) {
  // Find a domain object to resolve in
  const dom = Object.keys(domains).find(d => url.startsWith(d));
  return dom
    ? resolveNameInDomain(dom, domains[dom], url.slice(dom.length))
    : url;
}

function _mirrorUrls(urlsArr) {
  // Dont do name mapping if using dweb-mirror as our gateway, as always want to send URLs there.
  // So preference urls to the mirror, if no mirrored urls then use anything else
  const maybeUrls = urlsArr.map(url => _resolvedUrlToGatewayUrl(url));
  const mirrorUrl = maybeUrls.find(url => url.startsWith(DwebTransports.mirror));
  return mirrorUrl ? [mirrorUrl] : maybeUrls;
}

/**
 * routing wraps urls before calling DwebTransports, it performs archive specific mapping to specific services,
 * and to Dweb transport layers (Gun, Wolk, IPFS etc).
 *
 * It assumes that DwebTransports exists so that it can access configuration info where appropriate.
 *
 * In general it will return URLs for transports even if those transports aren't loaded,
 * it gets filtered down during the DwebTransports.validFor() call
 *
 * @param urls          url or [url] typically of form "https://archive.org/..."
 * @param opts          wantOneHttp true if want just one HTTP url (for example to pass to a backgroundImage
 * @returns {string[]}  An array or urls for passing to DwebTransports
 */
function routed(urls, { wantOneHttp = false } = {}) { // TODO-ROUTING remove p_resolvenames and resolvenames from DTS
  if (!urls) return []; // e.g. passed undefined
  const urlsArr = Array.isArray(urls) ? urls : [urls]; // Make sure its an array
  const routedUrls = ((typeof DwebTransports !== "undefined") && DwebTransports.mirror)
    ? _mirrorUrls(urlsArr)
    : [].concat(...urlsArr.map(u => resolveName(u)));
  return wantOneHttp ? routedUrls.find(u => u.startsWith("http")) : routedUrls;
}

//TESTING start uncomment to test
/*
const testdata = {
  'dweb:/arc/archive.org/metadata/foo': [
    'https://www-dweb-metadata.dev.archive.org/metadata/foo',
    'gun:/gun/arc/archive.org/metadata/foo',
    'wolk://dweb.archive.org/metadata/foo'],
  'dweb:/arc/archive.org/details/foo': [
    'https://dweb.archive.org/archive/archive.html?item=foo'],
  'https://archive.org/metadata/bar': [
    'wolk://dweb.archive.org/metadata/bar',
    'gun:/gun/arc/archive.org/metadata/bar',
    'https://www-dweb-metadata.dev.archive.org/metadata/bar'
  ],
  'https://archive.org/something/else': [
    'https://archive.org/something/else'
  ],
  'https://archive.org/advancedsearch?query=splat': [
    'https://dweb.archive.org/advancedsearch?query=splat'
  ]
}

function test() {
  global.DwebTransports = {}; // Defeat requirement for it to be defined.
  Object.entries(testdata).forEach(kv => {
    const res = routed(kv[0]);
    if ((!res
      || res.length !== kv[1].length)
      || res.some(r => !kv[1].includes(r))) {
    debug('%s => %s expect %s', kv[0], res, kv[1]);
  }});
}
test();
*/

exports = module.exports = { routed };
