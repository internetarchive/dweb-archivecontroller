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

The classes represent the core Archive objcts
* ArchiveFile - an individual file
* ArchiveItem - an item, the primary unit of IA organiation, includes usually a directory of files. 
* ArchiveMember - a Search Engine Document, relates to an ArchiveItem, but is a super/subset of the data

The ArchiveMember has three subclasses, representing the places lists of items are found.
* ArchivMemberFav - in someone's personal favorites
* ArchiveMemberRelated - in a response to the Related Items API call
* ArchiveMemberSearch - in response to an AdvancedSearch query, this is the only one with sufficient info to render a Tile.

## ArchiveFile


#####ArchiveFile.new(({itemid=undefined, archiveitem=undefined, metadata=undefined, filename=undefined}={}, f(err,data)))

Asynchronously create a new ArchiveFile instance and load its metadata.

```
 archiveitem:   Instance of ArchiveItem with or without its metadata loaded
 itemid:        Identifier of item (only used if archiveitem not defined)
 metadata:      If defined is the result of a metadata API call for loading in AF.metadata
 filename:      Name of an existing file, (may be multipart e.g. foo/bar)
 cb(err, archivefile): passed Archive File
 resolves to:   archivefile if no cb
 errors:        FileNotFound or errors from ArchiveFile() or fetch_metadata()
```

## ArchiveItem
## ArchiveMember
## ArchiveMemberFav
## ArchiveMemberRelated
## ArchiveMemberSearch
## Util

# Other files
## item_rules.js

