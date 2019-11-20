#API for dweb-mirror v0.1.0
TODO-DOCS - need API.md for dweb-archivecontroller this is only partial

This document covers the API for v0.1.0 of dweb-mirror which will be the first semi-stable one. 

#### Outline of APIs

* Config file: Control the behavior of each of the apps in this package
* Apps can be built on top of dweb-archivecontroller's classes:
  ArchiveItem, ArchiveMember, ArchiveFile which are extended by this package.
* A set of classes that provide higher level support esp:
  * TODO-DOC fill in here

#### Expected API changes
No breaking changes expected at present, though additions are likely. 

# Classes

The classes are controllers, each represents the core Archive objects
* ArchiveFile - an individual file
* ArchiveItem - an item, the primary unit of IA organiation, includes usually a directory of files. 
* ArchiveMember - a Search Engine Document, relates to an ArchiveItem, but is a super/subset of the data

The ArchiveMember can be created from any set list of members - including in a Search, a Favorites list, and returned by the related items call

## ArchiveFile

A controller that represents a file. 

Common arguments... 
```
 archiveitem:   Instance of ArchiveItem with or without its metadata loaded
 itemid:        Identifier of item 
                (note gradually code is changing to use "identifier" especially as it touches the IAUX library)
 metadata:      As returned by metadata call for file, or in .file of a item metadata API call
 filename:      Name of an existing file, (may be multipart e.g. foo/bar)
```

##### new ArchiveFile({itemid, metadata})

Instantiate new object, optionally defining its metadata. Object typically has structure
```
{
    itemid: Archive Identifier of parent item 
    metadata: { as returned by metadata API for each file }
}
```

##### ArchiveFile.new(({itemid, archiveitem, metadata, filename, cb(err,data)))

Asynchronously create a new ArchiveFile instance and load its metadata from server.
Will fetch metadata on archiveitem if not present.

```
 itemid is alternative to archiveitem 
 filename:      Name of an existing file, (may be multipart e.g. foo/bar)
 cb(err, archivefile): passed Archive File
 resolves to:   archivefile if no cb
 errors:        FileNotFound or errors from ArchiveFile() or fetch_metadata()
 wantPlayList   true if should include playlist in metadata
```

##### name() 
Returns name of file from `metadata.name`

##### urls(cb)

Expand metadata to urls could pass to DwebTransports, 
```
cb(err, urls)
```
##### httpUrl()
Return URL to file on a http server, typically dweb.archive.org or local gateway

##### mimetype()
 
Return mimetype found by mapping metadata.format via the `formats` table

##### data(cb)

Fetch and return data (normally should use streaming rather than this)

##### async blobUrl(cb) 

Fetch data but return as a blob URL suitable for a browser

##### sizePretty()
Return a 'pretty' size for a file

##### istype(type)

Return true if file is of a certain high level type, these are loosely equivalent to higher level mimetypes
but allow for things like application/pdf to be `text`. See `Util.js/_formatarr`

##### playable(type)
True if file is a playable file of type specified

##### downloadable(type)
True if file is a downloadable file of type specified

## ArchiveItem
A controller that represents an Archive item. 

Common Parameters:
```
 bookapi:       Result of bookreader api call, or export
 itemid:        Identifier of item 
                (note gradually code is changing to use "identifier" especially as it touches the IAUX library)
 query          Query string such as "collection: foo"
 metaapi        Result of a metadata API call (includes files, reviews etc)
 sort           Array of strings for sorting query
 wantStream     true if prefer a result as a stream
 wantMembers    true if want results converted to ArchiveMember
 wantFullResp   true if want data wrapped in {response: { numFound, start, docs}} 
```

##### new ArchiveItem({identifier, query, sort, metaapi})

Instantiate new ArchiveItem and load from metaapi call

##### exportFiles() 
Return metadata portion for files (overridden in dweb-mirror.ArchiveItemPatched)

##### exportMetadataAPI({wantPlayList})

Export JSON that looks like metadata API call results i.e. { ..., files, metadata, etc}

##### loadFromMetadataAPI(metaapi)

Convert results of metadata API (or `exportMetadataAPI()`) into fields. 
Enforces the string or Array files, and overrides obsolete mediatypes

##### loadFromBookreaderAPI(bookapi)

Apply the results of a bookreader API or exportBookreaderAPI() call to an ArchiveItem

##### async fetch()

Fetch metadata and query 

