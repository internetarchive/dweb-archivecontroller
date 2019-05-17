# dweb-archivecontroller
Classes to controll Archive objects
Builds on dweb-transports and dweb-objects.

## Background
This library is part of a general project at the Internet Archive (archive.org)
to support the decentralized web.

## Goals
* to allow unmodified browsers to access the Internet Archive's millions of items
* to support as many of the IA's features as possible, adding them iteratively
* to use decentralized platforms for as many features as possible, without sacrificing functionality
* to avoid single points of failure where possible

## Installation
### All cases
```
git clone https://git@github.com/internetarchive/dweb-archivecontroller.git
cd dweb-archivecontroller

# install the dependencies including IPFS & WebTorrent
npm install

# NOTE:
# dweb-transports - will be provided to client using window.DwebTransports in a separate import
# dweb-objects - will be provided to client using window.DwebObjects in a separate import

```

### Node Installation to work on this repo
Note that the only reason to do this would be to work on the code,
Just do the "All" case above

## See related:

* [Archive.org](https://dweb.archive.org/details) bootstrap into the Archive's page
* [Examples](https://dweb.me/examples) examples

### Repos:
* *dweb-transports:* Common API to underlying transports (http, webtorrent, ipfs, yjs)
* *dweb-objects:* Object model for Dweb inc Lists, Authentication, Key/Value, Naming and example html for these
* *dweb-serviceworker:* Run Transports in ServiceWorker (experimental)
* *dweb-archive:* Decentralized Archive webpage and bootstrapping
* *dweb-archivecontroller:* Archive objects
* *dweb-transport:* Original Repo, still has some half-complete projects

## Class hierarchy
* ArchiveFile - represents a single file
* ArchiveItem - represents data structures for an item (a directory of files)
* ArchiveMember - represents each item returned by a search
* Util - a collection of tools, short functions, and dictionaries of use in multiple places

## API of key subclassed function

## See also
See [Dweb document index](https://github.com/internetarchive/dweb-transports/blob/master/DOCUMENTINDEX.md) for a list of the repos that make up the Internet Archive's Dweb project, and an index of other documents. 

Ask Arthur for the Google spreadsheet "Metadata Audit" which is currently IA internal. 

## Release notes

* v0.1.56 Support downloaded field and fix bugs in crawl indicator
* v0.1.55 support for adding crawl objects; bugs in upstream checking & appending queries to small collections
* v0.1.54 added ArchiveItem.more
* v0.1.53 bug fixes: relateditems; package.json refer to specific versions 
* v0.1.52 add playlist
