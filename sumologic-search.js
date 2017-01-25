#!/usr/bin/env node
"use strict"
var
  defaults= require( "./config"),
  Fetch= require(" node-fetch"),
  ObservableDefer= require( "observable-defer"),

function processError( response){
	// TODO: get the payload & print out it's code & message
	throw new Error( `Expected 202 Accepted, got ${response.status}`)
}

function SumologicSearch( query, config){
	config= Object.assign({}, defaults, config)
	var
	  defer= ObservableDefer(),
	  fetch= Fetch( `https://${config.accessId}:${config.accessKey}@${config.deployment}/api/v1/search/jobs`, {
		method: "post"
		headers: {
			"Content-Type": "application/json",
			"Accept": "application/json"
		},
		body: query
	  }),
	  response= fetch.then(function(response){
		if( response.status!== 202){
			return processError( response)
		}
		var
		  loc= response.headers.get( "location"),
		  lastSlash= loc.lastIndexOf( "/"),
		  id= loc.substring( lastSlash+ 1),
		  cookies= c.headers.getAll( "set-cookie")
		if( lastSlash=== "-1"|| !id){
			throw new Error( "Expected location")
		}
		return {
			cookies,
			id
		}
	  })
	setInterval(
	
	defer.onunsubscribe= function(){
		
	}
	return defer.stream
}


// initialize

function collectors(n){
	var url = "https://"+user+":"+password+"@"+apiUrl+"collectors?limit="+pageLimit+"&offset="+n
	return fetch(url)
}


var collectors = collectors(0) // get first page
var cookies = collectors.then(c => { // get session cookies
	return c.headers.getAll("set-cookie")
})
var targetCollector = collectors.then(c => c.json()).then(function(c){ // find the asked for collector
	for(var i in c.collectors){
		if(collector.test(c.collectors[i].name)){
			return c.collectors[i]
		}
	}
})

// retrieve all sources, find any whose name includes a command line argument

function sources(){ // get all sources using existing session
	return Promise.all([cookies, targetCollector]).then(function(args){
		var cookies = args[0],
		  collector = args[1],
		  url = "https://"+apiUrl+"collectors/"+collector.id+"/sources?limit="+pageLimit+"&offset=0",
		  headers = new (fetch.Headers)()
		for(var i in cookies){
			headers.append("cookie", cookies[i])
		}
		return fetch(url, {headers})
	})
}

function filterSourceList(s){ // filter the sources down and print out
	if(process.argv.length <= 2){
		console.log(JSON.stringify(s))
		return
	}

	var filters = process.argv.slice(2).map(a => new RegExp(a, "i"))
	function filter(s){
		for(var i in filters){ // see if name matches any argument
			if(filters[i].test(s.name))
				return true
		}
	}
	console.log(JSON.stringify(s.filter(filter)))
}

var sourceList = sources().then(s => s.json()).then(s => s.sources).then(filterSourceList)