##### fetch_metadata(opts, cb(err, this))
Fetch metadata via API, and store in object, if not already done.
(overridden in dweb-mirror.ArchiveItemPatched to use cache) 

##### fetch_bookreader(opts, cb(err, this))
Fetch bookreader via API, and store in object, if not already done.
(overridden in dweb-mirror.ArchiveItemPatched to use cache) 

##### fetch_query(opts, cb(err, this))
Fetch results of search query via API, and store in object, if not already done.
Knows about different types of collections, simple_lists, etc
(overridden in dweb-mirror.ArchiveItemPatched to use cache) 

##### more(opts, cb)
Fetch next page of query

##### relatedItems({wantStream, wantMembers}, cb)
Fetch and return RelatedItems query. Default is the raw API, but can extract ArchiveMembers
(overridden in dweb-mirror.ArchiveItemPatched to use cache) 

##### thumbnaillinks
Return array of thumbnaillinks - maybe Obsolete as thumbnails usually shown from ArchiveMember

##### thumbnailFile()
Find appropriate thumbnail file, and return ArchiveFile for it.
Uses heuristic approach since Archive data is inconsistent currently. File could be `__ia_thumb.jpg` or `_itemimage.jpg`

##### videoThumbnailFile()
Applies a different heuristic to find appropriate thumbnail for a vide. 

##### playableFile(type)
Find a single playable file, typically replaced by the playlist functionality. 

##### fileFromFilename(filename)
Find file in .files, undefined if not found

##### processPlaylist(rawplaylist)
Process results of raw playlist call, adding fields to make it more usable. 
```
rawplaylist:    As returned by API - or an already cooked processed version
returns: [ {
    title,
    autoplay,
    duration    (secs),
    prettyduration  string e.g. 3:23.2
    image,      root-relative url
    imagename,  filename portion - may include subdirectory
    imageurls,  Archivefile
    orig:       filename of original file
    sources: [ { // optional files to play for the track
        file,   root-relative url (unusable)
        name,   filename portion - may include subdirectory
        type,
        url,    Archivefile
        height,
        width }  ]
    tracks: [ ] // Not really tracks, its things like subtitles
```

##### minimumForUI
Returns [ArchiveFile*], which is the minimum set of files needed for the UI, 
The result depends on the mediatype, and could involve a playlist. 
These are the files that would be downloaded for a cache for example. 

## Class ArchiveMember

Controller representing a single result of a search query or related items etc.
It should have sufficient information to paint tiles. 

Common parameters
```
unexpanded  True if do not have data, and should do a search to fetch (e.g. if comes from favorites)
```
##### new ArchiveMember({fields}, {unexpanded})
Instantiate a new object, initializing from {fields} which will be the result of a search query etc

##### static fromRel(rel)
Instantiate a ArchiveMember from one result in a Related items call.
Enforces array / string rules. 

##### static fromIdentifier(identifier)
Instantiate a ArchiveMember from an identifier, it will be marked unexpanded. 

##### static fromaFav(fav)
Instantiate an ArchiveMember from one of a favorites list - will be unexpanded as favorites dont have 
enough metadata to paint a tile. 

##### processMetadataFjords(meta, rules)
Enforces array / string rules

##### httpUrl
Returns http url to fetch member, usually via gateway Server or mirror

##### urls()
Return an array of urls ... either via defined thumbnaillinks or http url

##### async p_urls()
Asynchronous version of urls

##### collection0 
Return first collection this member is in, used for parent tile.

##### isExpanded() 
True if have fields necessary to paint tile

##### static expandMembers(members, cb)
Expand an array of members via a query on the server.

##### expand(ids, cb)
Expand a list of ides to members. 

## Class RawBookReaderResposne

Encapsulates the results of a bookreader API call. 
Its structure is exactly that returned by the call.
It is intended to match the equivalent class in IAUX.

Common arguments:
```
archiveitem ArchiveItem class including { metadata: {}, bookreader: { data, brOptions, lendingInfo}}
```

##### new RawBookReaderResponse(props)

Passed the data returned by the API call. 
```
{ data { data, brOptions, lendingInfo, metadata }}
```
##### fromArchiveItem(archiveitem)
Create a RawBookReaderResponse from a ArchiveItem (typically to then be exported)

The ArchiveItem should include `{ metadata: {}, bookreader: { data, brOptions, lendingInfo}}`

##### cooked({server, protocol)
Preprocess the somewhat odd results of the API into something the browser can use,
```
server      If present, urls will be redirected from old server to new ones
protocol    If present URLs will be redirected from https to protocol (typically 'http')
```

