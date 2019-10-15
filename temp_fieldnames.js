#!/usr/bin/env node
//const canonicaljson = require('@stratumn/canonicaljson');


FILE='/Users/mitra/Dropbox/DecentralizedWeb/field_count__gt_10.json';

const fieldnames = require(FILE);
const buckets = fieldnames.aggregations["Field names"].buckets; // [ key, doc_count, doc_count_error_upper_bound ]
maxDocCount = buckets[0].doc_count;
function skipField(bucket) {
  // Will add a list of fields to exclude here
  return (bucket.doc_count !== maxDocCount) ? (![].includes(bucket.key)) : ["mediatype", "identifier"].includes(bucket.key)
}
function showDecline(b,i) {
  if (!(i % 100)) {
    console.log(`${i} "${b.key}" ${b.doc_count} x${lastCount/b.doc_count}`);
    lastCount = b.doc_count
  }
  return b;
}

let lastCount = maxDocCount;
let fieldCount = buckets.length;
fieldCount = 400; // Uncomment to get fixed number of fields
// Analyse how fast it drops off
buckets.filter( b => skipField(b))
  .filter((b,i) => i < fieldCount)
  //.map(showDecline)
  //.map(b => b.key).map(k=>(k.charAt(0).toUpperCase() + k.substr(1))).sort().forEach(k=>console.log(k))
  .map(b => b.key).sort().forEach(k=>console.log(k))
;

