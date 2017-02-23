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
		// note: to is the third (not second) extra parameter in args
		if( process.argv[ 4]){
			to= process.argv[ 4]
			var number= Number.parseInt( to)
			if( isNaN( number)){
				// parse it as a full date
				to= Date.parse( to)
			}else{
				// a number is taken as epoch timestamp
				to= number
			}
		}
	}
	if( !from){
		from= to- (15 * 60 * 1000)
		if( process.argv[ 3]){
			from= process.argv[ 3]
			var number= Number.parseInt( from)
			if( isNaN( number)){
				// assume there's a fully specified date
				from= Date.parse( from)
			}else{
				// if a number, use this as an *offset in seconds* since to.
				from= to- (number* 1000)
			}
		}
	}
	if( !timeZone){
		timeZone= "UTC"
		var candidate= process.env.TZ
		if( candidate){
			timeZone= candidate
		}
		candidate= process.env.SUMOLOGIC_TZ
		if( candidate){
			timeZone= candidate
		}
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
