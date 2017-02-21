#!/usr/bin/env node
"use strict"

var
  defaults= require( "./config"),
  Fetch= require( "node-fetch"),
  ObservableDefer= require( "observable-defer")

function processError( response){
	// TODO: get the payload & print out it's code & message
	return response.json().then( function( body){
		throw new Error( `Expected 202 Accepted, got ${response.status}: ${JSON.stringify( body)}`)
	})
}

var jsonHeaders= {
	"Content-Type": "application/json",
	"Accept": "application/json"
}

function SumologicSearch( queryBody, config){
	if( this instanceof SumologicSearch){
		throw new Error("Do not use 'new' on SumologicSearch")
	}
	// result is an Observable, built here.
	var defer= ObservableDefer()
	// pull in default config
	if( !config){
		config= require( "./config")()
	}
	if( !config.then){
		config= Promise.resolve(config)
	}
	// POST the job
	var job= config.then( function( config){
		config= Object.assign( {}, defaults, config)
		var headers= Object.assign( {}, jsonHeaders, {cookie: config.cookie}, config.headers)
		if( !config.accessId|| !config.accessKey|| !config.deployment){
			throw new Error( "Connection configuration information missing")
		}
		return Fetch( `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/search/jobs`, {
			method: "POST",
			headers,
			body: queryBody
		}).then( function( fetch){
			if( fetch.status!== 202){
				return processError( fetch)
			}
			var
			  loc= fetch.headers.get( "location"),
			  lastSlash= loc.lastIndexOf( "/"),
			  searchJobId= loc.substring( lastSlash+ 1),
			  cookie= headers.cookie= fetch.headers.get( "set-cookie")|| headers.cookie
			if( lastSlash=== -1|| !searchJobId){
				throw new Error("Job ID expected")
			}
			if( !cookie){
				throw new Error("Cookie expected")
			}
			return {
				searchJobId,
				cookie // internally we reuse headers, but export this for exterior users
			}
		})
	})
	// get currentJobStatus periodically
	var status= job.then( function( searchJob){
		if( lastSlash=== "-1"|| !id){
			throw new Error( "Expected location")
		}
		var
		  headers= Object.assign( {}, jsonHeaders, { cookie: searchJob.cookie}),
		  interval= setInterval( function(){
			Fetch( `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/search/jobs/${searchJob.searchJobId}`, {headers})
				.then( response=> response.json())
				.then( defer.next.bind(defer))
		  }, config.interval)
		return {
			interval
		}
	})

	// stop polling when the observable is no longer listened to
	defer.onunsubscribe= function(){
		status.then( function( status){
			clearInterval( status.interval)
		})
	}
	return defer.stream
}
module.exports= SumologicSearch

if( require.main=== module){
	require( "./main")()
}
