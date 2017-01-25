"use strict"

function fail(err){
	console.error(err)
	process.exit(1)
}

process.on("uncaughtException", fail)
process.on("unhandledRejection", fail)
