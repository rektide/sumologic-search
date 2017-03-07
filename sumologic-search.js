#!/usr/bin/env node
"use strict"

var
  assertFields= require( "./util/assertFields"),
  defaults= require( "./config"),
  Fetch= require( "node-fetch"),
  most= require( "most"),
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

/**
 * A Sumologic Search, via their Search API.
 * @param {object} [config] - Configuration to use for search. These options are merged into `this`.
 * @param {string} query - the query to run
 * @param {Date|epoch} [config.from=-15*60*1000] - Time to start searching from, or a negative number of ms before `option.to`
 * @param {Date|epoch} [config.to=Date.now()] - Time to start searching from, in epoch or Date form.
 * @param {object} [config.headers] - Headers to use in the request
 * @param {string} [config.cookies] - Cookies to use during request (will overwrite a cookie set in headers)
 * @param {string} [config.timeZone=UTC] - TimeZone to search with.
 */
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
		this._records= ObservableDefer()
		this.messages= most.multicast( this._messages.stream)
		this._messages= ObservableDefer()
		this.records= most.multicast( this._records.stream)
	}
	/**
	 * Compute a set of headers to use when making Sumologic API request pertaining to this search
	 */
	get headers(){
		var cookie= this.cookie? {cookie: this.cookie}: null
		return Object.assign( {}, jsonHeaders, this.headers, cookie)
	}
	/**
	 * Compute a URL to use to reach Sumologic.
	 * @param {string} endpoint - the piece of the url following the /api/v1 prefix
	 */ 
	url( endpoint){
		return `https://${this.accessId}:${this.accessKey}@${this.deployment}/api/v1/${endpoint}`
	}
	/**
	 * Get the job status stream
	 * Note that this is not setup as a multicast stream- at most one consumer is expected!
	 */
	get status(){
		return this._status.stream
	}
	/**
	 * Get the final job status reported, after all results are gathered.
	 */ 
	get finalStatus(){
		return this._finalStatus.promise
	}

	/**
	 * Fire off the job to the Sumologic endpoint, getting back the job id.
	 * @returns a Promise that resolves to this once `jobId` and `cookie` are available.
	 */ 
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

	/**
	 * Poll the status of the job while results are gathered
	 * @returns a promise for the final status of gathered results
	 */
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



	/**
	 * Get an observable for the message logs returned by sumologic
	 * @returns an observable of all messages returned by Sumologic
	 */
	readMessages(){
		return this._readResults( "message")
	}

	/**
	 * Get an observable for the aggregate records returned by sumologic. This is only usable for queries with aggregation.
	 * @returns an observable of all records returned by Sumologic
	 */
	readRecords(){
		return this._readResults( "record")
	}

	/**
	 */
	_readResults( aggregateRecords){
		if( this._results.started){
			return this.results
		}
		this.finalStatus.then
		
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
