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
