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

function url( config, endpoint){
	return `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/${endpoint}`
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
	var jobStatus= ObservableDefer()
	// POST the job
	var job= Promise.all([ body, config, defaults()]).then( function( params){
		var
		  body= params[0],
		  searchJob= Object.assign( {}, params[2], params[1]),
		  headers= Object.assign( {}, jsonHeaders, {cookie: searchJob.cookie}, searchJob.headers)
		// validate request
		if( !body){
			throw new Error( "No body query provided")
		}
		if( typeof(body)!== "string"){
			assertFields( body, [ "query", "from", "to", "timeZone"])
		}
		assertFields( searchJob, [ "accessId", "accessKey", "deployment"])
		// send request
		body= JSON.stringify( body)
		return Fetch( url( searchJob, "search/jobs"), {
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
			searchJob.searchJobId= searchJobId
			searchJob.cookie= cookie
			return searchJob
		})
	})

	// poll current Job Status periodically, look for end
	var statusPolling= job.then( function( searchJob){
		// ingest a current Job Status response
		function processStatus( response){
			// handle errors
			if( response.status&& response.code){
				if( response.status=== 404){
					// getting a lot of these but they don't seem to be "real"
					// filtering them out
					return
				}
				jobStatus.error( response)
				return
			}
			if( response.recordCount=== -1){
				// still preparing to get any results, skip this
				return
			}

			// handle data
			jobStatus.next( response)
			// we ought eventually get a done gathering, signalling job has finished
			if( response.state=== "DONE GATHERING RESULTS"){
				// all data received -- stop polling
				stopPolling( response)
			}
		}
		// wrap up all polling operations & finish the jobStatus observable
		function stopPolling( response){
			// stop polling
			clearInterval( interval)
			// job status has finished
			jobStatus.complete()
			// resolve the final status
			finalStatus.resolve( response)
		}

		// kick off polling
		var
		  finalStatus= Promise.defer(),
		  headers= Object.assign( {}, jsonHeaders, { cookie: searchJob.cookie}),
		  interval= setInterval( function(){
			Fetch( url( searchJob, "search/jobs/" + searchJob.searchJobId), {headers})
				.then( response=> response.json())
				.then( processStatus)
		  }, searchJob.interval)
		searchJob.stopPolling= function(){ stopPolling }
		searchJob.finalStatus= finalStatus.promise
		return searchJob
	})
	var finalStatus= statusPolling.then( jobStatus=> jobStatus.finalStatus)

	// create an observable for the records or messages results
	function getResults( isMessage){
		var resultsDefer= new ObservableDefer()
		return statusPolling.then( function( searchJob){
			return searchJob.finalStatus.then( function( finalStatus){
				var
				  resultType= isMessage? "message": "record",
				  count= finalStatus[ resultType+ "Count"],
				  pages= Math.ceil( count/ searchJob.pageLimit),
				  headers= Object.assign( {}, jsonHeaders, { cookie: searchJob.cookie}),
				  query= "search/jobs/"+ searchJob.searchJobId+ "/"+ resultType+ "s?limit="+ searchJob.pageLimit+ "&offset="
				for( var i= 0; i< pages; ++i){
					var
					  offset= i* searchJob.pageLimit,
					  page= Fetch( url( searchJob, query+ offset), {headers}).then(response=> response.json()).then( data=> console.log(JSON.stringify(data)))
				}
			})
		}).then( function(){
			return resultsDefer.stream
		})
	}
	finalStatus
		//.then(function(){
		//	return new Promise(function(resolve){
		//		setTimeout(resolve, 2000)
		//	})
		//})
		.then( _=> getResults( false))

	// stop polling when the observable is no longer listened to
	jobStatus.onunsubscribe= function(){
		statusPolling.then( statusPolling=> statusPolling.stopPolling)
	}
	return jobStatus.stream
}
module.exports= SumologicSearch

if( require.main=== module){
	require( "./main")()
}
