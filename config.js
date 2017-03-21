#!/usr/bin/env node
"use strict"
var
  assertFields= require( "./util/assertFields"),
  fs= require( "fs"),
  path= require( "path"),
  XdgBasedir= require( "xdg-basedir")

var numeric= [
	"interval",
	"pageLimit",
	"pagesMax"
]

function defaults(){
	return {
		accessId: null,
		accessKey: null,
		deployment: "api.us2.sumologic.com",
		interval: 3333,
		pageLimit: 3000,
		pagesMax: 50,
		to: Date.now(),
		from: -(15 * 60 * 1000),
		timeZone: "UTC"
	}
}

function configFile(){
	var
	  configPath= path.join( XdgBasedir.config, "sumologic", "config.json"),
	  configText= fs.readFileSync( configPath, "utf8")
	return JSON.parse( configText)
}

var envs= {
	accessId: process.env.SUMOLOGIC_ACCESS_ID,
	accessKey: process.env.SUMOLOGIC_ACCESS_KEY,
	deployment: process.env.SUMOLOGIC_DEPLOYMENT,
	interval: process.env.SUMOGLOGIC_INTERVAL,
	pageLimit: process.env.SUMOLOGIC_PAGE_LIMIT,
	pagesMax: process.env.SUMOLOGIC_PAGES_MAX,
	to: process.env.SUMOLOGIC_TO,
	from: process.env.SUMOLOGIC_FROM,
	timeZone: process.env.SUMOLOGIC_TZ,
	cookie: process.env.SUMOLOGIC_COOKIE
}

for( var i in envs){
	if( envs[ i]=== undefined){
		delete envs[ i]
	}
}

function config(){
	var
	  defs= defaults(),
	  conf= Object.assign( {}, defs, configFile(), envs)
	for( var numField of numeric){
		conf[ numField]= Number.parseInt( conf[ numField])
	}
	assertFields( conf, Object.keys( defs))
	return conf
}

module.exports= config

if( require.main=== module){
	require( "./uncaught")
	var conf= config()
	console.log( JSON.stringify( conf))
}
