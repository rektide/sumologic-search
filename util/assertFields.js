/**
 * Look through an object and make sure if has all the fields.
 * @param object - the object to check
 * @param fields - an array of slots to check
 * @param extraCheck - an optional function to also check
 */
function assertFields(object, fields, extraCheck){
	var bads= fields.reduce( function( bads, field){
		var val= object[ field]
		if( val=== null|| val=== undefined|| ( extraCheck&& !extraCheck(val))){
			if( !bads){
				bads= [ field]
			}else{
				bads.push( field)
			}
		}
		return bads
	}, null)
	if( bads){
		throw new Error( "Expected fields: "+ bads.join(", "))
	}
	return object
}

module.exports= assertFields
