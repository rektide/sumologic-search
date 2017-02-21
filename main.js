#!/usr/bin/env node
"use strict"

var
  es6Promisify= require( "es6-promisify"),
  fs= require( "fs"),
  SumologicSearch= require( "./sumologic-search")

/**
 */
function main( query, from, to, timeZone){
	require( "./uncaught")

	if( !query){
		// default to first argument being a query-file or query
		query= process.argv[2]
	}
	if( !to){
		to= Date.now()
	}
	if( !from){
		from= to- (15 * 60 * 1000)
		//from= to
	}
	if( !timeZone){
		timeZone= "UTC"
	}

	var
	  // attempt to read "query" as a file, fallback to it as query-text
	  queryText= es6Promisify( fs.readFile)( query, "utf8").catch( _=> query),
	  // run search
	  search= queryText.then( query=> SumologicSearch({ query, from, to, timeZone}))
	search.then( search=> search.forEach( console.log).then( _=> console.log("done")))
}

module.exports= main
if( require.main=== module){
	main()
}