Typical no-mirror scenario
* browser calls fetch_bookreader which forwards to datanode
* datanode returns with server=DATANODE and urls https://DATANODE...
* Browser uses this url to request page from DATANODE

Typical mirror scenario
* browser calls fetch_bookreader which forwards to localhost with server=localhost:4244
* Mirror catches this, calls fetch_bookreader which fetches from datanode or dweb.archive.org with server=DATANODE
* datanode returns with server=DATANODE and urls https://DATANODE... which is what gets cached
* Mirror cooks (in mirrorHttp) based on browser's server= when returning to browser
* Browser uses cooked url to request page from mirror


## Class RawMetadataAPIResponse  TODO-API
Encapsulates results of Metadata API call.

This is still being built out, and will match the structure of IAUX's equivalent class
and be used to encapsulate metadata API response prior to "cooking" into an ArchiveItem.

## Util 

A library of functions used in this repo and elsewhere and exported individually. 

##### fetch_json(url, cb)
Deprecated call to return json. Should be repaced with with httptools.p_GET from DwebTransports.

Constructs CORS safe call.
```
url:   to be fetched - construct CORS safe JSON enquiry.
cb(err, obj)    optional callback otherwise returns a Promise
  err   TypeError if cant fetch
        Error if fetch doesnt return JSON.
  obj   Decoded json response via cb or promise
```


##### _formatarr
Note identical copies in dweb-archivecontroller/Util.js and ia-components/util.js

An array of information about formats, useful for converting between the multitude of
ways that formats are used at the Archive.

It is incomplete, there does not appear to be any consistent usable tables in petabox, 
but various partial mappings done in different places

Each row of the array corresponds to a unique format, any field may be duplicated.

The table is intentionally not exported, but could be if code needs to use it.

```
format:         as used in file metadata
ext:            file extension
type:           mediatype
mimetype:       As in Content-type http header
playable:       true if suitable for playing, usually this is smaller format videos and audio etc
downloadable:   Set to the upper case string used for sorting in the downloads bar on details page
```
##### formats(k, v, {first=true})
Note identical copies in dweb-archivecontroller/Util.js and ia-components/util.js

Look up k=v in _formatarr
```
first   if true, will return an object for the first match, 
        otherwise an array of all matches
```
Typical usage ... `formats("format", this.metadata.format, {first:true}.downloadable`

##### gatewayServer(server=undefined)

Return a string suitable for prepending to root relative URLs choosing between normal, Dweb, and dweb-mirror scenarios

Note copy of this in dweb-archivecontroller/Util.js and ia-components/util.js

##### enforceStringOrArray(meta, rules)
Apply a set of rules (see item_rules.js) to metadata. 
Covers required fields, strings and arrays. 
Generally returns warnings rather than errors, 
converting data to something usable but not-ideal. (e.g. selecting first option from an array that should be a string)

##### gateway = { key: url } 
Configure urls used to access the gateway

##### homeSkipIdentifiers = [ IDENTIFIER* ]
Configure identifiers not to be returned on home page even if they are popular.

##### homeQuery = string
Query to use for the home page

##### languageMapping = { MARC: "long" } //TODO-API moved to ia-components/util.js
Map three letter (marc) codes to Longer names

##### rules = { RULESET: RULES } 
```
{ RULESET: { 
    repeatable_fields: [IDENTiFIER*],   fields that may be repeated i.e. always return as array
    nonrepeatable_fields: [IDENTiFIER*], fields that may not be repeated always return as a string
    requiredfields: [IDENTiFIER*]}}     fields that are required convert to "" or []
    }
}
```
##### ObjectDeeperAssign(res, ...objs)
Like Object.assign but recursively assigns fields inside objects. 

Note it will replace an array as there is no "right" solution to merge them.

##### objectFrom(jsonstring) 
Parse json present in strings or Uint8Arrays)

##### parmsFrom(queryobj
Convert a object into the parameter portion of a URL, 
encoding where appropriate and skipping undefined).
Returns e.g. `a=foo&b=bar&c=hello%20world`

##### _query(queryobj, cb)
Perform a query via gateway to advancedsearch 
Deprecated as should be using DwebTransports but uses fetch_json

## File item_rules.js 

Contains a ruleset suitable for Util/rules but with some more.

This is obtainable from Arthur's metadata checking tool, 
though syntax for automating doing so is not currently known.
