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
	pagesMax: 50,
	interval: 3333
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
	pagesMax: process.env.SUMOLOGIC_PAGES_MAX,
	interval: process.env.SUMOGLOGIC_INTERVAL
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
		// merge
		var val= Object.assign.apply( null, values)
		var unInt= [ "pageLimit", "pagesMax", "interval"].reduce( function( unInt, cur){
			var num= val[cur]= Number.parseInt( val[ cur])
			if( isNaN(num)){
				if( !unInt){
					unInt= [ cur]
				}else{
					unInt.push( cur)
				}
				return unInt
			}
		}, null)
		if( unInt){
			throw new Error( "Expected numerical value for configuration: "+ unInt.join(", "))
		}
		return val
	})

}

module.exports= config

if( require.main=== module){
	require( "./uncaught")
	config().then( console.log)
}
