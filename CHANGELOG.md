# dweb-archivecontroller - Change Log

* v0.2.4 routing: Catch root-relative urls (as seen in eg. www-dweb.Main.js)
* v0.2.3 Error in routing
* v0.2.2 Metadata check for IPFS hash disabled; fix some routes
* v0.2.1 Build btihQueryUrl for dweb-torrent
* v0.2.0 Refactor naming here from dweb-transports; 
* v0.2.0 Add RawBookReaderJSONResponse

-------------

* v0.1.86 Major naming refactor; support sort order; query edge cases 
* v0.1.85 Minor bug fixes and code reviews and link fixes
* v0.1.84 naming refactor; torrent support; format updates
* v0.1.83 move magnetlink up one level
* v0.1.82 Add index.html; support enhanced Media player and torrent upgrades
* v0.1.81 Support "radio" subtype
* v0.1.80 Processor for metadata field report; downloads direct from archive.org (reqd for epub); 
* v0.1.79 workaround bug in embed playlist API; some cases for search in local; _query use DT.fetch; speedup in expand
* v0.1.78 fix bugs in Epub, Kindle and update some other formats
* v0.1.77 fix bug with /local introduced in .76; dont fetch metadata for files unless IPFS||WEBTORRENT
* v0.1.76 blob handling refactor for download links; account query issue; partial add epub and kindle
* v0.1.75 handle missing thumbnails; add EPUB & KINDLE
* v0.1.74 update format array
* v0.1.73 bugs empty size of files; is_dark error message; missing thumbnails; 
* v0.1.72 bug fixes bookreader heuristic, download flag 
* v0.1.71 bug fix to ObjectMap and page=0
* v0.1.70 is_dark fixed
* v0.1.69 Sort on searches; Carousel subtype on mediatype=texts; update formatarr;
* v0.1.68 Local & Home queries go upstream, support copyDirectory refactor in dweb-mirror
* v0.1.67 Fix bug where reading back bad data for .downloaded in _extra.json
* v0.1.66 LanguageMapping moved to IAUX; refactor members to membersFav and membersSearch; support noCache option to _query; download info on searches
* v0.1.65 catch some bugs with certain playlists missing images
* v0.1.64 Start adding support for identifier instead of itemid; support caching donwloaded on files; 
* v0.1.62 Align case Object_filter -> ObjectFilter etc
* v0.1.62 Better support for special identifiers: home, local, settings
* v0.1.61 Support for Reload; and crawl/download on related items
* v0.1.60 Pass downloaded along; support simple-list/collection/search_collection
* v0.1.59 bug fix in gatewayServer when not mirrored
* v0.1.58 Refactor Utils to multi-export and handle home and local specially
* v0.1.57 Remove unused dependency on dweb-transports and dweb-objects
* v0.1.56 Support downloaded field and fix bugs in crawl indicator
* v0.1.55 support for adding crawl objects; bugs in upstream checking & appending queries to small collections
* v0.1.54 added ArchiveItem.more
* v0.1.53 bug fixes: relateditems; package.json refer to specific versions 
* v0.1.52 add playlist
