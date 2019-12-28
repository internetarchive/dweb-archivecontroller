# dweb-archivecontroller
Classes to controll Archive objects
Builds on dweb-transports.

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

```

### Node Installation to work on this repo
Note that the only reason to do this would be to work on the code,
Just do the "All" case above

## See related:

* [Archive.org](https://dweb.archive.org) bootstrap into the Archive's page

### Repos:
* *dweb-transports:* Common API to underlying transports (http, webtorrent, ipfs, yjs)
* *dweb-objects:* Object model for Dweb inc Lists, Authentication, Key/Value and example html for these
* *dweb-serviceworker:* Run Transports in ServiceWorker (experimental)
* *dweb-archive:* Decentralized Archive webpage and bootstrapping
* *dweb-archivecontroller:* Archive objects
* *dweb-transport:* Original Repo, still has some half-complete projects
* *dweb-mirror:* Offline archive server

## Class hierarchy
* ArchiveFile - represents a single file
* ArchiveItem - represents data structures for an item (a directory of files)
* ArchiveMember - represents each item returned by a search
* Util - a collection of tools, short functions, and dictionaries of use in multiple places

## API of key subclassed function
See [API.md](./API.md)

## See also
See [Dweb document index](https://github.com/internetarchive/dweb-transports/blob/master/DOCUMENTINDEX.md) for a list of the repos that make up the Internet Archive's Dweb project, and an index of other documents. 

Ask Arthur for the Google spreadsheet "Metadata Audit" which is currently IA internal. 
