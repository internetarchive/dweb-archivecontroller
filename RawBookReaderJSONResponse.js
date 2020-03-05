// const debug = require('debug')('RawBookReaderJSONResponse');
const { parmsFrom } = require('./Util.js');

class RawBookReaderJSONResponse {
  /*
  Subset of the data structure returned from BookReaderJSON.php

  See the similar RawBookReaderResponse.js
  */
  constructor(props) {
    // Create a new API from props, using a shallow copy (may switch to deeper copy if reqd)
    this.data = props.data;
  }

  /**
   *
   * @param from    ArchiveItem { identifier, metadata, server, bookreader: {data, brOptions}}
   * @param server  Optional override of server representing data node
   * @param protocol Optional override of 'https'
   * @returns {{server, archiveFormat: *, titleIndex: number, collection: (*|string), pageNums, title: *, pageHeights, url: string, titleImage: string, itemId: *, numPages, subPrefix, itemPath: *, pageWidths, leafNums: *, titleLeaf: string, previewImage: string}}
   */
  static fromArchiveItem(from, { server = undefined, protocol = undefined } = {}) {
    // Create a RawBookReaderResponse from a ArchiveItem (typically to then be exported)
    if (typeof server === 'undefined') server = from.server;
    if (typeof protocol === 'undefined') protocol = 'https';

    const jsia = from.bookreader;
    const metadata = from.metadata;
    const brOptions = jsia.brOptions;
    const leafs = [].concat(...brOptions.data); // flatten
    if (typeof server === 'undefined') server = from.server;
    const subPrefix = brOptions.subPrefix;
    const previewUrlParms = {
      id: metadata.identifier,
      subPrefix,
      itemPath: brOptions.bookPath,
      server
    };
    const previewUrlStart = `${protocol}://${server}/BookReader/BookReaderPreview.php?${parmsFrom(previewUrlParms)}&`;
    const res = {
      archiveFormat: brOptions.zip ? 'zip' : undefined, // Dont have any examples currently where its not zip
      collection: metadata.collection[0], // Always set for a book
      itemId: metadata.identifier,
      itemPath: brOptions.bookPath,
      leafNums: leafs.map(l => l.leafNum),
      numPages: leafs.length,
      pageHeights: leafs.map(l => l.height),
      pageWidths: leafs.map(l => l.width),
      pageNums: leafs.map(unusedL => ''), //TODO find an example that has pageNums != leafNums or something other than ""
      previewImage: previewUrlStart + 'page=preview&',
      server, // localhost:4244 or ia123456.us.archive.org
      subPrefix,
      title: brOptions.bookTitle, // Also at metadata.title
      titleImage: previewUrlStart + 'page=title&',
      titleIndex: 0, // TODO find an example where this is not true
      titleLeaf: '0', // TODO find an example where this is not true
      url: `${protocol}://${server}/${jsia.data.bookUrl}`, // e.g. http://localhost:4244/details/foo or https://ia123456/details/foo
    };
    ['date', 'language', 'ppi', 'publisher'].forEach(k => res[k] = metadata[k]);
    ['imageFormat', 'pageProgression', 'zip'].forEach(k => res[k] = brOptions[k]);
    return res;
  }
}
exports = module.exports = RawBookReaderJSONResponse;

// Code Inspection Mitra 2019-12-17
