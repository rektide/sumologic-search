#!/usr/bin/env node
"use strict"

var
  defaults= require( "./config"),
  Fetch= require( "node-fetch"),
  ObservableDefer= require( "observable-defer")

function processError( response){
	// TODO: get the payload & print out it's code & message
	throw new Error( `Expected 202 Accepted, got ${response.status}`)
}

var jsonHeaders= {
	"Content-Type": "application/json",
	"Accept": "application/json"
}

function SumologicSearch( queryBody, config){
	config= Object.assign({}, defaults, config)
	var
	  defer= ObservableDefer(),
	  headers= Object.assign({}, jsonHeaders, {cookie: config.cookie}, config.headers),
	  fetch= Fetch( `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/search/jobs`, {
		method: "POST",
		headers,
		body: queryBody
	  }),
	  job= fetch.then(function( fetch){
		if( fetch.status!== 202){
			return processError( fetch)
		}
		var
		  loc= fetch.headers.get( "location"),
		  lastSlash= loc.lastIndexOf( "/"),
		  searchJobId= loc.substring( lastSlash+ 1),
		  cookie= headers.cookie= fetch.headers.get( "set-cookie")|| headers.cookie
		return {
			searchJobId,
			cookie // internally we reuse headers, but export this for exterior users
		}
	  }),
	  monitor= job.then(function( searchJob){
		if( lastSlash=== "-1"|| !id){
			throw new Error( "Expected location")
		}
		var interval= setInterval( function(){
			Fetch( `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/search/jobs/${searchJob.searchJobId}`, {headers})
				.then( response=> response.json())
				.then( defer.next.bind(defer))
		}, config.interval)
		return {
			interval
		}
	  })

	defer.onunsubscribe= function(){
		monitor.then( function( monitor){
			clearInterval( monitor.interval)
		})
	}
	return defer.stream
}
module.exports= SumologicSearch

if( require.main=== module){
	require( "./main")()
}
