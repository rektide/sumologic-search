#!/usr/bin/env node
"use strict"
var
  Es6Promisify= require( "es6-promisify"),
  fs= require( "fs"),
  path= require( "path"),
  XdgBasedir= require( "xdg-basedir")

var
  readFile= Es6Promisify( fs.readFile, fs)

var defaults= {
	deployment: "api.us2.sumologic.com",
	pageLimit: 3000,
	pagesMax: 50
}

function configFile(){
	var configPath= path.join( XdgBasedir.config, "sumologic", "config.json")
	return readFile( configPath).then( JSON.parse)
}

var envs= {
	accessKey: process.env.SUMOLOGIC_ACCESS_KEY,
	accessId: process.env.SUMOLOGIC_ACCESS_ID,
	deployment: process.env.SUMOLOGIC_DEPLOYMENT,
	pageLimit: process.env.SUMOLOGIC_PAGE_LIMIT,
	pagesMax: process.env.SUMOLOGIC_PAGES_MAX
}
for( var i in envs){
	if( envs[ i]=== undefined){
		delete envs[ i]
	}
}

function config(){
	return Promise.all([
		// sources, in order
		{},
		defaults,
		configFile(),
		envs
	]).then(values=> {
		console.log(values)
		// merge
		var val= Object.assign.apply( null, values)
		val.pageLimit= Number.parseInt( val.pageLimit)
		if( isNaN( val.pageLimit)){
			throw new Error( "pageLimit is not a number")
		}
		val.pagesMax= Number.parseInt( val.pagesMax)
		if( isNaN( val.pagesMax)){
			throw new Error( "pagesMax is not a number")
		}
		return val
	})

}

module.exports= config

if( require.main=== module){
	require( "./uncaught")
	config().then( console.log)
}
