#!/usr/bin/env node
"use strict"

var
  assertFields= require( "./util/assertFields"),
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

function SumologicSearch( body, config){
	if( this instanceof SumologicSearch){
		throw new Error("Do not use 'new' on SumologicSearch")
	}
	// result is an Observable, built here.
	var defer= ObservableDefer()
	// POST the job
	var job= Promise.all([ body, config, defaults()]).then( function( params){
		var
		  body= params[0],
		  value= Object.assign( {}, params[2], params[1]),
		  headers= Object.assign( {}, jsonHeaders, {cookie: value.cookie}, value.headers)
		// validate request
		if( !body){
			throw new Error( "No body query provided")
		}
		if( typeof(body)!== "string"){
			assertFields( body, [ "query", "from", "to", "timeZone"])
		}
		assertFields( value, [ "accessId", "accessKey", "deployment"])
		// send request
		body= JSON.stringify( body)
		return Fetch( `https://${value.accessId}:${value.accessKey}@${value.deployment}/api/v1/search/jobs`, {
			method: "POST",
			headers,
			body
		}).then( function( fetch){
			if( fetch.status!== 202){
				return processError( fetch)
			}
			// extract job id, cookie
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
			value.searchJobId= searchJobId
			value.cookie= cookie
			return value
		})
	})
	// get currentJobStatus periodically
	var status= job.then( function( searchJob){
		var
		  headers= Object.assign( {}, jsonHeaders, { cookie: searchJob.cookie}),
		  interval= setInterval( function(){
			Fetch( `https://${searchJob.accessId}:${searchJob.accessKey}@${searchJob.deployment}/api/v1/search/jobs/${searchJob.searchJobId}`, {headers})
				.then( response=> response.json())
				.then( defer.next.bind(defer))
		  }, searchJob.interval)
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
