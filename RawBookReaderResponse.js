class RawBookReaderResponse {
    /*
    Exactly the data structure returned from BookReaderJSIA.php
    { data { data, brOptions, lendingInfo, metadata }
    TODO-IAUX this is intended to match equivalent class in IAUX
    TODO - refactor to use this
     */
    constructor(props) {
        // Create a new API from props, using a shallow copy (may switch to deeper copy if reqd)
        //[ "data", "brOptions", "lendingInfo", "metadata"].forEach( k => this[k] = props[k]);
        this.data = props.data;
    }

    static fromArchiveItem(from) {
        // Create a RawBookReaderResponse from a ArchiveItem (typically to then be exported)
        return new this({ data: Object.assign({}, from.bookreader, {metadata: from.metadata})});
    }
}
exports = module.exports = RawBookReaderResponse;
