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

class SumologicSearch{
	constructor( config){
		Object.assign( this, defaults(), config)
		if( this.headers&& this.headers.cookie){
			this.cookie= this.headers.cookie
		}
		if( this.from< 0){
			var to= this.to instanceof Date? this.to.getTime(): this.to
			this.from= to- this.from
		}

		// initialize the values for results, such that anyone can listen whenever they want,
		// even if the producer has not started yet
		this._status= ObservableDefer()
		this._finalStatus= Promise.defer()
		this._results= ObservableDefer()
	}
	get headers(){
		var cookie= this.cookie? {cookie: this.cookie}: null
		return Object.assign( {}, jsonHeaders, this.headers, cookie)
	}
	url( endpoint){
		return `https://${this.accessId}:${this.accessKey}@${this.deployment}/api/v1/${endpoint}`
	}

	get status(){
		return this._status.stream
	}

	get finalStatus(){
		return this._finalStatus.promise
	}
	get results(){
		return this._results.stream
	}

	// post the job
	postJob(){
		if( this.jobId){
			return Promise.resolve( this)
		}

		// validate request
		assertFields( this, [ "accessId", "accessKey", "deployment", "query", "from", "to", "timeZone"])

		// POST the job
		var
		  url= this.url( "search/jobs"),
		  headers= this.headers,
		  body= JSON.stringify({
			query: this.query,
			from: this.from,
			to: this.to,
			timeZone: this.timeZone
		  }),
		  post= Fetch( url, {
			method: "POST",
			headers,
			body
		  }).then( post=> {
			if( fetch.status!== 202){
				return processError( fetch)
			}

			// extract job id, cookie
			var
			  loc= fetch.headers.get( "location"),
			  lastSlash= loc.lastIndexOf( "/"),
			  jobId= loc.substring( lastSlash+ 1),
			  cookie= fetch.headers.get( "set-cookie")
			if( lastSlash=== -1|| !jobId){
				throw new Error("Job ID expected in response")
			}
			if( !cookie){
				throw new Error("Cookie expected in response")
			}
			// save results!
			this.jobId= jobId
			this.cookie= this.cookie|| cookie
			return this
		  })
		return post
	}

	pollJob(){
		// run only if polling not started
		if( this._finalStatus.started){
			// return existing polling
			return this.finalStatus
		}
		this._finalStatus.started= true

		// wrap up all polling operations & finish the jobStatus observable
		var stopPolling= response=> {
			// stop polling
			clearInterval( this.polling)
			// job status has finished
			this._status.complete()
			// resolve the final status
			this._finalStatus.resolve( response)
		}
		// ingest a current Job Status response
		var ingestStatus= response=> {
			// handle errors
			if( response.status&& response.code){
				if( response.status=== 404){
					// getting a lot of these but they don't seem to be "real"
					// filtering them out
					return
				}
				this._status.error( response)
				this._finalStatus.reject( response)
				return
			}
			if( response.recordCount=== -1){
				// still preparing to get any results, skip this
				return
			}
	
			// handle data
			this._status.next( response)
			// we ought eventually get a done gathering, signalling job has finished
			if( response.state=== "DONE GATHERING RESULTS"){
				// all data received -- stop polling
				stopPolling( response)
			}
		}

		// poll current Job Status periodically
		return this.postJob().then( ()=> {
			// kick off polling
			var
			  url= this.url( "search/jobs"+ this.jobId),
			  headers= this.headers,
			  interval= setInterval(()=> {
				Fetch( url, {headers})
					.then( response=> response.json())
					.then( processStatus)
			  }, this.interval)
			return this.finalStatus
		})
	}

	function getResults( isMessage){
		var resultsDefer= new ObservableDefer()
		return Promise.all([ statusPolling, finalStatus]).then( function(state){
			var
			  searchJob= state[ 0],
			  finalStatus= state[ 1],
			  resultType= isMessage? "message": "record",
			  count= finalStatus[ resultType+ "Count"],
			  pages= Math.ceil( count/ searchJob.pageLimit),
			  headers= Object.assign( {}, jsonHeaders, { cookie: searchJob.cookie}),
			  query= "search/jobs/"+ searchJob.searchJobId+ "/"+ resultType+ "s?limit="+ searchJob.pageLimit+ "&offset="
			if( count=== undefined){
				throw new Error("No count found for "+ resultType)
			}
			for( var i= 0; i< pages; ++i){
				var
				  offset= i* searchJob.pageLimit,
				  page= Fetch( url( searchJob, query+ offset), {headers}).then(response=> response.json()).then( data=> console.log(JSON.stringify(data)))
			}
		}).then( function(){
			return resultsDefer.stream
		})
	}
	finalStatus
		.then(function(){
			return new Promise(function(resolve){
				setTimeout(resolve, 3000)
			})
		})
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
