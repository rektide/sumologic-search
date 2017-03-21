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

function okStatusFilter( response){
	if( response.status> 299){
		return response
			.text()
			.then( err=> { throw new Error("Bad response status "+ response.status+ ": "+ err)})
	}
	return response
}

var jsonHeaders= {
	"Content-Type": "application/json",
	"Accept": "application/json"
}

function tick( value){
	return new Promise( resolve=> process.nextTick(()=> resolve( value)))
}

/**
 * A Sumologic Search, via their Search API.
 * @param {object} [config] - Configuration to use for search. These options are merged into `this`.
 * @param {string} query - the query to run
 * @param {Date|epoch} [config.from=-15*60*1000] - Time to start searching from, or a negative number of ms before `option.to`
 * @param {Date|epoch} [config.to=Date.now()] - Time to start searching from, in epoch or Date form.
 * @param {object} [config.headers] - Headers to use in the request
 * @param {string} [config.cookie] - Cookies to use during request (will overwrite a cookie set in headers)
 * @param {string} [config.timeZone=UTC] - TimeZone to search with.
 */
class SumologicSearch{
	constructor( config){
		var defs= defaults()
		Object.assign( this, defs, config)
		this._headers= Object.assign({}, defs.headers, config&& config.headers, {cookie: config&& config.cookie})
		if( this.from< 0){
			var to= this.to instanceof Date? this.to.getTime(): this.to
			this.from= to- this.from
		}

		// initialize the values for results, such that anyone can listen whenever they want,
		// even if the producer has not started yet
		this._status= ObservableDefer()
		this._finalStatus= Promise.defer()
		this._messages= ObservableDefer()
		this.messages= most.multicast( this._messages.stream)
		this._records= ObservableDefer()
		this.records= most.multicast( this._records.stream)
	}

	/**
	 * Compute a set of headers to use when making Sumologic API request pertaining to this search
	 */
	get headers(){
		var cookie= this.cookie? {cookie: this.cookie}: null
		return Object.assign( {}, jsonHeaders, this._headers, cookie)
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
			if( post.status!== 202){
				return processError( post)
			}

			// extract job id, cookie
			var
			  loc= post.headers.get( "location"),
			  lastSlash= loc.lastIndexOf( "/"),
			  jobId= loc.substring( lastSlash+ 1),
			  cookie= post.headers.get( "set-cookie")
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
					.then( okStatusFilter)
					.then( response=> response.json())
					.then( ingestStatus)
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
	 * Fetch either "message" or "record" results
	 * @internal
	 * @param {string} countType - either "message" or "record" results
	 */
	_readResults( resultType){
		if( resultType!== "message"&& resultType!== "record"){
			throw new Error( "Unknown kind of results '"+ resultType+ "'")
		}
		var resultStream= this[ "_"+ resultType+ "s"]
		if( resultStream.started){
			return resultStream.stream
		}
		resultStream.started= true

		// wait for all results to be gathered
		return this.pollJob().then( finalStatus=> {
			var
			  total= finalStatus[ resultType+ "Count"],
			  pageLimit= this.pageLimit,
			  pages= Math.ceil( total/ pageLimit),
			  headers= this.headers(),
			  query= this.url( "search/jobs/"+ this.jobId+ "/"+ resultType+ "s?limit="+ pageLimit+ "&offset="),
			  currentPage= 0
			if( count=== undefined){
				throw new Error("No count found for "+ resultType)
			}
			function consumePage( page){
				page[ resultType+ "s"].forEach( message=> resultStream.next( message.map))
				fetchPage( ++currentPage)
				return page
			}
			function fetchPage( page){
				page= page|| 0
				if( page> pages){
					return
				}
				var
				  offset= page* pageLimit
				  page= Fetch( query+ offset, {headers})
					.then( okStatusFilter)
					.then( response=> response.json())
				page.then( tick)
					.then( consumePage( page))
				return page
			}
			var page0= fetchPage( 0)
			page0.then( page=> resultStream.fields= response.fields)
			return page0
		})
	}

	/**
	 * "Although search jobs ultimately time out in the Sumo Logic backend, it's a good practice to explicitly cancel a search job when it is not needed anymore."
	 */
	deleteJob(){
	}

}
module.exports= SumologicSearch

if( require.main=== module){
	require( "./main")()
}
